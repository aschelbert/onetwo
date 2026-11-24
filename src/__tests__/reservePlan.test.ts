import { describe, it, expect, beforeEach } from 'vitest';
import { componentOf, componentsOf, edited, firstShort, levels, lifeExtended, percentFunded, project, replaced, reserveStanding, DEFAULT_ASSUMPTIONS } from '@/lib/reservePlan';
import type { ReserveItem } from '@/types/financial';
import { RESERVE_REVIEW, type ReserveReviewData } from '@/lib/actions/reserveReview';
import { stepsOf } from '@/lib/actions';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { changeComponent, ensureReview, openReview, planDoc, reviewData, setAssumptions } from '@/ux2/boardroom/reserves';
import { recordCase, runActionTriggers, runRecordActions } from '@/ux2/boardroom/recordActions';

const item = (id: string, name: string, cost: number, life: number, lastReplaced: string, over: Partial<ReserveItem> = {}): ReserveItem => ({ id, name, estimatedCost: cost, currentFunding: 0, usefulLife: life, lastReplaced, yearsRemaining: 0, isContingency: false, ...over });
const FLAT = { inflationPct: 0, interestPct: 0, growthPct: 0 };

describe('the reserve funding plan', () => {
  const hvac = item('h', 'HVAC central', 95000, 20, '2007');
  const roof = item('r', 'Roof membrane', 185000, 25, '2014');

  it('ages a component from the year it was last replaced, and from years left when no year is on file', () => {
    expect(componentOf(hvac, 2026)).toMatchObject({ age: 19, replaceYear: 2027, shouldHave: 90250, costThen: 97850 });
    expect(componentOf(item('x', 'Gate', 45000, 15, '', { yearsRemaining: 1 }), 2026)).toMatchObject({ age: 14, replaceYear: 2027, shouldHave: 42000 });
    // Overdue: replaced this year, fully used up.
    expect(componentOf(item('o', 'Old', 1000, 10, '2000'), 2026)).toMatchObject({ age: 10, replaceYear: 2026, shouldHave: 1000 });
  });

  it('measures percent funded against what should be set aside by now, leaving the contingency line out', () => {
    const comps = componentsOf([hvac, roof, item('c', 'Contingency', 10000, 1, '', { isContingency: true })], 2026);
    expect(comps.map(c => c.name)).toEqual(['HVAC central', 'Roof membrane']);
    // 90,250 + 185,000 × 12 ÷ 25 = 179,050
    expect(percentFunded(89525, comps)).toBe(50);
    expect(percentFunded(0, [])).toBeNull();
  });

  it('replays each replacement in its year and again a life later', () => {
    const rows = project(100000, 500, componentsOf([hvac], 2026, FLAT), 2026, FLAT, 25);
    expect(rows[0]).toMatchObject({ year: 2026, contribution: 6000, spent: 0, end: 106000 });
    expect(rows[1]).toMatchObject({ year: 2027, spent: 95000, replaced: ['HVAC central'], end: 17000 });
    // Twenty more years of $6,000 pays for the second one: 17,000 + 120,000 - 95,000.
    expect(rows[21]).toMatchObject({ year: 2047, spent: 95000, end: 42000 });
    expect(firstShort(rows)).toBeNull();
    // At $100 a month the second replacement cannot be paid for.
    expect(firstShort(project(100000, 100, componentsOf([hvac], 2026, FLAT), 2026, FLAT, 25))).toEqual({ year: 2047, by: 63600, what: 'HVAC central' });
  });

  it('adds interest and grows costs and contributions', () => {
    const rows = project(100000, 1000, componentsOf([hvac], 2026), 2026, DEFAULT_ASSUMPTIONS, 2);
    expect(rows[0]).toMatchObject({ contribution: 12000, interest: 2000, end: 114000 });
    expect(rows[1]).toMatchObject({ contribution: 12360, interest: 2280, spent: 97850 });
  });

  it('offers three levels: today, the lowest that never runs short, and fully funded', () => {
    const comps = componentsOf([hvac, roof], 2026);
    const [today, never, full] = levels(60000, 300, comps, 2026);
    expect(today).toMatchObject({ id: 'today', monthly: 300 });
    expect(today.short).not.toBeNull();
    expect(never.short).toBeNull();
    expect(never.monthly % 50).toBe(0);
    // One step lower would run short.
    expect(firstShort(project(60000, never.monthly - 50, comps, 2026))).not.toBeNull();
    expect(full.monthly).toBeGreaterThanOrEqual(never.monthly);
    expect(project(60000, full.monthly, comps, 2026)[14].pct).toBeGreaterThanOrEqual(100);
  });

  it('restarts the clock on replacement, moves the date when life changes, and keeps years left in step on an edit', () => {
    expect(replaced(hvac, '2027-03-01', 101000, 22)).toEqual({ lastReplaced: '2027', usefulLife: 22, yearsRemaining: 22, estimatedCost: 101000, currentFunding: 0 });
    expect(lifeExtended(hvac, 5, 2026)).toEqual({ usefulLife: 25, yearsRemaining: 6 });
    // It cannot be made to have run out before now.
    expect(lifeExtended(hvac, -10, 2026)).toEqual({ usefulLife: 20, yearsRemaining: 1 });
    expect(edited(hvac, { cost: 99000, life: 22 }, 2026)).toMatchObject({ estimatedCost: 99000, usefulLife: 22, yearsRemaining: 3, lastReplaced: '2007' });
  });

  it('gives a screen everything from one call', () => {
    const st = reserveStanding([hvac, roof], 89525, 6000, 2026);
    expect(st).toMatchObject({ pct: 50, monthly: 500, shouldHave: 179050, costToday: 280000 });
    expect(st.rows).toHaveLength(30);
  });
});

