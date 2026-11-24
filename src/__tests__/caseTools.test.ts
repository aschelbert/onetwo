import { describe, it, expect, beforeEach } from 'vitest';
import { agingBuckets, allowanceTarget, blankReconciliation, blankRebuildCheck, contributionLevels, met, outcomeLine, parseMoney, rebuildStanding, reconcile, signBlocker, spread, type Objective } from '@/lib/caseTools';
import { useFinancialStore, ALLOWANCE_ACCT, BAD_DEBT_ACCT, WRITTEN_OFF_MARK } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { balanceOf } from '@/lib/ledger';
import { toolsFor } from '@/ux2/boardroom/tools/CaseTools';
import { postWriteOff } from '@/ux2/boardroom/tools/MoneyTools';
import { readToolDoc, saveToolDoc } from '@/ux2/boardroom/tools/docs';

describe('bank reconciliation', () => {
  const rec = { ...blankReconciliation('1010', '2026-10'), bankBalance: 61204.18, outstanding: [{ id: 'a', what: 'Check 1160', amount: -310 }, { id: 'b', what: 'Checks not cashed', amount: -2594 }] };
  it('counts what the bank has not seen and shows what is left to explain', () => {
    expect(reconcile(rec, 58300.18)).toEqual({ adjustedBank: 58300.18, leftToExplain: 0 });
    expect(reconcile(rec, 57832.18).leftToExplain).toBe(468);
  });
  it('is signed by someone other than whoever prepared it, and only once it ties out', () => {
    expect(signBlocker(rec, 58300.18, 'Ann')).toBe('It has not been prepared yet');
    const prepared = { ...rec, preparedBy: 'Dana Carter', preparedOn: '2026-11-02' };
    expect(signBlocker(prepared, 58300.18, 'dana carter ')).toBe('Whoever prepared it cannot also sign it');
    expect(signBlocker(prepared, 57832.18, 'Ann')).toBe('There is still a difference to explain');
    expect(signBlocker(prepared, 58300.18, 'Ann')).toBe('');
  });
});

describe('allowance for dues that may not be collected', () => {
  it('ages what is owed and applies the share unlikely to come in', () => {
    const open = [
      { unitNumber: '101', dueDate: '2026-12-01', remaining: 450 },
      { unitNumber: '203', dueDate: '2026-09-01', remaining: 1050 },
      { unitNumber: '305', dueDate: '2026-03-01', remaining: 2000 },
      { unitNumber: '305', dueDate: '2026-04-01', remaining: 1150 },
      { unitNumber: '401', dueDate: '2026-01-01', remaining: 0 },
    ];
    const b = agingBuckets(open, '2026-12-31');
    expect(b.map(x => [x.owed, x.units])).toEqual([[450, 1], [1050, 1], [3150, 1]]);
    expect(allowanceTarget(b)).toBe(1680);
    expect(allowanceTarget(agingBuckets(open, '2026-12-31', { recent: 0, late: 10, old: 100 }))).toBe(3255);
  });
});

describe('insured for enough', () => {
  it('reads a limit out of the policy text', () => {
    expect(parseMoney('$14,000,000 blanket')).toBe(14000000);
    expect(parseMoney('$14M')).toBe(14000000);
    expect(parseMoney('')).toBe(0);
  });
  it('grows the appraisal for building costs and compares the limit with the floor', () => {
    const c = { ...blankRebuildCheck(14000000), appraisal: 16800000, appraisedOn: '2025-03-01' };
    const st = rebuildStanding(c, '2026-11-01');
    expect(st.rebuild).toBe(17900000);
    expect(st).toMatchObject({ insuredPct: 78, floor: 14320000, underFloor: true, monthsOld: 20 });
    expect(rebuildStanding({ ...c, limit: 17900000 }, '2026-11-01').underFloor).toBe(false);
  });
});

