import { describe, it, expect, beforeEach } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { seedChartOfAccounts, seedUnits } from '@/data/financial';
import { amountOwed, legacyOwed } from '@/lib/financial-logic';

beforeEach(() => {
  useFinancialStore.setState({
    tenantId: null,
    chartOfAccounts: [...seedChartOfAccounts],
    acctStatus: Object.fromEntries(seedChartOfAccounts.map(a => [a.num, true])),
    generalLedger: [],
    glNextId: 1000,
    units: seedUnits.map(u => ({ ...u, balance: 0, lateFees: [], specialAssessments: [], payments: [] })),
    unitInvoices: [],
    closedThrough: null,
  });
});

const st = () => useFinancialStore.getState();
const unitOf = (n: string) => st().units.find(u => u.number === n)!;
const U = seedUnits[0].number;

describe('recordUnitPayment', () => {
  it('applies dues first, then special assessments, then fees, oldest due first', () => {
    const fee = st().imposeLateFee(U, 25, 'Late · Sept', { date: '2026-09-16', dueDate: '2026-09-16' });
    const sa = st().addSpecialAssessment(U, 600, 'Roof', { dueDate: '2026-10-01' });
    const duesOct = st().createUnitInvoice(U, 'monthly', 450, 'Dues · October', undefined, '2026-10-01', { date: '2026-10-01' });
    const duesSep = st().createUnitInvoice(U, 'monthly', 450, 'Dues · September', undefined, '2026-09-01', { date: '2026-09-01' });
    expect(unitOf(U).balance).toBe(1525);

    const r = st().recordUnitPayment(U, 1000, 'check', { date: '2026-10-05' });
    expect(r.applied).toEqual([{ invoiceId: duesSep.id, amount: 450 }, { invoiceId: duesOct.id, amount: 450 }, { invoiceId: sa.id, amount: 100 }]);
    expect(r.toBalance).toBe(0);
    expect(r.toCredit).toBe(0);
    const byId = Object.fromEntries(st().unitInvoices.map(i => [i.id, i]));
    expect(byId[duesSep.id].status).toBe('paid');
    expect(byId[duesOct.id].status).toBe('paid');
    expect(byId[sa.id]).toMatchObject({ status: 'sent', paidAmount: 100 });
    expect(byId[fee.id].status).toBe('sent');
    expect(unitOf(U).balance).toBe(525);
    expect(unitOf(U).payments).toHaveLength(1);
    expect(unitOf(U).payments[0]).toMatchObject({ amount: 1000, method: 'check', date: '2026-10-05' });
  });

  it('the building can choose oldest charge first instead', () => {
    useFinancialStore.setState({ paymentOrder: 'oldest-first' });
    const fee = st().imposeLateFee(U, 25, 'Late · Sept', { date: '2026-09-16', dueDate: '2026-09-16' });
    const dues = st().createUnitInvoice(U, 'monthly', 450, 'Dues · October', undefined, '2026-10-01', { date: '2026-10-01' });
    const r = st().recordUnitPayment(U, 100, 'check', { date: '2026-10-05' });
    expect(r.applied).toEqual([{ invoiceId: fee.id, amount: 25 }, { invoiceId: dues.id, amount: 75 }]);
    useFinancialStore.setState({ paymentOrder: 'dues-first' });
  });

  it('credits each charge\'s own receivable account', () => {
    st().imposeLateFee(U, 25, 'Late');
    st().addSpecialAssessment(U, 600, 'Roof');
    st().createUnitInvoice(U, 'monthly', 450, 'Dues');
    st().recordUnitPayment(U, 1075, 'ach');
    expect(st().acctBalance('1110')).toBe(0);
    expect(st().acctBalance('1120')).toBe(0);
    expect(st().acctBalance('1130')).toBe(0);
    expect(st().acctBalance('1010')).toBe(1075);
    expect(unitOf(U).balance).toBe(0);
    expect(unitOf(U).lateFees[0].paid).toBe(true);
    expect(unitOf(U).specialAssessments[0].paid).toBe(true);
  });

  it('a balance with no invoice behind it is paid after the invoices, then the rest is a prepaid credit', () => {
    useFinancialStore.setState({ units: st().units.map(u => (u.number === U ? { ...u, balance: 300 } : u)) });
    st().createUnitInvoice(U, 'monthly', 450, 'Dues');
    expect(unitOf(U).balance).toBe(750);
    expect(legacyOwed(unitOf(U), st().unitInvoices)).toBe(300);
    const r = st().recordUnitPayment(U, 1000, 'check');
    expect(r).toMatchObject({ toBalance: 300, toCredit: 250, total: 1000 });
    expect(unitOf(U).balance).toBe(-250);
    expect(amountOwed(unitOf(U))).toBe(0);
    expect(st().acctBalance('2020')).toBe(250);
    expect(st().acctBalance('1110')).toBe(-300); // the brought-forward balance was never posted here; opening balances (step 5) put it in
  });

  it('an overpayment is never lost: it becomes a credit, not a clamped zero', () => {
    st().createUnitInvoice(U, 'monthly', 450, 'Dues');
    st().recordUnitPayment(U, 500, 'check');
    expect(unitOf(U).balance).toBe(-50);
    expect(st().generalLedger[st().generalLedger.length - 1]).toMatchObject({ debitAcct: '1010', creditAcct: '2020', amount: 50 });
  });

  it('a special assessment paid from the unit record goes through its invoice', () => {
    const inv = st().addSpecialAssessment(U, 600, 'Roof');
    st().markSpecialAssessmentPaid(U, unitOf(U).specialAssessments[0].id, 'check');
    expect(st().unitInvoices.find(i => i.id === inv.id)!.status).toBe('paid');
    expect(unitOf(U).specialAssessments[0].paid).toBe(true);
    expect(unitOf(U).balance).toBe(0);
    expect(st().generalLedger).toHaveLength(2);
  });

  it('voiding an open charge reverses its income and takes it out of the balance', () => {
    const inv = st().addSpecialAssessment(U, 600, 'Roof');
    expect(st().voidUnitInvoice(inv.id, 'Vote failed')).toBe(true);
    expect(unitOf(U).balance).toBe(0);
    expect(unitOf(U).specialAssessments).toHaveLength(0);
    expect(st().acctBalance('4020')).toBe(0);
    expect(st().acctBalance('1120')).toBe(0);
    expect(st().voidUnitInvoice(inv.id, 'again')).toBe(false);
  });

  it('nothing is posted for a payment of zero or to an unknown unit', () => {
    expect(st().recordUnitPayment(U, 0, 'check').total).toBe(0);
    expect(st().recordUnitPayment('nope', 10, 'check').applied).toEqual([]);
    expect(st().generalLedger).toHaveLength(0);
  });
});
