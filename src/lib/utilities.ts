/**
 * Utility meters and bills: what the building used and what it cost, month by
 * month. Kept as one standing document (kind 'utilities') in the action
 * records, read on Building › Care › Utilities, and the source for the utility spike
 * and energy benchmarking actions.
 */
export type Utility = 'electricity' | 'gas' | 'water';
export const UTILITIES: Record<Utility, { label: string; unit: string }> = {
  electricity: { label: 'Electricity', unit: 'kWh' },
  gas: { label: 'Gas', unit: 'therms' },
  water: { label: 'Water and sewer', unit: 'gallons' },
};

export interface Meter { id: string; name: string; utility: Utility; account: string }
export interface UtilityBill {
  id: string;
  meterId: string;
  /** The month the bill covers, 'YYYY-MM'. */
  month: string;
  use: number;
  cost: number;
  /** An estimated read, not an actual one. */
  estimated: boolean;
  enteredOn: string;
}
/** A project that would cut the bills, with what it costs and saves. */
export interface SavingsProject { id: string; name: string; cost: number; rebate: number; savesPerYear: number }
export interface UtilitiesDoc { meters: Meter[]; bills: UtilityBill[]; projects: SavingsProject[] }
export const EMPTY_UTILITIES: UtilitiesDoc = { meters: [], bills: [], projects: [] };
export const utilitiesFrom = (data: unknown): UtilitiesDoc => ({ ...EMPTY_UTILITIES, ...((data as Partial<UtilitiesDoc>) ?? {}) });

/** A bill this far above usual opens a utility spike action. */
export const SPIKE_RATIO = 1.5;

const avg = (ns: number[]) => (ns.length ? ns.reduce((t, n) => t + n, 0) / ns.length : 0);

/**
 * What a meter usually uses in a month: the average of the same month in
 * earlier years, or, with no earlier year, the average of its other bills once
 * there are at least three. Null when there is too little to compare with.
 */
export function usualUse(bills: UtilityBill[], meterId: string, month: string): number | null {
  const mine = bills.filter(b => b.meterId === meterId && b.month !== month && !b.estimated);
  const sameMonth = mine.filter(b => b.month.slice(5) === month.slice(5) && b.month < month);
  if (sameMonth.length) return avg(sameMonth.map(b => b.use));
  const before = mine.filter(b => b.month < month);
  return before.length >= 3 ? avg(before.map(b => b.use)) : null;
}

export interface Spike { usual: number; ratio: number; extraCost: number }
/** Whether a bill is a spike, and by how much. An estimated read is never one. */
export function spikeOf(bill: UtilityBill, bills: UtilityBill[]): Spike | null {
  if (bill.estimated || bill.use <= 0) return null;
  const usual = usualUse(bills, bill.meterId, bill.month);
  if (!usual || bill.use <= usual * SPIKE_RATIO) return null;
  const rate = bill.cost / bill.use;
  return { usual: Math.round(usual), ratio: Math.round((bill.use / usual) * 10) / 10, extraCost: Math.round((bill.use - usual) * rate) };
}

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
export const monthsOf = (year: number) => MONTHS.map(m => `${year}-${m}`);
/** The months of a year a meter has no bill for. */
export const missingMonths = (doc: UtilitiesDoc, meterId: string, year: number) => {
  const have = new Set(doc.bills.filter(b => b.meterId === meterId).map(b => b.month));
  return monthsOf(year).filter(m => !have.has(m));
};
/** Every meter has all twelve months of the year. */
export const yearComplete = (doc: UtilitiesDoc, year: number) => doc.meters.length > 0 && doc.meters.every(m => missingMonths(doc, m.id, year).length === 0);

export interface UtilityTotal { utility: Utility; use: number; cost: number; lastYearCost: number | null; rate: number }
/** Use and cost by utility for a year, with the cost of the same months a year earlier. */
export function totalsFor(doc: UtilitiesDoc, year: number): UtilityTotal[] {
  return (Object.keys(UTILITIES) as Utility[]).map(utility => {
    const meters = new Set(doc.meters.filter(m => m.utility === utility).map(m => m.id));
    const mine = doc.bills.filter(b => meters.has(b.meterId));
    const now = mine.filter(b => b.month.startsWith(`${year}-`));
    const months = new Set(now.map(b => b.month.slice(5)));
    const before = mine.filter(b => b.month.startsWith(`${year - 1}-`) && months.has(b.month.slice(5)));
    const use = now.reduce((t, b) => t + b.use, 0), cost = now.reduce((t, b) => t + b.cost, 0);
    return { utility, use, cost: Math.round(cost * 100) / 100, lastYearCost: before.length ? Math.round(before.reduce((t, b) => t + b.cost, 0) * 100) / 100 : null, rate: use > 0 ? cost / use : 0 };
  }).filter(t => doc.meters.some(m => m.utility === t.utility));
}

