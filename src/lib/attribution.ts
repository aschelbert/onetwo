// Ad attribution: which ad sent this visitor.
//
// The first page a visitor lands on (the website or the signup page) saves
// the UTM tags from its URL in a first-party cookie. The signup flow reads the
// cookie back and sends it with the checkout, so the building's `tenants` row
// records the ad that produced it. The cookie is ours alone; nothing here is
// sent to an ad platform.

const COOKIE = 'ot_attr';
const MAX_AGE_DAYS = 90;
const ROOT_DOMAIN = 'getonetwo.com';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
type UtmKey = (typeof UTM_KEYS)[number];

export type Attribution = Partial<Record<UtmKey, string>> & {
  /** The first URL the visitor arrived on, query string included. */
  first_landing_url?: string;
};

/** Ad click IDs the platforms append themselves; used when a UTM tag is missing. */
const CLICK_ID_SOURCES: [param: string, source: string][] = [
  ['gclid', 'google'],
  ['gbraid', 'google'],
  ['wbraid', 'google'],
  ['rdt_cid', 'reddit'],
  ['oppref', 'chatgpt'],
];

const clean = (value: string | null, max: number): string | undefined => {
  const v = (value ?? '').trim().slice(0, max);
  return v || undefined;
};

/** The attribution saved for this visitor, or an empty object. Never throws. */
export function readAttribution(): Attribution {
  try {
    const cookie = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
    if (!cookie) return {};
    const parsed: unknown = JSON.parse(decodeURIComponent(cookie.slice(COOKIE.length + 1)));
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Attribution = {};
    for (const key of [...UTM_KEYS, 'first_landing_url'] as const) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === 'string' && v) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function utmFromUrl(params: URLSearchParams): Partial<Record<UtmKey, string>> {
  const utm: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const v = clean(params.get(key), 100);
    if (v) utm[key] = key === 'utm_source' ? v.toLowerCase() : v;
  }
  if (!utm.utm_source) {
    const hit = CLICK_ID_SOURCES.find(([param]) => params.get(param));
    if (hit) utm.utm_source = hit[1];
  }
  return utm;
}

/**
 * Save where this visitor came from. Call once on page load, before anything
 * rewrites the URL. First touch wins: the landing URL is never replaced, and
 * UTM tags are only filled in if no earlier visit carried any. Never throws.
 */
export function captureAttribution(): void {
  try {
    const saved = readAttribution();
    const next: Attribution = { ...saved };
    if (!saved.utm_source) Object.assign(next, utmFromUrl(new URLSearchParams(window.location.search)));
    if (!saved.first_landing_url) next.first_landing_url = clean(window.location.href, 500);
    if (JSON.stringify(next) === JSON.stringify(saved)) return;

    const host = window.location.hostname;
    const domain = host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`) ? `; Domain=${ROOT_DOMAIN}` : '';
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Max-Age=${MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax${domain}${secure}`;
  } catch {
    // Attribution must never break a page
  }
}
