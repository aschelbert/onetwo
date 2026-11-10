/**
 * The month close runbook, wired: on the building's start day (the 1st by
 * default, Funds › Settings › Billing rules) the app opens one case for the
 * month just ended, with the close as its steps, and ticks the steps it can
 * see are done: dues posted, books closed, packet sent. One case per month:
 * `source: 'runbook'`, `sourceId: 'month-close:YYYY-MM'`; a month already
 * closed by hand before its day never gets a case.
 *
 * The database runs the same job every morning (run_month_close_all,
 * migration 051), so the case opens even when nobody opens the app that
 * day; this is the fallback, and either side finds the other's case. The
 * step texts here and in that migration must stay the same.
 *
 * Pure helpers first (the period, the trigger date, the steps), then the
 * store-facing `runMonthClose` that the shell's hook calls.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { addDays, isDuesInvoiceFor } from '@/lib/billingCycle';
import { monthEnd } from '@/lib/ledger';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const MONTH_CLOSE_ID = 'month-close';
export const monthCloseSourceId = (period: string) => `${MONTH_CLOSE_ID}:${period}`;
/** The case's situation id: its own, so its five steps survive a reload. */
export const MONTH_CLOSE_SIT = 'runbook-month-close';

/** Is this case the month close for some month? */
export const isMonthCloseCase = (c: CaseTrackerCase) => c.source === 'runbook' && !!c.sourceId?.startsWith(`${MONTH_CLOSE_ID}:`);

/** The month close case (open or closed) for a period, if the runbook opened one. */
export function monthCloseCase(cases: CaseTrackerCase[], period: string): CaseTrackerCase | undefined {
  return cases.find(c => c.source === 'runbook' && c.sourceId === monthCloseSourceId(period));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

const shiftMonth = (y: number, m: number, by: number) => { const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const clampDay = (day: number) => Math.min(28, Math.max(1, Math.round(Number(day)) || 1));

/**
 * The month whose close is due today: the month before this one once the
 * start day has arrived, otherwise the month before that (its close started
 * last month and may still be running).
 */
export function monthClosePeriod(today: string, startDay: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return shiftMonth(y, m, d >= clampDay(startDay) ? -1 : -2);
}

/** The day the close for `period` starts: the start day of the following month. */
export function monthCloseTriggerDate(period: string, startDay: number): string {
  const [y, m] = period.split('-').map(Number);
  return `${shiftMonth(y, m, 1)}-${String(clampDay(startDay)).padStart(2, '0')}`;
}

/** When the packet is owed to owners: two weeks after the close starts (the bylaws' 15 days, with the 1st as day one). */
export const monthCloseDue = (period: string, startDay: number) => addDays(monthCloseTriggerDate(period, startDay), 14);

/** The next day the runbook will start a close, on or after today. */
export function nextMonthCloseStart(today: string, startDay: number): string {
  const [y, m] = today.split('-').map(Number);
  const thisMonth = `${today.slice(0, 7)}-${String(clampDay(startDay)).padStart(2, '0')}`;
  return thisMonth >= today ? thisMonth : `${shiftMonth(y, m, 1)}-${String(clampDay(startDay)).padStart(2, '0')}`;
}

/** Trigger text for the catalogue row, from the building's setting. */
export const monthCloseTrigger = (startDay: number) => `The ${ordinal(clampDay(startDay))} of each month`;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Step positions the app ticks itself. */
export const STEP = { posted: 0, reconciled: 1, reviewed: 2, closed: 3, sent: 4 } as const;

export function monthCloseSteps(period: string, startDay: number): { s: string; detail?: string; ck?: string[] }[] {
  const label = periodLabel(period);
  const end = monthEnd(`${period}-01`);
  return [
    { s: `Post ${label} dues, late fees and the reserve transfer`, detail: 'Automatic billing posts these on the 1st (Funds › Settings › Billing rules; Run billing now if any are missing). This step ticks itself once the dues invoices exist.' },
    { s: `Record every ${label} payment and bill, then reconcile the bank`, ck: ['Every payment received in the month is on its unit ledger', 'Every bill paid or owed for the month is entered', 'The bank statement balance matches the ledger'] },
    { s: `Review ${label} against the budget`, ck: ['Any line more than 10% over its budget has a note for the packet', 'The reserve transfer posted and reserves match the bank'] },
    { s: `Close the books through ${end}`, detail: 'Funds › Statements › Close through locks every entry on or before that date; a later correction posts as a reversal dated today. This step ticks itself when the books are closed.' },
    { s: `Send the ${label} packet to owners by ${monthCloseDue(period, startDay)}`, detail: 'The app drafts the packet (balance sheet, income statement, budget variance, ledger) from the closed ledger; Funds › Statements › Send to owners posts it to Community notices. This step ticks itself when it is sent.' },
  ];
}

/** Tick the steps the app can see are done: dues posted and books closed. */
export function syncMonthCloseCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || !c.sourceId) return;
  const period = c.sourceId.slice(MONTH_CLOSE_ID.length + 1);
  const fin = useFinancialStore.getState();
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.posted].done && fin.unitInvoices.some(i => i.status !== 'void' && isDuesInvoiceFor(i, period))) complete(c.id, STEP.posted);
  if (!c.steps[STEP.closed].done && fin.closedThrough && fin.closedThrough >= monthEnd(`${period}-01`)) complete(c.id, STEP.closed);
}

/** Funds › Statements calls this when a month's packet goes to owners. */
export function markMonthClosePacketSent(period: string): void {
  const c = monthCloseCase(useIssuesStore.getState().cases, period);
  if (c && c.status !== 'closed') useIssuesStore.getState().completeStep(c.id, STEP.sent);
}

export interface MonthCloseRun {
  period: string;
  /** The case for the period, whether this run opened it or found it. */
  caseId: string | null;
  opened: boolean;
}

/**
 * What runs when a board member or manager opens the app: open the close for
 * the month that is due if the runbook is on and the month is neither closed
 * nor already in a case, then tick the steps the app can see. Safe to call
 * any number of times.
 */
export function runMonthClose(today: string = todayIso()): MonthCloseRun {
  const fin = useFinancialStore.getState();
  const startDay = clampDay(fin.monthCloseStartDay);
  const period = monthClosePeriod(today, startDay);
  const issues = useIssuesStore.getState();
  const existing = monthCloseCase(issues.cases, period);
  if (existing) { syncMonthCloseCase(existing); return { period, caseId: existing.id, opened: false }; }
  if (!fin.monthCloseEnabled || fin.runbooksOff.includes(MONTH_CLOSE_ID)) return { period, caseId: null, opened: false };
  if (fin.closedThrough && fin.closedThrough >= monthEnd(`${period}-01`)) return { period, caseId: null, opened: false };
  const label = periodLabel(period);
  const id = issues.createCase({
    catId: 'financial',
    // Not a wizard situation: the store rehydrates a wizard situation's case back to the wizard's steps, and these are the close's own.
    sitId: MONTH_CLOSE_SIT,
    approach: 'pre',
    title: `Month close · ${label}`,
    unit: '',
    owner: 'Treasurer',
    priority: 'medium',
    notes: `Opened by the Month close runbook on ${today}. Post the month, reconcile, review against the budget, close the books, send the packet. Owners expect the packet by ${monthCloseDue(period, startDay)}.`,
    assignedRole: 'Treasurer',
    dueDate: monthCloseDue(period, startDay),
    source: 'runbook',
    sourceId: monthCloseSourceId(period),
    customSteps: monthCloseSteps(period, startDay),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncMonthCloseCase(created);
  return { period, caseId: id, opened: true };
}
