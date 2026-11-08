import { describe, it, expect, beforeEach } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { seedChartOfAccounts, seedUnits } from '@/data/financial';

// Reset store to a clean state before each test
beforeEach(() => {
  useFinancialStore.setState({
    tenantId: null,
    chartOfAccounts: [...seedChartOfAccounts],
    acctStatus: Object.fromEntries(seedChartOfAccounts.map(a => [a.num, true])),
    generalLedger: [],
    glNextId: 1000,
    units: seedUnits.map(u => ({ ...u, balance: 0, lateFees: [], specialAssessments: [], payments: [] })),
    unitInvoices: [],
    workOrders: [],
    closedThrough: null,
  });
});

const st = () => useFinancialStore.getState();
const unitOf = (n: string) => st().units.find(u => u.number === n)!;

// ── createUnitInvoice ───────────────────────────────────────────────

describe('createUnitInvoice', () => {
  const unitNum = seedUnits[0].number;

  it('returns invoice with status "sent"', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    expect(inv.status).toBe('sent');
  });

  it('dueDate is ~30 days from now', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    const due = new Date(inv.dueDate);
    const now = new Date();
    const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it('GL entry posted with correct accounts for fee type', () => {
    st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    const gl = st().generalLedger;
    expect(gl).toHaveLength(1);
    expect(gl[0].debitAcct).toBe('1130');
    expect(gl[0].creditAcct).toBe('4030');
    expect(gl[0].amount).toBe(50);
  });

  it('GL entry posted with correct accounts for monthly type', () => {
    st().createUnitInvoice(unitNum, 'monthly', 500, 'Monthly assessment');
    const gl = st().generalLedger;
    expect(gl[0].debitAcct).toBe('1110');
    expect(gl[0].creditAcct).toBe('4010');
  });

  it('a special assessment is reserve-fund income by default, operating when told so', () => {
    const reserve = st().createUnitInvoice(unitNum, 'special_assessment', 1000, 'Roof');
    expect(reserve.fund).toBe('reserve');
    expect(st().generalLedger[0]).toMatchObject({ debitAcct: '1120', creditAcct: '4020' });
    const operating = st().createUnitInvoice(unitNum, 'special_assessment', 300, 'Insurance shortfall', undefined, undefined, { fund: 'operating' });
    expect(operating.fund).toBe('operating');
    expect(st().generalLedger[1]).toMatchObject({ debitAcct: '1110', creditAcct: '4010' });
  });

  it('id starts with "INV-U"', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    expect(inv.id).toMatch(/^INV-U/);
  });

  it('the charge raises the unit balance, so the owner shows as owing it', () => {
    st().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    expect(st().unitInvoices).toHaveLength(1);
    expect(unitOf(unitNum).balance).toBe(25);
  });

  it('a prepaid credit pays a new charge first', () => {
    st().recordUnitPayment(unitNum, 300, 'check'); // nothing owed: all of it is credit
    expect(unitOf(unitNum).balance).toBe(-300);
    const inv = st().createUnitInvoice(unitNum, 'monthly', 450, 'Dues · November');
    expect(inv).toMatchObject({ status: 'sent', paidAmount: 300 });
    expect(unitOf(unitNum).balance).toBe(150);
    // Dr 2020 prepaid / Cr 1110 for the credit used.
    expect(st().generalLedger[st().generalLedger.length - 1]).toMatchObject({ debitAcct: '2020', creditAcct: '1110', amount: 300 });
    expect(st().acctBalance('2020')).toBe(0);
    const small = st().createUnitInvoice(unitNum, 'fee', 20, 'Key');
    expect(small.status).toBe('sent');
  });

  it('a balance brought forward becomes an invoice without posting again', () => {
    useFinancialStore.setState({ units: st().units.map(u => (u.number === unitNum ? { ...u, balance: 900 } : u)) });
    const inv = st().billOutstandingBalance(unitNum);
    expect(inv).toMatchObject({ type: 'monthly', amount: 900, glEntryId: null });
    expect(st().generalLedger).toHaveLength(0);
    expect(unitOf(unitNum).balance).toBe(900);
    expect(st().billOutstandingBalance(unitNum)).toBeNull();
  });
});

// ── payUnitInvoice ──────────────────────────────────────────────────

