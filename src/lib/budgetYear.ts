/**
 * A fiscal year's budget as the board adopted it, kept after the year is
 * over: each line with what was adopted, what it was amended to, how it falls
 * across the months, and what was spent. Funds › Planning reads the current
 * year from the live budget lines and every other year from these records.
 */
import type { ChartOfAccountsEntry, GLEntry } from '@/types/financial';
import { balanceOf, budgetLineAccounts } from './ledger';
import { spread } from './caseTools';

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** What a line pays for: running the building, a capital job paid from dues, loan payments, or the cushion. */
export type LineKind = 'operating' | 'capital' | 'debt' | 'contingency';
export const KIND_LABEL: Record<LineKind, string> = { operating: 'Operating', capital: 'Capital', debt: 'Loan payments', contingency: 'Cushion' };
export const CAPITAL_PREFIX = 'Capital · ';
export const DEBT_LINE = 'Loan payments';
/** The ledger marks a loan payment with this at the start of its source id. */
export const LOAN_PAYMENT_SOURCE = 'loan-pay:';

/** A line's kind from its name, for budgets made before the kind was kept. */
export function kindOf(name: string): LineKind {
  if (/^capital\b/i.test(name.trim())) return 'capital';
  if (/^loan payments?$/i.test(name.trim())) return 'debt';
  if (/contingenc|cushion/i.test(name)) return 'contingency';
  return 'operating';
}

export interface YearLine {
  id: string;
  name: string;
  kind: LineKind;
  /** What the board adopted, and what the line stands at after any amendment. */
  adopted: number;
  amount: number;
  /** The line by calendar month, January first; adds up to `amount`. */
  months: number[];
  /** What was spent, written when the year is kept at its end. */
  actual: number | null;
}

export interface Amendment { on: string; lineId: string; name: string; from: number; to: number; why: string; by: string }

export interface BudgetYear {
  /** The first day of the fiscal year: the record's key. */
  key: string;
  fyEnd: string;
  label: string;
  /** '' while the budget has not been adopted by a vote the app knows of. */
  adoptedOn: string;
  adoptedHow: string;
  lines: YearLine[];
  /** The year's reserve contribution and what all units were billed a month. */
  reserve: number;
  monthlyDues: number;
  amendments: Amendment[];
  /** When the year's actuals were written in and the year stopped changing. */
  keptOn: string;
}

export const blankYear = (key: string, fyEnd = '', label = ''): BudgetYear => ({ key, fyEnd, label, adoptedOn: '', adoptedHow: '', lines: [], reserve: 0, monthlyDues: 0, amendments: [], keptOn: '' });

/** Whether a year's lines can still be typed over: not once the board has adopted it. Changes then go through a budget amendment. */
export const isLocked = (y: Pick<BudgetYear, 'adoptedOn'> | undefined | null) => !!y?.adoptedOn;

export interface LineInput { id: string; name: string; amount: number; kind?: LineKind; shape?: number[] }

/** The lines of a year, each spread across its months: in the shape given, or evenly. */
export const yearLines = (lines: LineInput[]): YearLine[] =>
  lines.map(l => ({ id: l.id, name: l.name, kind: l.kind ?? kindOf(l.name), adopted: r0(l.amount), amount: r0(l.amount), months: spread(l.amount, l.shape), actual: null }));

/** A line moved to a new amount, its months keeping their shape. */
export function resized(l: YearLine, amount: number): YearLine {
  return { ...l, amount: r0(amount), months: spread(amount, l.months.some(n => n > 0) ? l.months : undefined) };
}

/**
 * The year after its lines changed (an amendment that passed, or a line typed
 * over before adoption). Once adopted, every change is listed; before that the
 * adopted figure simply follows.
 */
export function withAmounts(y: BudgetYear, now: { id: string; name: string; amount: number }[], note: { on: string; why: string; by: string }): BudgetYear {
  const locked = isLocked(y);
  const amendments = [...y.amendments];
  const lines = now.map(n => {
    // A line keeps its history when its id changes (a new line gets its database id after it is saved): matched by name then.
    const found = y.lines.find(l => l.id === n.id) ?? y.lines.find(l => l.name.toLowerCase() === n.name.toLowerCase() && !now.some(x => x.id === l.id));
    const had = found && found.id !== n.id ? { ...found, id: n.id } : found;
    if (!had) {
      if (locked) amendments.push({ on: note.on, lineId: n.id, name: n.name, from: 0, to: r0(n.amount), why: note.why, by: note.by });
      return { ...yearLines([{ id: n.id, name: n.name, amount: n.amount }])[0], adopted: locked ? 0 : r0(n.amount) };
    }
    if (r0(had.amount) === r0(n.amount)) return had.name === n.name && had === found ? had : { ...had, name: n.name };
    if (locked) amendments.push({ on: note.on, lineId: n.id, name: n.name, from: had.amount, to: r0(n.amount), why: note.why, by: note.by });
    const next = resized({ ...had, name: n.name }, n.amount);
    return locked ? next : { ...next, adopted: next.amount };
  });
  return { ...y, lines, amendments };
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * A line's budget for a stretch of dates: each calendar month's figure, with
 * a month only partly inside the stretch counted by its share of days. For a
 * stretch of a year or less.
 */
export function budgetFor(months: number[], from: string, to: string): number {
  if (!months.length || to < from) return 0;
  let total = 0;
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)) - 1;
  for (let n = 0; n < 13; n++) {
    const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    if (first > to) break;
    const len = daysIn(y, m);
    const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(len).padStart(2, '0')}`;
    const a = from > first ? Number(from.slice(8, 10)) : 1;
    const b = to < last ? Number(to.slice(8, 10)) : len;
    if (b >= a) total += (months[m] ?? 0) * ((b - a + 1) / len);
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return r0(total);
}

/** What a line spent between two dates, from the ledger accounts it is measured against. Loan payments are read from the payments posted. */
export function lineActual(line: { id: string; name: string; kind?: LineKind }, coa: ChartOfAccountsEntry[], gl: GLEntry[], from: string, to: string): number {
  const inside = gl.filter(e => e.status !== 'void' && e.date >= from && e.date <= to);
  if ((line.kind ?? kindOf(line.name)) === 'debt') return r2(inside.filter(e => (e.sourceId ?? '').startsWith(LOAN_PAYMENT_SOURCE)).reduce((t, e) => t + e.amount, 0));
  return r2(budgetLineAccounts(line, coa).reduce((t, a) => t + balanceOf(a.num, a.type, inside), 0));
}

/** The year with what each line spent written in, and marked as kept. */
export function kept(y: BudgetYear, coa: ChartOfAccountsEntry[], gl: GLEntry[], on: string): BudgetYear {
  return { ...y, keptOn: on, lines: y.lines.map(l => ({ ...l, actual: lineActual(l, coa, gl, y.key, y.fyEnd) })) };
}

export interface LineStanding { expected: number; over: boolean; ahead: boolean; overBy: number }
/**
 * Where a line stands today: against its yearly figure, and against what its
 * monthly spread says should be spent by now. "Ahead" is more than 10% and
 * $250 past the spread without being over for the year.
 */
export function standing(l: { amount: number; months: number[] }, actual: number, fyStart: string, today: string): LineStanding {
  const expected = budgetFor(l.months, fyStart, today);
  const over = l.amount > 0 && actual > l.amount;
  return { expected, over, ahead: !over && actual - expected > 250 && actual > expected * 1.1, overBy: over ? r2(actual - l.amount) : 0 };
}
