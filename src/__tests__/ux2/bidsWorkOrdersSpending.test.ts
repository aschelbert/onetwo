import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useSpendingStore, type SpendingApproval } from '@/store/useSpendingStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, situationLabel, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { bidStepOf, runVendorBids, STEP as V } from '@/ux2/boardroom/vendorBids';
import { runWorkOrders, standalone, STEP as W } from '@/ux2/boardroom/workOrders';
import { runSpendingRequests, spendingSteps, STEP as S } from '@/ux2/boardroom/spendingRequest';
import type { WorkOrder } from '@/data/financial';

const wo = (id: string, title: string, status: WorkOrder['status'], over: Partial<WorkOrder> = {}): WorkOrder => ({ id, title, vendor: 'Apex Roofing', description: '', acctNum: '6100', amount: 4200, status, caseId: null, createdDate: '2026-11-01', approvedDate: null, invoiceNum: null, invoiceDate: null, paidDate: null, glEntryId: null, attachments: [], ...over });
const approval = (id: string, title: string, amount: number, over: Partial<SpendingApproval> = {}): SpendingApproval => ({ id, title, description: '', amount, category: 'maintenance', requestedBy: 'Jennifer Adams', status: 'pending', priority: 'normal', vendorName: '', workOrderId: '', votes: [], threshold: 5000, notes: '', decidedAt: '', fundingSource: 'operating', caseId: '', ...over });
const cases = () => useIssuesStore.getState().cases;
const bid = (vendorName: string, verified = true) => ({ vendorName, amount: 1000, scope: 'x', timeline: '2 weeks', warranty: '1 year', insuranceVerified: verified, licenseVerified: verified, submittedDate: '2026-11-10', notes: '' });

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [], workOrders: [] });
  useSpendingStore.setState({ approvals: [] });
  useBuildingStore.setState(s => ({ management: { ...s.management, company: 'Premier Property Management' } }));
  useRunbookSwitches.setState({ off: [] });
});

/** A parent case whose current step asks for three bids. */
function parentWithBidStep(): string {
  const id = useIssuesStore.getState().createCase({ catId: 'maintenance', sitId: 'runbook-test-parent', approach: 'pre', title: 'Roof membrane', unit: '', owner: 'Board', priority: 'high', notes: '', assignedRole: 'Vice President', dueDate: '2026-12-15', customSteps: [{ s: 'Document the leak' }, { s: 'Obtain 3 bids' }, { s: 'Pick and sign' }] });
  useIssuesStore.setState(s => ({ cases: s.cases.map(c => c.id !== id ? c : { ...c, steps: c.steps!.map((st, i) => i === 0 ? { ...st, done: true, doneDate: '2026-11-09' } : i === 1 ? { ...st, requiresBids: true, minimumBids: 3, bidCollection: { minimumBids: 3, bids: [], selectedBidId: null, selectionRationale: '', completedDate: null } } : st) }) }));
  return id;
}

