/**
 * Next year's budget draft: what the Annual budget runbook's steps edit.
 *
 * The draft starts from this year's numbers (every budget line with what has
 * been spent so far and where the year is heading, the vendor contracts and
 * the insurance premiums, the reserve study's recommendation, today's dues)
 * and records each decision the board makes on the way: each line's amount,
 * the reserve contribution and the cushion, the dues, the meeting that
 * reviews it, the vote that adopts it. On the first day of the year the app
 * switches Funds over to it (budget lines, every unit's dues, the reserve
 * transfer). Everything here is pure; the store keeps it and the runbook
 * ticks its steps from it.
 */

export interface DraftLine {
  id: string;
  name: string;
  /** The budget category this line came from, when it did. */
  categoryId?: string;
  /** This year: the budget, spent so far, and where the full year is heading. */
  budgeted: number;
  actual: number;
  projected: number;
  /** What the app suggests for next year, and why. */
  suggested: number;
  why: string;
  /** What the board puts in. */
  amount: number;
  reviewed: boolean;
}

/** A known cost for next year: a vendor contract or an insurance premium. */
export interface DraftCost {
  id: string;
  kind: 'contract' | 'insurance';
  name: string;
  detail: string;
  /** A year of it, as the contract or policy reads; 0 when there is no fixed price. */
  annual: number;
  /** The budget line it is paid from. */
  lineId: string | null;
  confirmed: boolean;
}

export type ReserveChoice = 'recommended' | 'keep' | 'custom';
export type DuesOption = 'needed' | 'keep' | 'custom';

export interface BudgetDraft {
  fyStart: string;
  fyEnd: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  lines: DraftLine[];
  costs: DraftCost[];
  /** Today's numbers, kept so the draft compares against where it started. */
  base: { reserveAnnual: number; recommendedReserve: number; monthlyDues: number };
  reserve: { choice: ReserveChoice | null; annual: number };
  contingencyPct: number | null;
  dues: { option: DuesOption | null; monthlyTotal: number };
  /** The bylaws' cap on a dues increase without an owner vote, in percent; null when not known. */
  capPct: number | null;
  review?: { meetingId: string; itemId: string };
  adoptedAt?: string;
  adoptedHow?: string;
  noticeAt?: string;
  switchedAt?: string;
  filedAt?: string;
}

export interface SeedInput {
  fy: { start: string; end: string };
  label: string;
  today: string;
  /** This fiscal year, for how far along the spending is. */
  thisYear: { start: string; end: string };
  lines: { id?: string; name: string; budgeted: number; actual: number }[];
  vendors: { id: string; name: string; service: string; contract: string; status: string }[];
  insurance: { id: string; type: string; carrier: string; premium: string; expires: string }[];
  reserveAnnual: number;
  recommendedReserve: number;
  units: { number: string; monthlyFee: number; votingPct: number }[];
  capPct?: number | null;
}

export const INFLATION = 0.03;
export const CONTINGENCY_OPTIONS = [3, 5, 10];
const round10 = (n: number) => Math.round(n / 10) * 10;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** How much of this fiscal year has gone, 0–1. */
export function yearElapsed(today: string, fy: { start: string; end: string }): number {
  const total = days(fy.start, fy.end) + 1;
  return Math.min(1, Math.max(0, (days(fy.start, today) + 1) / total));
}

/** "$650/mo" → 7,800; "Annual, $3,200/yr" → 3,200; "On-call" → 0. */
export function annualFromText(text: string): number {
  const m = /\$\s?([\d,]+(?:\.\d+)?)\s*(?:\/\s*|per\s+)?(mo|month|yr|year|annual|qtr|quarter)?/i.exec(text || '');
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ''));
  const per = (m[2] || (/monthly/i.test(text) ? 'mo' : /quarter/i.test(text) ? 'qtr' : 'yr')).toLowerCase();
  if (per.startsWith('mo')) return Math.round(n * 12);
  if (per.startsWith('q')) return Math.round(n * 4);
  return Math.round(n);
}

/** Where a year is heading from what it has spent so far; this year's budget when it is too early to tell. */
export function projectYear(actual: number, budgeted: number, elapsed: number): number {
  if (actual <= 0) return budgeted;
  if (elapsed < 0.25) return Math.max(actual, budgeted);
  return Math.round(actual / elapsed);
}

