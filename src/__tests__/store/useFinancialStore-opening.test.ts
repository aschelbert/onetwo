import { beforeEach, describe, expect, it } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { seedChartOfAccounts } from '@/data/financial';
import { readSheet } from '@/features/setup/importSpreadsheet';
import type { Unit } from '@/types/financial';

const unit = (number: string, monthlyFee: number, balance = 0): Unit => ({
  number, owner: `Owner ${number}`, email: '', phone: '', monthlyFee, votingPct: 25, status: 'ACTIVE', balance, moveIn: null, sqft: 0, bedrooms: 0, parking: null,
  payments: [], lateFees: [], specialAssessments: [],
});

beforeEach(() => {
  useFinancialStore.setState({
    tenantId: null,
    chartOfAccounts: [...seedChartOfAccounts],
    acctStatus: Object.fromEntries(seedChartOfAccounts.map(a => [a.num, true])),
    generalLedger: [],
    glNextId: 1000,
    units: [unit('1A', 450, 900), unit('1B', 475), unit('2A', 500), unit('2B', 500)],
    unitInvoices: [],
    workOrders: [],
    closedThrough: null,
    autoBillingEnabled: false,
    lateFeeEnabled: false,
  });
});

const st = () => useFinancialStore.getState();
const unitOf = (n: string) => st().units.find(u => u.number === n)!;
const TODAY = '2026-11-08';
const input = {
  asOf: '2026-10-31',
  operatingCash: 42300,
  reserveCash: 180000,
  units: [{ number: '1A', amount: 900 }, { number: '1B', amount: -475 }, { number: '2A', amount: 0 }],
  bills: [{ vendor: 'Heating Co', description: 'October boiler service', amount: 1250, acctNum: '5010', invoiceNum: 'H-77' }],
};

