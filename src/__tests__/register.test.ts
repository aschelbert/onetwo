import { describe, it, expect, beforeEach } from 'vitest';
import {
  architecturalStanding, blankArchitectural, blankLien, blankResale, blankViolation, cureBy, decisionDue, lienStanding, priorViolations, resaleDue, resaleStanding, violationStanding,
  type ArchitecturalRequest, type Lien, type ResaleRequest, type Violation,
} from '@/lib/register';
import { useRegisterStore } from '@/store/useRegisterStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { A_STEP, R_STEP, V_STEP, architecturalSteps, registerCase, resaleSteps, runRegister, violationSteps } from '@/ux2/boardroom/register';
import { RUNBOOKS } from '@/ux2/boardroom/runbooks';
import { runbookPlan } from '@/ux2/boardroom/runbookPlans';
import { registerSummary } from '@/ux2/boardroom/tabs/RegisterTab';

const base = { unit: '204', owner: 'Sam Lee', closedOn: '', notes: '' };
const violation = (d: Partial<Violation['data']> = {}, over: Partial<Violation> = {}): Violation => ({ ...base, id: 'v1', kind: 'violation', title: 'Storage on the balcony', openedOn: '2026-11-01', data: { ...blankViolation(), rule: 'Rules § 4.2', ...d }, ...over });
const arch = (d: Partial<ArchitecturalRequest['data']> = {}, over: Partial<ArchitecturalRequest> = {}): ArchitecturalRequest => ({ ...base, id: 'a1', kind: 'architectural', title: 'Replace windows', openedOn: '2026-11-01', data: { ...blankArchitectural(), ...d }, ...over });
const resale = (d: Partial<ResaleRequest['data']> = {}, over: Partial<ResaleRequest> = {}): ResaleRequest => ({ ...base, id: 'r1', kind: 'resale', title: 'Resale certificate', openedOn: '2026-11-10', data: { ...blankResale(), ...d }, ...over });
const lien = (d: Partial<Lien['data']> = {}): Lien => ({ ...base, id: 'l1', kind: 'lien', title: 'Lien', openedOn: '2026-11-01', data: { ...blankLien(), amount: 2400, ...d } });

describe('violation standing', () => {
  it('asks for the notice first, then counts the cure period from the notice', () => {
    expect(violationStanding(violation(), '2026-11-03')).toMatchObject({ stage: 'logged', next: 'Send the notice of violation', overdue: false });
    expect(violationStanding(violation(), '2026-11-20')).toMatchObject({ stage: 'logged', overdue: true });
    const noticed = violation({ noticeSentOn: '2026-11-05' });
    expect(cureBy(noticed)).toBe('2026-12-05');
    expect(violationStanding(noticed, '2026-11-20')).toMatchObject({ stage: 'noticed', due: '2026-12-05', overdue: false });
    expect(violationStanding(noticed, '2026-12-06')).toMatchObject({ stage: 'uncured', overdue: true });
  });
  it('moves through the hearing to a fine that has to be charged', () => {
    const set = violation({ noticeSentOn: '2026-11-05', hearingOn: '2026-12-15' });
    expect(violationStanding(set, '2026-12-10').stage).toBe('hearing-set');
    expect(violationStanding(set, '2026-12-16')).toMatchObject({ stage: 'hearing-held', overdue: true });
    const upheld = violation({ noticeSentOn: '2026-11-05', hearingOn: '2026-12-15', hearingOutcome: 'upheld', fineAmount: 100 });
    expect(violationStanding(upheld, '2026-12-16')).toMatchObject({ stage: 'fine-due', open: true });
    expect(violationStanding(violation({ ...upheld.data, fineInvoiceId: 'INV-1' }), '2026-12-16')).toMatchObject({ stage: 'fined', open: false });
  });
  it('ends when cured, dismissed, or upheld without a fine', () => {
    expect(violationStanding(violation({ noticeSentOn: '2026-11-05', curedOn: '2026-11-12' }), '2026-12-30').open).toBe(false);
    expect(violationStanding(violation({ hearingOutcome: 'dismissed' }), '2026-12-30')).toMatchObject({ stage: 'dismissed', open: false });
    expect(violationStanding(violation({ hearingOutcome: 'upheld', fineAmount: 0 }), '2026-12-30')).toMatchObject({ stage: 'warned', open: false });
  });
  it('counts earlier violations of the same rule by the same unit', () => {
    const now = violation({}, { id: 'v2', openedOn: '2026-11-01' });
    const earlier = violation({}, { id: 'v0', openedOn: '2026-03-01' });
    const otherRule = violation({ rule: 'Rules § 7' }, { id: 'v3', openedOn: '2026-02-01' });
    const otherUnit = violation({}, { id: 'v4', unit: '301', openedOn: '2026-02-01' });
    expect(priorViolations(now, [now, earlier, otherRule, otherUnit]).map(v => v.id)).toEqual(['v0']);
  });
});

