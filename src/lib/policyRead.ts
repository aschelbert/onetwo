/**
 * A first pass at an insurance document: the text of a declarations page or
 * a certificate of insurance in, the fields a person would otherwise type
 * out. It reads what is labelled; it does not guess. Every figure it finds
 * is shown to a person to confirm before anything is saved.
 */
export interface PolicyRead {
  coverage?: string;
  carrier?: string;
  policyNum?: string;
  namedInsured?: string;
  limit?: number;
  deductible?: number;
  premium?: number;
  /** 'YYYY-MM-DD'. */
  effective?: string;
  expires?: string;
}

/** The coverages an association is expected to carry, and how each is recognised in a document. */
export const COVERAGES: { id: string; label: string; match: RegExp; why: string }[] = [
  { id: 'property', label: 'Property, the building', match: /\b(commercial property|property coverage|building coverage|master policy|special form|blanket building|businessowners)\b/i, why: 'Rebuilds the building after a fire or other covered loss' },
  { id: 'liability', label: 'General liability', match: /\b(commercial general liability|general liability|\bCGL\b)/i, why: 'Someone is hurt on the common areas' },
  { id: 'do', label: 'Directors and officers', match: /\b(directors?\s*(and|&)\s*officers?|D\s?&\s?O\b|management liability)/i, why: 'A claim against the board for a decision it made' },
  { id: 'fidelity', label: 'Fidelity bond', match: /\b(fidelity|crime coverage|employee dishonesty|commercial crime)\b/i, why: "Theft of the association's money by someone who handles it" },
  { id: 'umbrella', label: 'Umbrella', match: /\b(umbrella|excess liability)\b/i, why: 'Sits on top of the liability limits' },
  { id: 'boiler', label: 'Boiler and machinery', match: /\b(boiler (and|&) machinery|equipment breakdown)\b/i, why: 'Breakdown of the boiler, elevator or other equipment' },
  { id: 'workers', label: "Workers' compensation", match: /\b(workers'?\s*comp(ensation)?|employers'? liability)\b/i, why: 'Needed with employees; also covers an uninsured contractor hurt on site' },
  { id: 'flood', label: 'Flood', match: /\b(flood (insurance|policy|coverage)|NFIP)\b/i, why: 'Flood is left out of a property policy' },
];
/** A unit owner's own policy. */
export const HO6 = /\b(HO-?\s?6|condominium unit[- ]owners?|unit[- ]owners? (form|policy)|homeowners? policy)\b/i;

export const coverageOf = (type: string) => COVERAGES.find(c => c.match.test(type) || c.label.toLowerCase() === type.trim().toLowerCase() || new RegExp(`\\b${c.id}\\b`, 'i').test(type));

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) => (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '');
const DATE = String.raw`(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})`;

/** "10/01/2027", "Oct 1, 2027", "October 1 2027" and "2027-10-01" all read as 2027-10-01; '' when it is not a date. */
export function readDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (m) return iso(Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]), Number(m[2]));
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) { const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); return mo >= 0 ? iso(Number(m[3]), mo + 1, Number(m[2])) : ''; }
  return '';
}

