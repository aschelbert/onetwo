import { describe, it, expect, beforeEach } from 'vitest';
import { billTrail, payBlocker } from '@/lib/controls';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { saveToolDoc } from '@/ux2/boardroom/tools/docs';

const as = (name: string) => useAuthStore.setState({ currentUser: { ...useAuthStore.getState().currentUser, name } });
const fin = () => useFinancialStore.getState();
const wo = () => fin().workOrders[fin().workOrders.length - 1];

describe('who may pay a bill', () => {
  it('lets anyone pay while the rule is off, and stops whoever raised or approved it once it is on', () => {
    const people = { raisedBy: 'Dana Carter', approvedBy: 'Ann Lee' };
    expect(payBlocker(people, 'Dana Carter', {})).toBe('');
    expect(payBlocker(people, 'dana carter ', { twoPersonBills: true })).toBe('dana carter  raised this bill, so someone else has to pay it.');
    expect(payBlocker(people, 'Ann Lee', { twoPersonBills: true })).toContain('approved');
    expect(payBlocker(people, 'Sam Park', { twoPersonBills: true })).toBe('');
    // A bill from before anyone was recorded is not held up.
    expect(payBlocker(null, 'Dana Carter', { twoPersonBills: true })).toBe('');
    expect(billTrail({ raisedBy: 'Dana', paidBy: 'Sam' })).toBe('raised by Dana · paid by Sam');
  });
});

describe('the ledger records who did what', () => {
  beforeEach(() => {
    useActionRecordsStore.setState({ records: [] });
    useFinancialStore.setState({ workOrders: [], generalLedger: [], closedThrough: null as never });
    as('Dana Carter');
  });

  it('stamps each entry with who posted it, and dues with the billing run', () => {
    fin().postManualEntry('2026-11-20', 'Bank fee', '5070', '1010', 18);
    expect(fin().generalLedger.slice(-1)[0].postedBy).toBe('Dana Carter');
    fin().glPost('2026-11-01', 'Dues', '1110', '4010', 450, 'assessment', '101');
    expect(fin().generalLedger.slice(-1)[0].postedBy).toBe('Billing run');
  });

  it('follows a bill from the person who raised it to the person who paid it', () => {
    fin().createWorkOrder({ title: 'Parapet flashing', vendor: 'Apex', amount: 900, acctNum: '5010' });
    as('Ann Lee');
    fin().approveWorkOrder(wo().id);
    fin().receiveInvoice(wo().id, 'INV-1', 900, '2026-11-20');
    expect(wo().people).toEqual({ raisedBy: 'Dana Carter', approvedBy: 'Ann Lee' });
    expect(fin().payWorkOrder(wo().id, '2026-11-22')).toBe('');
    expect(wo()).toMatchObject({ status: 'paid', people: { raisedBy: 'Dana Carter', approvedBy: 'Ann Lee', paidBy: 'Ann Lee' } });
  });

  it('with the rule on, refuses the payment and says why; a third person, or the automatic Tasker payment, goes through', () => {
    saveToolDoc('controls', 'building', {}, { twoPersonBills: true });
    fin().createWorkOrder({ title: 'Gutter clean', vendor: 'Apex', amount: 300, acctNum: '5010' });
    fin().approveWorkOrder(wo().id);
    fin().receiveInvoice(wo().id, 'INV-2', 300, '2026-11-20');
    expect(fin().payBlockerFor(wo().id)).toContain('raised this bill');
    expect(fin().payWorkOrder(wo().id, '2026-11-22')).toContain('someone else has to pay it');
    expect(wo().status).toBe('invoiced');
    as('Sam Park');
    expect(fin().payWorkOrder(wo().id, '2026-11-22')).toBe('');
    expect(wo()).toMatchObject({ status: 'paid', people: { paidBy: 'Sam Park' } });

    as('Dana Carter');
    fin().createWorkOrder({ title: 'Tasker job', vendor: 'Tasker', amount: 80, acctNum: '5010' });
    fin().approveWorkOrder(wo().id);
    fin().receiveInvoice(wo().id, 'T-1', 80, '2026-11-20');
    expect(fin().payWorkOrder(wo().id, '2026-11-22', { automatic: true })).toBe('');
    expect(wo().people?.paidBy).toBe('Automatic, under the Tasker limit');
  });
});
