import { describe, it, expect, beforeEach } from 'vitest';
import { blankYear, budgetFor, isLocked, kindOf, lineActual, standing, withAmounts, yearLines, kept, LOAN_PAYMENT_SOURCE } from '@/lib/budgetYear';
import { withCapitalLines, draftTotals, type BudgetDraft } from '@/ux2/boardroom/budgetDraft';
import { outlook, loanPaymentsBetween, loanStanding, type Loan } from '@/lib/outlook';
import { balanceSheet } from '@/lib/statements';
import { fundingEffects } from '@/lib/capitalProject';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { blankProject } from '@/lib/capitalProject';
import { budgetLocked, markAdopted, syncCurrentYear, turnYear, yearDoc } from '@/ux2/funds/planning/budgetYears';
import { planningDoc, savePlanning } from '@/ux2/funds/planning/planningDoc';
import { LOAN_INTEREST, LOAN_PAYABLE, nextUnposted, recordPayment, recordProceeds } from '@/ux2/funds/planning/loans';
import { ensureCapitalLine } from '@/ux2/boardroom/capitalImprovement';
import { switchToBudget, syncCapitalLines } from '@/ux2/boardroom/annualBudget';
import type { ChartOfAccountsEntry, GLEntry } from '@/types/financial';

const coa: ChartOfAccountsEntry[] = [
  { num: '1010', name: 'Operating Checking', type: 'asset', sub: 'bank', parent: '1000' },
  { num: '1020', name: 'Reserve Savings', type: 'asset', sub: 'bank', parent: '1000' },
  { num: '2100', name: 'Loans Payable', type: 'liability', sub: 'loan', parent: '2000' },
  { num: '3010', name: 'Operating Fund Balance', type: 'equity', sub: 'fund', parent: '3000' },
  { num: '4010', name: 'Assessments', type: 'income', sub: 'assessment', parent: '4000' },
  { num: '5020', name: 'Utilities', type: 'expense', sub: 'operating', parent: '5000' },
];
let n = 0;
const e = (date: string, debitAcct: string, creditAcct: string, amount: number, sourceId: string | null = null): GLEntry => ({ id: `g${n++}`, date, memo: '', debitAcct, creditAcct, amount, source: 'manual', sourceId, posted: date, status: 'posted' } as GLEntry);