/** Years until a project's saving has paid for it: cost less rebate, over the yearly saving. Null when it saves nothing. */
export const paybackYears = (p: Pick<SavingsProject, 'cost' | 'rebate' | 'savesPerYear'>) => (p.savesPerYear > 0 ? Math.round((Math.max(0, p.cost - p.rebate) / p.savesPerYear) * 10) / 10 : null);

const csv = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** A year's meter readings as a spreadsheet: one row per meter and month, the figures Portfolio Manager asks for. */
export function benchmarkCsv(doc: UtilitiesDoc, year: number): string {
  const rows = [['Meter', 'Type', 'Unit', 'Start date', 'End date', 'Usage', 'Cost', 'Estimated']];
  for (const m of doc.meters) for (const month of monthsOf(year)) {
    const b = doc.bills.find(x => x.meterId === m.id && x.month === month);
    if (!b) continue;
    const end = new Date(Date.UTC(year, Number(month.slice(5)), 0)).toISOString().slice(0, 10);
    rows.push([m.name, UTILITIES[m.utility].label, UTILITIES[m.utility].unit, `${month}-01`, end, String(b.use), String(b.cost), b.estimated ? 'Yes' : 'No']);
  }
  return rows.map(r => r.map(csv).join(',')).join('\n');
}

export const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** What to check when a meter spikes, by utility. */
export const SPIKE_CHECKS: Record<Utility, string[]> = {
  water: ['Read the meter at night with everything off: is it still turning?', 'Pool fill valve and auto-fill', 'Cooling tower make-up and boiler feed', 'Running toilets in common bathrooms; irrigation left on', 'Ask owners to report a running toilet or a wet ceiling'],
  electricity: ['New equipment added, or equipment running that is usually off', 'Timers and schedules for lighting and ventilation', 'A hotter or colder month than usual', 'A motor, pump or compressor running without stopping', 'Anything plugged into common-area outlets'],
  gas: ['A colder month than usual', 'Boiler settings, and whether it is short-cycling', 'Hot-water temperature and recirculation pump', 'The smell of gas anywhere: call the gas company at once', 'When the boiler was last serviced'],
};

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const UNIT_WORDS: Record<Utility, RegExp> = { electricity: /([\d,]+(?:\.\d+)?)\s*kwh/i, gas: /([\d,]+(?:\.\d+)?)\s*(?:therms?|ccf)/i, water: /([\d,]+(?:\.\d+)?)\s*(?:gallons?|gal\b|ccf)/i };
const toNum = (s: string) => Number(s.replace(/,/g, ''));

/**
 * A first reading of a utility bill's text: the amount due, the use in the
 * meter's unit, and the month the service period ends in. Bills differ, so
 * every figure is a suggestion for a person to confirm; anything not found
 * is left out.
 */
export function readBill(text: string, utility: Utility): { use?: number; cost?: number; month?: string; estimated?: boolean } {
  const out: { use?: number; cost?: number; month?: string; estimated?: boolean } = {};
  const due = /(?:total\s+)?(?:amount|balance)\s+due[^$\d]{0,40}\$?\s*([\d,]+\.\d{2})/i.exec(text) ?? /(?:total\s+(?:current\s+)?charges|new\s+charges)[^$\d]{0,40}\$?\s*([\d,]+\.\d{2})/i.exec(text);
  if (due) out.cost = toNum(due[1]);
  const uses = [...text.matchAll(new RegExp(UNIT_WORDS[utility].source, 'gi'))].map(m => toNum(m[1])).filter(n => n > 0);
  // The largest figure in the meter's unit is nearly always the period's total, not a rate tier.
  if (uses.length) out.use = Math.max(...uses);
  const period = /(?:service|billing)\s+(?:period|dates?)[^\d]{0,30}(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*(?:-|to|through|–)\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i.exec(text);
  if (period) { const y = period[6].length === 2 ? '20' + period[6] : period[6]; out.month = y + '-' + period[4].padStart(2, '0'); }
  else {
    const named = new RegExp('(?:service|billing)\\s+(?:period|dates?)[^\\n]{0,60}?(' + MONTH_NAMES.join('|') + ')[a-z]*\\.?\\s+\\d{1,2},?\\s+(\\d{4})\\s*$', 'im').exec(text);
    if (named) out.month = named[2] + '-' + String(MONTH_NAMES.indexOf(named[1].toLowerCase()) + 1).padStart(2, '0');
  }
  if (/\bestimated?\s+(?:read|reading|bill|usage)/i.test(text)) out.estimated = true;
  return out;
}
