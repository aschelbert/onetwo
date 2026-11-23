/**
 * The work that hangs off the long-standing runbooks (month close,
 * collections, insurance renewal, annual budget, year-end close). Each piece
 * is kept as a small record beside its action and shown with it in the Board
 * Room; the pure rules are here.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Bank reconciliation (month close) ─────────────────────────────────────────
export interface Reconciliation {
  acct: string;
  /** 'YYYY-MM'. */
  period: string;
  /** The closing balance on the bank statement. */
  bankBalance: number;
  /** Money the books show that the bank has not seen yet: uncashed checks (negative) and deposits in transit (positive). */
  outstanding: { id: string; what: string; amount: number }[];
  preparedBy: string;
  preparedOn: string;
  signedBy: string;
  signedOn: string;
}
export const blankReconciliation = (acct: string, period: string): Reconciliation => ({ acct, period, bankBalance: 0, outstanding: [], preparedBy: '', preparedOn: '', signedBy: '', signedOn: '' });

/** The bank's balance once uncashed checks and deposits in transit are counted, and what is still unexplained against the books. */
export function reconcile(rec: Reconciliation, bookBalance: number) {
  const adjustedBank = r2(rec.bankBalance + rec.outstanding.reduce((t, o) => t + o.amount, 0));
  return { adjustedBank, leftToExplain: r2(adjustedBank - bookBalance) };
}

/** Why this person cannot sign the reconciliation, or '' when they can. Whoever prepared it cannot be the one who signs. */
export function signBlocker(rec: Reconciliation, bookBalance: number, who: string): string {
  if (!rec.preparedOn) return 'It has not been prepared yet';
  if (reconcile(rec, bookBalance).leftToExplain !== 0) return 'There is still a difference to explain';
  if (who.trim().toLowerCase() === rec.preparedBy.trim().toLowerCase()) return 'Whoever prepared it cannot also sign it';
  return '';
}

// ── Allowance for dues that may not be collected (year-end) ───────────────────
export type BucketId = 'recent' | 'late' | 'old';
export interface AgingBucket { id: BucketId; label: string; owed: number; units: number; pct: number }
export const DEFAULT_ALLOWANCE_PCT: Record<BucketId, number> = { recent: 0, late: 10, old: 50 };

/** What is owed, by how long it has been due: up to 60 days, 61 to 180, over 180. */
export function agingBuckets(open: { unitNumber: string; dueDate: string; remaining: number }[], asOf: string, pct: Record<BucketId, number> = DEFAULT_ALLOWANCE_PCT): AgingBucket[] {
  const days = (d: string) => Math.round((Date.parse(asOf) - Date.parse(d)) / 86400000);
  const pick = (id: BucketId, label: string, test: (n: number) => boolean): AgingBucket => {
    const mine = open.filter(i => i.remaining > 0 && test(days(i.dueDate)));
    return { id, label, owed: r2(mine.reduce((t, i) => t + i.remaining, 0)), units: new Set(mine.map(i => i.unitNumber)).size, pct: pct[id] };
  };
  return [pick('recent', 'Up to 60 days', n => n <= 60), pick('late', '61 to 180 days', n => n > 60 && n <= 180), pick('old', 'Over 180 days', n => n > 180)];
}
export const allowanceTarget = (buckets: AgingBucket[]) => r2(buckets.reduce((t, b) => t + (b.owed * b.pct) / 100, 0));

// ── Is the building insured for enough (insurance renewal) ────────────────────
export interface RebuildCheck { appraisal: number; appraisedOn: string; growthPct: number; floorPct: number; limit: number; chosenLimit: number; reason: string; decidedOn: string }
export const blankRebuildCheck = (limit: number): RebuildCheck => ({ appraisal: 0, appraisedOn: '', growthPct: 4, floorPct: 80, limit, chosenLimit: 0, reason: '', decidedOn: '' });

/** "$14,000,000 blanket" gives 14000000; "$14M" gives 14000000. */
export function parseMoney(text: string | undefined | null): number {
  const m = /([\d,]+(?:\.\d+)?)\s*(m|million|k)?/i.exec(text ?? '');
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ''));
  const unit = (m[2] ?? '').toLowerCase();
  return Math.round(n * (unit.startsWith('m') ? 1e6 : unit === 'k' ? 1e3 : 1));
}

/** The rebuild cost today: the appraisal grown by the yearly rate for the time since, to the nearest $100,000. */
export function rebuildCostToday(c: Pick<RebuildCheck, 'appraisal' | 'appraisedOn' | 'growthPct'>, today: string): number {
  if (!c.appraisal) return 0;
  const years = c.appraisedOn ? Math.max(0, (Date.parse(today) - Date.parse(c.appraisedOn)) / (365.25 * 86400000)) : 0;
  return Math.round((c.appraisal * Math.pow(1 + c.growthPct / 100, years)) / 100000) * 100000;
}

