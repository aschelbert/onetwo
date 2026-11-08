import { beforeEach, describe, expect, it } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { seedBudgetCategories, seedChartOfAccounts } from '@/data/financial';

beforeEach(() => {
  useFinancialStore.setState({
    tenantId: null,
    chartOfAccounts: [...seedChartOfAccounts],
    acctStatus: Object.fromEntries(seedChartOfAccounts.map(a => [a.num, true])),
    generalLedger: [],
    glNextId: 1000,
    units: [],
    unitInvoices: [],
    workOrders: [],
    budgetCategories: seedBudgetCategories.map(c => ({ ...c, expenses: [] })),
    closedThrough: null,
  });
});

const st = () => useFinancialStore.getState();

describe('vendor bills on accrual', () => {
  it('receiving the invoice books the expense and the payable; paying clears the payable from the bank', () => {
    st().createWorkOrder({ title: 'Boiler service', vendor: 'Heating Co', amount: 2400, acctNum: '5010' });
    const wo = st().workOrders[st().workOrders.length - 1];
    st().approveWorkOrder(wo.id);
    st().receiveInvoice(wo.id, 'H-1', 2450, '2026-10-28');
    let w = st().workOrders.find(x => x.id === wo.id)!;
    expect(w).toMatchObject({ status: 'invoiced', amount: 2450, invoiceDate: '2026-10-28' });
    expect(w.accrualGlEntryId).toBeTruthy();
    expect(st().generalLedger[st().generalLedger.length - 1]).toMatchObject({ date: '2026-10-28', debitAcct: '5010', creditAcct: '2010', amount: 2450, source: 'expense', sourceId: 'H-1' });
    expect(st().acctBalance('2010')).toBe(2450);
    expect(st().acctBalance('5010')).toBe(2450);
    expect(st().getBalanceSheet().liabilities.payable).toBe(2450);

    st().payWorkOrder(wo.id, '2026-11-05');
    w = st().workOrders.find(x => x.id === wo.id)!;
    expect(w).toMatchObject({ status: 'paid', paidDate: '2026-11-05' });
    expect(st().generalLedger[st().generalLedger.length - 1]).toMatchObject({ debitAcct: '2010', creditAcct: '1010', amount: 2450 });
    expect(st().acctBalance('2010')).toBe(0);
    expect(st().acctBalance('5010')).toBe(2450);
    expect(st().acctBalance('1010')).toBe(-2450);
    const bs = st().getBalanceSheet();
    expect(bs.assets.total).toBeCloseTo(bs.liabilities.total + bs.equity.total, 2);
  });

  it('a bill invoiced before accrual is paid the old way: expense and bank in one entry', () => {
    useFinancialStore.setState({ workOrders: [{ id: 'WO-9', title: 'Old bill', vendor: 'V', description: '', acctNum: '5030', amount: 300, status: 'invoiced', caseId: null, createdDate: '2026-09-01', approvedDate: '2026-09-02', invoiceNum: 'X', invoiceDate: '2026-09-10', paidDate: null, glEntryId: null, attachments: [] }] });
    st().payWorkOrder('WO-9', '2026-09-20');
    expect(st().generalLedger).toHaveLength(1);
    expect(st().generalLedger[0]).toMatchObject({ debitAcct: '5030', creditAcct: '1010', amount: 300 });
  });

  it('a reserve bill is paid from the reserve bank account', () => {
    st().createWorkOrder({ title: 'Roof section', vendor: 'Apex', amount: 20000, acctNum: '6010' });
    const wo = st().workOrders[st().workOrders.length - 1];
    st().approveWorkOrder(wo.id);
    st().receiveInvoice(wo.id, 'R-1', 20000);
    st().payWorkOrder(wo.id);
    expect(st().generalLedger[st().generalLedger.length - 1]).toMatchObject({ debitAcct: '2010', creditAcct: '1020', amount: 20000 });
    expect(st().getBalanceSheet().equity.reserveFund).toBe(-20000);
  });

  it('an invoice dated in a closed month is booked today instead', () => {
    st().createWorkOrder({ title: 'Snow', vendor: 'Plow', amount: 900, acctNum: '5030' });
    const wo = st().workOrders[st().workOrders.length - 1];
    st().approveWorkOrder(wo.id);
    st().closeBooksThrough('2026-01-31', '2026-03-01');
    st().receiveInvoice(wo.id, 'S-1', 900, '2026-01-20');
    const e = st().generalLedger[st().generalLedger.length - 1];
    expect(e.date).not.toBe('2026-01-20');
    expect(st().canPostOn(e.date)).toBe(true);
  });
});

describe('budget variance', () => {
  it('counts this fiscal year only, following the building\'s fiscal year end', () => {
    const today = new Date().toISOString().slice(0, 10);
    const year = today.slice(0, 4);
    st().glPost(`${Number(year) - 1}-06-15`, 'Last year', '5020', '1010', 5000, 'expense', null);
    st().glPost(`${year}-01-10`, 'This year', '5020', '1010', 700, 'expense', null);
    const util = () => st().getBudgetVariance().find((v: { name: string }) => v.name === 'Utilities');
    expect(util().actual).toBe(700);
    // A fiscal year ending June 30 puts a January entry in the year that started last July.
    useBuildingStore.setState({ details: { ...useBuildingStore.getState().details, fiscalYearEnd: '06-30' } });
    const fyStartsLastJuly = today.slice(5) < '07-01';
    expect(util().actual).toBe(fyStartsLastJuly ? 700 : 0);
    useBuildingStore.setState({ details: { ...useBuildingStore.getState().details, fiscalYearEnd: '12-31' } });
  });
});
