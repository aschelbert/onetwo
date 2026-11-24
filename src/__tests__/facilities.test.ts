import { describe, it, expect, beforeEach } from 'vitest';
import { addMonths, completed, deferralOf, deferred, frequencyMonths, nextDueAfter, scheduleState } from '@/lib/maintenance';
import { certificateState, vendorInsuranceStatus } from '@/lib/vendorInsurance';
import { missingColumn } from '@/lib/services/missingColumn';
import { useBuildingStore, type MaintenanceSchedule, type VendorCertificate } from '@/store/useBuildingStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { kindOf, markDone, putOff } from '@/ux2/building/maintenanceActions';
import { contractRows, contractsSummary, maintenanceOverdue } from '@/ux2/building/metrics';
import type { BuildingSnapshot } from '@/ux2/building/metrics';
import { bills as fundBills, type FundsSnapshot } from '@/ux2/funds/metrics';

const sched = (over: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule => ({ id: 'm1', task: 'Roof inspection', category: 'Roof and envelope', frequency: 'Twice a year', vendor: 'Apex Roofing', lastCompleted: '', nextDue: '2026-04-01', estimatedCost: '$600', notes: 'Membrane and drains', status: 'on-track', ...over });

describe('maintenance recurrence', () => {
  it('reads how often a task repeats, old wording included', () => {
    expect(frequencyMonths('Monthly')).toBe(1);
    expect(frequencyMonths('quarterly')).toBe(3);
    expect(frequencyMonths('semi-annual')).toBe(6);
    expect(frequencyMonths('Twice a year')).toBe(6);
    expect(frequencyMonths('annual')).toBe(12);
    expect(frequencyMonths('Every 5 years')).toBe(60);
    expect(frequencyMonths('Every 6 months')).toBe(6);
    expect(frequencyMonths('One time')).toBe(0);
    expect(frequencyMonths('')).toBe(0);
  });
  it('rolls dates by whole months, clamping the day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(nextDueAfter('2026-04-10', 'Twice a year')).toBe('2026-10-10');
    expect(nextDueAfter('2026-04-10', 'One time')).toBe('');
  });
  it('judges a schedule by its dates, not its stored status', () => {
    expect(scheduleState(sched({ status: 'on-track' }), '2026-04-02')).toBe('overdue');
    expect(scheduleState(sched({ status: 'overdue' }), '2026-03-15')).toBe('due-soon');
    expect(scheduleState(sched({ status: 'overdue' }), '2026-01-01')).toBe('on-track');
    expect(scheduleState(sched({ frequency: 'One time', nextDue: '', status: 'completed' }), '2026-01-01')).toBe('completed');
  });
  it('sets the next due date from the day it was done', () => {
    expect(completed(sched(), '2026-04-10')).toMatchObject({ lastCompleted: '2026-04-10', nextDue: '2026-10-10', status: 'on-track' });
    expect(completed(sched({ frequency: 'One time' }), '2026-04-10')).toMatchObject({ nextDue: '', status: 'completed' });
  });
  it('keeps the first due date and the reason when a task is put off, and clears them once done', () => {
    const once = { ...sched(), ...deferred(sched(), '2026-06-01', 'Waiting on the spring budget', '2026-03-20') };
    expect(once.nextDue).toBe('2026-06-01');
    expect(deferralOf(once)).toEqual({ from: '2026-04-01', on: '2026-03-20', reason: 'Waiting on the spring budget' });
    expect(once.notes).toContain('Membrane and drains');
    const twice = { ...once, ...deferred(once, '2026-08-01', 'Contractor unavailable', '2026-05-25') };
    expect(deferralOf(twice)).toMatchObject({ from: '2026-04-01', reason: 'Contractor unavailable' });
    const done = { ...twice, ...completed(twice, '2026-08-02') };
    expect(deferralOf(done)).toBeNull();
    expect(done.notes).toBe('Membrane and drains');
  });
  it('names the kind of work', () => {
    expect(kindOf({ task: 'Fire alarm system test', frequency: 'Annual' })).toBe('Inspection');
    expect(kindOf({ task: 'Hallway vacuuming', frequency: 'Monthly' })).toBe('Routine');
    expect(kindOf({ task: 'HVAC filter replacement', frequency: 'Quarterly' })).toBe('Preventive');
  });
});

