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
    units: seedUnits.map(u => ({ ...u })),
    unitInvoices: [],
    workOrders: [],
  });
});

// ── createUnitInvoice ───────────────────────────────────────────────

describe('createUnitInvoice', () => {
  const unitNum = seedUnits[0].number;

  it('returns invoice with status "sent"', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    expect(inv.status).toBe('sent');
  });

  it('dueDate is ~30 days from now', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    const due = new Date(inv.dueDate);
    const now = new Date();
    const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it('GL entry posted with correct accounts for fee type', () => {
    useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    const gl = useFinancialStore.getState().generalLedger;
    expect(gl).toHaveLength(1);
    expect(gl[0].debitAcct).toBe('1130');
    expect(gl[0].creditAcct).toBe('4030');
    expect(gl[0].amount).toBe(50);
  });

  it('GL entry posted with correct accounts for monthly type (Bug #1 fix)', () => {
    useFinancialStore.getState().createUnitInvoice(unitNum, 'monthly', 500, 'Monthly assessment');
    const gl = useFinancialStore.getState().generalLedger;
    expect(gl[0].debitAcct).toBe('1110');
    expect(gl[0].creditAcct).toBe('4010');
  });

  it('id starts with "INV-U"', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    expect(inv.id).toMatch(/^INV-U/);
  });

  it('invoice added to unitInvoices array', () => {
    useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 25, 'Late fee');
    expect(useFinancialStore.getState().unitInvoices).toHaveLength(1);
  });
});

// ── payUnitInvoice ──────────────────────────────────────────────────

describe('payUnitInvoice', () => {
  const unitNum = seedUnits[0].number;

  it('sets status "paid", fills paidDate and paidAmount', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    const updated = useFinancialStore.getState().unitInvoices.find(i => i.id === inv.id)!;
    expect(updated.status).toBe('paid');
    expect(updated.paidDate).toBeTruthy();
    expect(updated.paidAmount).toBe(50);
  });

  it('idempotency: calling on already-paid invoice → no state change', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    const glCountAfterFirst = useFinancialStore.getState().generalLedger.length;
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    expect(useFinancialStore.getState().generalLedger.length).toBe(glCountAfterFirst);
  });

  it('posts GL entry: debit 1010, credit correct AR', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    const gl = useFinancialStore.getState().generalLedger;
    const paymentEntry = gl[gl.length - 1];
    expect(paymentEntry.debitAcct).toBe('1010');
    expect(paymentEntry.creditAcct).toBe('1130');
  });

  it('reduces unit balance (min 0)', () => {
    // Set unit balance first
    useFinancialStore.setState({
      units: useFinancialStore.getState().units.map(u =>
        u.number === unitNum ? { ...u, balance: 50 } : u
      ),
    });
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    const unit = useFinancialStore.getState().units.find(u => u.number === unitNum)!;
    expect(unit.balance).toBe(0);
  });

  it('adds payment record to unit.payments', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    const paymentsBefore = useFinancialStore.getState().units.find(u => u.number === unitNum)!.payments.length;
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    const paymentsAfter = useFinancialStore.getState().units.find(u => u.number === unitNum)!.payments.length;
    expect(paymentsAfter).toBe(paymentsBefore + 1);
  });
});

// ── refundUnitInvoice ───────────────────────────────────────────────

describe('refundUnitInvoice', () => {
  const unitNum = seedUnits[0].number;

  it('sets status "void", fills refund fields', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    useFinancialStore.getState().refundUnitInvoice(inv.id, 'Customer request');
    const updated = useFinancialStore.getState().unitInvoices.find(i => i.id === inv.id)!;
    expect(updated.status).toBe('void');
    expect(updated.refundAmount).toBe(50);
    expect(updated.refundReason).toBe('Customer request');
  });

  it('posts reversal GL entry: debit AR, credit 1010', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    useFinancialStore.getState().refundUnitInvoice(inv.id, 'Refund');
    const gl = useFinancialStore.getState().generalLedger;
    const refundEntry = gl[gl.length - 1];
    expect(refundEntry.debitAcct).toBe('1130');
    expect(refundEntry.creditAcct).toBe('1010');
  });

  it('increases unit balance', () => {
    useFinancialStore.setState({
      units: useFinancialStore.getState().units.map(u =>
        u.number === unitNum ? { ...u, balance: 0 } : u
      ),
    });
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    useFinancialStore.getState().payUnitInvoice(inv.id, 'check');
    useFinancialStore.getState().refundUnitInvoice(inv.id, 'Refund');
    const unit = useFinancialStore.getState().units.find(u => u.number === unitNum)!;
    expect(unit.balance).toBe(50);
  });

  it('BUG #3: calling on non-paid invoice silently returns (no error thrown)', () => {
    const inv = useFinancialStore.getState().createUnitInvoice(unitNum, 'fee', 50, 'Late fee');
    const glBefore = useFinancialStore.getState().generalLedger.length;
    // Should not throw, just silently return
    expect(() => useFinancialStore.getState().refundUnitInvoice(inv.id, 'Refund')).not.toThrow();
    // No new GL entry should be posted
    expect(useFinancialStore.getState().generalLedger.length).toBe(glBefore);
  });
});
