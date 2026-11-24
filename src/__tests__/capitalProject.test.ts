import { describe, it, expect, beforeEach } from 'vitest';
import {
  bidsNeeded, blankProject, currentStep, extraPaybackYears, fundingEffects, loanPayment, paybackYears, permitNeeded, projectCost, projectSteps, stageLabel,
  type CapitalProject, type ProjectOption,
} from '@/lib/capitalProject';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { awardContract, closeOut, projectCase, projectIdOf, runCapitalImprovement, signOffWork, capitalSteps } from '@/ux2/boardroom/capitalImprovement';
import { RUNBOOKS } from '@/ux2/boardroom/runbooks';
import { runbookPlan } from '@/ux2/boardroom/runbookPlans';

const opt = (o: Partial<ProjectOption>): ProjectOption => ({ id: 'o', name: 'Option', cost: 0, rebate: 0, savesPerYear: 0, notes: '', ...o });
const project = (over: Partial<CapitalProject> = {}): CapitalProject => ({ ...blankProject('Garage gate system', 'Controller failing', '2026-09-14'), id: 'p1', ...over });
const same = opt({ id: 'same', name: 'Same again', cost: 36000 });
const better = opt({ id: 'better', name: 'With plate reader', cost: 43800, savesPerYear: 1900 });
const bid = (id: string, vendor: string, amount: number, insuranceOk = true) => ({ id, vendor, amount, meetsScope: true, insuranceOk, notes: '' });
const done = (p: CapitalProject) => projectSteps(p).map(s => (s.done ? 1 : 0)).join('');

describe('payback', () => {
  it('is cost less rebate over the yearly saving, and nothing when it saves nothing', () => {
    expect(paybackYears({ cost: 18400, rebate: 2200, savesPerYear: 7100 })).toBe(2.3);
    expect(paybackYears({ cost: 36000, rebate: 0, savesPerYear: 0 })).toBeNull();
  });
  it('for a dearer option is the extra cost over the extra saving, against the cheapest', () => {
    expect(extraPaybackYears(better, [same, better])).toBe(4.1);
    expect(extraPaybackYears(same, [same, better])).toBeNull();
    expect(extraPaybackYears(opt({ id: 'x', cost: 50000 }), [same])).toBeNull();
  });
});

describe('ways to pay', () => {
  const ctx = { units: 50, reserveCash: 342450, operatingCash: 58300, reservePct: 43, reservePctAfter: 30, shortAfter: 2031 as number | null };
  it('shows what each does to this building', () => {
    const rows = fundingEffects(103000, ctx);
    expect(rows.map(r => r.source)).toEqual(['reserves', 'operating', 'special_assessment', 'loan']);
    expect(rows[0]).toMatchObject({ possible: true, decides: 'Board', effect: 'Reserves go from 43% to 30% funded · the plan then runs short in 2031' });
    expect(rows[1].possible).toBe(false);
    expect(rows[2].effect).toContain('$2,060 a unit, once');
    expect(rows[3].decides).toBe("Owners' vote");
  });
  it('prices a level loan payment', () => {
    expect(Math.round(loanPayment(103000, 7, 7))).toBe(1555);
    expect(loanPayment(1200, 0, 1)).toBe(100);
  });
  it('says when reserves cannot cover it', () => {
    expect(fundingEffects(400000, ctx)[0]).toMatchObject({ possible: false });
  });
});

