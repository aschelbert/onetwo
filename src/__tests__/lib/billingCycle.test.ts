import { describe, expect, it } from 'vitest';
import { billingDue, duesDescription, duesDueDate, isDuesInvoiceFor, lateFeesDue, periodKey, reserveTransferMemo } from '@/lib/billingCycle';
import type { UnitInvoice } from '@/types/financial';

const inv = (over: Partial<UnitInvoice>): UnitInvoice => ({
  id: 'i', unitNumber: '1A', type: 'monthly', description: duesDescription('2026-10'), amount: 400, status: 'sent', createdDate: '2026-10-01', dueDate: '2026-10-01',
  paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null, ...over,
});

describe('billing cycle decisions', () => {
  it('names and dates a month\'s dues', () => {
    expect(periodKey('2026-11-08')).toBe('2026-11');
    expect(duesDescription('2026-11')).toBe('Dues · November 2026');
    expect(duesDueDate('2026-11', 15)).toBe('2026-11-15');
    expect(duesDueDate('2026-11', 31)).toBe('2026-11-28');
    expect(duesDueDate('2026-11', 0)).toBe('2026-11-01');
    expect(isDuesInvoiceFor(inv({}), '2026-10')).toBe(true);
    expect(isDuesInvoiceFor(inv({}), '2026-11')).toBe(false);
    expect(isDuesInvoiceFor(inv({ type: 'fee', description: 'Late fee · October 2026' }), '2026-10')).toBe(false);
    expect(reserveTransferMemo('2026-11')).toBe('Reserve transfer · November 2026');
  });

  it('bills a month once, and only when billing is on', () => {
    expect(billingDue('2026-11-08', false, null)).toBeNull();
    expect(billingDue('2026-11-08', true, null)).toBe('2026-11');
    expect(billingDue('2026-11-08', true, '2026-10-01T12:00:00Z')).toBe('2026-11');
    expect(billingDue('2026-11-08', true, '2026-11-01T12:00:00Z')).toBeNull();
  });

  it('finds dues past the grace period with no fee yet', () => {
    const dues = inv({ id: 'd1' });
    const paid = inv({ id: 'd2', unitNumber: '2A', status: 'paid', paidAmount: 400 });
    const partPaid = inv({ id: 'd3', unitNumber: '3A', paidAmount: 100 });
    const feeFor1 = inv({ id: 'f1', type: 'fee', description: 'Late fee · October 2026', forInvoiceId: 'd1', dueDate: '2026-10-16' });
    expect(lateFeesDue('2026-10-15', [dues, paid, partPaid], 15).map(i => i.id)).toEqual([]);
    expect(lateFeesDue('2026-10-17', [dues, paid, partPaid], 15).map(i => i.id)).toEqual(['d1', 'd3']);
    expect(lateFeesDue('2026-10-17', [dues, paid, partPaid, feeFor1], 15).map(i => i.id)).toEqual(['d3']);
    // A voided fee does not count as charged.
    expect(lateFeesDue('2026-10-17', [dues, { ...feeFor1, status: 'void' }], 15).map(i => i.id)).toEqual(['d1']);
  });
});