describe('recording a maintenance visit', () => {
  beforeEach(() => {
    useBuildingStore.setState({ maintenanceSchedules: [sched()], assets: [] });
    usePropertyLogStore.setState({ logs: [] });
  });
  it('rolls the schedule forward and files the visit in the property log', () => {
    markDone('m1', { doneOn: '2026-04-03', by: 'Apex Roofing', result: 'Two drains cleared', followUp: 'Re-seal flashing at the north parapet' });
    expect(useBuildingStore.getState().maintenanceSchedules[0]).toMatchObject({ lastCompleted: '2026-04-03', nextDue: '2026-10-03' });
    const log = usePropertyLogStore.getState().logs[0];
    expect(log).toMatchObject({ type: 'inspection', title: 'Roof inspection', date: '2026-04-03', conductedBy: 'Apex Roofing', status: 'open' });
    expect(log.findings[0].notes).toBe('Two drains cleared');
    expect(log.actionItems[0].description).toBe('Re-seal flashing at the north parapet');
  });
  it('records a clean visit as resolved', () => {
    markDone('m1', { doneOn: '2026-04-03', by: 'Apex Roofing', result: 'No issues' });
    expect(usePropertyLogStore.getState().logs[0]).toMatchObject({ status: 'resolved', actionItems: [] });
  });
  it('puts a task off with its reason', () => {
    putOff('m1', '2026-07-01', 'Budget', '2026-03-28');
    const m = useBuildingStore.getState().maintenanceSchedules[0];
    expect(m.nextDue).toBe('2026-07-01');
    expect(deferralOf(m)?.from).toBe('2026-04-01');
  });
});

const cert = (over: Partial<VendorCertificate> = {}): VendorCertificate => ({ id: 'c1', coverage: 'general_liability', carrier: 'Acme Mutual', policyNum: 'GL-1', limit: '$1,000,000', expires: '2027-01-01', addedAt: '2026-01-01', ...over });

describe('vendor certificates of insurance', () => {
  const today = '2026-11-23';
  it('judges a certificate by its expiry', () => {
    expect(certificateState(cert({ expires: '2026-11-22' }), today)).toBe('lapsed');
    expect(certificateState(cert({ expires: '2026-12-10' }), today)).toBe('expiring');
    expect(certificateState(cert({ expires: '2027-06-01' }), today)).toBe('current');
    expect(certificateState(cert({ expires: '' }), today)).toBe('lapsed');
  });
  it('is missing without general liability, whatever else is on file', () => {
    expect(vendorInsuranceStatus({ insurance: [] }, today).state).toBe('missing');
    expect(vendorInsuranceStatus({}, today).state).toBe('missing');
    expect(vendorInsuranceStatus({ insurance: [cert({ coverage: 'workers_comp' })] }, today)).toMatchObject({ state: 'missing', count: 1 });
  });
  it('takes the worst coverage, and lets a renewal replace the lapsed certificate', () => {
    expect(vendorInsuranceStatus({ insurance: [cert(), cert({ id: 'c2', coverage: 'workers_comp', expires: '2026-10-01' })] }, today).state).toBe('lapsed');
    expect(vendorInsuranceStatus({ insurance: [cert({ expires: '2026-10-01' }), cert({ id: 'c2', expires: '2027-10-01' })] }, today)).toMatchObject({ state: 'current', daysLeft: 312 });
  });
  it('counts insured vendors from certificates, not contracts, and lists the gaps', () => {
    const snap = {
      today, name: 'B', address: { street: '', city: '', state: 'DC', zip: '' }, details: { yearBuilt: '', totalUnits: 0, floors: 0, fiscalYearEnd: '12-31', entityType: 'incorporated' },
      managementCompany: '', counselCount: 0, board: [], legalDocuments: [], insurance: [], obligations: [], completions: {}, filings: [],
      vendors: [
        { id: 'v1', name: 'Covered Co', service: 'Roofing', contact: '', phone: '', email: '', contract: '', status: 'active', insurance: [cert()] },
        { id: 'v2', name: 'Lapsed Co', service: 'Plumbing', contact: '', phone: '', email: '', contract: '', status: 'active', insurance: [cert({ expires: '2026-06-01' })] },
        { id: 'v3', name: 'Contract No Cert', service: 'Cleaning', contact: '', phone: '', email: '', contract: '', status: 'active' },
        { id: 'v4', name: 'Never Used', service: 'Painting', contact: '', phone: '', email: '', contract: '', status: 'active' },
      ],
      contracts: [{ id: 'k1', vendorId: 'v3', vendorName: 'Contract No Cert', title: 'Cleaning', startDate: '2026-01-01', endDate: '2027-12-31', amount: 1200, status: 'active', autoRenew: false, attachments: [], notes: '' }],
      workOrders: [],
      maintenance: [sched({ nextDue: '2026-11-01' }), sched({ id: 'm2', nextDue: '2027-03-01' })],
    } as unknown as BuildingSnapshot;
    const sum = contractsSummary(contractRows(snap));
    expect(sum.insured).toBe(1);
    expect(sum.insuranceLapsed.map(r => r.vendor)).toEqual(['Lapsed Co']);
    expect(sum.insuranceMissing.map(r => r.vendor)).toEqual(['Contract No Cert']);
    expect(maintenanceOverdue(snap).map(m => m.id)).toEqual(['m1']);
  });
});