export function rebuildStanding(c: RebuildCheck, today: string) {
  const rebuild = rebuildCostToday(c, today);
  const insuredPct = rebuild > 0 ? Math.round((c.limit / rebuild) * 100) : null;
  const floor = Math.round((rebuild * c.floorPct) / 100);
  const monthsOld = c.appraisedOn ? Math.round((Date.parse(today) - Date.parse(c.appraisedOn)) / (30.44 * 86400000)) : null;
  return { rebuild, insuredPct, floor, underFloor: insuredPct != null && insuredPct < c.floorPct, monthsOld };
}

// ── The year's objectives and outcomes (annual budget, year-end) ──────────────
export type Measure = 'dues-increase' | 'reserve-funded' | 'late-dues' | 'utilities' | 'custom';
export const MEASURES: Record<Measure, { label: string; unit: 'pct' | 'usd' | ''; direction: 'at-most' | 'at-least'; from: string }> = {
  'dues-increase': { label: 'Hold the dues increase down', unit: 'pct', direction: 'at-most', from: 'Entered when the dues are set' },
  'reserve-funded': { label: 'Build the reserves', unit: 'pct', direction: 'at-least', from: 'Reserve items: funded against cost' },
  'late-dues': { label: 'Bring late dues down', unit: 'pct', direction: 'at-most', from: "What owners owe, against a year's dues" },
  utilities: { label: 'Hold utility cost down', unit: 'usd', direction: 'at-most', from: "The year's bills under Building, Utilities" },
  custom: { label: 'Something else', unit: '', direction: 'at-least', from: 'Entered by the board at year end' },
};
export interface Objective { id: string; measure: Measure; text: string; target: number; result: number | null; note: string }
export interface YearPlan { year: string; objectives: Objective[]; setOn: string; outcomeOn: string; outcomeBy: string }
export const blankPlan = (year: string): YearPlan => ({ year, objectives: [], setOn: '', outcomeOn: '', outcomeBy: '' });

/** Whether an objective was met, or null while it has no result. */
export function met(o: Objective): boolean | null {
  if (o.result == null) return null;
  return MEASURES[o.measure].direction === 'at-most' ? o.result <= o.target : o.result >= o.target;
}

export const showMeasure = (measure: Measure, n: number) => {
  const u = MEASURES[measure].unit;
  return u === 'usd' ? '$' + Math.round(n).toLocaleString('en-US') : u === 'pct' ? n + '%' : String(n);
};

export function outcomeLine(o: Objective): string {
  const m = met(o);
  const bound = MEASURES[o.measure].direction === 'at-most' ? 'at most' : 'at least';
  const result = o.result == null ? 'no result yet' : showMeasure(o.measure, o.result);
  return o.text + ': ' + result + ', target ' + bound + ' ' + showMeasure(o.measure, o.target) + (m == null ? '' : m ? ' · met' : ' · missed');
}

// ── Spreading a budget line across the year (annual budget) ───────────────────
/** Twelve whole-dollar months that add up to the yearly figure exactly: even, or in the shape of last year's spending. */
export function spread(annual: number, shape?: number[]): number[] {
  const total = Math.round(annual);
  const weights: number[] = shape && shape.length === 12 && shape.some(n => n > 0) ? shape.map(n => Math.max(0, n)) : Array(12).fill(1);
  const sum = weights.reduce((t, n) => t + n, 0);
  const months = weights.map(w => Math.floor((total * w) / sum));
  let left = total - months.reduce((t, n) => t + n, 0);
  // Hand the leftover dollars to the heaviest months first, so the total is exact.
  const order = weights.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(x => x[1]);
  for (let k = 0; left > 0; k = (k + 1) % 12) { months[order[k]] += 1; left -= 1; }
  return months;
}

// ── Reserve contribution levels (annual budget) ───────────────────────────────
/** Three yearly contribution levels from the reserve items: this year's, what funds every item by its replacement date, and halfway. */
export function contributionLevels(items: { estimatedCost: number; currentFunding: number; yearsRemaining: number; isContingency?: boolean }[], current: number) {
  const full = Math.round(items.filter(i => !i.isContingency && i.yearsRemaining > 0).reduce((t, i) => t + Math.max(0, i.estimatedCost - i.currentFunding) / i.yearsRemaining, 0));
  const baseline = Math.round(current);
  return [
    { id: 'baseline', label: 'As now', amount: baseline, note: "Keeps this year's contribution" },
    { id: 'halfway', label: 'Halfway', amount: Math.round((baseline + full) / 2), note: 'Closes half the gap to full funding' },
    { id: 'full', label: 'Full funding', amount: full, note: 'Funds every item by its replacement date' },
  ];
}