describe('architectural request standing', () => {
  it('runs the board\'s deadline from the day the application came in', () => {
    expect(decisionDue(arch())).toBe('2026-12-01');
    expect(architecturalStanding(arch(), '2026-11-10')).toMatchObject({ stage: 'review', due: '2026-12-01', overdue: false });
    expect(architecturalStanding(arch(), '2026-12-02').overdue).toBe(true);
    expect(decisionDue(arch({ reviewDays: 45 }))).toBe('2026-12-16');
  });
  it('stays open after approval until the work is inspected; a denial ends it', () => {
    expect(architecturalStanding(arch({ decision: 'approved', decidedOn: '2026-11-20' }), '2026-12-30')).toMatchObject({ stage: 'approved', open: true, overdue: false });
    expect(architecturalStanding(arch({ decision: 'approved', decidedOn: '2026-11-20', inspectedOn: '2027-01-15' }), '2027-02-01').open).toBe(false);
    expect(architecturalStanding(arch({ decision: 'denied', decidedOn: '2026-11-20' }), '2026-12-30')).toMatchObject({ stage: 'denied', open: false });
  });
});

describe('resale certificate clock', () => {
  it('is due ten days after the request', () => {
    expect(resaleDue(resale())).toBe('2026-11-20');
    expect(resaleStanding(resale(), '2026-11-12')).toMatchObject({ stage: 'requested', due: '2026-11-20', next: 'Prepare the statement of account', overdue: false });
    expect(resaleStanding(resale(), '2026-11-21')).toMatchObject({ overdue: true, tone: 'red' });
  });
  it('is ready once the statement is prepared and ends on delivery, noting a late one', () => {
    const st = { preparedOn: '2026-11-12', balance: 0, monthlyFee: 450, specialAssessments: 0 };
    expect(resaleStanding(resale({ statement: st }), '2026-11-12')).toMatchObject({ stage: 'ready', next: 'Deliver the certificate' });
    expect(resaleStanding(resale({ statement: st, deliveredOn: '2026-11-18' }), '2026-12-01')).toMatchObject({ stage: 'delivered', open: false, tone: 'sage' });
    expect(resaleStanding(resale({ statement: st, deliveredOn: '2026-11-25' }), '2026-12-01')).toMatchObject({ label: 'Delivered 2026-11-25 · late', tone: 'amber' });
  });
});

describe('lien standing', () => {
  it('goes from referral to recording, and asks for the release once the unit has paid', () => {
    expect(lienStanding(lien(), '2026-11-10', 2400)).toMatchObject({ stage: 'referred', next: 'Send the owner notice of the lien' });
    expect(lienStanding(lien({ noticeSentOn: '2026-11-05' }), '2026-11-10', 2400).next).toBe('Record the lien and enter its instrument number');
    expect(lienStanding(lien({ recordedOn: '2026-11-20', instrument: '2026-118834' }), '2026-12-01', 2400)).toMatchObject({ stage: 'recorded', overdue: false });
    expect(lienStanding(lien({ recordedOn: '2026-11-20' }), '2026-12-15', 0)).toMatchObject({ stage: 'release-due', tone: 'red', next: 'Record the release of lien' });
    expect(lienStanding(lien({ recordedOn: '2026-11-20', releasedOn: '2026-12-20' }), '2026-12-21', 0).open).toBe(false);
    expect(lienStanding(lien(), '2026-11-10', 0).stage).toBe('moot');
  });
});

