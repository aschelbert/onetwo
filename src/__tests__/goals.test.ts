import { describe, it, expect, beforeEach } from 'vitest';
import { GOALS, type GoalsData } from '@/lib/actions/goals';
import { stepsOf, type ActionRecord } from '@/lib/actions';
import { blankPlan, type Objective } from '@/lib/caseTools';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { goalsFor, goalsRecordFor, nextFiscalYearStart, startGoals } from '@/ux2/boardroom/goals';
import { goalLine } from '@/ux2/boardroom/tools/GoalsEditor';
import { saveToolDoc } from '@/ux2/boardroom/tools/docs';
import { recordCase, runActionTriggers, runRecordActions } from '@/ux2/boardroom/recordActions';
import { budgetSourceId } from '@/ux2/boardroom/annualBudget';

const goal = (over: Partial<Objective> = {}): Objective => ({ id: 'g1', measure: 'reserve-funded', text: 'Build the reserves', target: 62, result: null, note: '', ...over });
const ticks = (r: ActionRecord) => stepsOf(r).map(s => (s.done ? 1 : 0)).join('');
const store = () => useActionRecordsStore.getState();

describe("setting the year's goals", () => {
  beforeEach(() => {
    useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
    useActionRecordsStore.setState({ records: [], saveError: null });
    useFinancialStore.setState({ runbooksOff: [], reserveItems: [] });
  });

  it('describes a goal with its longer target and where it stands', () => {
    expect(goalLine(goal({ longTarget: 70, longBy: '2029' }), { 'reserve-funded': 58 })).toBe('Target at least 62% · 70% by 2029 · today 58%');
    expect(goalLine(goal({ measure: 'dues-increase', target: 4 }), {})).toBe('Target at most 4%');
    expect(nextFiscalYearStart('2026-11-24')).toBe('2027-01-01');
  });

  it('opens one action a year, counts the drafted goals, and waits for the list to be sent', () => {
    const { recordId, caseId } = startGoals('2027-01-01', '2026-10-03');
    expect(caseId).toBeTruthy();
    expect(startGoals('2027-01-01', '2026-10-04').recordId).toBe(recordId);
    const rec = () => store().records.find(r => r.id === recordId)!;
    expect(rec().title).toBe('Fiscal year starting 2027-01-01');
    saveToolDoc('objectives', '2027-01-01', blankPlan('2027-01-01'), { objectives: [goal(), goal({ id: 'g2', measure: 'late-dues', text: 'Bring late dues down', target: 3 })] }, '2026-10-06');
    runRecordActions('2026-10-06');
    expect((rec().data as unknown as GoalsData).goalCount).toBe(2);
    store().patchData(recordId, { reviewedLastOn: '2026-10-05', stoodOn: '2026-10-06' });
    expect(ticks(rec())).toBe('11000');
    store().patchData(recordId, { sentOn: '2026-10-20' });
    expect(ticks(rec())).toBe('11100');
  });

  it('a carried vote adopts and publishes the goals; until then they are a draft', () => {
    const { recordId } = startGoals('2027-01-01', '2026-10-03');
    const rec = () => store().records.find(r => r.id === recordId)!;
    saveToolDoc('objectives', '2027-01-01', blankPlan('2027-01-01'), { objectives: [goal()] }, '2026-10-06');
    store().patchData(recordId, { reviewedLastOn: 'x', stoodOn: 'x', sentOn: '2026-10-20' });
    runRecordActions('2026-10-21');
    expect(goalsFor('2027-01-01').adoptedOn).toBeUndefined();
    store().patchData(recordId, { vote: { on: '2026-11-18', inFavor: 5, against: 0 } });
    runRecordActions('2026-11-18'); runRecordActions('2026-11-19');
    expect(goalsFor('2027-01-01')).toMatchObject({ adoptedOn: '2026-11-18' });
    expect(rec()).toMatchObject({ closedOn: '2026-11-18' });
    expect((rec().data as unknown as GoalsData).publishedOn).toBe('2026-11-18');
    expect(recordCase(useIssuesStore.getState().cases, rec())!.status).toBe('closed');
  });

  it('a failed vote publishes nothing', () => {
    const { recordId } = startGoals('2027-01-01', '2026-10-03');
    saveToolDoc('objectives', '2027-01-01', blankPlan('2027-01-01'), { objectives: [goal()] }, '2026-10-06');
    store().patchData(recordId, { sentOn: '2026-10-20', vote: { on: '2026-11-18', inFavor: 2, against: 3 } });
    runRecordActions('2026-11-18');
    expect(goalsFor('2027-01-01').adoptedOn).toBeUndefined();
    expect(store().records.find(r => r.id === recordId)!.closedOn).toBe('2026-11-18');
    expect(GOALS.stepTitles).toHaveLength(5);
  });

  it('opens with the annual budget action, once', () => {
    useIssuesStore.getState().createCase({ catId: 'financial', sitId: 'runbook-annual-budget', approach: 'pre', title: 'Budget for fiscal 2027', unit: '', owner: '', priority: 'medium', notes: '', source: 'runbook', sourceId: budgetSourceId('2027-01-01'), customSteps: [{ s: 'Start the draft' }] });
    runActionTriggers('2026-10-03'); runActionTriggers('2026-10-04');
    expect(store().records.filter(r => r.kind === 'goals')).toHaveLength(1);
    expect(goalsRecordFor('2027-01-01')).toBeTruthy();
  });
});