describe('opening balances', () => {
  it('posts the state of the books as of the cutover, with the statements tying, and closes the books through it', () => {
    const r = st().postOpeningBalances(input, TODAY);
    expect(r).toMatchObject({ asOf: '2026-10-31', operatingCash: 42300, reserveCash: 180000, owed: 900, prepaid: 475, billsTotal: 1250, operatingFund: 42300 + 900 - 475 - 1250, reserveFund: 180000, paymentsApplied: false });
    expect(r.units).toEqual({ '1A': 900, '1B': -475 });
    expect(st().closedThrough).toBe('2026-10-31');
    expect(st().generalLedger.every(e => e.date === '2026-10-31')).toBe(true);

    const bs = st().getBalanceSheet();
    expect(bs.assets.operating).toBe(42300);
    expect(bs.assets.reserves).toBe(180000);
    expect(bs.assets.assessmentsAR).toBe(900);
    expect(bs.liabilities.prepaidAssessments).toBe(475);
    expect(bs.liabilities.payable).toBe(1250);
    expect(bs.equity.operatingFund).toBe(42300 + 900 - 475 - 1250);
    expect(bs.equity.reserveFund).toBe(180000);
    expect(bs.assets.total).toBeCloseTo(bs.liabilities.total + bs.equity.total, 2);
    // Nothing of this is income or expense: it is the position on the cutover.
    expect(st().getIncomeStatement('2026-01-01', '2026-12-31').totalIncome).toBe(0);
    expect(st().getIncomeStatement('2026-01-01', '2026-12-31').totalExpenses).toBe(0);
  });

  it('each unit carries its balance: one charge for an owner behind, a credit for one paid ahead, zero for one declared current', () => {
    st().postOpeningBalances(input, TODAY);
    expect(unitOf('1A').balance).toBe(900);
    const inv = st().unitInvoices.find(i => i.unitNumber === '1A')!;
    expect(inv).toMatchObject({ type: 'monthly', amount: 900, status: 'sent', dueDate: '2026-10-31', glEntryId: null, forInvoiceId: 'opening' });
    expect(unitOf('1B').balance).toBe(-475);
    expect(unitOf('2A').balance).toBe(0);
    expect(unitOf('2B').balance).toBe(0); // left out of the list: unchanged
    // The first payment from 1A settles the opening charge; a new dues invoice for 1B is paid by the credit.
    st().recordUnitPayment('1A', 900, 'check', { date: '2026-11-05' });
    expect(st().unitInvoices.find(i => i.id === inv.id)!.status).toBe('paid');
    expect(st().acctBalance('1110')).toBe(0);
    st().createUnitInvoice('1B', 'monthly', 475, 'Dues · November 2026', undefined, '2026-11-15', { date: '2026-11-01' });
    expect(unitOf('1B').balance).toBe(0);
    expect(st().acctBalance('2020')).toBe(0);
  });

  it('an opening bill sits under bills to pay and paying it clears the payable without touching this year\'s expenses', () => {
    st().postOpeningBalances(input, TODAY);
    const bill = st().workOrders.find(w => w.id === 'OB-1')!;
    expect(bill).toMatchObject({ status: 'invoiced', vendor: 'Heating Co', amount: 1250, acctNum: '5010', invoiceNum: 'H-77', invoiceDate: '2026-10-31' });
    expect(bill.accrualGlEntryId).toBeTruthy();
    st().payWorkOrder('OB-1', '2026-11-06');
    expect(st().acctBalance('2010')).toBe(0);
    expect(st().acctBalance('5010')).toBe(0);
    expect(st().acctBalance('1010')).toBe(42300 - 1250);
  });

  it('re-entering replaces the earlier lines and balances instead of adding to them', () => {
    st().postOpeningBalances(input, TODAY);
    const r = st().postOpeningBalances({ ...input, operatingCash: 40000, units: [{ number: '1A', amount: 450 }, { number: '1B', amount: 0 }], bills: [] }, TODAY);
    expect(r).toMatchObject({ operatingCash: 40000, owed: 450, prepaid: 0, billsTotal: 0 });
    expect(unitOf('1A').balance).toBe(450);
    expect(unitOf('1B').balance).toBe(0);
    expect(st().unitInvoices.filter(i => i.status !== 'void')).toHaveLength(1);
    expect(st().workOrders.filter(w => w.status === 'invoiced')).toHaveLength(0);
    expect(st().acctBalance('1010')).toBe(40000);
    expect(st().acctBalance('2010')).toBe(0);
    expect(st().acctBalance('2020')).toBe(0);
    const bs = st().getBalanceSheet();
    expect(bs.assets.total).toBeCloseTo(bs.liabilities.total + bs.equity.total, 2);
  });

  it('refuses a cutover on or after today, a later close, or a re-entry after payments were applied', () => {
    expect(() => st().postOpeningBalances({ ...input, asOf: TODAY }, TODAY)).toThrow(/before today/);
    st().postOpeningBalances(input, TODAY);
    st().closeBooksThrough('2026-11-07', TODAY);
    expect(() => st().postOpeningBalances(input, TODAY)).toThrow(/closed through 2026-11-07/);
    st().closeBooksThrough('2026-10-31', TODAY);
    st().recordUnitPayment('1A', 100, 'check', { date: '2026-11-05' });
    expect(st().openingBalances().paymentsApplied).toBe(true);
    expect(() => st().postOpeningBalances(input, TODAY)).toThrow(/payment was already applied/);
    // A failed attempt leaves the lock where it was.
    expect(st().closedThrough).toBe('2026-10-31');
  });
});

describe('owner list with a balance column', () => {
  it('reads what each owner owes, credits in parentheses or marked CR', () => {
    const r = readSheet([
      ['Unit', 'Owner', 'Monthly Dues', 'Balance Due'],
      ['1A', 'Ana Rivera', '$450.00', '$900.00'],
      ['1B', 'Sam Park', '475', '(475.00)'],
      ['2A', 'Lee Chen', '500', '120 CR'],
      ['2B', 'Vacant', '500', ''],
      ['Total', '', '1925', '545'],
    ], 'owners.csv');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.units.map(u => [u.unit, u.monthlyFee, u.openingBalance])).toEqual([['1A', 450, 900], ['1B', 475, -475], ['2A', 500, -120], ['2B', 500, null]]);
  });
});
