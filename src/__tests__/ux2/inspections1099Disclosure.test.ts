import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildingStore, type MaintenanceSchedule, type Vendor } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, situationLabel, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { inspectionDue, runBoilerFire, runElevatorInspection, watchedEntries } from '@/ux2/boardroom/inspections';
import { form1099Steps, runForm1099, vendors1099, STEP as F } from '@/ux2/boardroom/form1099';
import { disclosureSteps, runOwnerDisclosure, STEP as D } from '@/ux2/boardroom/ownerDisclosure';
import type { WorkOrder } from '@/data/financial';

const sched = (id: string, task: string, category: string, nextDue: string, over: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule => ({ id, task, category, frequency: 'annual', vendor: '', lastCompleted: '2025-06-01', nextDue, estimatedCost: '', notes: '', status: 'on-track', ...over });
const wo = (id: string, vendor: string, amount: number, paidDate: string | null, status: WorkOrder['status'] = 'paid'): WorkOrder => ({ id, title: 'Work', vendor, description: '', acctNum: '6100', amount, status, caseId: null, createdDate: '2026-02-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate, glEntryId: null, attachments: [] });
const vendor = (id: string, name: string, w9OnFile?: boolean): Vendor => ({ id, name, service: '', contact: '', phone: '', email: '', contract: '', status: 'active', w9OnFile });
const cases = () => useIssuesStore.getState().cases;

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [], closedThrough: null, workOrders: [] });
  useBuildingStore.setState({ maintenanceSchedules: [], vendors: [] });
  useComplianceStore.setState({ announcements: [], communications: [] });
  useRunbookSwitches.setState({ off: [] });
});

describe('inspections', () => {
  const calendar = [sched('ms2', 'Elevator Inspection', 'Elevator', '2026-12-20', { vendor: 'Metro Elevator Co' }), sched('ms3', 'Fire Alarm System Test', 'Fire Safety', '2027-01-08'), sched('ms7', 'Boiler inspection', 'HVAC', '2026-11-01', { status: 'overdue' }), sched('ms5', 'Roof Inspection', 'General', '2026-11-15'), sched('ms8', 'Sprinkler flow test', 'Fire Safety', '2026-10-01', { status: 'completed' })];

  it('each runbook watches its own systems on the maintenance calendar', () => {
    expect(watchedEntries('elevator-inspection', calendar).map(m => m.id)).toEqual(['ms2']);
    expect(watchedEntries('boiler-fire', calendar).map(m => m.id)).toEqual(['ms3', 'ms7', 'ms8']);
    expect(inspectionDue(calendar[0], '2026-10-21')).toBe(true);
    expect(inspectionDue(calendar[0], '2026-10-20')).toBe(false);
    expect(inspectionDue(calendar[4], '2026-11-10')).toBe(false);
  });

  it('opens one case per entry and due date, 60 days out or when overdue, with the inspection playbook; never twice', () => {
    useBuildingStore.setState({ maintenanceSchedules: calendar });
    expect(runElevatorInspection('2026-10-20').opened.length).toBe(0);
    expect(runElevatorInspection('2026-10-21').opened.length).toBe(1);
    const e = cases()[0];
    expect(e).toMatchObject({ title: 'Elevator Inspection · due 2026-12-20', catId: 'maintenance', sitId: 'inspection-scheduling', source: 'runbook', sourceId: 'elevator-inspection:ms2:2026-12-20', assignedRole: 'Vice President', dueDate: '2026-12-20', priority: 'high' });
    expect(e.steps?.length).toBe(6);
    expect(runElevatorInspection('2026-11-10').opened.length).toBe(0);
    expect(runBoilerFire('2026-11-08').opened.length).toBe(1);
    expect(cases().find(c => c.sourceId === 'boiler-fire:ms7:2026-11-01')).toMatchObject({ title: 'Boiler inspection · due 2026-11-01', priority: 'urgent' });
    expect(runBoilerFire('2026-11-09').opened.length).toBe(1);
    expect(cases().find(c => c.sourceId === 'boiler-fire:ms3:2027-01-08')).toBeTruthy();
    expect(runBoilerFire('2026-11-12').opened.length).toBe(0);
  });

  it('ticks the calendar step at once, the vendor step when one is on the entry, and the scheduling and visit once the entry is done', () => {
    useBuildingStore.setState({ maintenanceSchedules: [sched('ms3', 'Fire Alarm System Test', 'Fire Safety', '2026-12-15')] });
    const [id] = runBoilerFire('2026-11-10').opened;
    const steps = () => cases().find(c => c.id === id)!.steps!;
    const done = (re: RegExp) => steps().find(s => re.test(s.s))!.done;
    expect(done(/^identify all required/i)).toBe(true);
    expect(done(/^engage qualified/i)).toBe(false);
    useBuildingStore.setState(s => ({ maintenanceSchedules: s.maintenanceSchedules.map(m => ({ ...m, vendor: 'DC Fire Protection' })) }));
    runBoilerFire('2026-11-11');
    expect(done(/^engage qualified/i)).toBe(true);
    expect(done(/^attend inspection/i)).toBe(false);
    useBuildingStore.setState(s => ({ maintenanceSchedules: s.maintenanceSchedules.map(m => ({ ...m, lastCompleted: '2026-12-10', nextDue: '2027-12-10', status: 'on-track' as const })) }));
    runBoilerFire('2026-12-11');
    expect(done(/^schedule inspection date/i)).toBe(true);
    expect(done(/^attend inspection/i)).toBe(true);
    expect(done(/^address deficiencies/i)).toBe(false);
    // The next due date gets its own case when its time comes, not while this one is open.
    expect(runBoilerFire('2027-10-12').opened.length).toBe(0);
    useIssuesStore.setState(s => ({ cases: s.cases.map(c => ({ ...c, status: 'closed' as const })) }));
    expect(runBoilerFire('2027-10-11').opened.length).toBe(1);
  });

  it('defers to the Home obligation\'s case and respects the switch', () => {
    useBuildingStore.setState({ maintenanceSchedules: [sched('ms2', 'Elevator Inspection', 'Elevator', '2026-12-01')] });
    useIssuesStore.getState().createCase({ catId: 'maintenance', sitId: 'inspection-scheduling', approach: 'pre', title: 'Elevator inspection current', unit: '', owner: 'VP', priority: 'high', notes: '', source: 'obligation', sourceId: 'm2' });
    expect(runElevatorInspection('2026-11-10').opened.length).toBe(0);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('elevator-inspection', false);
    expect(runElevatorInspection('2026-11-10').opened.length).toBe(0);
    useRunbookSwitches.getState().setOn('elevator-inspection', true);
    expect(runElevatorInspection('2026-11-10').opened.length).toBe(1);
  });
});