describe('vendor bids', () => {
  it('opens one bids case when a case reaches a step that asks for quotes, beside the parent, once', () => {
    const parent = parentWithBidStep();
    expect(bidStepOf(cases()[0])?.idx).toBe(1);
    const r = runVendorBids('2026-11-10');
    expect(r.opened.length).toBe(1);
    const b = cases().find(c => c.sourceId === `vendor-bids:${parent}:1`)!;
    expect(b).toMatchObject({ title: 'Bids · Roof membrane', catId: 'maintenance', sitId: 'runbook-vendor-bids', assignedRole: 'Vice President', dueDate: '2026-12-15', priority: 'high' });
    expect(b.steps?.length).toBe(5);
    expect(b.steps![V.collect].s).toBe('Collect at least 3 bids on the parent case');
    expect(runVendorBids('2026-11-11').opened.length).toBe(0);
    expect(cases().length).toBe(2);
  });

  it('ticks the collection, the verification, the pick and the hand-back from the parent step; not before the step is reached; respects the switch', () => {
    const parent = parentWithBidStep();
    const [id] = runVendorBids('2026-11-10').opened;
    const steps = () => cases().find(c => c.id === id)!.steps!;
    const st = useIssuesStore.getState();
    st.addBid(parent, 1, bid('A')); st.addBid(parent, 1, bid('B', false));
    runVendorBids('2026-11-11');
    expect(steps()[V.collect].done).toBe(false);
    st.addBid(parent, 1, bid('C'));
    runVendorBids('2026-11-12');
    expect(steps()[V.collect].done).toBe(true);
    expect(steps()[V.verify].done).toBe(false);
    useIssuesStore.setState(s => ({ cases: s.cases.map(c => c.id !== parent ? c : { ...c, steps: c.steps!.map((x, i) => i === 1 ? { ...x, bidCollection: { ...x.bidCollection!, bids: x.bidCollection!.bids.map(y => ({ ...y, insuranceVerified: true, licenseVerified: true })) } } : x) }) }));
    runVendorBids('2026-11-13');
    expect(steps()[V.verify].done).toBe(true);
    expect(steps()[V.pick].done).toBe(false);
    const chosen = cases().find(c => c.id === parent)!.steps![1].bidCollection!.bids[0].id;
    useIssuesStore.getState().selectBid(parent, 1, chosen, 'Best references');
    runVendorBids('2026-11-14');
    expect(steps()[V.pick].done).toBe(true);
    expect(steps()[V.back].done).toBe(false);
    useIssuesStore.setState(s => ({ cases: s.cases.map(c => c.id !== parent ? c : { ...c, steps: c.steps!.map((x, i) => i === 1 ? { ...x, done: true, doneDate: '2026-11-15' } : x) }) }));
    runVendorBids('2026-11-15');
    expect(steps()[V.back].done).toBe(true);
    expect(steps()[V.scope].done).toBe(false);
    // A parent still on an earlier step opens nothing; the switch stops it.
    useIssuesStore.setState({ cases: [] });
    const p2 = parentWithBidStep();
    useIssuesStore.setState(s => ({ cases: s.cases.map(c => c.id !== p2 ? c : { ...c, steps: c.steps!.map((x, i) => i === 0 ? { ...x, done: false, doneDate: null } : x) }) }));
    expect(runVendorBids('2026-11-10').opened.length).toBe(0);
    useIssuesStore.setState(s => ({ cases: s.cases.map(c => c.id !== p2 ? c : { ...c, steps: c.steps!.map((x, i) => i === 0 ? { ...x, done: true } : x) }) }));
    useRunbookSwitches.getState().setOn('vendor-bids', false);
    expect(runVendorBids('2026-11-10').opened.length).toBe(0);
    useRunbookSwitches.getState().setOn('vendor-bids', true);
    expect(runVendorBids('2026-11-10').opened.length).toBe(1);
  });
});

describe('work order', () => {
  it('opens a case for a work order raised on its own, links it, leaves paid ones and ones a case drives alone', () => {
    const parentId = useIssuesStore.getState().createCase({ catId: 'maintenance', sitId: 'common-area-repairs', approach: 'pre', title: 'Lobby repair', unit: '', owner: 'Board', priority: 'medium', notes: '' });
    useFinancialStore.setState({ workOrders: [wo('WO-1', 'Roof patch', 'draft'), wo('WO-2', 'Lobby paint', 'approved', { caseId: parentId }), wo('WO-3', 'Old job', 'paid'), wo('WO-4', 'Boiler service', 'invoiced', { caseId: 'gone' })] });
    expect(standalone(wo('x', 'x', 'draft', { caseId: parentId }), cases())).toBe(false);
    expect(standalone(wo('x', 'x', 'draft', { caseId: 'gone' }), cases())).toBe(true);
    const r = runWorkOrders('2026-11-10');
    expect(r.opened.length).toBe(2);
    const c = cases().find(x => x.sourceId === 'work-order:WO-1')!;
    expect(c).toMatchObject({ title: 'Work order · Roof patch', sitId: 'runbook-work-order', owner: 'Apex Roofing', assignedRole: 'Property Manager' });
    expect(c.steps?.length).toBe(4);
    expect(c.steps![W.approve].s).toBe('Approve the work order: Roof patch, Apex Roofing, $4,200');
    expect(c.steps![W.approve].done).toBe(false);
    expect(cases().find(x => x.sourceId === 'work-order:WO-4')!.steps![W.invoice].done).toBe(true);
    expect(useFinancialStore.getState().workOrders.find(w => w.id === 'WO-1')?.caseId).toBe(c.id);
    expect(runWorkOrders('2026-11-11').opened.length).toBe(0);
  });

  it('ticks approval, invoice and payment as the ledger moves the work order; respects the switch', () => {
    useFinancialStore.setState({ workOrders: [wo('WO-1', 'Roof patch', 'draft')] });
    const [id] = runWorkOrders('2026-11-10').opened;
    const steps = () => cases().find(c => c.id === id)!.steps!;
    const move = (status: WorkOrder['status']) => useFinancialStore.setState(s => ({ workOrders: s.workOrders.map(w => w.id === 'WO-1' ? { ...w, status } : w) }));
    move('approved'); runWorkOrders('2026-11-11');
    expect(steps()[W.approve].done).toBe(true);
    expect(steps()[W.invoice].done).toBe(false);
    move('invoiced'); runWorkOrders('2026-11-12');
    expect(steps()[W.invoice].done).toBe(true);
    expect(steps()[W.pay].done).toBe(false);
    move('paid'); runWorkOrders('2026-11-13');
    expect(steps()[W.pay].done).toBe(true);
    expect(steps()[W.work].done).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useFinancialStore.setState({ workOrders: [wo('WO-9', 'New', 'draft')] });
    useRunbookSwitches.getState().setOn('work-order', false);
    expect(runWorkOrders('2026-11-10').opened.length).toBe(0);
  });
});

