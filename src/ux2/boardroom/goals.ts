/**
 * The year's goals, wired. The goals themselves are the 'objectives' record
 * for a fiscal year (what the year-end close reports against, and what
 * Building › Goals shows once adopted); the action is how they get set:
 * drafted, voted by the board, published to owners.
 */
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { blankPlan, type YearPlan } from '@/lib/caseTools';
import { goalsPassed, type GoalsData } from '@/lib/actions/goals';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fiscalYearStart } from '@/lib/ledger';
import { todayIso } from '../runbook/adapters';
import { SYNC, TRIGGERS, recordCase, startAction } from './recordActions';
import { budgetFyOf } from './annualBudget';
import { readToolDoc, saveToolDoc } from './tools/docs';

export const goalsFor = (year: string): YearPlan => readToolDoc<YearPlan>('objectives', year, blankPlan(year));
const goalsRecords = () => useActionRecordsStore.getState().records.filter(r => r.kind === 'goals');
export const goalsRecordFor = (year: string) => goalsRecords().find(r => (r.data as unknown as GoalsData).year === year);

/** The first day of the fiscal year after the one today falls in. */
export function nextFiscalYearStart(today: string = todayIso()): string {
  const start = fiscalYearStart(today, useBuildingStore.getState().details?.fiscalYearEnd || '12-31');
  return `${Number(start.slice(0, 4)) + 1}${start.slice(4)}`;
}

/** The goals action for a fiscal year, opening one when there is none. Returns its record id and its action's case id. */
export function startGoals(year: string, today: string = todayIso()): { recordId: string; caseId: string | null } {
  const have = goalsRecordFor(year);
  if (have) return { recordId: have.id, caseId: recordCase(useIssuesStore.getState().cases, have)?.id ?? null };
  return startAction('goals', `Fiscal year starting ${year}`, { year, goalCount: goalsFor(year).objectives.length }, {}, today);
}

/** The count of drafted goals follows the goals; a carried vote adopts and publishes them, once; either result closes the action. */
SYNC.goals = (r, today) => {
  const d = r.data as unknown as GoalsData;
  if (r.closedOn) return;
  const store = useActionRecordsStore.getState();
  const plan = goalsFor(d.year);
  if (!d.vote.on && plan.objectives.length !== d.goalCount) store.patchData(r.id, { goalCount: plan.objectives.length });
  if (!d.vote.on) return;
  if (goalsPassed(d) && !d.publishedOn) {
    saveToolDoc('objectives', d.year, blankPlan(d.year), { adoptedOn: d.vote.on, setOn: plan.setOn || today }, today);
    store.patchData(r.id, { publishedOn: today });
  }
  store.patch(r.id, { closedOn: today });
};

/** Goals come before the money: an open annual budget action for a year with no goals action starts one. */
TRIGGERS.push((today: string) => {
  if (useFinancialStore.getState().runbooksOff.includes('year-goals')) return;
  for (const c of useIssuesStore.getState().cases) {
    if (c.status === 'closed') continue;
    const fy = budgetFyOf(c);
    if (fy && !goalsRecordFor(fy.start)) startGoals(fy.start, today);
  }
});