describe("a year's budget, kept", () => {
  it('knows what a line is for from its name', () => {
    expect([kindOf('Capital · Lobby'), kindOf('Loan payments'), kindOf('Contingency'), kindOf('Utilities')]).toEqual(['capital', 'debt', 'contingency', 'operating']);
  });

  it("adds up a line's own months for any stretch of dates", () => {
    const even = yearLines([{ id: 'u', name: 'Utilities', amount: 12000 }])[0];
    expect(even.months).toEqual(Array(12).fill(1000));
    expect(budgetFor(even.months, '2026-01-01', '2026-03-31')).toBe(3000);
    expect(budgetFor(even.months, '2026-01-01', '2026-04-15')).toBe(3500);
    // A winter-heavy line: by the end of February it expects most of the year, not a sixth.
    const gas = yearLines([{ id: 'g', name: 'Gas', amount: 12000, shape: [4, 4, 2, 1, 0, 0, 0, 0, 0, 1, 2, 4] }])[0];
    expect(gas.months.reduce((t, x) => t + x, 0)).toBe(12000);
    expect(budgetFor(gas.months, '2026-01-01', '2026-02-28')).toBe(5334);
    // A fiscal year that straddles two calendar years still reads each month once.
    expect(budgetFor(even.months, '2026-07-01', '2027-06-30')).toBe(12000);
  });

  it('reads a line as ahead of its months without being over for the year', () => {
    const gas = yearLines([{ id: 'g', name: 'Gas', amount: 12000, shape: [4, 4, 2, 1, 0, 0, 0, 0, 0, 1, 2, 4] }])[0];
    // $5,000 spent by the end of February is right for gas, and far ahead for an even line.
    expect(standing(gas, 5000, '2026-01-01', '2026-02-28')).toMatchObject({ ahead: false, over: false });
    expect(standing({ amount: 12000, months: Array(12).fill(1000) }, 5000, '2026-01-01', '2026-02-28')).toMatchObject({ ahead: true, over: false, expected: 2000 });
    expect(standing(gas, 12500, '2026-01-01', '2026-11-30')).toMatchObject({ over: true, overBy: 500 });
  });

  it('follows the lines until adopted, then lists every change', () => {
    let y = { ...blankYear('2026-01-01', '2026-12-31', '2026'), lines: yearLines([{ id: 'u', name: 'Utilities', amount: 60000 }, { id: 'm', name: 'Maintenance', amount: 44000 }]) };
    y = withAmounts(y, [{ id: 'u', name: 'Utilities', amount: 61000 }, { id: 'm', name: 'Maintenance', amount: 44000 }], { on: '2026-01-10', why: 'typed', by: 'Ana' });
    expect(y.amendments).toEqual([]);
    expect(y.lines[0]).toMatchObject({ adopted: 61000, amount: 61000 });
    y = { ...y, adoptedOn: '2026-01-15' };
    expect(isLocked(y)).toBe(true);
    y = withAmounts(y, [{ id: 'u', name: 'Utilities', amount: 64000 }, { id: 'm', name: 'Maintenance', amount: 41000 }, { id: 'c', name: 'Capital · Lobby', amount: 0 }], { on: '2026-06-01', why: 'Water leak', by: 'Ana' });
    expect(y.lines.map(l => [l.adopted, l.amount])).toEqual([[61000, 64000], [44000, 41000], [0, 0]]);
    expect(y.amendments.map(a => `${a.name} ${a.from}>${a.to} ${a.why}`)).toEqual(['Utilities 61000>64000 Water leak', 'Maintenance 44000>41000 Water leak', 'Capital · Lobby 0>0 Water leak']);
    expect(y.lines[0].months.reduce((t, x) => t + x, 0)).toBe(64000);
    // A line that only got its database id is the same line, not a new one.
    const again = withAmounts(y, [{ id: 'db-1', name: 'Utilities', amount: 64000 }, { id: 'm', name: 'Maintenance', amount: 41000 }, { id: 'c', name: 'Capital · Lobby', amount: 0 }], { on: '2026-06-02', why: 'x', by: 'Ana' });
    expect(again.amendments.length).toBe(3);
    expect(again.lines[0]).toMatchObject({ id: 'db-1', adopted: 61000 });
  });

  it('writes in what each line spent when the year is kept; loan payments are read from the payments posted', () => {
    const gl = [e('2026-03-01', '5020', '1010', 700), e('2027-01-05', '5020', '1010', 999), e('2026-04-01', '5400', '1010', 120, `${LOAN_PAYMENT_SOURCE}l1:2026-04`), e('2026-04-01', '2100', '1010', 880, `${LOAN_PAYMENT_SOURCE}l1:2026-04`), e('2026-02-01', '1010', '2100', 50000, 'loan:l1')];
    const y = kept({ ...blankYear('2026-01-01', '2026-12-31', '2026'), lines: yearLines([{ id: 'u', name: 'Utilities', amount: 9000 }, { id: 'd', name: 'Loan payments', amount: 12000 }]) }, coa, gl, '2027-01-01');
    expect(y.keptOn).toBe('2027-01-01');
    expect(y.lines.map(l => l.actual)).toEqual([700, 1000]);
    expect(lineActual({ id: 'u', name: 'Utilities' }, coa, gl, '2027-01-01', '2027-12-31')).toBe(999);
  });
});

