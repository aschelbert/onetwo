/**
 * The annual budget runbook, wired: 90 days before the fiscal year starts,
 * one case to draft, adopt and announce next year's budget, and the app
 * ticks the steps it can see: the draft rolled forward (it does that
 * itself, on Funds › Planning), owners told once the notice is posted.
 * One case per fiscal year; a budget case the board already opened by
 * hand, or from the budget obligation on Home, counts instead.
 *
 * The database runs the same job every morning (run_annual_budget,
 * migration 057); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { addDays } from '@/lib/billingCycle';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';
import { fiscalLabel, nextFiscalYear } from './fiscal';

export const ANNUAL_BUDGET_ID = 'annual-budget';
/** Days before the fiscal year starts that the runbook opens. */
export const BUDGET_LEAD_DAYS = 90;
/** Owners hear about the adopted budget and any dues change this many days before the year starts. */
export const BUDGET_NOTICE_DAYS = 30;
export const budgetSourceId = (fyStart: string) => `${ANNUAL_BUDGET_ID}:${fyStart}`;
export const ANNUAL_BUDGET_SIT = 'runbook-annual-budget';

export const STEP = { draft: 0, dues: 1, contracts: 2, review: 3, adopt: 4, fees: 5, notify: 6, enter: 7, file: 8 } as const;

/** A case already working next year's budget: the runbook's own, one from the Home obligation, or one opened by hand on the wizard. */
export function openBudgetCase(cases: CaseTrackerCase[], fyStart: string): CaseTrackerCase | undefined {
  return cases.find(c => (c.source === 'runbook' && c.sourceId === budgetSourceId(fyStart)) || (c.status !== 'closed' && ((c.source === 'obligation' && c.sourceId === 'f1') || c.sitId === 'annual-budgeting')));
}

export function budgetSteps(fy: { start: string; end: string }): { s: string; detail?: string; ck?: string[] }[] {
  const label = fiscalLabel(fy);
  return [
    { s: `Roll the ${label} draft forward from this year's actuals`, detail: 'Funds › Planning › Next year draft does this itself: every line grown from this year, the dues options, the reserve gap. This step ticks itself when the case opens.' },
    { s: 'Pick the dues option and the reserve line', detail: 'Funds › Planning › Next year draft. Keeping dues flat, funding the reserve study on time, or the minimum; the choice is recorded here and in the minutes.', ck: ['Reserve line meets the study or the shortfall is documented', 'Contingency line set'] },
    { s: 'Put next year\'s contracts and insurance into the lines', ck: ['Every vendor contract renewing next year, at its new price', 'Insurance premiums from the renewal quotes', 'Utilities at this year\'s run rate plus the known increases'] },
    { s: 'Board reviews the draft at a meeting', ck: ['Draft on the agenda with the variance against this year', 'Questions answered in the minutes'] },
    { s: 'Board votes to adopt the budget', ck: ['Motion and vote recorded on this case or in the minutes', 'Owner ratification scheduled if the bylaws require it'] },
    { s: `Set the ${label} dues on the fee schedule and every unit`, detail: 'Funds › Settings › Fee schedule holds the tiers; Funds › Income › Units carries each unit\'s monthly amount.' },
    { s: `Tell owners by ${addDays(fy.start, -BUDGET_NOTICE_DAYS)}: the adopted budget and the ${label} dues`, detail: 'Post it as a financial notice under Community (the bylaws want 30 days before the year starts). This step ticks itself when a notice about the budget is posted after this case opened.' },
    { s: `Enter the adopted lines as the ${label} budget`, detail: 'Funds › Planning › Budget, each category at its adopted amount, so the variance report starts the year right.' },
    { s: 'File the adopted budget with the minutes under Building › Documents', ck: ['Adopted budget PDF', 'Resolution or minutes with the vote'] },
  ];
}

const budgetNotice = (c: CaseTrackerCase) => useComplianceStore.getState().announcements.some(a => /budget|dues/i.test(a.title) && (a.category === 'financial' || a.category === 'meeting' || a.category === 'general') && a.postedDate.slice(0, 10) >= c.created.slice(0, 10));

/** Tick the steps the app can see: the draft (always), the owner notice. */
export function syncBudgetCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${ANNUAL_BUDGET_ID}:`)) return;
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.draft].done) complete(c.id, STEP.draft);
  if (!c.steps[STEP.notify].done && budgetNotice(c)) complete(c.id, STEP.notify);
}

export interface BudgetRun { fyStart: string; caseId: string | null; opened: boolean }

export function runAnnualBudget(today: string = todayIso()): BudgetRun {
  const fin = useFinancialStore.getState();
  const fye = useBuildingStore.getState().details?.fiscalYearEnd;
  const fy = nextFiscalYear(today, fye);
  const issues = useIssuesStore.getState();
  const existing = openBudgetCase(issues.cases, fy.start);
  if (existing) { syncBudgetCase(existing); return { fyStart: fy.start, caseId: existing.id, opened: false }; }
  if (fin.runbooksOff.includes(ANNUAL_BUDGET_ID)) return { fyStart: fy.start, caseId: null, opened: false };
  if (today < addDays(fy.start, -BUDGET_LEAD_DAYS)) return { fyStart: fy.start, caseId: null, opened: false };
  const label = fiscalLabel(fy);
  const id = issues.createCase({
    catId: 'financial',
    sitId: ANNUAL_BUDGET_SIT,
    approach: 'pre',
    title: `Annual budget · ${label}`,
    unit: '',
    owner: 'Treasurer',
    priority: 'high',
    notes: `Opened by the Annual budget runbook on ${today}: the fiscal year ${label} starts ${fy.start}. The draft is on Funds › Planning; owners must hear the adopted budget and the dues by ${addDays(fy.start, -BUDGET_NOTICE_DAYS)}.`,
    assignedRole: 'Treasurer',
    dueDate: addDays(fy.start, -BUDGET_NOTICE_DAYS),
    source: 'runbook',
    sourceId: budgetSourceId(fy.start),
    customSteps: budgetSteps(fy),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncBudgetCase(created);
  return { fyStart: fy.start, caseId: id, opened: true };
}
