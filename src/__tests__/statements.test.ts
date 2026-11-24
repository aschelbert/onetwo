import { describe, it, expect } from 'vitest';
import { cashFlow, operatingStatement, periodDates, trialBalance, wantsReason } from '@/lib/statements';
import type { ChartOfAccountsEntry, GLEntry } from '@/types/financial';

const coa: ChartOfAccountsEntry[] = [
  { num: '1000', name: 'Assets', type: 'asset', sub: 'header', parent: null },
  { num: '1010', name: 'Operating Checking', type: 'asset', sub: 'bank', parent: '1000' },
  { num: '1020', name: 'Reserve Savings', type: 'asset', sub: 'bank', parent: '1000' },
  { num: '1110', name: 'Assessments Receivable', type: 'asset', sub: 'receivable', parent: '1000' },
  { num: '1190', name: 'Allowance for Doubtful Accounts', type: 'asset', sub: 'receivable', parent: '1000' },
  { num: '2010', name: 'Accounts Payable', type: 'liability', sub: 'payable', parent: null },
  { num: '2500', name: 'Loan Payable', type: 'liability', sub: 'loan', parent: null },
  { num: '4010', name: 'Regular Assessments', type: 'income', sub: 'assessment', parent: null },
  { num: '4040', name: 'Interest Income', type: 'income', sub: 'interest', parent: null },
  { num: '5020', name: 'Utilities', type: 'expense', sub: 'operating', parent: null },
  { num: '5010', name: 'Maintenance & Repairs', type: 'expense', sub: 'operating', parent: null },
  { num: '5300', name: 'Bad Debt Expense', type: 'expense', sub: 'operating', parent: null },
  { num: '6010', name: 'Roof Replacement', type: 'expense', sub: 'reserve', parent: null },
];
let n = 0;
const e = (date: string, debitAcct: string, creditAcct: string, amount: number, status: GLEntry['status'] = 'posted'): GLEntry => ({ id: `g${n++}`, date, memo: '', debitAcct, creditAcct, amount, source: 'manual', sourceId: null, posted: date, status });
const gl: GLEntry[] = [
  e('2026-09-30', '1010', '4010', 50000),          // opening cash, before the period
  e('2026-10-01', '1110', '4010', 23000),          // dues billed
  e('2026-10-05', '1010', '1110', 21000),          // dues collected
  e('2026-10-10', '5020', '2010', 6940),           // utility bill received
  e('2026-10-12', '2010', '1010', 6940),           // and paid
  e('2026-10-15', '5010', '1010', 3150),           // repair paid
  e('2026-10-20', '1020', '1010', 6000),           // transfer to reserves
  e('2026-10-22', '6010', '1020', 4000),           // reserve spending
  e('2026-10-25', '1020', '4040', 60),             // interest on the reserve account
  e('2026-10-28', '5300', '1190', 500),            // allowance
  e('2026-10-29', '1010', '2500', 10000),          // loan drawn
  e('2026-10-30', '5010', '1010', 999, 'void'),    // voided, ignored
  e('2026-11-02', '5010', '1010', 700),            // after the period
];

describe('the operating statement', () => {
  const budget = (num: string) => ({ '5020': 4600, '5010': 3400 }[num] ?? null);
  const os = operatingStatement(coa, gl, '2026-10-01', '2026-10-31', budget);
  it('shows the operating fund only, with bad debt on its own line and net operating income before the transfer', () => {
    // Interest is the reserve fund's income in this chart, so it is not on the operating statement.
    expect(os.income.map(l => [l.name, l.amount])).toEqual([['Regular Assessments', 23000]]);
    expect(os.expenses.map(l => [l.name, l.amount, l.budget])).toEqual([['Utilities', 6940, 4600], ['Maintenance & Repairs', 3150, 3400]]);
    expect(os).toMatchObject({ totalIncome: 23000, badDebt: 500, totalExpenses: 10590, noi: 12410, toReserves: 6000, left: 6410, budgetExpenses: 8000 });
  });
  it('asks for a reason only when a line is more than 10% and $500 over', () => {
    expect(os.expenses.map(wantsReason)).toEqual([true, false]);
    expect(wantsReason({ amount: 5000, budget: 4600 })).toBe(false);
    expect(wantsReason({ amount: 900, budget: 300 })).toBe(true);
    expect(wantsReason({ amount: 9000, budget: null })).toBe(false);
  });
});

describe('the cash-flow statement', () => {
  it('sorts what moved through the bank accounts and ties to the balances', () => {
    const cf = cashFlow(coa, gl, '2026-10-01', '2026-10-31');
    expect(cf).toMatchObject({ start: 50000, fromOwners: 21000, otherReceipts: 60, toVendors: -10090, fromOperations: 10970, capital: -4000, loans: 10000, other: 0, end: 66970, operatingEnd: 64910, reserveEnd: 2060 });
    expect(cf.start + cf.fromOperations + cf.capital + cf.loans + cf.other).toBe(cf.end);
  });
});

describe('the trial balance', () => {
  it('lists every account with a balance, and its two columns agree', () => {
    const tb = trialBalance(coa, gl, '2026-10-31');
    expect(tb.balanced).toBe(true);
    expect(tb.debits).toBe(tb.credits);
    expect(tb.rows.find(r => r.num === '1010')).toMatchObject({ debit: 64910, credit: 0 });
    expect(tb.rows.find(r => r.num === '1190')).toMatchObject({ debit: 0, credit: 500 });
    expect(tb.rows.some(r => r.num === '1000' || r.num === '2010')).toBe(false);
  });
});

describe('periods', () => {
  it('gives last month, the year to date and the year before', () => {
    expect(periodDates('month', '2026-11-24', '2026-01-01')).toMatchObject({ from: '2026-10-01', to: '2026-10-31', label: 'October 2026' });
    expect(periodDates('month', '2026-01-10', '2026-01-01')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodDates('ytd', '2026-11-24', '2026-01-01')).toMatchObject({ from: '2026-01-01', to: '2026-11-24' });
    expect(periodDates('last-year', '2026-11-24', '2026-07-01')).toMatchObject({ from: '2025-07-01', to: '2026-06-30', yearShare: 1 });
  });
});