const money = (s: string | undefined) => { if (!s) return undefined; const n = Number(s.replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };
const AMOUNT = String.raw`\$?\s?([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,}(?:\.\d{2})?)`;
const first = (text: string, ...patterns: RegExp[]) => { for (const p of patterns) { const m = p.exec(text); if (m?.[1]) return m[1].trim(); } return undefined; };

/**
 * Read a declarations page or a certificate. Lines are kept apart, so a label
 * and its value are matched on the same line or on the line after.
 */
export function readPolicy(raw: string): PolicyRead {
  const text = raw.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const flat = text.replace(/\n+/g, ' ');
  const out: PolicyRead = {};

  // The policy period: "10/01/2026 to 10/01/2027", or the two dates under their own labels.
  const period = new RegExp(String.raw`(?:policy period|period of insurance|policy term|coverage period)\D{0,40}?${DATE}\s*(?:to|through|thru|until|–|-|—)\s*${DATE}`, 'i').exec(flat)
    ?? new RegExp(String.raw`(?:from|effective)\s*:?\s*${DATE}\s*(?:to|through|thru|until|–|-|—)\s*${DATE}`, 'i').exec(flat);
  if (period) { out.effective = readDate(period[1]) || undefined; out.expires = readDate(period[2]) || undefined; }
  if (!out.expires) {
    const exp = first(flat, new RegExp(String.raw`(?:expiration date|expires?(?: on)?|expiry date|policy exp(?:iration)?(?: date)?(?: \(mm\/dd\/yyyy\))?|exp\.? date)\s*:?\s*${DATE}`, 'i'));
    if (exp) out.expires = readDate(exp) || undefined;
  }
  if (!out.effective) {
    const eff = first(flat, new RegExp(String.raw`(?:effective date|policy eff(?:ective)?(?: date)?(?: \(mm\/dd\/yyyy\))?|inception date|eff\.? date)\s*:?\s*${DATE}`, 'i'));
    if (eff) out.effective = readDate(eff) || undefined;
  }
  // A period that reads backwards was mislabelled: leave both for the person to enter.
  if (out.effective && out.expires && out.expires <= out.effective) { delete out.effective; delete out.expires; }

  const num = first(text, /policy\s*(?:number|no\.?|#)\s*:?\s*([A-Z0-9][A-Z0-9\-\/ ]{3,24}[A-Z0-9])(?=\s|$)/im);
  if (num && /\d/.test(num)) out.policyNum = num.replace(/\s+/g, ' ');

  const carrier = first(text,
    /(?:insurer(?: [a-f])?|insurance company|issuing company|carrier|underwritten by|company name)[ \t]*[:–-][ \t]*([A-Z][A-Za-z0-9&.,' \-]{2,60}?)[ \t]*(?:\n|$|NAIC|Policy)/im,
    /^([A-Z][A-Za-z&.,' \-]{2,50}(?:Insurance|Assurance|Indemnity|Casualty|Mutual|Underwriters)(?: Company| Co\.?| Group| Inc\.?)?)\s*$/m);
  if (carrier) out.carrier = carrier.replace(/[\s,]+$/, '');

  const insured = first(text, /(?:named insured|insured(?: name)?)\s*:?\s*([A-Z][^\n]{2,70})/i);
  if (insured && !/^(and|is|shall|the following)\b/i.test(insured)) out.namedInsured = insured.replace(/\s{2,}.*$/, '').trim();

  out.limit = money(first(flat,
    new RegExp(String.raw`(?:blanket )?(?:building|property) limit(?: of insurance)?\s*:?\s*${AMOUNT}`, 'i'),
    new RegExp(String.raw`limit of (?:insurance|liability)\s*:?\s*${AMOUNT}`, 'i'),
    new RegExp(String.raw`each (?:occurrence|claim|loss)(?: limit)?\s*:?\s*${AMOUNT}`, 'i'),
    new RegExp(String.raw`(?:coverage a|dwelling)(?:[ \-–:]+dwelling)?\s*:?\s*${AMOUNT}`, 'i'),
    new RegExp(String.raw`(?:general )?aggregate(?: limit)?\s*:?\s*${AMOUNT}`, 'i'),
    new RegExp(String.raw`\blimit\s*:?\s*${AMOUNT}`, 'i')));
  out.deductible = money(first(flat, new RegExp(String.raw`(?:deductible|retention)(?: amount)?(?: \(?(?:all other perils|aop|per (?:occurrence|claim))\)?)?\s*:?\s*${AMOUNT}`, 'i')));
  out.premium = money(first(flat, new RegExp(String.raw`(?:total (?:annual |policy )?premium|annual premium|policy premium|premium(?: due)?)\s*:?\s*${AMOUNT}`, 'i')));

  const cov = COVERAGES.find(c => c.match.test(flat));
  if (HO6.test(flat) && !/\b(commercial|master policy)\b/i.test(flat)) out.coverage = "Unit owner's policy (HO-6)";
  else if (cov) out.coverage = cov.label;

  for (const k of Object.keys(out) as (keyof PolicyRead)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** What was read, in words, for the person checking it. */
export function readSummary(r: PolicyRead, fileName: string): string {
  const got = [r.coverage && 'the coverage', r.carrier && 'the carrier', r.policyNum && 'the policy number', r.limit && 'the limit', r.deductible && 'the deductible', r.premium && 'the premium', r.expires && 'the expiry date'].filter(Boolean);
  return got.length ? `Read ${got.join(', ')} from ${fileName}. Check each one against the document before saving.` : `Nothing could be read from ${fileName}: it may be a scan with no text. Type the details in.`;
}

export const usd = (n: number | undefined) => (n ? `$${Math.round(n).toLocaleString('en-US')}` : '');

/** Where a policy stands by its expiry date. */
export type Standing = 'current' | 'expiring' | 'lapsed' | 'unknown';
export function standingOf(expires: string | undefined, today: string, warnDays = 30): Standing {
  if (!expires || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return 'unknown';
  const days = Math.round((Date.parse(expires) - Date.parse(today)) / 86400000);
  return days < 0 ? 'lapsed' : days <= warnDays ? 'expiring' : 'current';
}