describe('payUnitInvoice', () => {
  const unitNum = seedUnits[0].number;

  it('sets status "paid", fills paidDate and paidAmount', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    st().payUnitInvoice(inv.id, 'check');
    const updated = st().unitInvoices.find(i => i.id === inv.id)!;
    expect(updated.status).toBe('paid');
    expect(updated.paidDate).toBeTruthy();
    expect(updated.paidAmount).toBe(50);
  });

  it('idempotency: calling on already-paid invoice → no state change', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    st().payUnitInvoice(inv.id, 'check');
    const glCountAfterFirst = st().generalLedger.length;
    st().payUnitInvoice(inv.id, 'check');
    expect(st().generalLedger.length).toBe(glCountAfterFirst);
  });

  it('posts GL entry: debit 1010, credit correct AR', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    st().payUnitInvoice(inv.id, 'check');
    const gl = st().generalLedger;
    const paymentEntry = gl[gl.length - 1];
    expect(paymentEntry.debitAcct).toBe('1010');
    expect(paymentEntry.creditAcct).toBe('1130');
  });

  it('takes the charge back out of the balance', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    expect(unitOf(unitNum).balance).toBe(50);
    st().payUnitInvoice(inv.id, 'check');
    expect(unitOf(unitNum).balance).toBe(0);
  });

  it('a part payment keeps the invoice open with the amount paid so far', () => {
    const inv = st().createUnitInvoice(unitNum, 'monthly', 500, 'Dues');
    st().payUnitInvoice(inv.id, 'check', { amount: 200 });
    expect(st().unitInvoices[0]).toMatchObject({ status: 'sent', paidAmount: 200 });
    expect(unitOf(unitNum).balance).toBe(300);
    st().payUnitInvoice(inv.id, 'check');
    expect(st().unitInvoices[0]).toMatchObject({ status: 'paid', paidAmount: 500 });
    expect(unitOf(unitNum).balance).toBe(0);
  });

  it('adds payment record to unit.payments', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    const paymentsBefore = unitOf(unitNum).payments.length;
    st().payUnitInvoice(inv.id, 'check');
    expect(unitOf(unitNum).payments.length).toBe(paymentsBefore + 1);
  });
});

// ── refundUnitInvoice ───────────────────────────────────────────────

describe('refundUnitInvoice', () => {
  const unitNum = seedUnits[0].number;

  it('sets status "void", fills refund fields', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    st().payUnitInvoice(inv.id, 'check');
    st().refundUnitInvoice(inv.id, 'Customer request');
    const updated = st().unitInvoices.find(i => i.id === inv.id)!;
    expect(updated.status).toBe('void');
    expect(updated.refundAmount).toBe(50);
    expect(updated.refundReason).toBe('Customer request');
  });

  it('the charge was wrong: reverses the income and returns the cash (Dr income / Cr bank)', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    st().payUnitInvoice(inv.id, 'check');
    st().refundUnitInvoice(inv.id, 'Refund');
    const gl = st().generalLedger;
    const refundEntry = gl[gl.length - 1];
    expect(refundEntry).toMatchObject({ debitAcct: '4030', creditAcct: '1010', amount: 50, source: 'refund' });
    expect(st().acctBalance('4030')).toBe(0);
    expect(st().acctBalance('1130')).toBe(0);
    expect(st().acctBalance('1010')).toBe(0);
  });

  it('the owner does not owe a refunded charge again', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    st().payUnitInvoice(inv.id, 'check');
    st().refundUnitInvoice(inv.id, 'Refund');
    expect(unitOf(unitNum).balance).toBe(0);
  });

  it('a part-paid charge: the paid part goes back, the open part is cancelled', () => {
    const inv = st().createUnitInvoice(unitNum, 'monthly', 500, 'Dues');
    st().payUnitInvoice(inv.id, 'check', { amount: 200 });
    st().refundUnitInvoice(inv.id, 'Billed in error');
    expect(unitOf(unitNum).balance).toBe(0);
    expect(st().acctBalance('4010')).toBe(0);
    expect(st().acctBalance('1110')).toBe(0);
    expect(st().unitInvoices[0]).toMatchObject({ status: 'void', refundAmount: 200 });
  });

  it('calling on an unpaid invoice does nothing (void it instead)', () => {
    const inv = st().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    const glBefore = st().generalLedger.length;
    expect(() => st().refundUnitInvoice(inv.id, 'Refund')).not.toThrow();
    expect(st().generalLedger.length).toBe(glBefore);
  });

  it('returning a credit the owner paid ahead comes out of prepaid, not income', () => {
    st().recordUnitPayment(unitNum, 120, 'check');
    expect(unitOf(unitNum).balance).toBe(-120);
    const e = st().refundCredit(unitNum, 500, 'Owner asked for it back');
    expect(e).toMatchObject({ debitAcct: '2020', creditAcct: '1010', amount: 120 });
    expect(unitOf(unitNum).balance).toBe(0);
    expect(st().refundCredit(unitNum, 10, 'again')).toBeNull();
  });
});
