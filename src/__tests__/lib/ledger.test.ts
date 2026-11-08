import { describe, expect, it } from 'vitest';
import { balanceOf, fiscalYearStart, fundOf, fundStatement, fundStatements, fundTotals, isLocked, monthEnd, priorMonthEnd, reversalOf } from '@/lib/ledger';
import { seedChartOfAccounts } from '@/data/financial';
import type { GLEntry } from '@/types/financial';

const entry = (over: Partial<GLEntry> & Pick<GLEntry, 'debitAcct' | 'creditAcct' | 'amount'>, i = 0): GLEntry => ({
  id: `GL${1000 + i}`, date: '2026-03-15', memo: 'test', source: 'manual', sourceId: null, posted: '2026-03-15T00:00:00Z', status: 'posted', ...over,
});

const coa = seedChartOfAccounts;
const nums = coa.filter(a => a.parent).map(a => a.num);

/** A small deterministic generator so the identity test is repeatable. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe('ledger engine', () => {
  it('assigns each account to a fund by tag, else by code', () => {
    expect(fundOf({ num: '1010' })).toBe('operating');
    expect(fundOf({ num: '1020' })).toBe('reserve');
    expect(fundOf({ num: '4020' })).toBe('reserve');
    expect(fundOf({ num: '6010' })).toBe('reserve');
    expect(fundOf({ num: '5010' })).toBe('operating');
    expect(fundOf({ num: '1020', fund: 'operating' })).toBe('operating');
    expect(fundOf(undefined, '3020')).toBe('reserve');
  });

  it('never counts a void entry', () => {
    const gl = [entry({ debitAcct: '1010', creditAcct: '4010', amount: 100 }), entry({ debitAcct: '1010', creditAcct: '4010', amount: 50, status: 'void' }, 1)];
    expect(balanceOf('1010', 'asset', gl)).toBe(100);
    expect(balanceOf('4010', 'income', gl)).toBe(100);
    expect(fundTotals('operating', coa, gl).assets).toBe(100);
  });

  it('each fund balances for any set of entries, transfers included', () => {
    const next = rng(7);
    const gl: GLEntry[] = [];
    for (let i = 0; i < 400; i++) {
      const d = nums[Math.floor(next() * nums.length)];
      let c = nums[Math.floor(next() * nums.length)];
      if (c === d) c = nums[(nums.indexOf(d) + 1) % nums.length];
      gl.push(entry({ debitAcct: d, creditAcct: c, amount: Math.round(next() * 500000) / 100, date: `2026-${String(1 + Math.floor(next() * 12)).padStart(2, '0')}-10`, status: next() < 0.1 ? 'void' : 'posted' }, i));
    }
    for (const fund of ['operating', 'reserve'] as const) {
      const t = fundTotals(fund, coa, gl);
      expect(Math.abs(t.assets - t.liabilities - t.fundBalance)).toBeLessThan(0.011);
    }
    const s = fundStatements(coa, gl, '2026-01-01', '2026-12-31');
    expect(s.operating.ties && s.reserve.ties).toBe(true);
    // Transfers net to zero across the two funds.
    expect(Math.abs(s.operating.transfersIn + s.reserve.transfersIn)).toBeLessThan(0.011);
    // The combined fund balance equals combined assets less liabilities.
    expect(Math.abs(s.total.assets - s.total.liabilities - s.total.fundBalance)).toBeLessThan(0.011);
  });

  it('shows a reserve transfer as money leaving operating and arriving in reserve', () => {
    const gl = [
      entry({ debitAcct: '1010', creditAcct: '3010', amount: 10000, date: '2025-12-31' }),
      entry({ debitAcct: '1110', creditAcct: '4010', amount: 4000, date: '2026-01-01' }, 1),
      entry({ debitAcct: '1010', creditAcct: '1110', amount: 4000, date: '2026-01-05' }, 2),
      entry({ debitAcct: '5020', creditAcct: '1010', amount: 1500, date: '2026-01-20' }, 3),
      entry({ debitAcct: '1020', creditAcct: '1010', amount: 1000, date: '2026-01-31', source: 'transfer' }, 4),
    ];
    const op = fundStatement('operating', coa, gl, '2026-01-01', '2026-01-31');
    const rs = fundStatement('reserve', coa, gl, '2026-01-01', '2026-01-31');
    expect(op.openingBalance).toBe(10000);
    expect(op.period).toEqual({ revenue: 4000, expenses: 1500, transfersIn: -1000, net: 1500 });
    expect(op.fundBalance).toBe(11500);
    expect(op.assets).toBe(11500);
    expect(rs.openingBalance).toBe(0);
    expect(rs.period.transfersIn).toBe(1000);
    expect(rs.fundBalance).toBe(1000);
    expect(rs.assets).toBe(1000);
    expect(op.ties && rs.ties).toBe(true);
  });

  it('respects the fiscal year end', () => {
    expect(fiscalYearStart('2026-11-08')).toBe('2026-01-01');
    expect(fiscalYearStart('2026-11-08', '06-30')).toBe('2026-07-01');
    expect(fiscalYearStart('2026-03-08', '06-30')).toBe('2025-07-01');
    expect(fiscalYearStart('2026-03-08', 'bad')).toBe('2026-01-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(priorMonthEnd('2026-03-01')).toBe('2026-02-28');
  });

  it('locks dates on or before the close and mirrors an entry for a reversal', () => {
    expect(isLocked('2026-01-31', '2026-01-31')).toBe(true);
    expect(isLocked('2026-02-01', '2026-01-31')).toBe(false);
    expect(isLocked('2026-02-01', null)).toBe(false);
    const e = entry({ debitAcct: '5010', creditAcct: '1010', amount: 300, source: 'expense', sourceId: 'INV-1' });
    const r = reversalOf(e, '2026-04-01', 'Duplicate bill');
    expect(r).toMatchObject({ debitAcct: '1010', creditAcct: '5010', amount: 300, date: '2026-04-01', source: 'expense', sourceId: 'GL1000' });
    expect(r.memo).toBe('Reversal of GL1000 · Duplicate bill');
  });
});
