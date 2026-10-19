import { describe, it, expect } from 'vitest';
import { findDifferences, type BankLine } from '@/lib/reconcile';
import type { GLEntry } from '@/types/financial';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBankLine(overrides: Partial<BankLine> & { id: string }): BankLine {
  return {
    date: '2026-10-15',
    description: 'Test bank line',
    amount: 500,
    type: 'credit',
    ...overrides,
  };
}

function makeGLEntry(overrides: Partial<GLEntry> & { id: string }): GLEntry {
  return {
    date: '2026-10-15',
    memo: 'Test GL entry',
    debitAcct: '1110',
    creditAcct: '4010',
    amount: 500,
    source: 'payment',
    sourceId: null,
    posted: new Date().toISOString(),
    status: 'posted',
    ...overrides,
  };
}

// ── findDifferences ──────────────────────────────────────────────────────────

describe('findDifferences', () => {
  it('matches entries with same amount and date', () => {
    const bankLines = [makeBankLine({ id: 'B1', amount: 500, date: '2026-10-15' })];
    const ledger = [makeGLEntry({ id: 'GL1', amount: 500, date: '2026-10-15' })];

    const result = findDifferences(bankLines, ledger);
    expect(result.matched).toHaveLength(1);
    expect(result.differences).toHaveLength(0);
    expect(result.matched[0].bankLine.id).toBe('B1');
    expect(result.matched[0].ledgerEntry.id).toBe('GL1');
  });

  it('matches entries within 3-day date window', () => {
    const bankLines = [makeBankLine({ id: 'B1', amount: 500, date: '2026-10-17' })];
    const ledger = [makeGLEntry({ id: 'GL1', amount: 500, date: '2026-10-15' })];

    const result = findDifferences(bankLines, ledger);
    expect(result.matched).toHaveLength(1);
    expect(result.differences).toHaveLength(0);
  });

  it('does not match entries more than 3 days apart', () => {
    const bankLines = [makeBankLine({ id: 'B1', amount: 500, date: '2026-10-20' })];
    const ledger = [makeGLEntry({ id: 'GL1', amount: 500, date: '2026-10-15' })];

    const result = findDifferences(bankLines, ledger);
    expect(result.matched).toHaveLength(0);
    expect(result.differences).toHaveLength(2); // unmatched bank + unmatched ledger
  });

  it('does not match entries with different amounts', () => {
    const bankLines = [makeBankLine({ id: 'B1', amount: 500, date: '2026-10-15' })];
    const ledger = [makeGLEntry({ id: 'GL1', amount: 501, date: '2026-10-15' })];

    const result = findDifferences(bankLines, ledger);
    expect(result.matched).toHaveLength(0);
    expect(result.differences).toHaveLength(2);
  });

  it('reports unmatched bank lines with suggested fix', () => {
    const bankLines = [
      makeBankLine({ id: 'B1', amount: 300, date: '2026-10-01', type: 'debit', description: 'Water bill' }),
    ];
    const ledger: GLEntry[] = [];

    const result = findDifferences(bankLines, ledger);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].type).toBe('unmatched_bank');
    expect(result.differences[0].suggestedFix).toContain('expense');
    expect(result.differences[0].suggestedFix).toContain('Water bill');
  });

  it('reports unmatched ledger entries with suggested fix', () => {
    const bankLines: BankLine[] = [];
    const ledger = [
      makeGLEntry({ id: 'GL1', amount: 200, date: '2026-10-05', memo: 'Office supplies' }),
    ];

    const result = findDifferences(bankLines, ledger);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].type).toBe('unmatched_ledger');
    expect(result.differences[0].suggestedFix).toContain('Office supplies');
  });

  it('flags manual entries missing reason', () => {
    const bankLines = [makeBankLine({ id: 'B1', amount: 500, date: '2026-10-15' })];
    const ledger = [
      makeGLEntry({ id: 'GL1', amount: 500, date: '2026-10-15', source: 'manual', reason: undefined }),
    ];

    const result = findDifferences(bankLines, ledger);
    // Should match (same amount/date) but also flag missing reason
    expect(result.matched).toHaveLength(1);
    // The manual entry missing reason should appear as a difference
    const missingReason = result.differences.filter(d => d.type === 'missing_reason');
    expect(missingReason).toHaveLength(1);
    expect(missingReason[0].suggestedFix).toContain('reason');
  });

  it('does not double-count unmatched manual entries missing reason', () => {
    const bankLines: BankLine[] = [];
    const ledger = [
      makeGLEntry({ id: 'GL1', amount: 500, date: '2026-10-15', source: 'manual', reason: undefined }),
    ];

    const result = findDifferences(bankLines, ledger);
    // Should have unmatched_ledger but NOT also missing_reason
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].type).toBe('unmatched_ledger');
  });

  it('computes balance difference correctly', () => {
    const bankLines = [
      makeBankLine({ id: 'B1', amount: 1000, type: 'credit', date: '2026-10-01' }),
      makeBankLine({ id: 'B2', amount: 300, type: 'debit', date: '2026-10-05' }),
    ];
    const ledger = [
      makeGLEntry({ id: 'GL1', amount: 1000, date: '2026-10-01' }),
      makeGLEntry({ id: 'GL2', amount: 300, date: '2026-10-05' }),
    ];

    const result = findDifferences(bankLines, ledger);
    // Bank total: 1000 - 300 = 700
    expect(result.bankTotal).toBe(700);
    // Ledger total: 1000 + 300 = 1300
    expect(result.ledgerTotal).toBe(1300);
  });

  it('handles empty inputs', () => {
    const result = findDifferences([], []);
    expect(result.matched).toHaveLength(0);
    expect(result.differences).toHaveLength(0);
    expect(result.bankTotal).toBe(0);
    expect(result.ledgerTotal).toBe(0);
    expect(result.balanceDifference).toBe(0);
  });

  it('prefers closer date matches', () => {
    const bankLines = [makeBankLine({ id: 'B1', amount: 500, date: '2026-10-15' })];
    const ledger = [
      makeGLEntry({ id: 'GL1', amount: 500, date: '2026-10-14' }),
      makeGLEntry({ id: 'GL2', amount: 500, date: '2026-10-17' }),
    ];

    const result = findDifferences(bankLines, ledger);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].ledgerEntry.id).toBe('GL1'); // closer date
    // One unmatched ledger entry
    expect(result.differences.filter(d => d.type === 'unmatched_ledger')).toHaveLength(1);
  });
});