describe('capital and loan lines in the draft', () => {
  const draft = (): BudgetDraft => ({ fyStart: '2027-01-01', fyEnd: '2027-12-31', label: '2027', createdAt: '', updatedAt: '', costs: [], base: { reserveAnnual: 0, recommendedReserve: 0, monthlyDues: 10000 }, reserve: { choice: 'keep', annual: 24000 }, contingencyPct: 5, dues: { option: 'needed', monthlyTotal: 0 }, capPct: null,
    lines: [{ id: 'u', name: 'Utilities', categoryId: 'u', budgeted: 60000, actual: 0, projected: 60000, suggested: 60000, why: '', amount: 60000, reviewed: true }] });

  it('adds a line for a job paid from the operating budget and one for loan payments, outside the cushion', () => {
    const d = withCapitalLines(draft(), [{ projectId: 'p1', title: 'Lobby', cost: 18000, decidedOn: '2026-10-01' }], 6000);
    expect(d.lines.map(l => [l.name, l.kind, l.amount, l.reviewed])).toEqual([['Utilities', undefined, 60000, true], ['Capital · Lobby', 'capital', 18000, false], ['Loan payments', 'debt', 6000, false]]);
    const t = draftTotals(d);
    expect(t).toMatchObject({ operating: 60000, capital: 24000, contingency: 3000, reserve: 24000, needed: 111000 });
    // Nothing changed: the same draft comes back, so nothing is saved.
    expect(withCapitalLines(d, [{ projectId: 'p1', title: 'Lobby', cost: 18000, decidedOn: '2026-10-01' }], 6000)).toBe(d);
  });

  it('keeps an amount the board set, follows the cost until then, drops a line whose job is gone, and stops at adoption', () => {
    let d = withCapitalLines(draft(), [{ projectId: 'p1', title: 'Lobby', cost: 18000, decidedOn: '' }], 0);
    d = withCapitalLines(d, [{ projectId: 'p1', title: 'Lobby', cost: 21000, decidedOn: '' }], 0);
    expect(d.lines[1]).toMatchObject({ amount: 21000, suggested: 21000 });
    d = { ...d, lines: d.lines.map(l => (l.kind ? { ...l, amount: 15000, reviewed: true } : l)) };
    d = withCapitalLines(d, [{ projectId: 'p1', title: 'Lobby', cost: 22000, decidedOn: '' }], 0);
    expect(d.lines[1]).toMatchObject({ amount: 15000, suggested: 22000 });
    expect(withCapitalLines(d, [], 0).lines.length).toBe(1);
    const adopted = { ...d, adoptedAt: '2026-11-20' };
    expect(withCapitalLines(adopted, [], 0)).toBe(adopted);
  });
});

describe('the outlook from next year\'s draft', () => {
  const base = { year: 2026, lines: [{ id: 'u', name: 'Utilities', budgeted: 60000 }], rates: { u: 0 }, duesNow: 120000, units: 10, reserveBalance: 0, reserveMonthly: 0, comps: [], loans: [] };
  it("makes the second year the draft itself and grows from it", () => {
    const plain = outlook(base);
    expect(plain.map(r => r.operating)).toEqual([60000, 60000, 60000, 60000, 60000, 60000]);
    const rows = outlook({ ...base, rates: { u: 10 }, next: { lines: [{ id: 'u', name: 'Utilities', budgeted: 70000 }], contingencyPct: 5, capital: 18000 } });
    // This year as it is; next year the draft with its cushion and the one-off capital job; then 10% a year from the draft.
    expect(rows.map(r => r.operating)).toEqual([60000, 91500, 80850, 88935, 97829, 107611]);
  });
  it("takes next year's dues from the draft once they are picked", () => {
    const rows = outlook({ ...base, next: { lines: [{ id: 'u', name: 'Utilities', budgeted: 66000 }], contingencyPct: 0, capital: 0, duesMonthlyTotal: 11500 } });
    expect(rows.map(r => r.dues)).toEqual([1000, 1150, 1150, 1150, 1150, 1150]);
    // Not picked: worked out from what has to be raised.
    expect(outlook({ ...base, next: { lines: [{ id: 'u', name: 'Utilities', budgeted: 66000 }], contingencyPct: 0, capital: 0 } })[1].dues).toBe(1100);
  });
});

describe('the balance sheet as of a date', () => {
  it('reads only what was posted by then, by fund, and carries a loan under what is owed', () => {
    const gl = [e('2026-01-05', '1010', '4010', 10000), e('2026-02-10', '1010', '2100', 50000), e('2026-03-01', '5020', '1010', 700)];
    const jan = balanceSheet(coa, gl, '2026-01-01', '2026-01-31');
    expect(jan.assets).toEqual([{ num: '1010', name: 'Operating Checking', fund: 'operating', amount: 10000 }]);
    expect(jan.liabilities).toEqual([]);
    const mar = balanceSheet(coa, gl, '2026-01-01', '2026-03-31');
    expect(mar.assets[0].amount).toBe(59300);
    expect(mar.liabilities).toEqual([{ num: '2100', name: 'Loans Payable', fund: 'operating', amount: 50000 }]);
    expect(mar.funds.total.ties).toBe(true);
    expect(mar.funds.operating.fundBalance).toBe(9300);
  });
});

describe('paying a job from reserves', () => {
  it('speaks in percent funded and names the short year', () => {
    const ctx = { units: 10, reserveCash: 100000, operatingCash: 0, reservePct: 62, reservePctAfter: 41, shortAfter: null as number | null };
    expect(fundingEffects(30000, ctx)[0].effect).toBe('Reserves go from 62% to 41% funded · no short year in the plan after it');
    expect(fundingEffects(30000, { ...ctx, reservePct: null, reservePctAfter: null })[0].effect).toContain('Leaves $70,000 in reserves');
  });
});

