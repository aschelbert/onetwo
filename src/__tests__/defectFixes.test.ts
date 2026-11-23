import { describe, it, expect } from 'vitest';
import { getJurisdictionCoverage, getJurisdictionData, noticeLeadDays } from '@/data/jurisdictions';
import { budgetLineAccounts, operatingSpendByMonth } from '@/lib/ledger';
import { approvalsNeeded, decisionFrom } from '@/lib/spendingRules';
import { bills, type FundsSnapshot } from '@/ux2/funds/metrics';
import type { ChartOfAccountsEntry, GLEntry } from '@/types/financial';

describe('jurisdiction lookup', () => {
  it('finds DC however the state was typed', () => {
    for (const s of ['DC', 'dc', ' D.C. ', 'District of Columbia', 'Washington, DC']) {
      expect(getJurisdictionData(s).code).toBe('DC');
      expect(getJurisdictionCoverage(s)).toBe('full');
    }
  });
  it('falls back to generic for a state with no data', () => {
    expect(getJurisdictionCoverage('Maryland')).toBe('generic');
    expect(getJurisdictionData('').coverage).toBe('generic');
  });
});

describe('meeting notice lead time', () => {
  it('uses the DC minimum for an annual meeting and the bylaws otherwise', () => {
    expect(noticeLeadDays('ANNUAL', 'DC')).toBe(21);
    expect(noticeLeadDays('SPECIAL', 'District of Columbia')).toBe(10);
    expect(noticeLeadDays('BOARD', 'DC')).toBe(10);
  });
  it('uses the bylaws where the state sets no rule', () => {
    expect(noticeLeadDays('ANNUAL', 'Maryland')).toBe(10);
    expect(noticeLeadDays('ANNUAL')).toBe(10);
  });
});

const chart: ChartOfAccountsEntry[] = [
  { num: '5000', name: 'Operating Expenses', type: 'expense', sub: 'header', parent: null },
  { num: '5010', name: 'Maintenance & Repairs', type: 'expense', sub: 'operating', parent: '5000' },
  { num: '5020', name: 'Utilities', type: 'expense', sub: 'operating', parent: '5000' },
  { num: '5021', name: 'Water', type: 'expense', sub: 'operating', parent: '5000', budgetCat: 'c-util' },
  { num: '6010', name: 'Roof Replacement', type: 'expense', sub: 'reserve', parent: '6000' },
];
const gl = (date: string, debitAcct: string, creditAcct: string, amount: number, status?: string): GLEntry =>
  ({ id: `${date}${debitAcct}${amount}`, date, memo: '', debitAcct, creditAcct, amount, source: 'expense', sourceId: null, posted: date, status } as unknown as GLEntry);

describe('budget lines and the ledger', () => {
  it('matches an unlinked line to the account with the same name', () => {
    expect(budgetLineAccounts({ id: 'uuid-1', name: 'Maintenance and repairs' }, chart).map(a => a.num)).toEqual(['5010']);
  });
  it('prefers an explicit link over the name', () => {
    expect(budgetLineAccounts({ id: 'c-util', name: 'Utilities' }, chart).map(a => a.num)).toEqual(['5021']);
  });
  it('has no account for a line nothing matches', () => {
    expect(budgetLineAccounts({ id: 'x', name: 'Holiday party' }, chart)).toEqual([]);
  });
  it('totals operating expense by month, net of credits, skipping voids and reserve spending', () => {
    const months = operatingSpendByMonth('2026', chart, [
      gl('2026-01-10', '5010', '2010', 400),
      gl('2026-01-20', '2010', '5010', 100),
      gl('2026-03-02', '5021', '1010', 75),
      gl('2026-03-05', '6010', '1020', 9000),
      gl('2026-03-06', '5020', '1010', 50, 'void'),
      gl('2025-12-31', '5010', '1010', 999),
    ]);
    expect(months[0]).toBe(300);
    expect(months[2]).toBe(75);
    expect(months.reduce((t, n) => t + n, 0)).toBe(375);
  });
  it('does not count an already-booked bill twice when flagging it over budget', () => {
    const snap = {
      today: '2026-06-01',
      budget: [{ id: 'a', name: 'Maintenance', budgeted: 1000, actual: 900, acctNum: '5010', acctNums: ['5010', '5011'] }],
      workOrders: [
        { id: 'booked', title: '', vendor: 'V', amount: 300, acctNum: '5010', status: 'invoiced', accrualGlEntryId: 'gl1' },
        { id: 'unbooked', title: '', vendor: 'V', amount: 300, acctNum: '5011', status: 'invoiced' },
      ],
    } as unknown as FundsSnapshot;
    expect(bills(snap).flagged.map(w => w.id)).toEqual(['unbooked']);
  });
});

describe('spending approvals', () => {
  it('needs a board majority over the limit', () => {
    expect(approvalsNeeded({ amount: 9000, threshold: 5000 }, 5, false)).toBe(3);
    expect(approvalsNeeded({ amount: 9000, threshold: 5000 }, 3, false)).toBe(2);
    expect(approvalsNeeded({ amount: 9000, threshold: 5000 }, 2, false)).toBe(2);
  });
  it('needs two when under the limit but over the budget line, one otherwise', () => {
    expect(approvalsNeeded({ amount: 900, threshold: 5000 }, 5, true)).toBe(2);
    expect(approvalsNeeded({ amount: 900, threshold: 5000 }, 5, false)).toBe(1);
  });
  it('never asks a one-person board for more than one', () => {
    expect(approvalsNeeded({ amount: 9000, threshold: 5000 }, 1, true)).toBe(1);
    expect(approvalsNeeded({ amount: 9000, threshold: 5000 }, 0, false)).toBe(1);
  });
  it('stays pending until enough matching votes are in', () => {
    expect(decisionFrom([{ vote: 'approve' }], 3)).toBe('pending');
    expect(decisionFrom([{ vote: 'approve' }, { vote: 'approve' }, { vote: 'deny' }], 3)).toBe('pending');
    expect(decisionFrom([{ vote: 'approve' }, { vote: 'approve' }, { vote: 'approve' }], 3)).toBe('approved');
    expect(decisionFrom([{ vote: 'deny' }, { vote: 'deny' }], 2)).toBe('denied');
  });
});
