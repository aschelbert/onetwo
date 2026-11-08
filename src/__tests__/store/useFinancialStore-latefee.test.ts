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
    units: seedUnits.map(u => ({ ...u, balance: 0, lateFees: [], specialAssessments: [], payments: [] })),
    unitInvoices: [],
    closedThrough: null,
  });
});

const st = () => useFinancialStore.getState();
const unitOf = (n: string) => st().units.find(u => u.number === n)!;

describe('imposeLateFee', () => {
  const unitNum = seedUnits[0].number;

  it('posts one entry: debit 1130, credit 4030', () => {
    st().imposeLateFee(unitNum, 25, 'Late payment');
    const gl = st().generalLedger;
    expect(gl).toHaveLength(1);
    expect(gl[0].debitAcct).toBe('1130');
    expect(gl[0].creditAcct).toBe('4030');
    expect(gl[0].amount).toBe(25);
  });

  it('is one invoice and one fee line that name each other, and is in the balance', () => {
    const inv = st().imposeLateFee(unitNum, 25, 'Late payment');
    expect(inv).toMatchObject({ type: 'fee', amount: 25, status: 'sent' });
    const fees = unitOf(unitNum).lateFees;
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ amount: 25, reason: 'Late payment', waived: false, invoiceId: inv.id });
    expect(unitOf(unitNum).balance).toBe(25);
  });

  it('two fees charged by hand are two charges; the billing run, not this call, guards against duplicates', () => {
    st().imposeLateFee(unitNum, 25, 'Late payment');
    st().imposeLateFee(unitNum, 25, 'Late payment');
    expect(unitOf(unitNum).lateFees).toHaveLength(2);
    expect(st().generalLedger).toHaveLength(2);
    expect(unitOf(unitNum).balance).toBe(50);
  });

  it('a payment settles the fee and marks the fee line paid', () => {
    st().imposeLateFee(unitNum, 25, 'Late payment');
    st().recordUnitPayment(unitNum, 25, 'check');
    expect(unitOf(unitNum).lateFees[0].paid).toBe(true);
    expect(unitOf(unitNum).balance).toBe(0);
    expect(st().acctBalance('1130')).toBe(0);
  });
});

describe('waiveLateFee', () => {
  const unitNum = seedUnits[0].number;

  it('voids the fee invoice and reverses income and receivable', () => {
    const inv = st().imposeLateFee(unitNum, 25, 'Late payment');
    st().waiveLateFee(unitNum, 0, 'First offence');
    expect(st().unitInvoices.find(i => i.id === inv.id)!.status).toBe('void');
    expect(unitOf(unitNum).lateFees[0].waived).toBe(true);
    expect(unitOf(unitNum).balance).toBe(0);
    expect(st().generalLedger[st().generalLedger.length - 1]).toMatchObject({ debitAcct: '4030', creditAcct: '1130', amount: 25 });
    expect(st().acctBalance('4030')).toBe(0);
    expect(st().acctBalance('1130')).toBe(0);
  });

  it('a fee from before the register (no invoice) is reversed in the ledger and marked waived', () => {
    useFinancialStore.setState({
      units: st().units.map(u => (u.number === unitNum ? { ...u, lateFees: [{ date: '2026-01-06', amount: 40, reason: 'old', waived: false }] } : u)),
      generalLedger: [{ id: 'GL1', date: '2026-01-06', memo: 'Late fee assessed', debitAcct: '1130', creditAcct: '4030', amount: 40, source: 'fee', sourceId: unitNum, posted: '', status: 'posted' }],
    });
    st().waiveLateFee(unitNum, 0);
    expect(unitOf(unitNum).lateFees[0].waived).toBe(true);
    expect(st().acctBalance('1130')).toBe(0);
    expect(st().acctBalance('4030')).toBe(0);
    expect(unitOf(unitNum).balance).toBe(0);
  });

  it('a paid fee cannot be waived; nothing changes', () => {
    const inv = st().imposeLateFee(unitNum, 25, 'Late payment');
    st().payUnitInvoice(inv.id, 'check');
    const before = st().generalLedger.length;
    st().waiveLateFee(unitNum, 0);
    expect(st().generalLedger.length).toBe(before);
    expect(unitOf(unitNum).lateFees[0].waived).toBe(false);
  });
});
