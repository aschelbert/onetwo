/**
 * A building with no chart of accounts in the database gets the default one
 * when it loads, and the default is written back so every screen can name
 * its accounts. A building that already has accounts is left alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { defaultChartOfAccounts } from '@/data/financial';
import * as financialSvc from '@/lib/services/financial';
import type { ChartOfAccountsEntry } from '@/types/financial';

vi.mock('@/lib/services/financial', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/financial')>()),
  fetchAllFinancialData: vi.fn(),
  upsertCoAEntries: vi.fn(async () => true),
}));
vi.mock('@/lib/services/unitManager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/unitManager')>()),
  fetchUnitDocuments: vi.fn(async () => null),
  fetchMoveEvents: vi.fn(async () => null),
}));

const TENANT = '00000000-0000-4000-8000-000000000001';
const dbData = (chartOfAccounts: ChartOfAccountsEntry[] | null) => ({
  units: null, budgetCategories: null, reserveItems: null, chartOfAccounts, generalLedger: null, workOrders: null, unitInvoices: null, settings: null,
});
const header = (num: string, name: string, type: ChartOfAccountsEntry['type']): ChartOfAccountsEntry => ({ num, name, type, sub: 'header', parent: null });

beforeEach(() => {
  vi.mocked(financialSvc.upsertCoAEntries).mockClear();
  useFinancialStore.setState({ tenantId: null, chartOfAccounts: [], acctStatus: {} });
});

describe('loading a building with no chart', () => {
  it('uses the default chart and writes it to the database', async () => {
    vi.mocked(financialSvc.fetchAllFinancialData).mockResolvedValue(dbData([]) as never);
    await useFinancialStore.getState().loadFromDb(TENANT);
    const chart = useFinancialStore.getState().chartOfAccounts;
    expect(chart.length).toBe(defaultChartOfAccounts.length);
    expect(chart.filter(a => !a.parent).map(a => a.num)).toEqual(['1000', '2000', '3000', '4000', '5000', '6000']);
    expect(chart.find(a => a.num === '1010')?.name).toBe('Operating Checking');
    // No links to the sample building's budget categories or reserve items.
    expect(chart.some(a => a.budgetCat || a.reserveItem)).toBe(false);
    expect(financialSvc.upsertCoAEntries).toHaveBeenCalledTimes(1);
    expect(vi.mocked(financialSvc.upsertCoAEntries).mock.calls[0][0]).toBe(TENANT);
    expect(vi.mocked(financialSvc.upsertCoAEntries).mock.calls[0][1].length).toBe(defaultChartOfAccounts.length);
    expect(useFinancialStore.getState().acctStatus['4010']).toBe(true);
  });

  it('keeps a section the board added and fills in the rest', async () => {
    vi.mocked(financialSvc.fetchAllFinancialData).mockResolvedValue(dbData([header('4000', 'Our income', 'income')]) as never);
    await useFinancialStore.getState().loadFromDb(TENANT);
    const chart = useFinancialStore.getState().chartOfAccounts;
    expect(chart.find(a => a.num === '4000')?.name).toBe('Our income');
    expect(chart.length).toBe(defaultChartOfAccounts.length);
    const written = vi.mocked(financialSvc.upsertCoAEntries).mock.calls[0][1];
    expect(written.length).toBe(defaultChartOfAccounts.length - 1);
    expect(written.some(a => a.num === '4000')).toBe(false);
  });
});

describe('loading a building that has a chart', () => {
  it('takes the database chart as it is and writes nothing', async () => {
    const own: ChartOfAccountsEntry[] = [header('1000', 'Assets', 'asset'), { num: '1010', name: 'Main checking', type: 'asset', sub: 'bank', parent: '1000' }];
    vi.mocked(financialSvc.fetchAllFinancialData).mockResolvedValue(dbData(own) as never);
    await useFinancialStore.getState().loadFromDb(TENANT);
    expect(useFinancialStore.getState().chartOfAccounts).toEqual(own);
    expect(financialSvc.upsertCoAEntries).not.toHaveBeenCalled();
  });

  it('leaves the chart alone when the database could not be read', async () => {
    useFinancialStore.setState({ chartOfAccounts: [header('1000', 'Assets', 'asset')] });
    vi.mocked(financialSvc.fetchAllFinancialData).mockResolvedValue(dbData(null) as never);
    await useFinancialStore.getState().loadFromDb(TENANT);
    expect(useFinancialStore.getState().chartOfAccounts.length).toBe(1);
    expect(financialSvc.upsertCoAEntries).not.toHaveBeenCalled();
  });
});
