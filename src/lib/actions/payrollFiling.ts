import { stepsFrom, usd, type ActionKind } from './types';

/** A quarter's payroll returns: check the wage records, record each filing, what was paid, and the proof. */
export interface PayrollFilingData {
  /** '2026-Q4'. */
  period: string;
  periodStart: string;
  periodEnd: string;
  /** Wages for the period, from the pay runs, as checked. */
  wages: number;
  wagesCheckedOn: string;
  returns: PayrollReturn[];
  paid: number;
  paidOn: string;
  paidNote: string;
  proofOn: string;
}
export interface PayrollReturn { id: string; name: string; to: string; dueOn: string; applies: boolean; filedOn: string; confirmation: string }

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The quarter a date falls in. */
export function quarterOf(date: string): { period: string; start: string; end: string } {
  const y = Number(date.slice(0, 4)), q = Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;
  return { period: `${y}-Q${q}`, start: iso(y, q * 3 - 2, 1), end: lastDay(y, q * 3) };
}
/** The last quarter that had ended by a date. */
export const lastFinishedQuarter = (today: string) => { const q = quarterOf(today); const d = new Date(q.start + 'T00:00:00Z'); d.setUTCDate(0); return quarterOf(d.toISOString().slice(0, 10)); };

/**
 * The returns a District employer usually files for a quarter. Which apply is
 * the board's to confirm with its payroll provider or accountant; due dates
 * are the usual ones and can be corrected.
 */
export function returnsFor(period: string): PayrollReturn[] {
  const y = Number(period.slice(0, 4)), q = Number(period.slice(6));
  const ny = q === 4 ? y + 1 : y, nm = q === 4 ? 1 : q * 3 + 1;
  const monthEnd = lastDay(ny, nm);
  const row = (id: string, name: string, to: string, dueOn: string): PayrollReturn => ({ id, name, to, dueOn, applies: true, filedOn: '', confirmation: '' });
  return [
    row('dc-withholding', 'District income tax withheld', 'Office of Tax and Revenue', iso(ny, nm, 20)),
    row('federal-941', 'Federal payroll tax return (Form 941)', 'IRS', monthEnd),
    row('dc-unemployment', 'Unemployment wage report', 'Department of Employment Services', monthEnd),
    row('dc-pfl', 'Paid family leave contribution', 'Department of Employment Services', monthEnd),
    ...(q === 4 ? [row('w2-1099', 'W-2s to employees and 1099s to contractors', 'Them, and the IRS', monthEnd), row('federal-940', 'Federal unemployment return (Form 940)', 'IRS', monthEnd)] : []),
  ];
}

export const due = (d: PayrollFilingData) => d.returns.filter(x => x.applies);
export const firstDue = (d: PayrollFilingData) => due(d).filter(x => !x.filedOn).map(x => x.dueOn).sort()[0] ?? '';

export const PAYROLL_FILING: ActionKind<PayrollFilingData> = {
  kind: 'payroll-filing', runbookId: 'payroll-filing', name: 'Payroll filing',
  trigger: 'Each quarter end, when the building has employees', blurb: "Record that a quarter's payroll returns went in, what was paid and the proof.",
  catId: 'financial', role: 'Treasurer', visibility: 'board',
  stepTitles: [['check', "Check the quarter's wage records"], ['file', 'File each return'], ['pay', 'Pay what is owed'], ['proof', 'File the proof']],
  how: {
    check: "Ticks itself when someone confirms the quarter's wages against the pay runs",
    file: 'Ticks itself when every return that applies has a filed date',
    pay: 'Ticks itself when the payment, or that nothing was owed, is recorded',
    proof: 'Ticks itself when the confirmations are filed with the wage records, which closes it',
  },
  blank: () => ({ period: '', periodStart: '', periodEnd: '', wages: 0, wagesCheckedOn: '', returns: [], paid: 0, paidOn: '', paidNote: '', proofOn: '' }),
  steps: (r) => {
    const d = r.data, list = due(d), filed = list.filter(x => x.filedOn).length;
    return stepsFrom(PAYROLL_FILING, {
      check: [!!d.wagesCheckedOn, d.wagesCheckedOn ? `${usd(d.wages)} in wages · checked ${d.wagesCheckedOn}` : ''],
      file: [list.length > 0 && filed === list.length, list.length ? `${filed} of ${list.length} filed${firstDue(d) ? ` · next due ${firstDue(d)}` : ''}` : '', !d.wagesCheckedOn ? 'the wage records being checked' : ''],
      pay: [!!d.paidOn, d.paidOn ? (d.paid ? `${usd(d.paid)} paid ${d.paidOn}` : `Nothing owed · ${d.paidOn}`) : ''],
      proof: [!!d.proofOn, d.proofOn ? `Filed ${d.proofOn}` : '', filed < list.length || !list.length ? 'every return being filed' : !d.paidOn ? 'the payment being recorded' : ''],
    });
  },
};
