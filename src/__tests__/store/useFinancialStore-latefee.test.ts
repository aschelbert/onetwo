import { describe, it, expect, beforeEach } from 'vitest';
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
  });
});

describe('imposeLateFee', () => {
  const unitNum = seedUnits[0].number;

  it('posts GL entry: debit 1130, credit 4030', () => {
    useFinancialStore.getState().imposeLateFee(unitNum, 25, 'Late payment');
    const gl = useFinancialStore.getState().generalLedger;
    expect(gl).toHaveLength(1);
    expect(gl[0].debitAcct).toBe('1130');
    expect(gl[0].creditAcct).toBe('4030');
    expect(gl[0].amount).toBe(25);
  });

  it('adds to unit lateFees array', () => {
    const before = useFinancialStore.getState().units.find(u => u.number === unitNum)!.lateFees.length;
    useFinancialStore.getState().imposeLateFee(unitNum, 25, 'Late payment');
    const after = useFinancialStore.getState().units.find(u => u.number === unitNum)!.lateFees;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].amount).toBe(25);
    expect(after[after.length - 1].reason).toBe('Late payment');
    expect(after[after.length - 1].waived).toBe(false);
  });

  it('BUG #4: calling twice creates duplicate fees (no guard)', () => {
    useFinancialStore.getState().imposeLateFee(unitNum, 25, 'Late payment');
    useFinancialStore.getState().imposeLateFee(unitNum, 25, 'Late payment');
    const fees = useFinancialStore.getState().units.find(u => u.number === unitNum)!.lateFees;
    // This documents the bug: duplicate fees are created
    expect(fees.filter(f => f.reason === 'Late payment')).toHaveLength(2);
    expect(useFinancialStore.getState().generalLedger).toHaveLength(2);
  });
});
