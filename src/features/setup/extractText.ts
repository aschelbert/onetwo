/**
 * Building setup, reading text without any outside service: the text of a
 * PDF (pulled out in the browser) or text someone pasted is scanned with
 * rules for the settings and lists setup can use. Every item keeps the page
 * and the sentence or line it came from, so a person can check it before
 * accepting. Wording the rules don't recognise is simply not found; the
 * person fills it in under Fill the gaps.
 *
 * Input is pages of lines (`string[][]`); output is the same `ReadResult` the
 * spreadsheet import produces.
 */
import type { BoardRow, BudgetRow, ClauseRow, ClauseTopic, Confidence, DocType, FactKey, FactRow, InsuranceRow, ReadResult, ReserveRow, UnitRow } from './setupModel';

// ── Numbers written as words ───────────────────────────────────────

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ORDINAL: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  'twenty-first': 21, 'twenty-fifth': 25, 'twenty-eighth': 28, last: 28,
};

/** "25", "twenty-five", "sixty seven", "15th", "fifteenth" → number. */
export function wordNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[()]/g, '');
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const ord = /^(\d+)(st|nd|rd|th)$/.exec(s);
  if (ord) return Number(ord[1]);
  if (ORDINAL[s] !== undefined) return ORDINAL[s];
  const parts = s.split(/[\s-]+/);
  let total = 0; let any = false;
  for (const p of parts) {
    if (SMALL[p] !== undefined) { total += SMALL[p]; any = true; }
    else if (p === 'hundred') { total = (total || 1) * 100; any = true; }
    else if (p !== 'and') return null;
  }
  return any ? total : null;
}

/** The number in "fifteen (15)" or "15" or "fifteen": a figure in brackets wins. */
function numberOf(words: string, bracket?: string): number | null {
  if (bracket && /\d/.test(bracket)) return Number(bracket.replace(/[^\d.]/g, ''));
  return wordNumber(words);
}

const moneyNum = (s: string) => Number(s.replace(/[$,\s]/g, ''));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE = `(${MONTHS.join('|')})`;

// ── Sentences ─────────────────────────────────────────────────────

interface Sentence { text: string; page: number | null }