const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
/** The budget line a vendor's service or a policy is paid from, by name. */
export function matchLine(lines: { id: string; name: string }[], text: string, fallback?: RegExp): string | null {
  const w = words(text);
  const hit = lines.find(l => words(l.name).some(x => w.some(y => y.startsWith(x.slice(0, 5)) || x.startsWith(y.slice(0, 5)))));
  if (hit) return hit.id;
  const fb = fallback ? lines.find(l => fallback.test(l.name)) : undefined;
  return fb?.id ?? null;
}

export function suggestLine(l: { budgeted: number; actual: number }, elapsed: number): { projected: number; suggested: number; why: string } {
  const projected = projectYear(l.actual, l.budgeted, elapsed);
  const up = `${INFLATION * 100}%`;
  if (l.actual <= 0) return { projected, suggested: round10(l.budgeted * (1 + INFLATION)), why: `This year's budget plus ${up} for prices` };
  if (elapsed < 0.25) return { projected, suggested: round10(Math.max(l.actual, l.budgeted) * (1 + INFLATION)), why: `Too early in the year to project; this year's budget plus ${up}` };
  if (projected > l.budgeted) return { projected, suggested: round10(projected * (1 + INFLATION)), why: `This year is heading to ${usd(projected)}, over its budget; that plus ${up} for prices` };
  // Spending under budget can be timing (a repair not done yet), so the suggestion keeps the budget; lower it when the savings will last.
  if (projected < l.budgeted * 0.8) return { projected, suggested: round10(l.budgeted * (1 + INFLATION)), why: `This year is heading to ${usd(projected)}, well under its budget. Kept at the budget plus ${up}: lower it if the savings will last` };
  return { projected, suggested: round10(l.budgeted * (1 + INFLATION)), why: `This year is heading to ${usd(projected)}, about its budget; the budget plus ${up}` };
}

export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** A first draft for next year, from this year's numbers. */
export function seedDraft(i: SeedInput): BudgetDraft {
  const elapsed = yearElapsed(i.today, i.thisYear);
  const lines: DraftLine[] = i.lines.map((l, n) => {
    const s = suggestLine(l, elapsed);
    return { id: l.id ?? `line-${n}`, name: l.name, categoryId: l.id, budgeted: l.budgeted, actual: l.actual, projected: s.projected, suggested: s.suggested, why: s.why, amount: s.suggested, reviewed: false };
  });
  const costs: DraftCost[] = [
    ...i.vendors.filter(v => v.status === 'active').map(v => ({
      id: `vendor:${v.id}`, kind: 'contract' as const, name: v.name, detail: `${v.service} · ${v.contract || 'no contract on file'}`,
      annual: annualFromText(v.contract), lineId: matchLine(lines, `${v.service} ${v.name}`, /maint|repair|contract|service/i), confirmed: false,
    })),
    ...i.insurance.map(p => ({
      id: `policy:${p.id}`, kind: 'insurance' as const, name: `${p.type} · ${p.carrier}`, detail: `Premium ${p.premium || 'not on file'}${p.expires ? ` · renews ${p.expires}` : ''}`,
      annual: annualFromText(p.premium), lineId: matchLine(lines, 'insurance', /insur/i), confirmed: false,
    })),
  ];
  // A line is suggested at no less than what its contracts and premiums cost.
  for (const l of lines) {
    const known = costs.filter(c => c.lineId === l.id).reduce((t, c) => t + c.annual, 0);
    if (known > l.suggested) { l.suggested = round10(known); l.amount = l.suggested; l.why = `What its contracts and premiums cost next year (${usd(known)})`; }
  }
  const monthlyDues = i.units.reduce((t, u) => t + u.monthlyFee, 0);
  const now = new Date().toISOString();
  return {
    fyStart: i.fy.start, fyEnd: i.fy.end, label: i.label, createdAt: now, updatedAt: now,
    lines, costs,
    base: { reserveAnnual: i.reserveAnnual, recommendedReserve: i.recommendedReserve, monthlyDues },
    reserve: { choice: null, annual: Math.max(i.reserveAnnual, i.recommendedReserve) },
    contingencyPct: null,
    dues: { option: null, monthlyTotal: monthlyDues },
    capPct: i.capPct ?? null,
  };
}

