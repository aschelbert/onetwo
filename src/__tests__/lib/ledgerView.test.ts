import { describe, it, expect } from 'vitest';
import { postedByFor, proofFor, yearEndPackage, type YearEndInputs } from '@/lib/ledgerView';
import type { GLEntry } from '@/types/financial';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<GLEntry> = {}): GLEntry {
  return {
    id: 'GL1001',
    date: '2026-10-15',
    memo: 'Test entry',
    debitAcct: '5010',
    creditAcct: '1010',
    amount: 500,
    source: 'manual',
    sourceId: null,
    posted: new Date().toISOString(),
    status: 'posted',
    ...overrides,
  };
}

// ── postedByFor ──────────────────────────────────────────────────────────────

describe('postedByFor', () => {
  it('returns flow label with user name when postedBy has both', () => {
    const entry = makeEntry({
      postedBy: { flow: 'money_in', userName: 'Alyssa' },
    });
    expect(postedByFor(entry)).toBe('Money in . Alyssa');
  });

  it('returns flow label without user when userName is missing', () => {
    const entry = makeEntry({
      postedBy: { flow: 'manual' },
    });
    expect(postedByFor(entry)).toBe('Manual entry');
  });

  it('falls back to source mapping for legacy entries without postedBy', () => {
    const entry = makeEntry({ source: 'assessment', postedBy: undefined });
    expect(postedByFor(entry)).toBe('Money in');
  });

  it('maps payment source to Money in', () => {
    const entry = makeEntry({ source: 'payment', postedBy: undefined });
    expect(postedByFor(entry)).toBe('Money in');
  });

  it('maps expense source to Money out', () => {
    const entry = makeEntry({ source: 'expense', postedBy: undefined });
    expect(postedByFor(entry)).toBe('Money out');
  });

  it('maps transfer source to Transfer', () => {
    const entry = makeEntry({ source: 'transfer', postedBy: undefined });
    expect(postedByFor(entry)).toBe('Transfer');
  });
});

// ── proofFor ─────────────────────────────────────────────────────────────────

describe('proofFor', () => {
  it('returns proof label when proof object exists', () => {
    const entry = makeEntry({
      proof: { type: 'invoice', label: 'Vendor invoice #1234' },
    });
    const result = proofFor(entry);
    expect(result.label).toBe('Vendor invoice #1234');
    expect(result.isWarning).toBe(false);
  });

  it('returns proof type when proof exists without label', () => {
    const entry = makeEntry({
      proof: { type: 'check_image' },
    });
    const result = proofFor(entry);
    expect(result.label).toBe('check_image');
    expect(result.isWarning).toBe(false);
  });

  it('returns reason as proof for manual entries with reason', () => {
    const entry = makeEntry({
      source: 'manual',
      reason: 'Correcting prior month error',
    });
    const result = proofFor(entry);
    expect(result.label).toBe('Correcting prior month error');
    expect(result.isWarning).toBe(false);
  });

  it('returns warning for manual entries without reason or proof', () => {
    const entry = makeEntry({
      source: 'manual',
      reason: undefined,
      proof: undefined,
    });
    const result = proofFor(entry);
    expect(result.label).toContain('No memo attached');
    expect(result.isWarning).toBe(true);
  });

  it('returns source-derived label for non-manual entries', () => {
    const entry = makeEntry({
      source: 'payment',
      reason: undefined,
      proof: undefined,
    });
    const result = proofFor(entry);
    expect(result.label).toBe('Payment receipt');
    expect(result.isWarning).toBe(false);
  });
});

// ── yearEndPackage ───────────────────────────────────────────────────────────

describe('yearEndPackage', () => {
  function makeYearEndInputs(overrides: Partial<YearEndInputs> = {}): YearEndInputs {
    return {
      periodCloses: [],
      generalLedger: [],
      workOrders: [],
      buildingName: 'Test Building',
      buildingState: 'DC',
      entityType: 'incorporated',
      ...overrides,
    };
  }

  it('returns 4 checklist items', () => {
    const items = yearEndPackage(2026, makeYearEndInputs());
    expect(items).toHaveLength(4);
    expect(items.map(i => i.key)).toEqual([
      'periods_closed',
      'form_1120h',
      'local_tax',
      'form_1099nec',
    ]);
  });

  it('periods_closed: done when all 12 months closed', () => {
    const periodCloses = Array.from({ length: 12 }, (_, i) => ({
      period: `2026-${String(i + 1).padStart(2, '0')}`,
      closedAt: '2026-12-31',
      locked: true,
    }));
    const items = yearEndPackage(2026, makeYearEndInputs({ periodCloses }));
    expect(items[0].done).toBe(true);
    expect(items[0].detail).toContain('12 of 12');
  });

  it('periods_closed: not done when only some months closed', () => {
    const periodCloses = [
      { period: '2026-01', closedAt: '2026-02-01', locked: true },
      { period: '2026-02', closedAt: '2026-03-01', locked: true },
    ];
    const items = yearEndPackage(2026, makeYearEndInputs({ periodCloses }));
    expect(items[0].done).toBe(false);
    expect(items[0].detail).toContain('2 of 12');
  });

  it('local_tax: shows D-20 for DC incorporated', () => {
    const items = yearEndPackage(2026, makeYearEndInputs({
      buildingState: 'DC',
      entityType: 'incorporated',
    }));
    expect(items[2].label).toContain('D-20');
  });

  it('local_tax: shows D-30 for DC unincorporated', () => {
    const items = yearEndPackage(2026, makeYearEndInputs({
      buildingState: 'DC',
      entityType: 'unincorporated',
    }));
    expect(items[2].label).toContain('D-30');
  });

  it('1099-NEC: identifies vendors paid >= $600', () => {
    const items = yearEndPackage(2026, makeYearEndInputs({
      workOrders: [
        { vendor: 'Acme Plumbing', amount: 400, paidDate: '2026-03-15', status: 'paid' },
        { vendor: 'Acme Plumbing', amount: 300, paidDate: '2026-06-15', status: 'paid' },
        { vendor: 'Small Fix Co', amount: 100, paidDate: '2026-04-01', status: 'paid' },
      ],
    }));
    const nec = items.find(i => i.key === 'form_1099nec')!;
    expect(nec.detail).toContain('1 vendor');
    expect(nec.detail).toContain('Acme Plumbing');
  });

  it('1099-NEC: done when no vendors over $600', () => {
    const items = yearEndPackage(2026, makeYearEndInputs({
      workOrders: [
        { vendor: 'Small Fix', amount: 100, paidDate: '2026-04-01', status: 'paid' },
      ],
    }));
    const nec = items.find(i => i.key === 'form_1099nec')!;
    expect(nec.done).toBe(true);
    expect(nec.detail).toContain('No vendors');
  });
});