describe('register runbooks', () => {
  const steps = (id: string) => useIssuesStore.getState().cases.find(c => c.id === id)!.steps!.map(s => s.done);
  const theCase = (id: string) => useIssuesStore.getState().cases.find(c => c.id === id)!;
  beforeEach(() => {
    useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
    useRegisterStore.setState({ entries: [], saveError: null });
    useFinancialStore.setState({ runbooksOff: [] });
    useBuildingStore.setState({ legalDocuments: [] });
  });

  it('opens one action per open entry, never twice, and none for a lien', () => {
    useRegisterStore.setState({ entries: [violation(), arch(), resale(), lien()] });
    expect(runRegister('2026-11-12').opened).toHaveLength(3);
    expect(runRegister('2026-11-12').opened).toHaveLength(0);
    const cases = useIssuesStore.getState().cases;
    expect(registerCase(cases, violation())?.steps).toHaveLength(violationSteps(violation()).length);
    expect(registerCase(cases, resale())).toMatchObject({ dueDate: '2026-11-20', unit: '204' });
    expect(registerCase(cases, arch())).toMatchObject({ sitId: 'architectural-review', dueDate: '2026-12-01' });
    expect(registerCase(cases, lien())).toBeUndefined();
  });

  it('ticks a violation\'s steps from the register and closes the action when it is cured', () => {
    useRegisterStore.setState({ entries: [violation()] });
    const [id] = runRegister('2026-11-03').opened;
    expect(steps(id)).toEqual([true, false, false, false, false, false]);
    useRegisterStore.getState().patchData('v1', { noticeSentOn: '2026-11-05' });
    runRegister('2026-11-06');
    expect(steps(id)[V_STEP.notice]).toBe(true);
    expect(steps(id)[V_STEP.reinspect]).toBe(false);
    useRegisterStore.getState().patchData('v1', { curedOn: '2026-11-20' });
    runRegister('2026-11-21');
    // Closing an action completes it, so the hearing steps it never needed are not left hanging.
    expect(theCase(id).status).toBe('closed');
    expect(theCase(id).closeReason ?? '').toMatch(/cured/i);
  });

  it('follows a violation through a hearing to the fine', () => {
    useRegisterStore.setState({ entries: [violation({ noticeSentOn: '2026-11-05' })] });
    const [id] = runRegister('2026-12-06').opened;
    useRegisterStore.getState().patchData('v1', { hearingOn: '2026-12-15' });
    runRegister('2026-12-07');
    expect(steps(id).slice(0, 4)).toEqual([true, true, true, true]);
    useRegisterStore.getState().patchData('v1', { hearingOutcome: 'upheld', fineAmount: 100 });
    runRegister('2026-12-16');
    expect(steps(id)[V_STEP.hearing]).toBe(true);
    expect(steps(id)[V_STEP.fine]).toBe(false);
    expect(theCase(id).status).not.toBe('closed');
    useRegisterStore.getState().patchData('v1', { fineInvoiceId: 'INV-9' });
    runRegister('2026-12-16');
    expect(steps(id)[V_STEP.fine]).toBe(true);
    expect(theCase(id).status).toBe('closed');
  });

  it('ticks the resale steps as the statement, the fee and the delivery land', () => {
    useRegisterStore.setState({ entries: [resale()] });
    const [id] = runRegister('2026-11-11').opened;
    expect(theCase(id).steps).toHaveLength(resaleSteps(resale()).length);
    expect(steps(id)).toEqual([true, false, false, false, false]);
    useRegisterStore.getState().patchData('r1', { statement: { preparedOn: '2026-11-12', balance: 0, monthlyFee: 450, specialAssessments: 0 }, feeWaived: true });
    runRegister('2026-11-12');
    expect(steps(id)[R_STEP.statement]).toBe(true);
    expect(steps(id)[R_STEP.fee]).toBe(true);
    // The packet step waits on the documents being on file.
    expect(steps(id)[R_STEP.packet]).toBe(false);
    useRegisterStore.getState().patchData('r1', { deliveredOn: '2026-11-15', deliveredTo: 'title@example.test' });
    runRegister('2026-11-15');
    expect(steps(id)[R_STEP.deliver]).toBe(true);
    expect(theCase(id).status).toBe('closed');
  });

  it('ticks the decision and the inspection on an architectural request', () => {
    useRegisterStore.setState({ entries: [arch()] });
    const [id] = runRegister('2026-11-05').opened;
    expect(theCase(id).steps).toHaveLength(architecturalSteps(arch()).length);
    useRegisterStore.getState().patchData('a1', { decision: 'approved_with_conditions', conditions: 'Weekdays only', decidedOn: '2026-11-18' });
    runRegister('2026-11-18');
    expect(steps(id)[A_STEP.decide]).toBe(true);
    expect(theCase(id).status).not.toBe('closed');
    useRegisterStore.getState().patchData('a1', { inspectedOn: '2027-01-10' });
    runRegister('2027-01-10');
    expect(steps(id)[A_STEP.inspect]).toBe(true);
    expect(theCase(id).status).toBe('closed');
  });

  it('opens nothing for a runbook that is switched off, or for a matter already ended', () => {
    useFinancialStore.setState({ runbooksOff: ['covenant-violation'] });
    useRegisterStore.setState({ entries: [violation(), resale({ deliveredOn: '2026-11-12' })] });
    expect(runRegister('2026-11-13').opened).toHaveLength(0);
  });

  it('has a plan that matches the steps it puts on the action', () => {
    const plan = (id: string) => runbookPlan(RUNBOOKS.find(r => r.id === id)!);
    expect(plan('covenant-violation')).toMatchObject({ live: true, source: 'runbook' });
    expect(plan('covenant-violation').steps).toHaveLength(violationSteps(violation()).length);
    expect(plan('resale-certificate').steps).toHaveLength(resaleSteps(resale()).length);
    expect(RUNBOOKS.find(r => r.id === 'covenant-violation')!.steps).toBe(violationSteps(violation()).length);
    expect(RUNBOOKS.find(r => r.id === 'resale-certificate')!.steps).toBe(resaleSteps(resale()).length);
  });
});