/** What the lines, the cushion and the reserves add up to, and the dues that pay for them. */
export function draftTotals(d: BudgetDraft) {
  const operating = d.lines.reduce((t, l) => t + (l.amount || 0), 0);
  const contingency = Math.round(operating * ((d.contingencyPct ?? 0) / 100));
  const reserve = d.reserve.annual || 0;
  const needed = operating + contingency + reserve;
  const neededMonthly = Math.ceil(needed / 12);
  const monthly = d.dues.option === 'needed' || d.dues.option === null ? neededMonthly : d.dues.option === 'keep' ? d.base.monthlyDues : d.dues.monthlyTotal;
  const change = d.base.monthlyDues > 0 ? (monthly - d.base.monthlyDues) / d.base.monthlyDues : 0;
  const shortfall = Math.max(0, needed - monthly * 12);
  return { operating, contingency, reserve, needed, neededMonthly, monthly, change, shortfall };
}

/** Each unit's new monthly dues: its share of the total, by percentage interest (or today's split when shares are missing). */
export function duesByUnit(units: { number: string; monthlyFee: number; votingPct: number }[], monthlyTotal: number): { unit: string; now: number; next: number }[] {
  const pctSum = units.reduce((t, u) => t + (u.votingPct || 0), 0);
  const feeSum = units.reduce((t, u) => t + (u.monthlyFee || 0), 0);
  return units.map(u => {
    const share = pctSum > 0 ? (u.votingPct || 0) / pctSum : feeSum > 0 ? u.monthlyFee / feeSum : 1 / Math.max(1, units.length);
    return { unit: u.number, now: u.monthlyFee, next: Math.round(monthlyTotal * share * 100) / 100 };
  });
}

/** The bylaws' cap on a dues increase without an owner vote, read from the clauses on file. */
export function capFromClauses(clauses: { heading: string; text: string; ref: string }[]): { pct: number; ref: string } | null {
  for (const c of clauses) {
    const t = `${c.heading} ${c.text}`;
    if (!/assessment|dues|budget|common expense/i.test(t) || !/increase|exceed/i.test(t)) continue;
    const m = /(\d{1,2}(?:\.\d)?)\s?(%|percent)/i.exec(t);
    if (m) return { pct: Number(m[1]), ref: c.ref };
  }
  return null;
}

/** An owner vote is needed when the increase passes the cap. */
export const needsOwnerVote = (d: BudgetDraft) => d.capPct != null && draftTotals(d).change * 100 > d.capPct;

// ── Steps ────────────────────────────────────────────────────────────────────

export type BudgetStepKey = 'start' | 'costs' | 'lines' | 'reserve' | 'dues' | 'review' | 'adopt' | 'notify' | 'switch' | 'file';