describe('the ten steps', () => {
  it('start with only the need done', () => {
    expect(done(project())).toBe('1000000000');
    expect(currentStep(project())?.key).toBe('options');
    expect(stageLabel(project())).toBe('Step 2 of 10 · Compare the options');
  });
  it('need three bids over the spending limit, one under it', () => {
    expect(bidsNeeded(project({ options: [better], chosenOptionId: 'better' }), 5000)).toBe(3);
    expect(bidsNeeded(project({ options: [opt({ id: 's', cost: 900 })], chosenOptionId: 's' }), 5000)).toBe(1);
  });
  it('tick the permit step once the questions are answered, either way', () => {
    expect(projectSteps(project({ permit: { ...project().permit, answered: true } }))[3]).toMatchObject({ done: true, summary: 'No permit needed' });
    const p = project({ permit: { ...project().permit, answered: true, answers: ['systems', 'tree'] } });
    expect(permitNeeded(p)).toBe(true);
    expect(projectSteps(p)[3]).toMatchObject({ done: true, summary: 'Permit needed · not on file yet · 1 other approval' });
  });
  it('hold the start of work until the permit is on file, and the payment until its final inspection', () => {
    const p = project({ permit: { ...project().permit, answered: true, answers: ['systems'] }, contractSignedOn: '2026-10-20' });
    expect(projectSteps(p)[7].waitsOn).toBe('the permit being on file');
    expect(projectSteps(p)[8].waitsOn).toBe("the permit's final inspection");
    const filed = project({ ...p, permit: { ...p.permit, number: 'B2600123', finalInspectionOn: '2026-12-01' } });
    expect(projectSteps(filed)[7].waitsOn).toBe('');
    expect(projectSteps(filed)[8].waitsOn).toBe('');
    // With no permit needed, nothing is held on that account.
    expect(projectSteps(project({ permit: { ...project().permit, answered: true }, contractSignedOn: '2026-10-20' }))[7].waitsOn).toBe('');
  });
  it('hold the award on an uninsured bidder', () => {
    const p = project({ bids: [bid('b1', 'Gate Co', 43800, false)], awardedBidId: 'b1' });
    expect(projectSteps(p)[5]).toMatchObject({ done: false, waitsOn: "Gate Co's insurance certificate" });
  });
  it('use the contract price once awarded', () => {
    expect(projectCost(project({ options: [better], chosenOptionId: 'better' }))).toBe(43800);
    expect(projectCost(project({ options: [better], chosenOptionId: 'better', bids: [bid('b1', 'Gate Co', 42100)], awardedBidId: 'b1' }))).toBe(42100);
  });
});

