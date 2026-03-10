import { describe, it, expect } from 'vitest';
import {
  getGLAccountsForInvoice,
  computeAcctBalance,
  computeAcctGroupBalance,
  computeDelinquencyAging,
} from '@/lib/financial-logic';
import type { ChartOfAccountsEntry, GLEntry, Unit } from '@/types/financial';

// ── GL Account Mapping ─────────────────────────────────────────────

describe('getGLAccountsForInvoice', () => {
  it('fee → AR 1130, Revenue 4030', () => {
    expect(getGLAccountsForInvoice('fee')).toEqual({ arAcct: '1130', revenueAcct: '4030' });
  });

  it('amenity_fee → AR 1130, Revenue 4060', () => {
    expect(getGLAccountsForInvoice('amenity_fee')).toEqual({ arAcct: '1130', revenueAcct: '4060' });
  });

  it('special_assessment → AR 1120, Revenue 4020', () => {
    expect(getGLAccountsForInvoice('special_assessment')).toEqual({ arAcct: '1120', revenueAcct: '4020' });
  });

  it('monthly → AR 1110, Revenue 4010 (Bug #1: was mapping to 1120/4020)', () => {
    const result = getGLAccountsForInvoice('monthly');
    expect(result).toEqual({ arAcct: '1110', revenueAcct: '4010' });
  });
});

// ── computeAcctBalance ──────────────────────────────────────────────

describe('computeAcctBalance', () => {
  const coa: ChartOfAccountsEntry[] = [
    { num: '1010', name: 'Operating', type: 'asset', sub: 'detail', parent: null },
    { num: '4010', name: 'Assessment Income', type: 'income', sub: 'detail', parent: null },
    { num: '5010', name: 'Utilities', type: 'expense', sub: 'detail', parent: null },
  ];

  const makeGL = (entries: Partial<GLEntry>[]): GLEntry[] =>
    entries.map((e, i) => ({
      id: `GL${i}`,
      date: '2026-01-01',
      memo: 'test',
      debitAcct: '',
      creditAcct: '',
      amount: 0,
      source: 'manual' as const,
      sourceId: null,
      posted: '2026-01-01',
      status: 'posted' as const,
      ...e,
    }));

  it('debit-normal account (asset): debits add, credits subtract', () => {
    const gl = makeGL([
      { debitAcct: '1010', amount: 1000 },
      { creditAcct: '1010', amount: 200 },
    ]);
    expect(computeAcctBalance('1010', coa, gl)).toBe(800);
  });

  it('credit-normal account (income): credits add, debits subtract', () => {
    const gl = makeGL([
      { creditAcct: '4010', amount: 500 },
      { debitAcct: '4010', amount: 100 },
    ]);
    // income is credit-normal → -(100 - 500) = 400
    expect(computeAcctBalance('4010', coa, gl)).toBe(400);
  });

  it('unknown account returns 0', () => {
    expect(computeAcctBalance('9999', coa, [])).toBe(0);
  });

  it('empty GL returns 0', () => {
    expect(computeAcctBalance('1010', coa, [])).toBe(0);
  });

  it('only counts entries matching the account number', () => {
    const gl = makeGL([
      { debitAcct: '1010', amount: 100 },
      { debitAcct: '5010', amount: 200 },
      { creditAcct: '4010', amount: 300 },
    ]);
    expect(computeAcctBalance('1010', coa, gl)).toBe(100);
    expect(computeAcctBalance('5010', coa, gl)).toBe(200);
    expect(computeAcctBalance('4010', coa, gl)).toBe(300);
  });
});

// ── computeAcctGroupBalance ─────────────────────────────────────────

describe('computeAcctGroupBalance', () => {
  const coa: ChartOfAccountsEntry[] = [
    { num: '1000', name: 'Assets', type: 'asset', sub: 'header', parent: null },
    { num: '1010', name: 'Operating', type: 'asset', sub: 'detail', parent: '1000' },
    { num: '1020', name: 'Reserves', type: 'asset', sub: 'detail', parent: '1000' },
  ];

  const makeGL = (entries: Partial<GLEntry>[]): GLEntry[] =>
    entries.map((e, i) => ({
      id: `GL${i}`,
      date: '2026-01-01',
      memo: 'test',
      debitAcct: '',
      creditAcct: '',
      amount: 0,
      source: 'manual' as const,
      sourceId: null,
      posted: '2026-01-01',
      status: 'posted' as const,
      ...e,
    }));

  it('parent sums children', () => {
    const gl = makeGL([
      { debitAcct: '1010', amount: 500 },
      { debitAcct: '1020', amount: 300 },
    ]);
    expect(computeAcctGroupBalance('1000', coa, gl)).toBe(800);
  });

  it('parent with no children returns own balance', () => {
    const gl = makeGL([{ debitAcct: '1010', amount: 100 }]);
    expect(computeAcctGroupBalance('1010', coa, gl)).toBe(100);
  });

  it('recursive parent → child → grandchild', () => {
    const deepCoa: ChartOfAccountsEntry[] = [
      { num: '1000', name: 'Assets', type: 'asset', sub: 'header', parent: null },
      { num: '1100', name: 'Receivables', type: 'asset', sub: 'header', parent: '1000' },
      { num: '1110', name: 'Assessments AR', type: 'asset', sub: 'detail', parent: '1100' },
      { num: '1120', name: 'Special AR', type: 'asset', sub: 'detail', parent: '1100' },
    ];
    const gl = makeGL([
      { debitAcct: '1110', amount: 200 },
      { debitAcct: '1120', amount: 150 },
    ]);
    expect(computeAcctGroupBalance('1000', deepCoa, gl)).toBe(350);
  });
});

// ── computeDelinquencyAging ─────────────────────────────────────────

describe('computeDelinquencyAging', () => {
  const makeUnit = (overrides: Partial<Unit>): Unit => ({
    number: '100',
    owner: 'Test',
    email: 'test@test.com',
    phone: '555-0000',
    monthlyFee: 500,
    votingPct: 10,
    status: 'ACTIVE',
    balance: 0,
    moveIn: null,
    sqft: 800,
    bedrooms: 1,
    parking: null,
    payments: [],
    lateFees: [],
    specialAssessments: [],
    ...overrides,
  });

  it('balance === 0 → excluded', () => {
    const result = computeDelinquencyAging([makeUnit({ balance: 0, monthlyFee: 500 })]);
    expect(result.current).toHaveLength(0);
    expect(result.totalOutstanding).toBe(0);
  });

  it('balance <= monthlyFee → current', () => {
    const result = computeDelinquencyAging([makeUnit({ number: '101', balance: 400, monthlyFee: 500 })]);
    expect(result.current).toHaveLength(1);
    expect(result.current[0].number).toBe('101');
  });

  it('balance === monthlyFee * 2 → 30 days', () => {
    const result = computeDelinquencyAging([makeUnit({ number: '102', balance: 1000, monthlyFee: 500 })]);
    expect(result.days30).toHaveLength(1);
  });

  it('balance === monthlyFee * 3 → 60 days', () => {
    const result = computeDelinquencyAging([makeUnit({ number: '103', balance: 1500, monthlyFee: 500 })]);
    expect(result.days60).toHaveLength(1);
  });

  it('balance > monthlyFee * 3 → 90+ days', () => {
    const result = computeDelinquencyAging([makeUnit({ number: '104', balance: 2000, monthlyFee: 500 })]);
    expect(result.days90plus).toHaveLength(1);
    expect(result.totalOutstanding).toBe(2000);
  });
});