describe('register summary', () => {
  it('counts what is waiting on someone and what is past its date', () => {
    const entries = [violation(), resale(), arch({ decision: 'denied', decidedOn: '2026-11-05' }), lien({ recordedOn: '2026-11-02' })];
    expect(registerSummary(entries, '2026-11-25', () => 500)).toEqual({ open: 3, waiting: 2, overdue: 2 });
  });
});

describe('fines and fees post to their own income accounts', () => {
  it('books a fine to Fines, and falls back when the chart has no such account', () => {
    const chart = [
      { num: '1130', name: 'Fees receivable', type: 'asset', sub: 'receivable', parent: null },
      { num: '4030', name: 'Late Fees', type: 'income', sub: 'fee', parent: null },
      { num: '4070', name: 'Fines & Penalties', type: 'income', sub: 'fee', parent: null },
    ];
    useFinancialStore.setState({ chartOfAccounts: chart as never, generalLedger: [], unitInvoices: [], units: [{ number: '204', owner: 'Sam', email: '', phone: '', monthlyFee: 450, votingPct: 2, status: 'ACTIVE', balance: 0, moveIn: null, sqft: 800, bedrooms: 1, parking: null, payments: [], lateFees: [], specialAssessments: [], stripeCustomerId: null }] as never, closedThrough: null as never });
    const fin = useFinancialStore.getState();
    fin.createUnitInvoice('204', 'fee', 100, 'Fine · balcony', undefined, undefined, { revenueAcct: '4070' });
    fin.createUnitInvoice('204', 'fee', 50, 'Other fee', undefined, undefined, { revenueAcct: '4999' });
    const credits = useFinancialStore.getState().generalLedger.map(e => e.creditAcct);
    expect(credits[0]).toBe('4070');
    expect(credits[1]).not.toBe('4999');
    expect(useFinancialStore.getState().units[0].balance).toBe(150);
  });
});