describe('in the app', () => {
  const loan: Loan = { id: 'l1', name: 'Elevator', lender: 'First Bank', principal: 120000, ratePct: 6, years: 10, firstPayment: '2026-03', securedBy: '', covenant: '', projectId: '' };
  beforeEach(() => {
    useActionRecordsStore.setState({ records: [] });
    useBudgetDraftStore.setState({ drafts: {}, loaded: true });
    useCapitalProjectsStore.setState({ projects: [] });
    useFinancialStore.setState({ chartOfAccounts: [{ num: '1000', name: 'Assets', type: 'asset', sub: 'header', parent: null }, { num: '2000', name: 'Liabilities', type: 'liability', sub: 'header', parent: null }, { num: '5000', name: 'Operating Expenses', type: 'expense', sub: 'header', parent: null }, ...coa] as never, generalLedger: [], closedThrough: null, budgetCategories: [{ id: 'u', name: 'Utilities', budgeted: 60000, expenses: [] }, { id: 'm', name: 'Maintenance', budgeted: 44000, expenses: [] }] as never });
  });

  it('locks the lines once the budget is marked adopted, and lists a later change', () => {
    syncCurrentYear('2026-05-01');
    expect(budgetLocked('2026-05-01')).toBe(false);
    markAdopted('2026-05-02', 'Board vote, 4 to 0', '2026-05-02');
    expect(budgetLocked('2026-05-03')).toBe(true);
    useFinancialStore.getState().updateBudgetCategory('u', { budgeted: 63000 });
    const y = syncCurrentYear('2026-06-01', 'Budget amendment: leak');
    expect(y.lines[0]).toMatchObject({ adopted: 60000, amount: 63000 });
    expect(y.amendments).toHaveLength(1);
    expect(y.amendments[0]).toMatchObject({ from: 60000, to: 63000, why: 'Budget amendment: leak' });
  });

  it('keeps the outgoing year with its actuals when the next budget takes over', () => {
    useFinancialStore.setState({ generalLedger: [e('2026-03-01', '5020', '1010', 700)] });
    turnYear({ fyStart: '2027-01-01', fyEnd: '2027-12-31', label: '2027', adoptedOn: '2026-11-20', adoptedHow: 'Board vote', reserve: 24000, monthlyDues: 11000, lines: [{ id: 'u', name: 'Utilities', amount: 66000 }] }, '2027-01-01');
    const old = yearDoc('2026-01-01')!;
    expect(old.keptOn).toBe('2027-01-01');
    expect(old.lines.map(l => [l.name, l.amount, l.actual])).toEqual([['Utilities', 60000, 700], ['Maintenance', 44000, 0]]);
    const next = yearDoc('2027-01-01')!;
    expect(next).toMatchObject({ adoptedOn: '2026-11-20', reserve: 24000 });
    expect(budgetLocked('2027-02-01')).toBe(true);
  });

  it('switching to an adopted draft carries its capital line into the budget and the year record', () => {
    const id = useCapitalProjectsStore.getState().add({ ...blankProject('Lobby', 'Worn out', '2026-09-01'), options: [{ id: 'o', name: 'Refit', cost: 18000, rebate: 0, savesPerYear: 0, notes: '' }], chosenOptionId: 'o', funding: { source: 'operating', decidedOn: '2026-10-01', vote: 'Board, 4 to 0' } });
    useBudgetDraftStore.getState().put({ fyStart: '2027-01-01', fyEnd: '2027-12-31', label: '2027', createdAt: '', updatedAt: '', costs: [], base: { reserveAnnual: 0, recommendedReserve: 0, monthlyDues: 0 }, reserve: { choice: 'keep', annual: 0 }, contingencyPct: 0, dues: { option: 'needed', monthlyTotal: 0 }, capPct: null,
      lines: [{ id: 'u', name: 'Utilities', categoryId: 'u', budgeted: 60000, actual: 0, projected: 0, suggested: 0, why: '', amount: 66000, reviewed: true }] });
    savePlanning({ loans: [loan] }, '2026-10-01');
    const d = syncCapitalLines({ start: '2027-01-01', end: '2027-12-31' })!;
    expect(d.lines.map(l => l.name)).toEqual(['Utilities', 'Capital · Lobby', 'Loan payments']);
    expect(d.lines[1]).toMatchObject({ sourceId: id, amount: 18000 });
    expect(d.lines[2].amount).toBe(loanPaymentsBetween([loan], '2027-01', '2027-12'));
    useBudgetDraftStore.getState().update('2027-01-01', x => ({ ...x, adoptedAt: '2026-11-20' }));
    expect(switchToBudget('2027-01-01', '2027-01-01')).toBe(true);
    expect(useFinancialStore.getState().budgetCategories.map(c => c.name).sort()).toEqual(['Capital · Lobby', 'Loan payments', 'Maintenance', 'Utilities']);
    expect(yearDoc('2027-01-01')!.lines.map(l => l.kind)).toEqual(['operating', 'capital', 'debt']);
  });

  it('a job paid from the operating budget becomes a line this year, listed as a change on an adopted budget', () => {
    syncCurrentYear('2026-05-01');
    markAdopted('2026-05-02', 'Board vote', '2026-05-02');
    const p = { ...blankProject('Lobby', 'Worn out', '2026-09-01'), id: 'p1', options: [{ id: 'o', name: 'Refit', cost: 18000, rebate: 0, savesPerYear: 0, notes: '' }], chosenOptionId: 'o', funding: { source: 'operating' as const, decidedOn: '2026-10-01', vote: 'Board, 4 to 0' } };
    expect(ensureCapitalLine(p, '2026-10-01')).toBe(true);
    expect(ensureCapitalLine(p, '2026-10-02')).toBe(false);
    const fin = useFinancialStore.getState();
    expect(fin.budgetCategories.find(c => c.name === 'Capital · Lobby')?.budgeted).toBe(18000);
    expect(fin.chartOfAccounts.find(a => a.name === 'Capital · Lobby')).toMatchObject({ num: '5900', type: 'expense' });
    const y = yearDoc('2026-01-01')!;
    expect(y.amendments[y.amendments.length - 1]).toMatchObject({ name: 'Capital · Lobby', from: 0, to: 18000 });
    expect(y.amendments[y.amendments.length - 1].why).toContain('Board, 4 to 0');
    // Paid from reserves: not a budget line.
    expect(ensureCapitalLine({ ...p, title: 'Roof', funding: { ...p.funding, source: 'reserves' } }, '2026-10-01')).toBe(false);
  });

  it('records a loan in the ledger: the money arriving, then each payment split into interest and principal', () => {
    savePlanning({ loans: [loan] }, '2026-02-01');
    expect(recordProceeds('l1', '2026-02-15', '1010', '2026-02-15')).toBe('');
    expect(recordProceeds('l1', '2026-02-16', '1010', '2026-02-16')).toBe('');
    expect(nextUnposted(planningDoc().loans[0], '2026-02')).toBeNull();
    expect(nextUnposted(planningDoc().loans[0], '2026-04')).toBe('2026-03');
    expect(recordPayment('l1', '2026-03', '2026-03-05', '1010', '2026-03-05')).toBe('');
    expect(recordPayment('l1', '2026-03', '2026-03-06', '1010', '2026-03-06')).toBe('');
    expect(nextUnposted(planningDoc().loans[0], '2026-04')).toBe('2026-04');
    const fin = useFinancialStore.getState();
    const st = loanStanding(loan, '2026-03');
    const bal = (num: string, type: 'asset' | 'liability' | 'expense') => fin.generalLedger.reduce((t, x) => t + (x.debitAcct === num ? x.amount : 0) - (x.creditAcct === num ? x.amount : 0), 0) * (type === 'liability' ? -1 : 1);
    expect(fin.generalLedger).toHaveLength(3);
    expect(bal(LOAN_INTEREST, 'expense')).toBe(600);
    expect(Math.round(bal(LOAN_PAYABLE, 'liability') * 100) / 100).toBe(st.owed);
    expect(Math.round(bal('1010', 'asset') * 100) / 100).toBe(Math.round((120000 - st.payment) * 100) / 100);
    // The Loan payments budget line is measured by what was paid, interest and principal together.
    useFinancialStore.setState({ budgetCategories: [{ id: 'd', name: 'Loan payments', budgeted: 16000, expenses: [] }] as never });
    expect(lineActual({ id: 'd', name: 'Loan payments' }, fin.chartOfAccounts, fin.generalLedger, '2026-01-01', '2026-12-31')).toBe(st.payment);
    // A closed month refuses the posting and says why; nothing is marked.
    useFinancialStore.setState({ closedThrough: '2026-04-30' });
    expect(recordPayment('l1', '2026-04', '2026-04-05', '1010', '2026-05-01')).not.toBe('');
    expect(planningDoc().loans[0].posted).toEqual(['2026-03']);
  });
});