describe('objectives and the budget', () => {
  const o = (measure: Objective['measure'], target: number, result: number | null): Objective => ({ id: 'x', measure, text: 'T', target, result, note: '' });
  it('knows which way each measure runs', () => {
    expect(met(o('dues-increase', 4, 3))).toBe(true);
    expect(met(o('late-dues', 3, 6.1))).toBe(false);
    expect(met(o('reserve-funded', 55, 58))).toBe(true);
    expect(met(o('reserve-funded', 55, null))).toBeNull();
    expect(outcomeLine(o('late-dues', 3, 6.1))).toBe('T: 6.1%, target at most 3% · missed');
    expect(outcomeLine(o('utilities', 60000, 58200))).toBe('T: $58,200, target at most $60,000 · met');
  });
  it('spreads a line across twelve months that add up exactly', () => {
    expect(spread(60000)).toEqual(Array(12).fill(5000));
    const even = spread(10000);
    expect(even.reduce((t, n) => t + n, 0)).toBe(10000);
    expect(Math.max(...even) - Math.min(...even)).toBe(1);
    const seasonal = spread(12000, [3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3]);
    expect(seasonal.reduce((t, n) => t + n, 0)).toBe(12000);
    expect(seasonal[0]).toBe(2400);
    expect(seasonal[5]).toBe(0);
    // A line with nothing spent last year falls back to even.
    expect(spread(1200, Array(12).fill(0))).toEqual(Array(12).fill(100));
  });
  it('offers three reserve contribution levels', () => {
    const levels = contributionLevels([{ estimatedCost: 100000, currentFunding: 40000, yearsRemaining: 5 }, { estimatedCost: 50000, currentFunding: 50000, yearsRemaining: 3 }, { estimatedCost: 9000, currentFunding: 0, yearsRemaining: 1, isContingency: true }], 8000);
    expect(levels.map(l => l.amount)).toEqual([8000, 10000, 12000]);
  });
});

describe('write-off and allowance postings', () => {
  const fin = () => useFinancialStore.getState();
  const bal = (acct: string, type: 'asset' | 'expense' | 'income') => balanceOf(acct, type, fin().generalLedger);
  beforeEach(() => {
    const unit = { ...fin().units[0], number: '305', balance: 0, payments: [], lateFees: [], specialAssessments: [] };
    useFinancialStore.setState({ units: [unit], unitInvoices: [], generalLedger: [], closedThrough: null as never });
    useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
    useActionRecordsStore.setState({ records: [] });
  });

  it('the allowance moves to its target with one entry for the difference', () => {
    expect(fin().setAllowance(1680, '2026-12-31')).toBe(1680);
    expect(bal(BAD_DEBT_ACCT, 'expense')).toBe(1680);
    expect(bal(ALLOWANCE_ACCT, 'asset')).toBe(-1680);
    expect(fin().setAllowance(1200, '2026-12-31')).toBe(-480);
    expect(bal(BAD_DEBT_ACCT, 'expense')).toBe(1200);
    expect(fin().setAllowance(1200, '2026-12-31')).toBe(0);
    expect(fin().chartOfAccounts.find(a => a.num === ALLOWANCE_ACCT)?.type).toBe('asset');
    expect(fin().chartOfAccounts.find(a => a.num === BAD_DEBT_ACCT)?.type).toBe('expense');
  });

  it('a write-off keeps the income, clears the unit, and uses the allowance first', () => {
    fin().createUnitInvoice('305', 'monthly', 1500, 'Dues', undefined, '2026-03-01');
    fin().createUnitInvoice('305', 'monthly', 900, 'Dues', undefined, '2026-04-01');
    const income = bal('4010', 'income');
    expect(income).toBe(2400);
    fin().setAllowance(2000, '2026-12-31');
    expect(fin().writeOffUnit('305', 'Sold at foreclosure', '2027-01-10')).toBe(2400);
    expect(fin().units[0].balance).toBe(0);
    expect(bal('4010', 'income')).toBe(2400);
    expect(bal('1110', 'asset')).toBe(0);
    expect(bal(ALLOWANCE_ACCT, 'asset')).toBe(0);
    expect(bal(BAD_DEBT_ACCT, 'expense')).toBe(2400);
    expect(fin().unitInvoices.every(i => i.status === 'void' && i.refundReason?.startsWith(WRITTEN_OFF_MARK))).toBe(true);
    // Nothing left to write off a second time.
    expect(fin().writeOffUnit('305', 'again')).toBe(0);
  });

  it('posts only after a passed vote, once, and closes the collections action', () => {
    fin().createUnitInvoice('305', 'monthly', 2400, 'Dues', undefined, '2026-03-01');
    const caseId = useIssuesStore.getState().createCase({ catId: 'financial', sitId: 'runbook-collections', approach: 'pre', title: 'Collections · Unit 305', unit: '305', owner: '', priority: 'high', notes: '', source: 'runbook', sourceId: 'collections:305:inv1', customSteps: [{ s: 'Charge the late fee' }] });
    const w = { reason: 'Cannot be found', askedOn: '2026-12-01', askedBy: 'T', voteOn: '', inFavor: 0, against: 0, amount: 0, postedOn: '' };
    expect(postWriteOff('305', caseId, w)).toBe(0);
    expect(postWriteOff('305', caseId, { ...w, voteOn: '2026-12-09', inFavor: 2, against: 3 })).toBe(0);
    expect(fin().units[0].balance).toBe(2400);
    expect(postWriteOff('305', caseId, { ...w, voteOn: '2026-12-09', inFavor: 4, against: 1 })).toBe(2400);
    const c = useIssuesStore.getState().cases.find(x => x.id === caseId)!;
    expect(c.status).toBe('closed');
    expect(postWriteOff('305', caseId, { ...w, voteOn: '2026-12-09', inFavor: 4, against: 1, postedOn: '2026-12-09' })).toBe(0);
  });
});

