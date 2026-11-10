/**
 * The year-end close runbook, wired: the day after the fiscal year ends,
 * a building with entries in that year gets one case to close it, and the
 * app ticks the steps it can see: the reserve transfer trued up, the books
 * closed through the year end. One case per fiscal year; a year whose books
 * are already closed never gets one.
 *
 * The database runs the same job every morning (run_year_end_close,
 * migration 057); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { addDays } from '@/lib/billingCycle';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';
import { fiscalLabel, lastFiscalYear } from './fiscal';

export const YEAR_END_ID = 'year-end';
export const yearEndSourceId = (fyEnd: string) => `${YEAR_END_ID}:${fyEnd}`;
export const YEAR_END_SIT = 'runbook-year-end';
/** The annual report and the tax hand-off are owed within this many days of the year end. */
export const YEAR_END_DUE_DAYS = 60;

export const STEP = { reconcile: 0, adjust: 1, reserve: 2, close: 3, report: 4, taxes: 5 } as const;

/** Form 1120-H is due the 15th day of the fourth month after the fiscal year ends: April 15 for a calendar year. */
export function taxDue(fyEnd: string): string {
  const [y, m] = fyEnd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + 4, 15));
  return d.toISOString().slice(0, 10);
}

export function yearEndCase(cases: CaseTrackerCase[], fyEnd: string): CaseTrackerCase | undefined {
  return cases.find(c => c.source === 'runbook' && c.sourceId === yearEndSourceId(fyEnd));
}

/** Non-void reserve transfers posted inside the year. */
export function reserveMoved(fy: { start: string; end: string }): number {
  return useFinancialStore.getState().generalLedger
    .filter(e => e.status !== 'void' && e.source === 'transfer' && e.memo.startsWith('Reserve transfer') && e.date >= fy.start && e.date <= fy.end)
    .reduce((t, e) => t + e.amount, 0);
}

export function yearEndSteps(fy: { start: string; end: string }, reserveAnnual: number): { s: string; detail?: string; ck?: string[] }[] {
  const label = fiscalLabel(fy);
  return [
    { s: `Reconcile every account to the ${fy.end} bank statements`, ck: ['Operating and reserve bank balances match the ledger', 'Every deposit in transit and outstanding check is listed', 'Dues owed matches the unit ledgers'] },
    { s: `Post the ${label} year-end adjustments: accruals, prepaid dues, bad debt`, ck: ['Bills for the year that arrive after it are accrued', 'Dues paid ahead sit in prepaid assessments', 'Balances the board has written off are reversed'] },
    { s: `True up the reserve transfer to the adopted ${fmt(reserveAnnual)}`, detail: 'Billing moves one twelfth each month; a missed or short month is made up here from Funds › Settings › Ledger. This step ticks itself once the year\'s transfers reach the adopted contribution.' },
    { s: `Close the books through ${fy.end}`, detail: 'Funds › Statements › Close through locks every entry on or before that date; a later correction posts as a reversal dated today. This step ticks itself when the books are closed.' },
    { s: `Send the ${label} annual report to owners: year-end statements and the reserve position`, ck: ['Balance sheet, income statement and budget variance for the year', 'Reserve balance against the study', 'Goes out with the annual meeting notice'] },
    { s: `Hand the ${label} figures to the tax filings: Form 1120-H and the DC return by ${taxDue(fy.end)}`, detail: 'Funds › Statements › Taxes and filings drafts the 1120-H from the closed ledger; the Filings runbook carries the filing itself.' },
  ];
}

/** Tick the steps the app can see: the reserve trued up, the books closed. */
export function syncYearEndCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || !c.sourceId || c.source !== 'runbook') return;
  const fyEnd = c.sourceId.slice(YEAR_END_ID.length + 1);
  const fye = useBuildingStore.getState().details?.fiscalYearEnd;
  const fy = lastFiscalYear(addDays(fyEnd, 1), fye);
  if (fy.end !== fyEnd) return;
  const fin = useFinancialStore.getState();
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.reserve].done && fin.annualReserveContribution > 0 && reserveMoved(fy) >= fin.annualReserveContribution - 0.5) complete(c.id, STEP.reserve);
  if (!c.steps[STEP.close].done && fin.closedThrough && fin.closedThrough >= fyEnd) complete(c.id, STEP.close);
}

export interface YearEndRun { fyEnd: string; caseId: string | null; opened: boolean }

export function runYearEndClose(today: string = todayIso()): YearEndRun {
  const fin = useFinancialStore.getState();
  const fye = useBuildingStore.getState().details?.fiscalYearEnd;
  const fy = lastFiscalYear(today, fye);
  const issues = useIssuesStore.getState();
  const existing = yearEndCase(issues.cases, fy.end);
  if (existing) { syncYearEndCase(existing); return { fyEnd: fy.end, caseId: existing.id, opened: false }; }
  if (fin.runbooksOff.includes(YEAR_END_ID)) return { fyEnd: fy.end, caseId: null, opened: false };
  if (fin.closedThrough && fin.closedThrough >= fy.end) return { fyEnd: fy.end, caseId: null, opened: false };
  // A year with nothing in the ledger (the building joined after it) has nothing to close.
  if (!fin.generalLedger.some(e => e.status !== 'void' && e.date >= fy.start && e.date <= fy.end)) return { fyEnd: fy.end, caseId: null, opened: false };
  const label = fiscalLabel(fy);
  const id = issues.createCase({
    catId: 'financial',
    sitId: YEAR_END_SIT,
    approach: 'pre',
    title: `Year-end close · ${label}`,
    unit: '',
    owner: 'Treasurer',
    priority: 'high',
    notes: `Opened by the Year-end close runbook on ${today}: the fiscal year ${label} ended ${fy.end}. Reconcile, post the adjustments, true up the reserve, close the books, send the annual report, hand the figures to the tax filings. The annual report and the tax hand-off are owed by ${addDays(fy.end, YEAR_END_DUE_DAYS)}.`,
    assignedRole: 'Treasurer',
    dueDate: addDays(fy.end, YEAR_END_DUE_DAYS),
    source: 'runbook',
    sourceId: yearEndSourceId(fy.end),
    customSteps: yearEndSteps(fy, fin.annualReserveContribution),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncYearEndCase(created);
  return { fyEnd: fy.end, caseId: id, opened: true };
}