/** Which part of the budget a step is, from its title; works for the steps written before these too. */
export function budgetStepKey(title: string): BudgetStepKey | null {
  const t = title.toLowerCase();
  if (/draft (forward|from this year)|start (the|next year's) .*draft|roll .* draft|^review current year financials/.test(t)) return 'start';
  if (/contracts and insurance|^obtain bids, contract renewals/.test(t)) return 'costs';
  if (/every line|set .*lines? for|^draft proposed budget/.test(t)) return 'lines';
  if (/reserve contribution|cushion|contingency|^review reserve study/.test(t)) return 'reserve';
  if (/^pick .*dues|dues option|assessment increase triggers owner vote/.test(t)) return 'dues';
  if (/agenda|reviews the draft|^schedule budget presentation/.test(t)) return 'review';
  if (/votes to adopt|adopt the budget|and adopt budget$/.test(t)) return 'adopt';
  if (/^tell owners/.test(t)) return 'notify';
  if (/switch funds|dues on the fee schedule|enter the adopted lines/.test(t)) return 'switch';
  if (/^file the adopted budget/.test(t)) return 'file';
  return null;
}

/** What the draft shows done, step by step. The notice is checked by the runbook, from the notices posted. */
export function draftDone(d: BudgetDraft | undefined): Record<BudgetStepKey, boolean> {
  return {
    start: !!d,
    costs: !!d && d.costs.every(c => c.confirmed),
    lines: !!d && d.lines.length > 0 && d.lines.every(l => l.reviewed),
    reserve: !!d && d.reserve.choice !== null && d.contingencyPct !== null,
    dues: !!d && d.dues.option !== null,
    review: !!d?.review,
    adopt: !!d?.adoptedAt,
    notify: !!d?.noticeAt,
    switch: !!d?.switchedAt,
    file: !!d?.filedAt,
  };
}

/** The adopted budget as a plain page, for the minutes and Building › Documents. */
export function budgetDocument(d: BudgetDraft, building: string, units: { number: string; monthlyFee: number; votingPct: number }[]): string {
  const t = draftTotals(d);
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const row = (a: string, b: string, c = '') => `<tr><td>${esc(a)}</td><td style="text-align:right">${b}</td><td style="text-align:right">${c}</td></tr>`;
  const perUnit = duesByUnit(units, t.monthly).map(u => row(`Unit ${u.unit}`, usd(u.now), usd(u.next))).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(building)} · ${d.label} budget</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:720px;margin:32px auto;color:#0d1b2e}table{width:100%;border-collapse:collapse;margin:12px 0 24px}td,th{border-bottom:1px solid #dde3ea;padding:6px 4px}th{text-align:left}</style></head><body>
<h1>${esc(building)}</h1><h2>${d.label} budget${d.adoptedAt ? `, adopted ${d.adoptedAt.slice(0, 10)}` : ' (proposed)'}</h2>
<p>Fiscal year ${d.fyStart} to ${d.fyEnd}.${d.adoptedHow ? ` ${esc(d.adoptedHow)}.` : ''}</p>
<table><tr><th>Line</th><th style="text-align:right">This year's budget</th><th style="text-align:right">${d.label}</th></tr>
${d.lines.map(l => row(l.name, usd(l.budgeted), usd(l.amount))).join('')}
${row('Contingency', '', `${usd(t.contingency)} (${d.contingencyPct ?? 0}%)`)}
${row('Reserve contribution', usd(d.base.reserveAnnual), usd(t.reserve))}
<tr><th>Total</th><th></th><th style="text-align:right">${usd(t.needed)}</th></tr></table>
<h3>Dues</h3><p>${usd(t.monthly)} a month for the building (${t.change >= 0 ? '+' : ''}${(t.change * 100).toFixed(1)}% on today's ${usd(d.base.monthlyDues)}).</p>
<table><tr><th>Unit</th><th style="text-align:right">Today, a month</th><th style="text-align:right">${d.label}, a month</th></tr>${perUnit}</table>
</body></html>`;
}

/** The owner notice for the adopted budget. */
export function noticeText(d: BudgetDraft, units: { number: string; monthlyFee: number; votingPct: number }[]): { title: string; body: string } {
  const t = draftTotals(d);
  const per = duesByUnit(units, t.monthly);
  const avgNow = per.length ? per.reduce((s, u) => s + u.now, 0) / per.length : 0;
  const avgNext = per.length ? per.reduce((s, u) => s + u.next, 0) / per.length : 0;
  const pct = (t.change * 100).toFixed(1);
  return {
    title: `The ${d.label} budget and dues`,
    body: [
      `The board adopted the ${d.label} budget${d.adoptedAt ? ` on ${d.adoptedAt.slice(0, 10)}` : ''}. It takes effect ${d.fyStart}.`,
      `Total: ${usd(t.needed)} for the year: ${usd(t.operating)} to run the building, ${usd(t.contingency)} set aside for the unexpected, and ${usd(t.reserve)} into reserves for future repairs.`,
      t.change === 0 ? 'Dues stay the same.' : `Dues ${t.change > 0 ? 'go up' : 'go down'} ${Math.abs(Number(pct))}%: about ${usd(avgNow)} to ${usd(avgNext)} a month for an average unit. Your unit's new amount is under Me › Units.`,
      'The full budget is under Building › Documents. Questions go to the board through Community › Requests.',
    ].join('\n\n'),
  };
}
