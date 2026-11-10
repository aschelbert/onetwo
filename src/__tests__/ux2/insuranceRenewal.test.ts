import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildingStore, type InsurancePolicy } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, situationLabel, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { insuranceSteps, renewalDue, runInsuranceRenewal, STEP } from '@/ux2/boardroom/insuranceRenewal';

const policy = (id: string, type: string, expires: string, over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({ id, type, carrier: 'Hartford', coverage: '$5,000,000', premium: '$8,500/yr', expires, policyNum: 'GL-1', attachments: [], ...over });

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [] });
  useBuildingStore.setState({ insurance: [policy('ins1', 'General Liability', '2027-01-05'), policy('ins2', 'Directors & Officers (D&O)', '2027-06-30'), policy('ins3', 'Umbrella', 'TBD')] });
  useRunbookSwitches.setState({ off: [] });
});

describe('when a renewal is due', () => {
  it('is 60 days before the expiry, and any time after it; a policy with no date never starts', () => {
    expect(renewalDue(policy('a', 'GL', '2027-01-05'), '2026-11-06')).toBe(true);
    expect(renewalDue(policy('a', 'GL', '2027-01-05'), '2026-11-05')).toBe(false);
    expect(renewalDue(policy('a', 'GL', '2026-01-05'), '2026-11-10')).toBe(true);
    expect(renewalDue(policy('a', 'GL', 'TBD'), '2026-11-10')).toBe(false);
  });

  it('writes five steps that name the policy and the old expiry', () => {
    const steps = insuranceSteps(policy('a', 'General Liability', '2027-01-05'));
    expect(steps.length).toBe(5);
    expect(steps[STEP.quote].s).toBe('Ask for the General Liability renewal quote from Hartford');
    expect(steps[STEP.bind].s).toContain('(was 2027-01-05)');
  });
});

describe('running the runbook', () => {
  it('opens one case per policy inside the lead time, assigned to the president and due on the expiry, never twice', () => {
    const r = runInsuranceRenewal('2026-11-10');
    expect(r.opened.length).toBe(1);
    const c = useIssuesStore.getState().cases[0];
    expect(c).toMatchObject({ title: 'Insurance renewal · General Liability · expires 2027-01-05', catId: 'legal', sitId: 'runbook-insurance-renewal', source: 'runbook', sourceId: 'insurance-renewal:ins1:2027-01-05', assignedRole: 'President', dueDate: '2027-01-05', priority: 'high' });
    expect(c.steps?.length).toBe(5);
    expect(runInsuranceRenewal('2026-11-20').opened.length).toBe(0);
    // Past the date it is urgent; a second policy comes due in its own time.
    expect(runInsuranceRenewal('2027-05-02').opened.map(id => useIssuesStore.getState().cases.find(c => c.id === id)!.title)).toEqual(['Insurance renewal · Directors & Officers (D&O) · expires 2027-06-30']);
    useBuildingStore.setState({ insurance: [policy('ins4', 'Flood', '2026-10-01')] });
    const [id] = runInsuranceRenewal('2026-11-10').opened;
    expect(useIssuesStore.getState().cases.find(c => c.id === id)).toMatchObject({ title: 'Insurance renewal · Flood · lapsed 2026-10-01', priority: 'urgent' });
  });

  it('respects the switch', () => {
    useRunbookSwitches.getState().setOn('insurance-renewal', false);
    expect(useFinancialStore.getState().runbooksOff).toEqual(['insurance-renewal']);
    expect(runInsuranceRenewal('2026-11-10').opened.length).toBe(0);
    useRunbookSwitches.getState().setOn('insurance-renewal', true);
    expect(runInsuranceRenewal('2026-11-10').opened.length).toBe(1);
  });

  it('ticks the bind step when the policy on file carries a later expiry, and the file step once a certificate is uploaded after that', () => {
    useBuildingStore.setState(s => ({ insurance: s.insurance.filter(p => p.id === 'ins1') }));
    const [id] = runInsuranceRenewal('2026-11-10').opened;
    const steps = () => useIssuesStore.getState().cases.find(c => c.id === id)!.steps!;
    useBuildingStore.setState(s => ({ insurance: s.insurance.map(p => p.id === 'ins1' ? { ...p, attachments: [{ name: 'old.pdf', size: '1 MB', uploadedAt: '2025-12-01', type: 'application/pdf' }] } : p) }));
    runInsuranceRenewal('2026-12-01');
    expect(steps()[STEP.bind].done).toBe(false);
    expect(steps()[STEP.file].done).toBe(false);
    useBuildingStore.setState(s => ({ insurance: s.insurance.map(p => p.id === 'ins1' ? { ...p, expires: '2028-01-05', premium: '$9,100/yr' } : p) }));
    runInsuranceRenewal('2026-12-15');
    expect(steps()[STEP.bind].done).toBe(true);
    expect(steps()[STEP.file].done).toBe(false);
    useBuildingStore.setState(s => ({ insurance: s.insurance.map(p => p.id === 'ins1' ? { ...p, attachments: [...p.attachments, { name: 'coi-2028.pdf', size: '1 MB', uploadedAt: new Date().toISOString().slice(0, 10), type: 'application/pdf' }] } : p) }));
    runInsuranceRenewal('2026-12-16');
    expect(steps()[STEP.file].done).toBe(true);
    // The renewed policy's next expiry starts its own case when its time comes, not before.
    expect(runInsuranceRenewal('2027-11-01').opened.length).toBe(0);
    expect(runInsuranceRenewal('2027-11-07').opened.length).toBe(1);
  });

  it('shows as the Insurance renewal runbook\'s own case on the Runbooks tab', () => {
    const [id] = runInsuranceRenewal('2026-11-10').opened;
    const snap = { today: '2026-11-10', cases: useIssuesStore.getState().cases, runbooksOff: [], viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'President' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['insurance-renewal'].openCases.map(c => c.id)).toEqual([id]);
    expect(by['insurance-claim'].openCases.length).toBe(0);
    expect(situationLabel(snap, useIssuesStore.getState().cases[0])).toBe('Insurance renewal');
  });
});
