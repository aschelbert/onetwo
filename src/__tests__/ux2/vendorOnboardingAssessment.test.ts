import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildingStore, type Vendor } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useSpendingStore, type SpendingApproval } from '@/store/useSpendingStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { runVendorOnboarding, vendorsToOnboard, STEP as O } from '@/ux2/boardroom/vendorOnboarding';
import { assessmentSteps, runSpecialAssessments, STEP as A } from '@/ux2/boardroom/specialAssessment';
import type { WorkOrder } from '@/data/financial';
import type { Unit, UnitInvoice } from '@/types/financial';

const wo = (id: string, vendor: string, status: WorkOrder['status'], amount = 1000): WorkOrder => ({ id, title: 'Work', vendor, description: '', acctNum: '6100', amount, status, caseId: null, createdDate: '2026-11-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: null, glEntryId: null, attachments: [] });
const vendor = (id: string, name: string, w9OnFile?: boolean): Vendor => ({ id, name, service: '', contact: '', phone: '', email: '', contract: '', status: 'active', w9OnFile });
const approval = (id: string, title: string, amount: number, over: Partial<SpendingApproval> = {}): SpendingApproval => ({ id, title, description: '', amount, category: 'capital', requestedBy: 'Robert Mitchell', status: 'approved', priority: 'normal', vendorName: '', workOrderId: '', votes: [], threshold: 5000, notes: '', decidedAt: '2026-11-08', fundingSource: 'special_assessment', caseId: '', ...over });
const unit = (number: string): Unit => ({ number, owner: `Owner ${number}`, email: '', phone: '', monthlyFee: 450, votingPct: 25, status: 'ACTIVE', balance: 0, moveIn: null, sqft: 0, bedrooms: 0, parking: null, payments: [], lateFees: [], specialAssessments: [] } as unknown as Unit);
const inv = (id: string, unitNumber: string, createdDate: string, status: UnitInvoice['status'] = 'sent'): UnitInvoice => ({ id, unitNumber, type: 'special_assessment', description: 'Special assessment · Roof', amount: 2500, status, createdDate, dueDate: '2027-01-15', paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null });
const cases = () => useIssuesStore.getState().cases;

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [], workOrders: [], units: [unit('1A'), unit('1B'), unit('2A'), unit('2B')], unitInvoices: [] });
  useBuildingStore.setState(s => ({ vendors: [], management: { ...s.management, company: '' } }));
  useVendorTrackerStore.setState({ contracts: [] });
  useSpendingStore.setState({ approvals: [] });
  useComplianceStore.setState({ announcements: [], communications: [] });
  useRunbookSwitches.setState({ off: [] });
});

describe('vendor onboarding', () => {
  it('finds vendors money has moved to who have no record or no W-9, and opens one case each', () => {
    useFinancialStore.setState({ workOrders: [wo('w1', 'Apex Roofing', 'paid', 4200), wo('w2', 'Apex Roofing', 'invoiced', 800), wo('w3', 'New Guy LLC', 'approved'), wo('w4', 'Draft Only', 'draft'), wo('w5', 'Known Co', 'paid')] });
    useBuildingStore.setState({ vendors: [vendor('v1', 'Apex Roofing', false), vendor('v2', 'Known Co', true)] });
    expect(vendorsToOnboard().map(v => `${v.name}:${v.paid}:${v.hasRecord}`).sort()).toEqual(['Apex Roofing:5000:true', 'New Guy LLC:1000:false']);
    const r = runVendorOnboarding('2026-11-10');
    expect(r.opened.length).toBe(2);
    const n = cases().find(c => c.sourceId === 'vendor-onboarding:new guy llc')!;
    expect(n).toMatchObject({ title: 'Vendor onboarding · New Guy LLC', sitId: 'runbook-vendor-onboarding', owner: 'New Guy LLC', assignedRole: 'Treasurer' });
    expect(n.steps?.length).toBe(4);
    expect(n.steps![O.record].done).toBe(false);
    const a = cases().find(c => c.sourceId === 'vendor-onboarding:apex roofing')!;
    expect(a.steps![O.record].done).toBe(true);
    expect(a.steps![O.w9].done).toBe(false);
    expect(runVendorOnboarding('2026-11-11').opened.length).toBe(0);
  });

  it('ticks the record, the W-9 and the contract as Building › Contracts fills in; respects the switch', () => {
    useFinancialStore.setState({ workOrders: [wo('w3', 'New Guy LLC', 'approved')] });
    const [id] = runVendorOnboarding('2026-11-10').opened;
    const steps = () => cases().find(c => c.id === id)!.steps!;
    useBuildingStore.setState({ vendors: [vendor('v9', 'new guy llc', false)] });
    runVendorOnboarding('2026-11-11');
    expect(steps()[O.record].done).toBe(true);
    expect(steps()[O.w9].done).toBe(false);
    useBuildingStore.setState({ vendors: [vendor('v9', 'new guy llc', true)] });
    useVendorTrackerStore.setState({ contracts: [{ id: 'vc9', vendorId: 'v9', vendorName: 'New Guy LLC', title: 'Snow', startDate: '2026-11-01', endDate: '2027-04-30', amount: 3000, status: 'active', autoRenew: false } as never] });
    runVendorOnboarding('2026-11-12');
    expect(steps()[O.w9].done).toBe(true);
    expect(steps()[O.contract].done).toBe(true);
    expect(steps()[O.insurance].done).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useFinancialStore.setState({ workOrders: [wo('w8', 'Another', 'paid')] });
    useRunbookSwitches.getState().setOn('vendor-onboarding', false);
    expect(runVendorOnboarding('2026-11-10').opened.length).toBe(0);
  });
});

