/**
 * How long each kind of record is kept, what is held against that period,
 * and what the wage law asks an employer to keep for each employee. Pure:
 * the schedule and lists of dated items in, rows out. Nothing here deletes
 * anything; disposal is a list the board approves.
 */
const ISO = /^\d{4}-\d{2}-\d{2}/;
const addYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4, 10)}`;

export type RecordKind = 'governing' | 'minutes' | 'ledger' | 'bills' | 'tax' | 'contracts' | 'wages' | 'upkeep' | 'actions' | 'unit-documents';

/** What the period is counted from. */
export type From = 'made' | 'closed' | 'ended' | 'left';
export const FROM_LABEL: Record<From, string> = { made: 'from when it was made', closed: 'from closing', ended: 'after it ends', left: 'after the owner leaves' };

export interface Rule {
  kind: RecordKind;
  label: string;
  /** Years it is kept; null is for good. */
  years: number | null;
  from: From;
  /** The shortest the board may set, where a law sets a floor; 0 where none does. */
  floor: number;
  why: string;
}

/** Where a building starts. The board can change any period, down to the floor. */
export const DEFAULT_RULES: Rule[] = [
  { kind: 'governing', label: 'Declaration, bylaws, plats, amendments', years: null, from: 'made', floor: 0, why: 'They are what the association is; a buyer or a court can ask for any version' },
  { kind: 'minutes', label: 'Minutes and meeting records', years: null, from: 'made', floor: 0, why: "The record of every decision the board and the owners made" },
  { kind: 'ledger', label: 'Ledger, statements, bank reconciliations', years: 7, from: 'made', floor: 3, why: 'Tax returns can be questioned for years after they are filed' },
  { kind: 'bills', label: 'Bills, invoices and receipts', years: 7, from: 'made', floor: 3, why: 'They back the figures in the ledger and the tax returns' },
  { kind: 'tax', label: 'Tax returns and their workpapers', years: null, from: 'made', floor: 0, why: 'A return that cannot be produced cannot be defended' },
  { kind: 'contracts', label: 'Contracts and bids', years: 7, from: 'ended', floor: 3, why: 'A claim on a contract can arrive years after the work is done' },
  { kind: 'wages', label: 'Wage and hour records', years: 3, from: 'made', floor: 3, why: "The District's wage law has an employer keep them at least 3 years (D.C. Code § 32-1008)" },
  { kind: 'upkeep', label: 'Inspection and maintenance records', years: null, from: 'made', floor: 0, why: 'Kept for the life of the equipment: the next inspector, insurer or buyer reads them' },
  { kind: 'actions', label: 'Closed actions, requests and letters', years: 7, from: 'closed', floor: 3, why: 'The decision trail behind each one, should it be challenged' },
  { kind: 'unit-documents', label: "Owners' unit documents", years: 3, from: 'left', floor: 1, why: 'Kept while they own the unit, and three years after' },
];

/** The schedule a building is on: the defaults with any period the board changed. */
export function rulesWith(changes: Partial<Record<RecordKind, number | null>> | undefined): Rule[] {
  return DEFAULT_RULES.map(r => {
    const c = changes?.[r.kind];
    if (c === undefined) return r;
    return { ...r, years: c === null ? null : Math.max(r.floor, Math.round(c) || r.floor) };
  });
}

export const periodLabel = (r: Pick<Rule, 'years' | 'from'>) => (r.years == null ? 'For good' : `${r.years} year${r.years === 1 ? '' : 's'} ${FROM_LABEL[r.from]}`);

/** One thing held: the date its period runs from ('' when that has not happened, such as a contract still running), and what a hold would match it by. */
export interface Held { id: string; label: string; date: string; unit?: string }

export interface Hold { id: string; what: string; unit: string; why: string; placedOn: string; placedBy: string; releasedOn: string }
export const activeHolds = (holds: Hold[]) => holds.filter(h => !h.releasedOn);
/** A hold covers an item when it names the item's unit, or its words appear in the item's label. */
export const onHold = (item: Held, holds: Hold[]) => activeHolds(holds).some(h => (!!h.unit && h.unit === item.unit) || (!!h.what.trim() && item.label.toLowerCase().includes(h.what.trim().toLowerCase())));

export interface KindStanding {
  rule: Rule;
  held: number;
  oldest: string;
  /** Past its period today, and not on hold: the board may approve disposing of these. */
  due: Held[];
  /** Past its period but held back by a hold. */
  heldBack: Held[];
  /** The first date anything in this kind reaches the end of its period, when nothing has yet. */
  nextDue: string;
}

export function standing(rule: Rule, items: Held[], holds: Hold[], today: string): KindStanding {
  const dated = items.filter(i => ISO.test(i.date));
  const oldest = dated.map(i => i.date.slice(0, 10)).sort()[0] ?? '';
  if (rule.years == null) return { rule, held: items.length, oldest, due: [], heldBack: [], nextDue: '' };
  const ends = (i: Held) => addYears(i.date, rule.years!);
  const past = dated.filter(i => ends(i) <= today);
  const due = past.filter(i => !onHold(i, holds));
  return { rule, held: items.length, oldest, due, heldBack: past.filter(i => onHold(i, holds)), nextDue: dated.filter(i => ends(i) > today).map(ends).sort()[0] ?? '' };
}

/** A year's disposal decision: what the board approved disposing of, by kind, and the vote. */
export interface DisposalReview { year: string; on: string; by: string; vote: string; approved: { kind: RecordKind; count: number; through: string }[] }

// ── What is missing from the record ──────────────────────────────────────────
/** Months between the first and last with anything in them that have nothing: a gap in a monthly record. */
export function missingMonths(months: string[], through: string): string[] {
  const have = new Set(months.map(m => m.slice(0, 7)));
  const first = [...have].sort()[0];
  if (!first) return [];
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  for (let n = 0; n < 600; n++) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    if (k > through.slice(0, 7)) break;
    if (!have.has(k)) out.push(k);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// ── The wage record ──────────────────────────────────────────────────────────
/** What the app holds for one employee, set against what the wage law has an employer keep. */
export interface WageFacts {
  name: string;
  address: string;
  occupation: string;
  /** Whether they are under 19, and their date of birth when they are. */
  under19: boolean | null;
  dob: string;
  rate: number;
  /** Paid a salary and exempt from minimum wage and overtime: daily hours are then not required. */
  exempt: boolean;
  /** The pay periods paid, and the days with hours recorded. */
  paid: { start: string; end: string; gross: number }[];
  days: { date: string; hours: number }[];
}

export interface WageCheck { item: string; ok: boolean; detail: string }

/** Each thing the record needs, and whether it is there. */
export function wageRecord(f: WageFacts): WageCheck[] {
  const noHours = f.exempt ? [] : f.paid.filter(p => !f.days.some(d => d.date >= p.start && d.date <= p.end && d.hours > 0));
  return [
    { item: 'Name, address and occupation', ok: !!f.name.trim() && !!f.address.trim() && !!f.occupation.trim(), detail: [!f.address.trim() && 'no address', !f.occupation.trim() && 'no occupation'].filter(Boolean).join(', ') || 'On file' },
    { item: 'Date of birth, if under 19', ok: f.under19 === false || (f.under19 === true && ISO.test(f.dob)), detail: f.under19 == null ? 'Not answered' : f.under19 ? (ISO.test(f.dob) ? f.dob : 'Under 19: no date of birth') : 'Not required: 19 or over' },
    { item: 'Rate of pay', ok: f.rate > 0, detail: f.rate > 0 ? `$${f.rate.toFixed(2)} an hour` : 'No rate on file' },
    { item: 'Amount paid each pay period', ok: f.paid.every(p => p.gross > 0), detail: f.paid.length ? `${f.paid.length} period${f.paid.length === 1 ? '' : 's'} paid` : 'No period paid yet' },
    { item: 'Time worked each day and each week', ok: noHours.length === 0, detail: f.exempt ? 'Not required: salaried and exempt' : noHours.length ? `${noHours.length} paid period${noHours.length === 1 ? '' : 's'} with no hours recorded (${noHours.slice(0, 2).map(p => `${p.start} to ${p.end}`).join('; ')}${noHours.length > 2 ? '…' : ''})` : `${f.days.length} day${f.days.length === 1 ? '' : 's'} recorded` },
  ];
}

/** The Monday of the week a date falls in. */
export function weekOf(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface Week { start: string; days: number[]; hours: number; over40: number }
/** Hours by workweek, Monday first, with the hours past 40. Newest week first. */
export function weeks(days: { date: string; hours: number }[]): Week[] {
  const by = new Map<string, number[]>();
  for (const d of days) {
    if (!ISO.test(d.date)) continue;
    const w = weekOf(d.date);
    if (!by.has(w)) by.set(w, Array(7).fill(0));
    by.get(w)![(new Date(d.date.slice(0, 10) + 'T00:00:00Z').getUTCDay() + 6) % 7] += d.hours;
  }
  return [...by.entries()].map(([start, ds]) => { const hours = Math.round(ds.reduce((t, n) => t + n, 0) * 100) / 100; return { start, days: ds, hours, over40: Math.max(0, Math.round((hours - 40) * 100) / 100) }; }).sort((a, b) => b.start.localeCompare(a.start));
}

/** Years a wage record is kept at the least. */
export const WAGE_YEARS = 3;
/** Whether a day's hours are part of the kept wage record: an employee's, paid, and less than three years old. */
export function wageRecordLocked(entry: { date: string }, isEmployee: boolean, paidPeriods: { start: string; end: string }[], today: string): boolean {
  if (!isEmployee || !ISO.test(entry.date)) return false;
  return addYears(entry.date, WAGE_YEARS) > today && paidPeriods.some(p => entry.date >= p.start && entry.date <= p.end);
}