describe('spending request', () => {
  it('opens a case for a request waiting for the board, over or under the limit, links it, and leaves one a case drives alone', () => {
    const parentId = useIssuesStore.getState().createCase({ catId: 'strategic', sitId: 'capital-projects', approach: 'pre', title: 'Elevator', unit: '', owner: 'Board', priority: 'medium', notes: '' });
    useSpendingStore.setState({ approvals: [approval('sa1', 'Lobby cameras', 4200), approval('sa2', 'Elevator modernization', 85000, { caseId: parentId, fundingSource: 'reserves' }), approval('sa3', 'Done', 300, { status: 'approved' }), approval('sa4', 'Generator', 12000, { fundingSource: 'reserves', priority: 'urgent' })] });
    const r = runSpendingRequests('2026-11-10');
    expect(r.opened.length).toBe(2);
    const c = cases().find(x => x.sourceId === 'spending-request:sa1')!;
    expect(c).toMatchObject({ title: 'Spending request · Lobby cameras · $4,200', sitId: 'runbook-spending-request', owner: 'Jennifer Adams', assignedRole: 'Treasurer', priority: 'medium' });
    expect(c.steps![S.check].done).toBe(true);
    expect(c.steps![S.vote].done).toBe(false);
    expect(spendingSteps(approval('x', 'x', 4200))[S.check].s).toBe('Check $4,200 against the operating budget and the $5,000 bylaws limit');
    expect(spendingSteps(approval('x', 'x', 12000))[S.minutes].s).toBe('Record the decision in the minutes and tell owners');
    expect(cases().find(x => x.sourceId === 'spending-request:sa4')).toMatchObject({ priority: 'urgent' });
    expect(useSpendingStore.getState().approvals.find(a => a.id === 'sa1')?.caseId).toBe(c.id);
    expect(runSpendingRequests('2026-11-11').opened.length).toBe(0);
  });

  it('ticks the vote as it is decided and the release once a work order is attached or the request is denied; respects the switch', () => {
    useSpendingStore.setState({ approvals: [approval('sa1', 'Lobby cameras', 4200), approval('sa4', 'Generator', 12000)] });
    runSpendingRequests('2026-11-10');
    const steps = (sid: string) => cases().find(c => c.sourceId === sid)!.steps!;
    useSpendingStore.setState(s => ({ approvals: s.approvals.map(a => a.id === 'sa1' ? { ...a, status: 'approved' as const } : a.id === 'sa4' ? { ...a, status: 'denied' as const } : a) }));
    runSpendingRequests('2026-11-11');
    expect(steps('spending-request:sa1')[S.vote].done).toBe(true);
    expect(steps('spending-request:sa1')[S.release].done).toBe(false);
    expect(steps('spending-request:sa4')[S.vote].done).toBe(true);
    expect(steps('spending-request:sa4')[S.release].done).toBe(true);
    useSpendingStore.setState(s => ({ approvals: s.approvals.map(a => a.id === 'sa1' ? { ...a, workOrderId: 'WO-7' } : a) }));
    runSpendingRequests('2026-11-12');
    expect(steps('spending-request:sa1')[S.release].done).toBe(true);
    expect(steps('spending-request:sa1')[S.minutes].done).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useSpendingStore.setState({ approvals: [approval('sa8', 'New', 900)] });
    useRunbookSwitches.getState().setOn('spending-request', false);
    expect(runSpendingRequests('2026-11-10').opened.length).toBe(0);
  });

  it('all three show under their own runbooks on the Runbooks tab', () => {
    const parent = parentWithBidStep();
    useFinancialStore.setState({ workOrders: [wo('WO-1', 'Roof patch', 'draft')] });
    useSpendingStore.setState({ approvals: [approval('sa1', 'Lobby cameras', 4200)] });
    const b = runVendorBids('2026-11-10').opened[0];
    const w = runWorkOrders('2026-11-10').opened[0];
    const s = runSpendingRequests('2026-11-10').opened[0];
    const snap = { today: '2026-11-10', cases: cases(), runbooksOff: [], viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'President' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['vendor-bids'].openCases.map(c => c.id)).toEqual([b]);
    expect(by['work-order'].openCases.map(c => c.id)).toEqual([w]);
    expect(by['spending-request'].openCases.map(c => c.id)).toEqual([s]);
    expect(by['vendor-bids'].on).toBe(true);
    expect(situationLabel(snap, cases().find(c => c.id === b)!)).toBe('Vendor bids');
    expect(cases().find(c => c.id === parent)).toBeTruthy();
  });
});
