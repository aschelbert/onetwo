import { beforeEach, describe, expect, it } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { seedChartOfAccounts, seedUnits } from '@/data/financial';

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
    closedThrough: null,
  });
});

const st = () => useFinancialStore.getState();

describe('posting engine', () => {
  it('the balance sheet ties: assets equal liabilities plus fund balances after ordinary activity', () => {
    st().glPost('2025-12-31', 'Opening operating', '1010', '3010', 20000, 'manual', null);
    st().glPost('2025-12-31', 'Opening reserve', '1020', '3020', 50000, 'transfer', null);
    st().glPost('2026-01-01', 'Dues', '1110', '4010', 5000, 'assessment', '101');
    st().glPost('2026-01-05', 'Payment', '1010', '1110', 4500, 'payment', '101');
    st().glPost('2026-01-10', 'Bill received', '5020', '2010', 1200, 'expense', 'INV-9');
    st().glPost('2026-01-20', 'Bill paid', '2010', '1010', 700, 'expense', 'INV-9');
    st().glPost('2026-01-31', 'To reserves', '1020', '1010', 1000, 'transfer', null);
    const bs = st().getBalanceSheet();
    expect(bs.assets.total).toBeCloseTo(bs.liabilities.total + bs.equity.total, 2);
    expect(bs.equity.operatingFund).toBe(20000 + 5000 - 1200 - 1000);
    expect(bs.equity.reserveFund).toBe(51000);
    expect(bs.equity.resultToDate).toBe(3800);
    expect(bs.funds.operating.transfersIn).toBe(-1000);
    expect(bs.funds.reserve.transfersIn).toBe(1000);
  });

  it('a void entry drops out of every balance and report', () => {
    const e = st().glPost('2026-01-01', 'Dues', '1110', '4010', 5000, 'assessment', '101');
    expect(st().acctBalance('4010')).toBe(5000);
    expect(st().voidEntry(e.id, 'posted twice')).toBe(true);
    expect(st().acctBalance('4010')).toBe(0);
    expect(st().getIncomeStatement('2026-01-01', '2026-12-31').totalIncome).toBe(0);
    expect(st().getBalanceSheet().assets.assessmentsAR).toBe(0);
  });

  it('closing the books locks earlier dates; corrections post as reversals dated today', () => {
    const e = st().glPost('2026-01-15', 'Snow', '5030', '1010', 900, 'expense', 'INV-2');
    st().closeBooksThrough('2026-01-31', '2026-03-10');
    expect(st().canPostOn('2026-01-31')).toBe(false);
    expect(st().canPostOn('2026-02-01')).toBe(true);
    expect(() => st().glPost('2026-01-20', 'Late', '5030', '1010', 1, 'manual', null)).toThrow(/closed through 2026-01-31/);
    expect(st().voidEntry(e.id)).toBe(false);
    const r = st().reverseEntry(e.id, 'Charged to the wrong line', '2026-03-10');
    expect(r).toMatchObject({ date: '2026-03-10', debitAcct: '1010', creditAcct: '5030', amount: 900, sourceId: e.id });
    expect(st().acctBalance('5030')).toBe(0);
    // A second reversal of the same entry is refused.
    expect(st().reverseEntry(e.id, 'again', '2026-03-10')).toBeNull();
    // Reopening lets the month be posted to again.
    st().closeBooksThrough(null);
    expect(st().canPostOn('2026-01-20')).toBe(true);
    expect(() => st().closeBooksThrough('2026-03-10', '2026-03-10')).toThrow();
  });

  it('a reversal in an open month keeps the original date', () => {
    const e = st().glPost('2026-02-02', 'Dup', '5010', '1010', 120, 'expense', null);
    const r = st().reverseEntry(e.id, 'Duplicate', '2026-02-20');
    expect(r?.date).toBe('2026-02-02');
  });

  it('fund statements follow the fiscal year and tie', () => {
    st().glPost('2025-12-31', 'Opening operating', '1010', '3010', 20000, 'manual', null);
    st().glPost('2026-02-01', 'Dues', '1010', '4010', 5000, 'assessment', null);
    const s = st().getFundStatements('2026-01-01', '2026-02-28');
    expect(s.operating.openingBalance).toBe(20000);
    expect(s.operating.period.revenue).toBe(5000);
    expect(s.operating.fundBalance).toBe(25000);
    expect(s.total.ties).toBe(true);
  });

  it('an account can be moved to the other fund', () => {
    st().glPost('2026-01-01', 'Interest', '1020', '4040', 10, 'manual', null);
    expect(st().getBalanceSheet().equity.reserveFund).toBe(10);
    // Interest income moved to operating while the cash stays in the reserve bank: operating earns it and transfers it over.
    st().setAcctFund('4040', 'operating');
    let bs = st().getBalanceSheet();
    expect(bs.equity.reserveFund).toBe(10);
    expect(bs.equity.operatingFund).toBe(0);
    expect(bs.funds.operating.transfersIn).toBe(-10);
    expect(bs.assets.total).toBeCloseTo(bs.liabilities.total + bs.equity.total, 2);
    // Both the income and the bank account in operating: the reserve fund has nothing.
    st().setAcctFund('1020', 'operating');
    bs = st().getBalanceSheet();
    expect(bs.equity.reserveFund).toBe(0);
    expect(bs.equity.operatingFund).toBe(10);
    expect(bs.assets.total).toBeCloseTo(bs.liabilities.total + bs.equity.total, 2);
  });
});