describe('work sign-off before payment', () => {
  it('offers only signed-off, in-budget bills for one-click approval', () => {
    const snap = {
      today: '2026-06-01',
      budget: [{ id: 'a', name: 'Maintenance', budgeted: 5000, actual: 900, acctNum: '5010', acctNums: ['5010'] }],
      workOrders: [
        { id: 'signed', title: '', vendor: 'V', amount: 300, acctNum: '5010', status: 'invoiced', accrualGlEntryId: 'g1', signoff: { date: '2026-05-30', by: 'Ann', notes: '' } },
        { id: 'unsigned', title: '', vendor: 'V', amount: 300, acctNum: '5010', status: 'invoiced', accrualGlEntryId: 'g2' },
      ],
    } as unknown as FundsSnapshot;
    const b = fundBills(snap);
    expect(b.ready.map(w => w.id)).toEqual(['signed']);
    expect(b.unsigned.map(w => w.id)).toEqual(['unsigned']);
  });
  it('records who signed off and when; a draft cannot be signed off', () => {
    const wo = (id: string, status: string) => ({ id, title: 'T', vendor: 'V', description: '', acctNum: '5010', amount: 100, status, caseId: null, createdDate: '2026-05-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: null, glEntryId: null, attachments: [] });
    useFinancialStore.setState({ workOrders: [wo('WO-A', 'invoiced'), wo('WO-B', 'draft')] as never });
    useFinancialStore.getState().signOffWorkOrder('WO-A', 'Ann Lee', ' Touch up paint ', '2026-05-30');
    useFinancialStore.getState().signOffWorkOrder('WO-B', 'Ann Lee');
    const [a, b] = useFinancialStore.getState().workOrders;
    expect(a.signoff).toEqual({ date: '2026-05-30', by: 'Ann Lee', notes: 'Touch up paint' });
    expect(b.signoff).toBeUndefined();
  });
});

describe('saving ahead of a migration', () => {
  it('recognises a missing column however the database reports it', () => {
    expect(missingColumn({ code: 'PGRST204', message: "Could not find the 'photos' column of 'issues' in the schema cache" }, 'photos')).toBe(true);
    expect(missingColumn({ code: '42703', message: 'column "signoff" of relation "work_orders" does not exist' }, 'signoff')).toBe(true);
    expect(missingColumn({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'photos')).toBe(false);
  });
});
