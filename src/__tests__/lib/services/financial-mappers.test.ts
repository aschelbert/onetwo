import { describe, it, expect } from 'vitest';
import { rowToUnit, rowToUnitInvoice } from '@/lib/services/financial';

// ── rowToUnit ───────────────────────────────────────────────────────

describe('rowToUnit', () => {
  const baseRow = {
    number: '101',
    owner: 'John Smith',
    email: 'john@test.com',
    phone: '555-1234',
    monthly_fee: 450,
    voting_pct: 12.5,
    status: 'ACTIVE',
    balance: 0,
    move_in: '2024-01-15',
    sqft: 850,
    bedrooms: 2,
    parking: 'P-12',
    payments: [{ date: '2026-01-15', amount: 450, method: 'check', note: 'Jan' }],
    late_fees: [],
    special_assessments: [],
    stripe_customer_id: 'cus_abc123',
  };

  it('numeric coercion: monthly_fee string → number', () => {
    const unit = rowToUnit({ ...baseRow, monthly_fee: '450' });
    expect(unit.monthlyFee).toBe(450);
    expect(typeof unit.monthlyFee).toBe('number');
  });

  it('BUG #2: monthly_fee undefined → NaN', () => {
    const unit = rowToUnit({ ...baseRow, monthly_fee: undefined });
    expect(unit.monthlyFee).toBeNaN();
  });

  it('BUG #2: monthly_fee non-numeric string → NaN', () => {
    const unit = rowToUnit({ ...baseRow, monthly_fee: 'abc' });
    expect(unit.monthlyFee).toBeNaN();
  });

  it('nullable moveIn: null → null', () => {
    const unit = rowToUnit({ ...baseRow, move_in: null });
    expect(unit.moveIn).toBeNull();
  });

  it('nullable moveIn: empty string → null', () => {
    const unit = rowToUnit({ ...baseRow, move_in: '' });
    expect(unit.moveIn).toBeNull();
  });

  it('array defaults: payments null → []', () => {
    const unit = rowToUnit({ ...baseRow, payments: null });
    expect(unit.payments).toEqual([]);
  });
});

// ── rowToUnitInvoice ────────────────────────────────────────────────

describe('rowToUnitInvoice', () => {
  const baseRow = {
    id: 'inv-1',
    unit_number: '101',
    type: 'monthly',
    description: 'Monthly assessment',
    amount: 450,
    status: 'sent',
    created_date: '2026-01-01',
    due_date: '2026-01-31',
    paid_date: null,
    paid_amount: null,
    payment_method: null,
    stripe_payment_link: null,
    gl_entry_id: 'GL1000',
    payment_gl_entry_id: null,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    refund_amount: null,
    refund_date: null,
    refund_reason: null,
    refund_gl_entry_id: null,
    stripe_refund_id: null,
  };

  it('null paid_amount → null (not 0)', () => {
    const inv = rowToUnitInvoice({ ...baseRow, paid_amount: null });
    expect(inv.paidAmount).toBeNull();
  });

  it('non-null paid_amount → number', () => {
    const inv = rowToUnitInvoice({ ...baseRow, paid_amount: 450 });
    expect(inv.paidAmount).toBe(450);
  });

  it('optional Stripe fields default to null', () => {
    const inv = rowToUnitInvoice(baseRow);
    expect(inv.stripeCheckoutSessionId).toBeNull();
    expect(inv.stripePaymentIntentId).toBeNull();
    expect(inv.stripeRefundId).toBeNull();
  });

  it('refund fields optional', () => {
    const inv = rowToUnitInvoice(baseRow);
    expect(inv.refundAmount).toBeNull();
    expect(inv.refundDate).toBeNull();
    expect(inv.refundReason).toBeNull();
    expect(inv.refundGlEntryId).toBeNull();
  });
});