function sentences(pages: string[][], paged: boolean): Sentence[] {
  const out: Sentence[] = [];
  pages.forEach((lines, i) => {
    // Rejoin words a PDF split across lines ("twenty- five" → "twenty-five").
    const text = lines.join(' ').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();
    for (const s of text.split(/(?<=[.;:])\s+(?=[A-Z(“"])/)) if (s.trim().length > 8) out.push({ text: s.trim(), page: paged ? i + 1 : null });
  });
  return out;
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

// ── Settings ──────────────────────────────────────────────────────

type Hit = { value: string; number: number | null; confidence?: Confidence };
type Rule = { key: FactKey; when?: RegExp; unless?: RegExp; read: (s: string) => Hit | null };

const pctIn = (s: string): number | null => {
  const m = /([a-z]+(?:[- ][a-z]+)?|\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\s*%?\))?\s*(?:%|percent\b)/i.exec(s);
  return m ? numberOf(m[1], m[2]) : null;
};

const RULES: Rule[] = [
  {
    key: 'late_fee', when: /\blate (?:fee|charge|payment (?:fee|charge)|penalt)|\bdelinquen\w* (?:fee|charge)|\blate\b[^.]{0,40}\bcharge/i,
    read: s => {
      const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(s);
      if (m) return { value: `$${moneyNum(m[1]).toLocaleString('en-US')} per late payment`, number: moneyNum(m[1]) };
      const w = /([a-z]+(?:[- ][a-z]+)?)\s+(?:\(\$?[\d.,]+\)\s+)?dollars/i.exec(s);
      if (w && wordNumber(w[1]) !== null) return { value: `$${wordNumber(w[1])} per late payment`, number: wordNumber(w[1]) };
      const p = pctIn(s);
      if (p !== null) return { value: `${p}% of the amount past due`, number: p };
      return null;
    },
  },
  {
    key: 'grace_period_days', when: /\b(late|delinquen|past due|grace)/i,
    read: s => {
      const m = /([a-z]+(?:[- ][a-z]+)?|\d+)\s*(?:\((\d+)\))?\s*(?:calendar\s+)?days?\s+(?:after|following|from|of)\s+(?:the\s+)?(?:its\s+)?(?:due date|date (?:it is |when )?due|date on which)/i.exec(s)
        ?? /grace period of\s+([a-z]+(?:[- ][a-z]+)?|\d+)\s*(?:\((\d+)\))?\s*days/i.exec(s);
      const n = m ? numberOf(m[1], m[2]) : null;
      return n !== null && n > 0 && n <= 90 ? { value: `${n} days after the due date`, number: n } : null;
    },
  },
  {
    key: 'assessment_due_day', when: /\b(assessment|dues|common (?:charge|expense)|installment|payable)/i,
    read: s => {
      const m = /(?:on|by)\s+the\s+([a-z-]+|\d{1,2}(?:st|nd|rd|th)?)\s*(?:\(\w+\))?\s+day of (?:each|every|the|each calendar|every calendar)\s+(?:calendar\s+)?month/i.exec(s);
      const n = m ? wordNumber(m[1]) : null;
      if (n === null || n < 1 || n > 28) return null;
      const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      return { value: `the ${n}${suffix} of each month`, number: n };
    },
  },
  {
    key: 'annual_meeting_month', when: /\bannual meeting/i,
    read: s => { const m = new RegExp(`\\b${MONTH_RE}\\b`).exec(s); return m ? { value: m[1], number: null } : null; },
  },
  {
    key: 'owner_quorum_pct', when: /\bquorum\b/i, unless: /\b(directors?|board)\b/i,
    read: s => { const n = pctIn(s); return n !== null && n > 0 && n <= 100 ? { value: `${n}% of the votes`, number: n } : null; },
  },
  {
    key: 'board_quorum', when: /\bquorum\b[^.]{0,120}\b(directors?|board)\b|\b(directors?|board)\b[^.]{0,120}\bquorum\b/i,
    read: s => {
      if (/majority/i.test(s)) return { value: 'A majority of the directors', number: null };
      const m = /([a-z]+|\d+)\s*(?:\((\d+)\))?\s+directors?\s+shall constitute a quorum/i.exec(s);
      const n = m ? numberOf(m[1], m[2]) : null;
      return n !== null ? { value: `${n} directors`, number: n } : null;
    },
  },
  {
    key: 'owner_meeting_notice', when: /\bnotice\b[^.]{0,200}\bmeeting|\bmeeting\b[^.]{0,200}\bnotice\b/i,
    read: s => {
      const range = /not (?:less|fewer) than\s+([a-z]+(?:[- ][a-z]+)?|\d+)\s*(?:\((\d+)\))?\s*(?:days\s+)?(?:nor|or|and not|but not)\s+more than\s+([a-z]+(?:[- ][a-z]+)?|\d+)\s*(?:\((\d+)\))?\s*days/i.exec(s);
      if (range) { const a = numberOf(range[1], range[2]); const b = numberOf(range[3], range[4]); if (a !== null && b !== null) return { value: `${a} to ${b} days before the meeting`, number: a }; }
      const least = /(?:at least|not (?:less|fewer) than)\s+([a-z]+(?:[- ][a-z]+)?|\d+)\s*(?:\((\d+)\))?\s*days/i.exec(s);
      const n = least ? numberOf(least[1], least[2]) : null;
      return n !== null ? { value: `At least ${n} days before the meeting`, number: n } : null;
    },
  },
  {
    key: 'board_size', when: /\b(board|directors)\b/i,
    read: s => {
      const m = /(?:consist|compos|compris)\w*\s+of\s+([a-z]+(?:[- ][a-z]+)?|\d+)\s*(?:\((\d+)\))?\s+(?:members|directors|persons|individuals)/i.exec(s);
      const n = m ? numberOf(m[1], m[2]) : null;
      return n !== null && n > 0 && n < 30 ? { value: `${n} directors`, number: n } : null;
    },
  },
  {
    key: 'board_term_years', when: /\bdirectors?\b[^.]{0,160}\bterm|\bterm\b[^.]{0,160}\bdirectors?\b/i,
    read: s => {
      const m = /term\w*[^.]{0,80}?\b([a-z]+|\d+)\s*(?:\((\d+)\))?\s+(?:-\s*)?years?/i.exec(s);
      const n = m ? numberOf(m[1], m[2]) : null;
      return n !== null && n > 0 && n <= 6 ? { value: `${n} years`, number: n } : null;
    },
  },
  {
    key: 'fiscal_year_end', when: /\bfiscal year\b/i,
    read: s => {
      if (/calendar year/i.test(s)) return { value: 'December 31 (the calendar year)', number: null };
      const end = new RegExp(`(?:end(?:ing|s)?|close)\\s+(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})`, 'i').exec(s);
      if (end) return { value: `${cap(end[1])} ${end[2]}`, number: null };
      const begin = new RegExp(`(?:begin(?:ning|s)?|commenc\\w*|start\\w*)\\s+(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})`, 'i').exec(s);
      if (begin) {
        const d = new Date(2001, MONTHS.findIndex(m => m.toLowerCase() === begin[1].toLowerCase()), Number(begin[2]) - 1);
        return { value: `${MONTHS[d.getMonth()]} ${d.getDate()}`, number: null };
      }
      return null;
    },
  },
  {
    key: 'assessment_cap_pct', when: /\b(increase|raise)\w*\b[^.]{0,200}\b(assessment|budget|dues|common expense)/i,
    read: s => {
      const m = /(?:more than|in excess of|exceed\w*|greater than|above)\s+([a-z]+(?:[- ][a-z]+)?|\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\s*%?\))?\s*(?:%|percent)/i.exec(s);
      const n = m ? numberOf(m[1], m[2]) : null;
      return n !== null && n > 0 && n <= 100 ? { value: `${n}% a year without an owner vote`, number: n, confidence: 'low' } : null;
    },
  },
  {
    key: 'board_spending_limit', when: /\b(expend|expenditure|spend|contract|capital improvement|purchase)/i,
    read: s => {
      if (!/\b(approv|vote|consent|authoriz)/i.test(s)) return null;
      const m = /(?:in excess of|exceeding|more than|greater than|over)\s+\$\s?([\d,]+)/i.exec(s);
      return m ? { value: `$${moneyNum(m[1]).toLocaleString('en-US')} before an owner vote is needed`, number: moneyNum(m[1]), confidence: 'low' } : null;
    },
  },
  {
    key: 'owner_vote_threshold_pct', when: /\b(vote|approval|consent|affirmative)\b[^.]{0,160}\b(owners|votes|members|percentage interests?)\b/i, unless: /\bquorum\b/i,
    read: s => { const n = pctIn(s); return n !== null && n > 50 && n <= 100 ? { value: `${n}% of the owners' votes`, number: n, confidence: 'low' } : null; },
  },
  {
    key: 'fine_amount', when: /\bfines?\b/i,
    read: s => { const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(s); return m ? { value: `$${moneyNum(m[1]).toLocaleString('en-US')} per violation`, number: moneyNum(m[1]) } : null; },
  },
  {
    key: 'pet_rule', when: /\b(pets?|dogs?|cats?|animals?)\b/i,
    read: s => /\b(no|not|allowed|permitted|prohibit|limit|maximum|may (?:keep|have)|shall (?:keep|have)|leash)/i.test(s) ? { value: clip(s, 160), number: null } : null,
  },
  {
    key: 'rental_rule', when: /\b(lease|leasing|leased|rent(?:al|ed)?|short[- ]term|airbnb)\b/i,
    read: s => /\b(minimum|not less than|at least|prohibit|shall not|may not|no unit|term of)/i.test(s) ? { value: clip(s, 160), number: null } : null,
  },
  {
    key: 'total_units', when: /\bunits\b/i,
    read: s => {
      const m = /(?:consist|compris|contain|divided into)\w*\s+(?:of\s+)?([a-z]+(?:[- ][a-z]+)?|\d+)\s*(?:\((\d+)\))?\s+(?:residential\s+|condominium\s+|separate\s+)?units/i.exec(s);
      const n = m ? numberOf(m[1], m[2]) : null;
      return n !== null && n > 1 && n < 5000 ? { value: `${n} units`, number: n } : null;
    },
  },
  {
    key: 'building_name',
    read: s => { const m = /name of the (?:condominium|association|project|regime) (?:is|shall be)\s+["“]?([^"”.;,]{3,80})/i.exec(s); return m ? { value: m[1].trim(), number: null } : null; },
  },
  {
    key: 'management_company',
    read: s => { const m = /(?:managed by|management company (?:is|shall be)|managing agent (?:is|shall be)|managing agent:|management company:)\s+([A-Z][\w&.,' -]{2,60}?)(?=[,.;(]| is\b| shall\b| and\b|$)/.exec(s); return m ? { value: m[1].trim(), number: null } : null; },
  },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function facts(all: Sentence[]): FactRow[] {
  const out: FactRow[] = [];
  for (const rule of RULES) {
    for (const s of all) {
      if (rule.when && !rule.when.test(s.text)) continue;
      if (rule.unless && rule.unless.test(s.text)) continue;
      const hit = rule.read(s.text);
      if (!hit) continue;
      out.push({ key: rule.key, value: hit.value, number: hit.number, page: s.page, quote: clip(s.text), confidence: hit.confidence ?? 'high' });
      break; // the first place a setting is stated
    }
  }
  return out;
}

// ── Lists ─────────────────────────────────────────────────────────

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/;

function units(pages: string[][], paged: boolean, likely: boolean): UnitRow[] {
  const rows: UnitRow[] = [];
  pages.forEach((lines, i) => {
    for (const line of lines) {
      const m = /^\s*(?:unit\s*(?:no\.?|#)?\s*)?([A-Z]?-?\d{1,4}[A-Z]?|[A-Z]{1,2}-?\d{1,3})\b[\s,.:|–-]+(.+)$/i.exec(line);
      if (!m) continue;
      let rest = m[2];
      const email = EMAIL.exec(rest)?.[0] ?? null; if (email) rest = rest.replace(email, ' ');
      const phone = PHONE.exec(rest)?.[0] ?? null; if (phone) rest = rest.replace(phone, ' ');
      const money = /\$\s?([\d,]+\.\d{2})/.exec(rest); if (money) rest = rest.replace(money[0], ' ');
      const pct = /\b(\d{1,2}\.\d{1,6})\s*%?|\b(0\.\d{3,8})\b/.exec(rest); if (pct) rest = rest.replace(pct[0], ' ');
      if (!email && !pct && !(likely && (money || phone))) continue;
      const owner = rest.replace(/\s{2,}/g, ' ').replace(/^[\s,;:|–-]+|[\s,;:|–-]+$/g, '').trim();
      rows.push({
        unit: m[1].toUpperCase(), owner: /^[\d\s.,%$-]*$/.test(owner) ? '' : owner, email, phone, mailingAddress: null,
        ownershipPct: pct ? Number(pct[1] ?? pct[2]) : null, monthlyFee: money ? moneyNum(money[1]) : null,
        page: paged ? i + 1 : null, quote: clip(line.trim(), 160), confidence: 'high',
      });
    }
  });
  // A real list has several rows; one or two matches are more likely section numbers.
  if (rows.length < 3) return [];
  const total = rows.reduce((t, r) => t + (r.ownershipPct ?? 0), 0);
  if (total > 0 && total <= 1.5) rows.forEach(r => { if (r.ownershipPct !== null) r.ownershipPct = Math.round(r.ownershipPct * 1_000_000) / 10_000; });
  return rows;
}

const OFFICES = '(President|Vice[- ]President|Treasurer|Secretary|Director|Member[- ]at[- ]Large|Board Member|Chair(?:person)?)';
const PERSON = "([A-Z][\\w.'’-]+(?:\\s+[A-Z][\\w.'’-]+){1,3})";

function board(pages: string[][], paged: boolean): BoardRow[] {
  const seen = new Set<string>();
  const out: BoardRow[] = [];
  const add = (name: string, role: string, line: string, page: number | null) => {
    const k = name.toLowerCase();
    if (seen.has(k) || /\b(the|board|association|meeting|motion)\b/i.test(name)) return;
    seen.add(k);
    out.push({ name: name.trim(), role: role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), email: EMAIL.exec(line)?.[0] ?? null, phone: PHONE.exec(line)?.[0] ?? null, termEnds: null, page, quote: clip(line.trim(), 160), confidence: 'high' });
  };
  pages.forEach((lines, i) => {
    const page = paged ? i + 1 : null;
    for (const line of lines) {
      const a = new RegExp(`^\\s*${OFFICES}\\s*[:–—-]\\s*${PERSON}`).exec(line);
      if (a) { add(a[2], a[1], line, page); continue; }
      const b = new RegExp(`^\\s*${PERSON},?\\s*[–—,-]\\s*${OFFICES}\\b`).exec(line);
      if (b) { add(b[1], b[2], line, page); continue; }
    }
    const text = lines.join(' ').replace(/\s+/g, ' ');
    for (const m of text.matchAll(new RegExp(`${PERSON}\\s+(?:was|were|has been)\\s+(?:re-?)?elected\\s+(?:as\\s+)?(?:the\\s+)?${OFFICES}`, 'g'))) add(m[1], m[2], m[0], page);
    for (const m of text.matchAll(new RegExp(`(?:re-?)?elected\\s+${PERSON}\\s+(?:as|to serve as)\\s+(?:the\\s+)?${OFFICES}`, 'g'))) add(m[1], m[2], m[0], page);
  });
  return out;
}

function budget(pages: string[][], paged: boolean): BudgetRow[] {
  const out: BudgetRow[] = [];
  pages.forEach((lines, i) => {
    for (const line of lines) {
      const m = /^\s*([A-Za-z][A-Za-z0-9 &/,'().-]{2,60}?)\s+((?:\$?\s?\(?[\d,]{3,}(?:\.\d{2})?\)?\s*){1,5})$/.exec(line);
      if (!m) continue;
      const label = m[1].trim();
      if (/\b(total|subtotal|net|revenue|income|surplus|deficit|balance|budget|year|actual|variance)\b/i.test(label)) continue;
      const nums = m[2].trim().split(/\s+(?=\$|\(|\d)/).map(x => moneyNum(x.replace(/[()]/g, ''))).filter(n => Number.isFinite(n));
      if (!nums.length) continue;
      out.push({ category: label, annualAmount: nums[nums.length - 1], page: paged ? i + 1 : null, quote: clip(line.trim(), 160), confidence: nums.length > 1 ? 'low' : 'high' });
    }
  });
  return out.length >= 3 ? out : [];
}

function reserves(pages: string[][], paged: boolean): ReserveRow[] {
  const out: ReserveRow[] = [];
  pages.forEach((lines, i) => {
    for (const line of lines) {
      const m = /^\s*([A-Za-z][A-Za-z0-9 &/,'().-]{2,60}?)\s+(\d{1,3})\s+(\d{1,3})\s+\$?\s?([\d,]{3,}(?:\.\d{2})?)\b/.exec(line);
      if (!m) continue;
      out.push({ component: m[1].trim(), usefulLifeYears: Number(m[2]), remainingLifeYears: Number(m[3]), estimatedCost: moneyNum(m[4]), page: paged ? i + 1 : null, quote: clip(line.trim(), 160), confidence: 'low' });
    }
  });
  return out.length >= 3 ? out : [];
}

const COVERAGES = ['Directors and Officers', 'D&O', 'General Liability', 'Commercial General Liability', 'Commercial Property', 'Property', 'Umbrella', 'Excess Liability', 'Fidelity', 'Crime', "Workers' Compensation", 'Workers Compensation', 'Flood', 'Earthquake', 'Boiler and Machinery', 'Equipment Breakdown'];
const usDate = (s: string) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); if (!m) return null; const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; };

function insurance(pages: string[][], paged: boolean, title: string): InsuranceRow[] {
  const text = pages.map(l => l.join('\n')).join('\n');
  const find = (re: RegExp) => { for (let i = 0; i < pages.length; i++) { for (const line of pages[i]) { const m = re.exec(line); if (m) return { m, line, page: paged ? i + 1 : null }; } } return null; };
  const carrier = find(/(?:insurer|insurance company|carrier|issuing company|company)\s*[:–-]\s*([A-Z][^:]{2,60}?)\s*$/i);
  const policy = find(/policy\s*(?:no\.?|number|#)\s*[:–-]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
  if (!carrier && !policy) return [];
  const period = find(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:to|-|–|through|thru)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const premium = find(/(?:total\s+)?(?:annual\s+)?premium\s*[:–-]?\s*\$\s?([\d,]+(?:\.\d{2})?)/i);
  const limit = find(/(?:each occurrence|per occurrence|limit of (?:insurance|liability)|aggregate)\s*[:–-]?\s*\$\s?([\d,]+)/i);
  const type = COVERAGES.find(c => new RegExp(c.replace(/[&']/g, '.'), 'i').test(title)) ?? COVERAGES.find(c => new RegExp(`\\b${c.replace(/[&']/g, '.')}\\b`, 'i').test(text)) ?? 'Insurance policy';
  const first = policy ?? carrier!;
  return [{
    type: type === 'D&O' ? 'Directors and Officers' : type,
    carrier: carrier?.m[1].trim() ?? '', policyNumber: policy?.m[1] ?? null,
    coverage: limit ? `$${moneyNum(limit.m[1]).toLocaleString('en-US')} limit` : null,
    premium: premium ? moneyNum(premium.m[1]) : null,
    expires: period ? usDate(period.m[2]) : null,
    page: first.page, quote: clip([carrier?.line, policy?.line, period?.line].filter(Boolean).join(' · '), 200), confidence: carrier && policy ? 'high' : 'low',
  }];
}

// ── Clauses ───────────────────────────────────────────────────────
//
// Bylaws and rules are written in articles and sections. Each section is
// sorted by its heading (and its article's title): an officer's duties, the
// board's powers and duties, what owners must do, or a rule for residents.
// Sections about procedure (how meetings run, how votes are counted) are
// left out; their numbers are already read as settings above.

const ARTICLE = /^\s*ARTICLE\s+([IVXLC]+|\d+)\b[\s.:–—-]*(.*)$/i;
const SECTION = /^\s*(?:Section|Sec\.|§)\s*(\d+(?:\.\d+)*[A-Za-z]?)\.?\s*[:.–—-]?\s*(.*)$/i;
const NUMBERED = /^\s*(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\.?\s+([A-Z][^.]{2,80}?)(?:\.\s+(.*)|\s*$)/;
const LIST_ITEM = /^\s*(\d{1,2}|[a-z])[.)]\s+(.{12,})$/;

const OFFICE = /\b(President|Vice[- ]President|Treasurer|Secretary)\b/;
const RULE_WORDS = /\b(use restrictions?|restrictions?|pets?|animals?|leas\w*|rental|renting|nuisance|noise|parking|vehicles?|signs?|alterations?|architectur\w*|trash|garbage|refuse|smok\w*|occupancy|rules|regulations|balcon\w*|storage|common elements? use)\b/i;
const OWNER_WORDS = /\b(obligations?|duties|responsibilit\w*|maintenance|maintain|repair|insurance|compliance|comply|liabilit\w*|access|right of entry|sale|transfer|notify|notice to)\b/i;
const BOARD_WORDS = /\b(powers?|duties|responsibilit\w*|qualifications?|removal|vacanc\w*|conflicts? of interest|compensation|indemnif\w*|fidelity|standard of conduct|limitations?)\b/i;

function classify(heading: string, article: string, body: string): { topic: ClauseTopic; role: string | null } | null {
  const h = `${heading} ${article}`;
  const office = OFFICE.exec(heading) ?? (/\bofficers?\b/i.test(article) ? OFFICE.exec(body.slice(0, 80)) : null);
  if (office && !/\belection|\bremoval|\bvacanc/i.test(heading)) return { topic: 'officer', role: office[1].replace('-', ' ').replace(/\bvice\b/i, 'Vice') };
  if (RULE_WORDS.test(heading) || (/\b(use|restriction|rules)\b/i.test(article) && heading)) return { topic: 'rules', role: null };
  if (/\b(unit )?owners?\b|\bmembers?\b/i.test(h) && OWNER_WORDS.test(heading)) return { topic: 'owners', role: null };
  if (/\bmaintenance|repair\b/i.test(heading)) return { topic: 'owners', role: null };
  if (/\b(board|directors?)\b/i.test(h) && BOARD_WORDS.test(heading)) return { topic: 'board', role: null };
  return null;
}

interface Open { ref: string; heading: string; article: string; lines: string[]; page: number | null }

function clauses(pages: string[][], paged: boolean, docType: DocType): ClauseRow[] {
  const out: ClauseRow[] = [];
  let article = ''; let articleNo = '';
  let cur: Open | null = null;
  const close = () => {
    if (!cur) return;
    const body = cur.lines.join(' ').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();
    const heading = cur.heading || clip(body, 70);
    const kind = classify(heading, cur.article, body);
    if (kind && body.length >= 25) {
      const first = body.split(/(?<=[.;])\s+/)[0] ?? body;
      out.push({ topic: kind.topic, role: kind.role, ref: cur.ref, heading: heading.replace(/[.:]$/, ''), text: clip(body, 900), page: cur.page, quote: clip(first, 200), confidence: 'high' });
    }
    cur = null;
  };
  pages.forEach((lines, i) => {
    const page = paged ? i + 1 : null;
    for (const line of lines) {
      const a = ARTICLE.exec(line);
      if (a) { close(); articleNo = a[1]; article = a[2].trim(); continue; }
      if (article === '' && articleNo && line.trim() && !SECTION.test(line) && !NUMBERED.test(line) && line.trim().length < 80) { article = line.trim(); continue; }
      const sec = SECTION.exec(line);
      const num = sec ? null : NUMBERED.exec(line);
      const item = sec || num || docType !== 'rules' ? null : LIST_ITEM.exec(line);
      if (sec || num) {
        close();
        const no = (sec ?? num)![1];
        const rest = sec ? sec[2] : `${num![2]}.${num![3] ? ` ${num![3]}` : ''}`;
        // "Powers and Duties. The Board shall…": the words before the first full stop are the heading.
        const hm = /^([A-Z][^.]{2,80}?)\.\s+(.*)$/.exec(rest) ?? /^([A-Z][^.]{2,80}?)\.?$/.exec(rest);
        cur = { ref: `${articleNo ? `Art. ${articleNo} ` : ''}§${no}`, heading: hm ? hm[1].trim() : '', article, lines: hm?.[2] ? [hm[2]] : hm ? [] : [rest], page };
        continue;
      }
      if (item) {
        close();
        cur = { ref: `Rule ${item[1]}`, heading: '', article: article || 'Rules', lines: [item[2]], page };
        continue;
      }
      if (cur) cur.lines.push(line);
    }
  });
  close();
  return out;
}

// ── The reading ───────────────────────────────────────────────────

/** What a document is, from its words when the file name didn't say. */
export function detectType(pages: string[][], guess: DocType): DocType {
  if (guess !== 'other') return guess;
  const head = pages.slice(0, 2).map(l => l.join(' ')).join(' ').slice(0, 4000);
  if (/\bby-?laws\b/i.test(head)) return 'bylaws';
  if (/declaration of (?:condominium|covenants)|master deed/i.test(head)) return 'declaration';
  if (/declarations? page|named insured|policy (?:no|number|period)/i.test(head)) return 'insurance';
  if (/reserve (?:study|analysis)/i.test(head)) return 'reserve_study';
  if (/\bminutes\b/i.test(head)) return 'minutes';
  if (/\bbudget\b/i.test(head)) return 'budget';
  if (/rules and regulations|house rules/i.test(head)) return 'rules';
  if (/management agreement|agreement between/i.test(head)) return 'contract';
  return 'other';
}

/**
 * Read pages of text. `paged` is false for pasted text (no page numbers).
 * Lists are only read from documents of the matching kind, so a budget's
 * lines are not mistaken for units.
 */
export function extractFromPages(pages: string[][], opts: { title: string; docType: DocType; paged?: boolean }): ReadResult {
  const paged = opts.paged ?? true;
  const t = opts.docType;
  const all = sentences(pages, paged);
  const found = ['bylaws', 'declaration', 'rules', 'other'].includes(t) ? clauses(pages, paged, t) : [];
  // A pets or leasing section is read as a whole clause; don't also offer its first sentence as a setting.
  const ruleHeads = found.filter(c => c.topic === 'rules').map(c => c.heading.toLowerCase()).join(' ');
  const facts0 = facts(all).filter(f => !(f.key === 'pet_rule' && /pet|animal/.test(ruleHeads)) && !(f.key === 'rental_rule' && /leas|rent/.test(ruleHeads)));
  return {
    docType: t,
    title: opts.title,
    pageCount: paged ? pages.length : null,
    summary: '',
    facts: facts0,
    units: ['owner_list', 'declaration', 'bylaws', 'other'].includes(t) ? units(pages, paged, t === 'owner_list') : [],
    board: board(pages, paged),
    insurance: t === 'insurance' ? insurance(pages, paged, opts.title) : [],
    vendors: [],
    budget: t === 'budget' ? budget(pages, paged) : [],
    reserves: t === 'reserve_study' ? reserves(pages, paged) : [],
    clauses: found,
  };
}

export const foundIn = (r: ReadResult) => r.facts.length + r.units.length + r.board.length + r.insurance.length + r.budget.length + r.reserves.length + (r.clauses?.length ?? 0);