describe('changing a component, and the review that follows', () => {
  const fin = () => useFinancialStore.getState();
  const records = () => useActionRecordsStore.getState().records;
  beforeEach(() => {
    useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
    useActionRecordsStore.setState({ records: [], saveError: null });
    useFinancialStore.setState({ runbooksOff: [], reserveItems: [item('h', 'HVAC central', 95000, 20, '2007')], annualReserveContribution: 6000, generalLedger: [], reserveStudyDate: null });
    // No reserve study among the building's documents, so only the triggers a test sets up can fire.
    useBuildingStore.setState({ legalDocuments: [] });
  });

  it('needs a reason, records who changed what, and opens one review for every change', () => {
    expect(changeComponent({ kind: 'extend', id: 'h', years: 5 }, '', 'Ann', '2026-11-24')).toBe(false);
    expect(records()).toHaveLength(0);
    expect(changeComponent({ kind: 'extend', id: 'h', years: 5 }, "Vendor's condition report", 'Ann', '2026-11-24')).toBe(true);
    expect(fin().reserveItems[0]).toMatchObject({ usefulLife: 25, yearsRemaining: 6 });
    expect(changeComponent({ kind: 'add', name: 'Roof membrane', cost: 185000, life: 25, lastReplaced: '2014' }, 'Reserve study', 'Ann', '2026-11-24')).toBe(true);
    expect(fin().reserveItems[1]).toMatchObject({ name: 'Roof membrane', usefulLife: 25, yearsRemaining: 13 });
    expect(records().filter(r => r.kind === 'reserve-review')).toHaveLength(1);
    const d = reviewData(openReview()!);
    expect(d.changes.map(c => c.what)).toEqual(['replacement moved 5 years later', 'added at $185,000, 25-year life']);
    expect(planDoc().changes[0]).toMatchObject({ name: 'Roof membrane', by: 'Ann', why: 'Reserve study' });
    // An edit that changes nothing is not a change.
    expect(changeComponent({ kind: 'edit', id: 'h', cost: 95000 }, 'no-op', 'Ann', '2026-11-24')).toBe(false);
  });

  it('a change after the components were confirmed asks for them to be confirmed again', () => {
    const { recordId } = ensureReview('Started by the board', '2026-11-24');
    useActionRecordsStore.getState().patchData(recordId, { componentsOn: '2026-11-24' });
    changeComponent({ kind: 'replace', id: 'h', on: '2026-11-20', cost: 99000 }, 'Replaced', 'Ann', '2026-11-25');
    expect(reviewData(openReview()!).componentsOn).toBe('');
    expect(fin().reserveItems[0]).toMatchObject({ lastReplaced: '2026', yearsRemaining: 20, estimatedCost: 99000 });
  });

  const voted = (over: Partial<ReserveReviewData>) => ({ componentsOn: '2026-11-24', assumptions: DEFAULT_ASSUMPTIONS, assumptionsOn: '2026-11-24', level: 'never-short' as const, monthly: 900, recommendation: 'Set it at $900', ...over });

  it('a carried vote changes the contribution now, once, and closes the review', () => {
    const { recordId } = ensureReview('Started by the board', '2026-11-24');
    const rec = () => records().find(r => r.id === recordId)!;
    useActionRecordsStore.getState().patchData(recordId, voted({ effective: 'now' }));
    runRecordActions('2026-11-25');
    expect(fin().annualReserveContribution).toBe(6000);
    expect(stepsOf(rec()).map(s => (s.done ? 1 : 0)).join('')).toBe('11100');
    useActionRecordsStore.getState().patchData(recordId, { vote: { on: '2026-12-09', inFavor: 4, against: 1 } });
    runRecordActions('2026-12-09'); runRecordActions('2026-12-10');
    expect(fin().annualReserveContribution).toBe(10800);
    expect(rec()).toMatchObject({ closedOn: '2026-12-09' });
    expect(reviewData(rec()).appliedOn).toBe('2026-12-09');
    expect(recordCase(useIssuesStore.getState().cases, rec())!.status).toBe('closed');
  });

  it('for next year it is held for the budget; a failed vote changes nothing', () => {
    const a = ensureReview('A', '2026-11-24');
    useActionRecordsStore.getState().patchData(a.recordId, voted({ effective: 'next-year', vote: { on: '2026-12-09', inFavor: 3, against: 2 } }));
    runRecordActions('2026-12-09');
    expect(fin().annualReserveContribution).toBe(6000);
    expect(planDoc()).toMatchObject({ nextYearMonthly: 900, nextYearSetOn: '2026-12-09' });
    const b = ensureReview('B', '2027-01-10');
    expect(b.recordId).not.toBe(a.recordId);
    useActionRecordsStore.getState().patchData(b.recordId, voted({ effective: 'now', monthly: 2000, vote: { on: '2027-01-12', inFavor: 2, against: 3 } }));
    runRecordActions('2027-01-12');
    expect(fin().annualReserveContribution).toBe(6000);
    expect(records().find(r => r.id === b.recordId)!.closedOn).toBe('2027-01-12');
  });

  it('opens by itself when the plan shows a short year, and not again for six months after a review closes', () => {
    runActionTriggers('2026-11-24'); runActionTriggers('2026-11-25');
    const all = () => records().filter(r => r.kind === 'reserve-review');
    expect(all()).toHaveLength(1);
    expect(all()[0].title).toMatch(/^Reserves run short in \d{4}$/);
    useActionRecordsStore.getState().patch(all()[0].id, { closedOn: '2026-12-09' });
    runActionTriggers('2027-02-01');
    expect(all()).toHaveLength(1);
    runActionTriggers('2027-07-01');
    expect(all()).toHaveLength(2);
  });

  it('opens when a reserve study newer than the last review is on file, and stays quiet with nothing to fund', () => {
    useFinancialStore.setState({ annualReserveContribution: 600000, reserveStudyDate: '2026-11-20' });
    runActionTriggers('2026-11-24');
    expect(records().filter(r => r.kind === 'reserve-review').map(r => r.title)).toEqual(['Reserve study of 2026-11-20']);
    useActionRecordsStore.setState({ records: [] });
    useFinancialStore.setState({ reserveItems: [] });
    runActionTriggers('2026-11-24');
    expect(records().filter(r => r.kind === 'reserve-review')).toHaveLength(0);
  });

  it('keeps the assumptions it is given and uses them', () => {
    setAssumptions({ inflationPct: 4, interestPct: 1, growthPct: 2 }, '2026-11-24');
    expect(planDoc().assumptions).toEqual({ inflationPct: 4, interestPct: 1, growthPct: 2 });
    expect(RESERVE_REVIEW.stepTitles).toHaveLength(5);
  });
});