describe('where the tools show', () => {
  it('finds the runbook and its key from the action', () => {
    expect(toolsFor({ source: 'runbook', sourceId: 'month-close:2026-10' })).toEqual({ runbook: 'month-close', parts: ['2026-10'] });
    expect(toolsFor({ source: 'runbook', sourceId: 'collections:305:inv9' })?.parts[0]).toBe('305');
    expect(toolsFor({ source: 'runbook', sourceId: 'elections:2026' })).toBeNull();
    expect(toolsFor({ source: 'manual' as never, sourceId: 'month-close:2026-10' })).toBeNull();
  });
  it('keeps one record per tool and key', () => {
    useActionRecordsStore.setState({ records: [] });
    saveToolDoc('reconciliation', '1010:2026-10', blankReconciliation('1010', '2026-10'), { bankBalance: 100 }, '2026-11-01');
    saveToolDoc('reconciliation', '1010:2026-10', blankReconciliation('1010', '2026-10'), { preparedBy: 'Dana' }, '2026-11-02');
    saveToolDoc('reconciliation', '1020:2026-10', blankReconciliation('1020', '2026-10'), { bankBalance: 5 }, '2026-11-02');
    expect(useActionRecordsStore.getState().records).toHaveLength(2);
    expect(readToolDoc('reconciliation', '1010:2026-10', blankReconciliation('1010', '2026-10'))).toMatchObject({ bankBalance: 100, preparedBy: 'Dana' });
  });
});

import { bankAmount, bankDate, bookLinesFor, matchStatement, parseBankCsv } from '@/lib/bankMatch';
import { closeBlocker } from '@/ux2/boardroom/tools/docs';