describe('1099 filing', () => {
  beforeEach(() => {
    useFinancialStore.setState({ workOrders: [wo('w1', 'Apex Roofing', 4200, '2026-03-10'), wo('w2', 'Apex Roofing', 800, '2026-09-01'), wo('w3', 'Tree Masters LLC', 599, '2026-05-05'), wo('w4', 'Pro Painters LLC', 2500, '2026-06-01'), wo('w5', 'Quick Fix Plumbing', 900, null, 'invoiced'), wo('w6', 'Old Vendor', 5000, '2025-12-20')] });
    useBuildingStore.setState({ vendors: [vendor('v1', 'Apex Roofing', true), vendor('v2', 'Pro Painters LLC', false)] });
  });

  it('lists the vendors paid $600 or more in the tax year from the paid work orders, with their W-9s', () => {
    expect(vendors1099(2026)).toEqual([{ vendor: 'Apex Roofing', amount: 5000, w9OnFile: true }, { vendor: 'Pro Painters LLC', amount: 2500, w9OnFile: false }]);
    expect(form1099Steps(2026, vendors1099(2026))[F.list].s).toBe('Confirm the vendors paid $600 or more in 2026: 2 vendors, $7,500');
    expect(form1099Steps(2026, vendors1099(2026))[F.file].s).toContain('by 2027-01-31');
  });

  it('opens on January 1 for the year just ended, once, through March; ticks the list at once and the W-9s when complete', () => {
    // December 31 is past the window for last year's forms; January 1 opens the year just ended.
    expect(runForm1099('2026-12-31')).toMatchObject({ taxYear: 2025, opened: false });
    expect(runForm1099('2027-01-01')).toMatchObject({ taxYear: 2026, opened: true });
    const c = cases()[0];
    expect(c).toMatchObject({ title: '1099 filing · 2026', sitId: 'runbook-1099', source: 'runbook', sourceId: '1099:2026', assignedRole: 'Treasurer', dueDate: '2027-01-31' });
    expect(c.steps?.length).toBe(4);
    expect(c.steps![F.list].done).toBe(true);
    expect(c.steps![F.w9].done).toBe(false);
    expect(runForm1099('2027-01-15').opened).toBe(false);
    useBuildingStore.setState(s => ({ vendors: s.vendors.map(v => ({ ...v, w9OnFile: true })) }));
    runForm1099('2027-01-16');
    expect(cases()[0].steps![F.w9].done).toBe(true);
    expect(cases()[0].steps![F.file].done).toBe(false);
    useIssuesStore.setState({ cases: [] });
    expect(runForm1099('2027-04-01').opened).toBe(false);
  });

  it('opens nothing when no vendor reached the threshold, and respects the switch', () => {
    useFinancialStore.setState({ workOrders: [wo('w3', 'Tree Masters LLC', 599, '2026-05-05')] });
    expect(runForm1099('2027-01-01').opened).toBe(false);
    useFinancialStore.setState({ workOrders: [wo('w1', 'Apex Roofing', 4200, '2026-03-10')] });
    useRunbookSwitches.getState().setOn('1099', false);
    expect(runForm1099('2027-01-01').opened).toBe(false);
    useRunbookSwitches.getState().setOn('1099', true);
    expect(runForm1099('2027-01-01').opened).toBe(true);
  });
});

