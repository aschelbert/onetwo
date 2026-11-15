// OpenAI Ads measurement pixel for the app.
//
// The marketing site (index.html) loads the pixel in its <head>. The app
// loads it only when a visitor enters the signup steps, so residents and
// board members using the app are never tracked. Same loader as OpenAI's
// snippet, including the Global Privacy Control opt-out the privacy policy
// promises. Each load records one page_viewed event; a completed signup is
// recorded separately as trial_started.

const PIXEL_ID = 'EeUAjrxrWJtnf5M7tToTws';
const SDK_URL = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';

type OaiqQueue = ((...args: unknown[]) => void) & { q: IArguments[] };

/** Load the pixel once. Safe to call repeatedly; later calls do nothing. */
export function loadOpenAIPixel(): void {
  if (typeof window === 'undefined' || window.oaiq) return;

  // Queue calls until the SDK loads, exactly as OpenAI's snippet does
  const q = function () {
    // eslint-disable-next-line prefer-rest-params
    q.q.push(arguments);
  } as unknown as OaiqQueue;
  q.q = [];
  window.oaiq = q;

  const script = document.createElement('script');
  script.async = true;
  script.src = SDK_URL;
  document.head.appendChild(script);

  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true) q('consent', false);
  q('init', { pixelId: PIXEL_ID });
  q('measure', 'page_viewed', { type: 'contents' });
}

/**
 * The ad click reference (oppref) OpenAI adds to ChatGPT ad links. The pixel
 * saves it from the landing URL in a first-party __oppref cookie for 30 days;
 * read it so the server-side conversion report can carry it too.
 */
export function readAdClickRef(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('oppref');
    const cookie = document.cookie.split('; ').find((c) => c.startsWith('__oppref='));
    const fromCookie = cookie ? decodeURIComponent(cookie.slice('__oppref='.length)) : null;
    const value = (fromUrl ?? fromCookie ?? '').trim();
    return value && value.length <= 512 ? value : null;
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Attach the new account's hashed email and user ID to the pixel, so OpenAI
 * can match the signup to an ad click. Values are hashed here, in the
 * browser; nothing raw is handed to the pixel. Never throws.
 */
export async function setOpenAIPixelUser(ids: { email?: string | null; userId?: string | null }): Promise<void> {
  try {
    if (!window.oaiq) return;
    const user: Record<string, string> = {};
    if (ids.email) user.email_sha256 = await sha256Hex(ids.email.trim().toLowerCase());
    if (ids.userId) user.external_id_sha256 = await sha256Hex(ids.userId);
    if (Object.keys(user).length) window.oaiq('init', { pixelId: PIXEL_ID, user });
  } catch {
    // Measurement must never break checkout
  }
}
