import { beforeEach, describe, expect, it } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { seedChartOfAccounts } from '@/data/financial';
import type { Unit } from '@/types/financial';

const unit = (number: string, monthlyFee: number, over: Partial<Unit> = {}): Unit => ({
  number, owner: `Owner ${number}`, email: '', phone: '', monthlyFee, votingPct: 25, status: 'ACTIVE', balance: 0, moveIn: null, sqft: 0, bedrooms: 0, parking: null,
  payments: [], lateFees: [], specialAssessments: [], ...over,
});

beforeEach(() => {
  useFinancialStore.setState({
    tenantId: null,
    chartOfAccounts: [...seedChartOfAccounts],
    acctStatus: Object.fromEntries(seedChartOfAccounts.map(a => [a.num, true])),
    generalLedger: [],
    glNextId: 1000,
    units: [unit('1A', 450), unit('1B', 475), unit('2A', 0), unit('2B', 500, { balance: -500 })],
    unitInvoices: [],
    hoaDueDay: 15,
    annualReserveContribution: 12000,
    autoReserveTransfer: true,
    autoBillingEnabled: true,
    lastBillingRun: null,
    lateFeeEnabled: true,
    lateFeeAmount: 25,
    lateFeeGraceDays: 15,
    lastLateFeeRun: null,
    closedThrough: null,
  });
});

const st = () => useFinancialStore.getState();
const unitOf = (n: string) => st().units.find(u => u.number === n)!;

describe('monthly billing', () => {
  it('bills every unit with a monthly amount once, dated the 1st and due on the due day, and moves the reserve transfer', () => {
    const r = st().runMonthlyBilling('2026-11', '2026-11-03');
    expect(r).toMatchObject({ period: '2026-11', billed: 3, amount: 1425, alreadyBilled: 0, noAmount: 1, reserveTransfer: 1000 });
    const dues = st().unitInvoices.filter(i => i.type === 'monthly');
    expect(dues).toHaveLength(3);
    expect(dues[0]).toMatchObject({ description: 'Dues · November 2026', createdDate: '2026-11-01', dueDate: '2026-11-15', status: 'sent' });
    expect(unitOf('1A').balance).toBe(450);
    // 2B had paid ahead: its credit paid November in full.
    const b = dues.find(i => i.unitNumber === '2B')!;
    expect(b).toMatchObject({ status: 'paid', paidAmount: 500, paymentMethod: 'credit' });
    expect(unitOf('2B').balance).toBe(0);
    // Ledger: 3 dues, 1 credit application, 1 transfer.
    expect(st().generalLedger).toHaveLength(5);
    expect(st().generalLedger[st().generalLedger.length - 1]).toMatchObject({ debitAcct: '1020', creditAcct: '1010', amount: 1000, source: 'transfer', memo: 'Reserve transfer · November 2026', date: '2026-11-01' });
    expect(st().lastBillingRun?.slice(0, 10)).toBe('2026-11-03');

    // Running the same month again bills nothing and posts no second transfer.
    const again = st().runMonthlyBilling('2026-11', '2026-11-04');
    expect(again).toMatchObject({ billed: 0, alreadyBilled: 3, reserveTransfer: 0 });
    expect(st().unitInvoices).toHaveLength(3);
    expect(st().generalLedger).toHaveLength(5);
  });

  it('the cycle bills this month when due, then charges late fees once per dues invoice', () => {
    const first = st().runBillingCycle('2026-11-02');
    expect(first?.billed).toBe(3);
    // Same month, later: nothing to bill, and not yet past the grace period (due 15th + 15 days = Nov 30).
    expect(st().runBillingCycle('2026-11-20')).toBeNull();
    // Dec 1: November's dues (1A, 1B still open) get a fee; the December run bills December.
    useFinancialStore.setState({ lastBillingRun: '2026-11-02T12:00:00.000Z' });
    const dec = st().runBillingCycle('2026-12-01');
    expect(dec).toMatchObject({ period: '2026-12', billed: 3, lateFees: 2 });
    const fees = st().unitInvoices.filter(i => i.type === 'fee');
    expect(fees.map(f => [f.unitNumber, f.amount, f.description])).toEqual([['1A', 25, 'Late fee · November 2026'], ['1B', 25, 'Late fee · November 2026']]);
    expect(unitOf('1A').lateFees[0]).toMatchObject({ amount: 25, invoiceId: fees[0].id });
    expect(unitOf('1A').balance).toBe(450 + 450 + 25);
    // A later day in December charges no second fee for November.
    expect(st().runLateFees('2026-12-10')).toBe(0);
  });

  it('a paid dues invoice never earns a late fee; a part-paid one does', () => {
    st().runMonthlyBilling('2026-11', '2026-11-01');
    const dues = st().unitInvoices.filter(i => i.type === 'monthly');
    st().payUnitInvoice(dues.find(i => i.unitNumber === '1A')!.id, 'check');
    st().payUnitInvoice(dues.find(i => i.unitNumber === '1B')!.id, 'check', { amount: 100 });
    expect(st().runLateFees('2026-12-01')).toBe(1);
    expect(st().unitInvoices.filter(i => i.type === 'fee')[0].unitNumber).toBe('1B');
  });

  it('bills a month whose 1st falls in a closed period dated today, named for its month', () => {
    st().closeBooksThrough('2026-11-30', '2026-12-05');
    const r = st().runMonthlyBilling('2026-11', '2026-12-05');
    expect(r.billed).toBe(3);
    expect(st().unitInvoices[0]).toMatchObject({ description: 'Dues · November 2026', createdDate: '2026-12-05', dueDate: '2026-11-15' });
  });

  it('late fees and the reserve transfer can each be turned off', () => {
    useFinancialStore.setState({ lateFeeEnabled: false, autoReserveTransfer: false });
    const r = st().runMonthlyBilling('2026-11', '2026-11-01');
    expect(r.reserveTransfer).toBe(0);
    expect(st().runLateFees('2027-01-01')).toBe(0);
  });
});