describe('owner disclosure statement', () => {
  it('opens on January 1, due March 31, once, through June; ticks the figures when last year closes and the sending when a notice goes out', () => {
    expect(runOwnerDisclosure('2027-01-01')).toMatchObject({ year: 2027, opened: true });
    const c = cases()[0];
    expect(c).toMatchObject({ title: 'Owner disclosure statement · 2027', sitId: 'runbook-owner-disclosure', source: 'runbook', sourceId: 'owner-disclosure:2027', assignedRole: 'Secretary', dueDate: '2027-03-31' });
    expect(c.steps?.length).toBe(3);
    expect(disclosureSteps(2027)[D.compile].s).toContain('2026 actuals against budget');
    expect(runOwnerDisclosure('2027-02-01').opened).toBe(false);
    const steps = () => cases()[0].steps!;
    expect(steps()[D.compile].done).toBe(false);
    useFinancialStore.setState({ closedThrough: '2026-12-31' });
    runOwnerDisclosure('2027-02-02');
    expect(steps()[D.compile].done).toBe(true);
    expect(steps()[D.send].done).toBe(false);
    useComplianceStore.setState({ communications: [{ id: 'oc9', type: 'notice', subject: '2027 Annual Disclosure Statement', date: new Date().toISOString().slice(0, 10), method: 'mail', recipients: 'All owners', respondedBy: null, status: 'sent', notes: '' }] });
    runOwnerDisclosure('2027-03-20');
    expect(steps()[D.send].done).toBe(true);
    expect(steps()[D.approve].done).toBe(false);
    useIssuesStore.setState({ cases: [] });
    expect(runOwnerDisclosure('2027-07-01').opened).toBe(false);
  });

  it('defers to the Home obligation\'s case and respects the switch', () => {
    useIssuesStore.getState().createCase({ catId: 'governance', sitId: 'obligation-r3', approach: 'pre', title: 'Annual disclosure statement distributed', unit: '', owner: 'Secretary', priority: 'medium', notes: '', source: 'obligation', sourceId: 'r3', customSteps: [{ s: 'Do it' }] });
    expect(runOwnerDisclosure('2027-01-05').opened).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('owner-disclosure', false);
    expect(runOwnerDisclosure('2027-01-05').opened).toBe(false);
    useRunbookSwitches.getState().setOn('owner-disclosure', true);
    expect(runOwnerDisclosure('2027-01-05').opened).toBe(true);
  });

  it('all four show under their own runbooks on the Runbooks tab', () => {
    useBuildingStore.setState({ maintenanceSchedules: [sched('ms2', 'Elevator Inspection', 'Elevator', '2026-12-01'), sched('ms3', 'Fire Alarm System Test', 'Fire Safety', '2026-12-01')], vendors: [vendor('v1', 'Apex Roofing', true)] });
    useFinancialStore.setState({ workOrders: [wo('w1', 'Apex Roofing', 4200, '2026-03-10')] });
    const e = runElevatorInspection('2026-11-10').opened[0];
    const b = runBoilerFire('2026-11-10').opened[0];
    const f = runForm1099('2027-01-02').caseId;
    const d = runOwnerDisclosure('2027-01-02').caseId;
    const snap = { today: '2027-01-02', cases: cases(), runbooksOff: [], viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'President' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['elevator-inspection'].openCases.map(c => c.id)).toEqual([e]);
    expect(by['boiler-fire'].openCases.map(c => c.id)).toEqual([b]);
    expect(by['1099'].openCases.map(c => c.id)).toEqual([f]);
    expect(by['owner-disclosure'].openCases.map(c => c.id)).toEqual([d]);
    expect(situationLabel(snap, cases().find(c => c.id === f)!)).toBe('1099 filing');
    expect(situationLabel(snap, cases().find(c => c.id === d)!)).toBe('Owner disclosure statement');
  });
});