describe('matching a bank statement to the ledger', () => {
  it('reads dates and amounts the way banks write them', () => {
    expect(bankDate('10/5/2026')).toBe('2026-10-05');
    expect(bankDate('10/15/26')).toBe('2026-10-15');
    expect(bankDate('Pending')).toBe('');
    expect(bankAmount('$1,234.50')).toBe(1234.5);
    expect(bankAmount('(18.00)')).toBe(-18);
    expect(bankAmount('')).toBeNull();
  });
  it('reads a signed amount column, or separate money-out and money-in columns', () => {
    const one = parseBankCsv('Account 4471\nDate,Description,Amount,Balance\n10/15/2026,"SERVICE FEE, MONTHLY",-18.00,100\n10/22/2026,DEPOSIT,450.00,550\n,,,\n');
    expect(one.lines.map(l => [l.date, l.description, l.amount])).toEqual([['2026-10-15', 'SERVICE FEE, MONTHLY', -18], ['2026-10-22', 'DEPOSIT', 450]]);
    const two = parseBankCsv('Posting Date,Payee,Debit,Credit\n2026-10-03,Check 1158,310.00,\n2026-10-04,ACH IN,,475.00\n');
    expect(two.lines.map(l => l.amount)).toEqual([-310, 475]);
    expect(parseBankCsv('hello\nworld').problem).toContain('No heading row');
  });
  it('pairs each bank line with one ledger entry of the same amount, nearest in date', () => {
    const books = [
      { id: 'a', date: '2026-10-01', memo: 'Dues 101', amount: 450 }, { id: 'b', date: '2026-10-20', memo: 'Dues 102', amount: 450 },
      { id: 'c', date: '2026-08-12', memo: 'Check 1160', amount: -310 }, { id: 'd', date: '2026-10-28', memo: 'Check 1171', amount: -900 },
    ];
    const lines = [{ id: '1', date: '2026-10-21', description: 'DEPOSIT', amount: 450 }, { id: '2', date: '2026-10-02', description: 'DEPOSIT', amount: 450 }, { id: '3', date: '2026-10-15', description: 'FEE', amount: -18 }];
    const m = matchStatement(lines, books);
    expect(m.matched.map(x => [x.line.id, x.book.id])).toEqual([['2', 'a'], ['1', 'b']]);
    expect(m.bankOnly.map(l => l.id)).toEqual(['3']);
    // The August check is too old to pair by chance, and stays outstanding with the unpaid October one.
    expect(m.bookOnly.map(b => b.id)).toEqual(['c', 'd']);
  });
  it('signs ledger entries by which side of the bank account they are on', () => {
    const gl = [
      { id: 'x', date: '2026-10-02', memo: 'in', debitAcct: '1010', creditAcct: '1110', amount: 450, status: 'posted' },
      { id: 'y', date: '2026-10-03', memo: 'out', debitAcct: '2010', creditAcct: '1010', amount: 310, status: 'posted' },
      { id: 'z', date: '2026-11-03', memo: 'later', debitAcct: '1010', creditAcct: '1110', amount: 5, status: 'posted' },
      { id: 'v', date: '2026-10-03', memo: 'void', debitAcct: '1010', creditAcct: '1110', amount: 5, status: 'void' },
    ];
    expect(bookLinesFor('1010', gl, '2026-10-31').map(b => [b.id, b.amount])).toEqual([['x', 450], ['y', -310]]);
  });
});

describe('closing the books', () => {
  beforeEach(() => {
    useActionRecordsStore.setState({ records: [] });
    useFinancialStore.setState({ generalLedger: [{ id: 'g', date: '2026-10-05', memo: 'Dues', debitAcct: '1010', creditAcct: '1110', amount: 450, source: 'payment', sourceId: null, posted: '2026-10-05', status: 'posted' }] as never });
  });
  it('asks for nothing until the building reconciles, then for a signature on every account that moved', () => {
    expect(closeBlocker('2026-10-31')).toBe('');
    saveToolDoc('reconciliation', '1010:2026-10', blankReconciliation('1010', '2026-10'), { bankBalance: 450, preparedBy: 'Dana', preparedOn: '2026-11-02' }, '2026-11-02');
    expect(closeBlocker('2026-10-31')).toBe('Operating Checking has no signed reconciliation for 2026-10');
    saveToolDoc('reconciliation', '1010:2026-10', blankReconciliation('1010', '2026-10'), { signedBy: 'Ann', signedOn: '2026-11-03' });
    expect(closeBlocker('2026-10-31')).toBe('');
    // The reserve account has not moved, so it is not asked for; the next month is.
    expect(closeBlocker('2026-11-30')).toContain('2026-11');
  });
  it('can be switched off', () => {
    saveToolDoc('reconciliation', '1010:2026-10', blankReconciliation('1010', '2026-10'), { bankBalance: 450 });
    saveToolDoc('controls', 'building', {}, { requireReconciliation: false });
    expect(closeBlocker('2026-10-31')).toBe('');
  });
});