describe('capital improvement runbook', () => {
  const store = () => useCapitalProjectsStore.getState();
  const theCase = () => projectCase(useIssuesStore.getState().cases, 'p1')!;
  const ticks = () => theCase().steps!.map(s => (s.done ? 1 : 0)).join('');
  beforeEach(() => {
    useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
    useCapitalProjectsStore.setState({ projects: [project({ assetId: 'a1', reserveItemId: 'res4' })], saveError: null });
    useFinancialStore.setState({
      runbooksOff: [], workOrders: [], generalLedger: [], closedThrough: null as never,
      chartOfAccounts: [{ num: '1010', name: 'Operating', type: 'asset', sub: 'bank', parent: null }, { num: '1020', name: 'Reserve', type: 'asset', sub: 'bank', parent: null }, { num: '2010', name: 'AP', type: 'liability', sub: 'payable', parent: null }, { num: '6040', name: 'Gate', type: 'expense', sub: 'reserve', parent: null, reserveItem: 'res4' }] as never,
      reserveItems: [{ id: 'res4', name: 'Garage gate system', estimatedCost: 45000, currentFunding: 42000, usefulLife: 15, lastReplaced: '2012', yearsRemaining: 1, isContingency: false }],
    });
    useBuildingStore.setState({ assets: [{ id: 'a1', name: 'Parking Gate System', condition: 'Poor', installedDate: '2012-05-01', usefulLifeYears: 15, remainingLifeYears: 1, replacementCostToday: 45000, originalCost: 30000, warranties: [], reserveItemId: 'res4' }] as never });
  });

  it('opens one action per open project, with the ten steps, and never twice', () => {
    expect(runCapitalImprovement('2026-09-14').opened).toHaveLength(1);
    expect(runCapitalImprovement('2026-09-14').opened).toHaveLength(0);
    expect(theCase().steps).toHaveLength(capitalSteps().length);
    expect(projectIdOf(theCase())).toBe('p1');
    expect(ticks()).toBe('1000000000');
  });

  it('opens nothing when switched off', () => {
    useFinancialStore.setState({ runbooksOff: ['capital-improvement'] });
    expect(runCapitalImprovement('2026-09-14').opened).toHaveLength(0);
  });

  it('follows a project from the options to the close-out', () => {
    runCapitalImprovement('2026-09-14');
    store().patch('p1', { options: [same, better], chosenOptionId: 'better', optionReason: 'Cuts call-outs' });
    store().patch('p1', { funding: { source: 'reserves', decidedOn: '2026-10-08', vote: 'Board 5–0' } });
    store().patch('p1', { permit: { answered: true, answers: ['systems'], pulledBy: 'contractor', number: '', issuedOn: '', finalInspectionOn: '' } });
    runCapitalImprovement('2026-10-09');
    expect(ticks()).toBe('1111000000');

    store().patch('p1', { scope: 'Replace the gate operator and controller', bids: [bid('b1', 'Gate Co', 43800), bid('b2', 'Access Ltd', 46200), bid('b3', 'Entry Inc', 44900)] });
    awardContract('p1', 'b1', 'Lowest for the whole scope', '2026-10-20');
    const wo = useFinancialStore.getState().workOrders[0];
    expect(wo).toMatchObject({ vendor: 'Gate Co', amount: 43800, acctNum: '6040', status: 'approved', caseId: theCase().id });
    expect(store().projects[0].workOrderId).toBe(wo.id);
    store().patch('p1', { ownersToldOn: '2026-11-03' });
    runCapitalImprovement('2026-11-03');
    expect(ticks()).toBe('1111111000');

    // Work is held until the permit is on file.
    expect(projectSteps(store().projects[0])[7].waitsOn).toBe('the permit being on file');
    store().patch('p1', { permit: { ...store().projects[0].permit, number: 'B2600123', issuedOn: '2026-10-28', finalInspectionOn: '2026-12-01' }, workStartedOn: '2026-11-10' });
    signOffWork('p1', 'Jennifer Adams', '2026-12-02');
    expect(useFinancialStore.getState().workOrders[0].signoff).toMatchObject({ by: 'Jennifer Adams', date: '2026-12-02' });
    runCapitalImprovement('2026-12-02');
    expect(ticks()).toBe('1111111100');

    // The bill is paid in Funds; the action picks it up.
    useFinancialStore.getState().receiveInvoice(wo.id, 'INV-77', 43800, '2026-12-03');
    useFinancialStore.getState().payWorkOrder(wo.id, '2026-12-05');
    runCapitalImprovement('2026-12-05');
    expect(store().projects[0].paidOn).toBe('2026-12-05');
    expect(ticks()).toBe('1111111110');

    closeOut('p1', '2026-12-10', 15, '2028-12-10');
    runCapitalImprovement('2026-12-10');
    expect(theCase().status).toBe('closed');
    expect(useFinancialStore.getState().reserveItems[0]).toMatchObject({ estimatedCost: 43800, usefulLife: 15, yearsRemaining: 15, lastReplaced: '2026', currentFunding: 0 });
    const asset = useBuildingStore.getState().assets[0];
    expect(asset).toMatchObject({ condition: 'Excellent', installedDate: '2026-12-10', remainingLifeYears: 15, replacementCostToday: 43800 });
    expect(asset.warranties[0]).toMatchObject({ expires: '2028-12-10', vendorName: 'Gate Co' });
    expect(stageLabel(store().projects[0])).toBe('Closed 2026-12-10');
  });

  it('does not raise a second work order if the award is recorded again', () => {
    runCapitalImprovement('2026-09-14');
    store().patch('p1', { bids: [bid('b1', 'Gate Co', 43800)] });
    awardContract('p1', 'b1', '', '2026-10-20');
    awardContract('p1', 'b1', 'Corrected reason', '2026-10-21');
    expect(useFinancialStore.getState().workOrders).toHaveLength(1);
    expect(store().projects[0]).toMatchObject({ awardReason: 'Corrected reason', contractSignedOn: '2026-10-21' });
  });

  it('has a plan that matches the steps on the action', () => {
    const def = RUNBOOKS.find(r => r.id === 'capital-improvement')!;
    const plan = runbookPlan(def);
    expect(plan).toMatchObject({ live: true, source: 'runbook' });
    expect(plan.steps).toHaveLength(capitalSteps().length);
    expect(def.steps).toBe(10);
    expect(plan.steps.every(s => s.auto && !!s.how)).toBe(true);
  });
});