describe('special assessment', () => {
  it('opens one case per approved request funded by a special assessment, with the shares ticked, and defers to a hand-opened case', () => {
    useSpendingStore.setState({ approvals: [approval('sa1', 'Roof replacement', 10000), approval('sa2', 'Pending one', 8000, { status: 'pending' }), approval('sa3', 'From reserves', 9000, { fundingSource: 'reserves' })] });
    const r = runSpecialAssessments('2026-11-10');
    expect(r.opened.length).toBe(1);
    const c = cases()[0];
    expect(c).toMatchObject({ title: 'Special assessment · Roof replacement · $10,000', sitId: 'runbook-special-assessment', source: 'runbook', sourceId: 'special-assessment:sa1', assignedRole: 'Treasurer', priority: 'high' });
    expect(c.steps?.length).toBe(6);
    expect(c.steps![A.shares].done).toBe(true);
    expect(assessmentSteps(approval('x', 'x', 10000), 4)[A.shares].detail).toContain('4 units, about $2,500 each');
    expect(runSpecialAssessments('2026-11-11').opened.length).toBe(0);
    useIssuesStore.setState({ cases: [] });
    useIssuesStore.getState().createCase({ catId: 'financial', sitId: 'special-assessments', approach: 'pre', title: 'Roof assessment', unit: '', owner: 'Board', priority: 'high', notes: '' });
    expect(runSpecialAssessments('2026-11-10').opened.length).toBe(0);
  });

  it('ticks the notice, the levy once every unit has its invoice, and the collection once all are paid; respects the switch', () => {
    useSpendingStore.setState({ approvals: [approval('sa1', 'Roof replacement', 10000)] });
    const [id] = runSpecialAssessments('2026-11-10').opened;
    const steps = () => cases().find(c => c.id === id)!.steps!;
    const today = new Date().toISOString().slice(0, 10);
    useComplianceStore.setState({ announcements: [{ id: 'an1', title: 'Roof special assessment: $2,500 per unit, due January 15', body: '', category: 'financial', postedBy: 'Treasurer', postedDate: today, pinned: true }] });
    runSpecialAssessments('2026-11-12');
    expect(steps()[A.notice].done).toBe(true);
    expect(steps()[A.levy].done).toBe(false);
    useFinancialStore.setState({ unitInvoices: [inv('i1', '1A', today), inv('i2', '1B', today), inv('i3', '2A', today)] });
    runSpecialAssessments('2026-11-13');
    expect(steps()[A.levy].done).toBe(false);
    useFinancialStore.setState(s => ({ unitInvoices: [...s.unitInvoices, inv('i4', '2B', today)] }));
    runSpecialAssessments('2026-11-14');
    expect(steps()[A.levy].done).toBe(true);
    expect(steps()[A.collect].done).toBe(false);
    useFinancialStore.setState(s => ({ unitInvoices: s.unitInvoices.map(i => ({ ...i, status: 'paid' as const, paidAmount: i.amount })) }));
    runSpecialAssessments('2027-01-20');
    expect(steps()[A.collect].done).toBe(true);
    expect(steps()[A.resolution].done).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('special-assessment', false);
    expect(runSpecialAssessments('2026-11-10').opened.length).toBe(0);
  });

  it('both show under their own runbooks on the Runbooks tab', () => {
    useFinancialStore.setState({ workOrders: [wo('w3', 'New Guy LLC', 'approved')] });
    useSpendingStore.setState({ approvals: [approval('sa1', 'Roof replacement', 10000)] });
    const o = runVendorOnboarding('2026-11-10').opened[0];
    const s = runSpecialAssessments('2026-11-10').opened[0];
    const snap = { today: '2026-11-10', cases: cases(), runbooksOff: [], viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'President' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['vendor-onboarding'].openCases.map(c => c.id)).toEqual([o]);
    expect(by['special-assessment'].openCases.map(c => c.id)).toEqual([s]);
  });
});
