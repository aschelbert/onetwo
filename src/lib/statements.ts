/**
 * Statements read from the ledger for any period: the operating statement
 * with net operating income, the cash-flow statement, and the trial balance.
 * Pure: a chart of accounts and a list of entries in, rows out.
 */
import type { ChartOfAccountsEntry, GLEntry } from '@/types/financial';
import { fundStatements, balanceOf, fundOf, type Fund } from './ledger';

const r2 = (n: number) => Math.round(n * 100) / 100;
const live = (gl: GLEntry[], from: string, to: string) => gl.filter(e => e.status !== 'void' && e.date >= from && e.date <= to);

/** The account the allowance and write-offs post bad debt to. */
export const BAD_DEBT = '5300';

export interface StatementLine { num: string; name: string; amount: number; budget: number | null }
export interface OperatingStatement {
  income: StatementLine[];
  totalIncome: number;
  expenses: StatementLine[];
  badDebt: number;
  totalExpenses: number;
  /** Net operating income: operating income less operating expenses, before the transfer to reserves. */
  noi: number;
  /** Moved out of the operating fund to reserves in the period (negative when money came back). */
  toReserves: number;
  /** What the period left in the operating fund. */
  left: number;
  budgetExpenses: number | null;
}

/**
 * The operating fund's statement for a period. `budgetFor` gives a budget for
 * an expense account over the period (its line's yearly figure times the
 * share of the year the period covers), or null where a line has none.
 */
export function operatingStatement(coa: ChartOfAccountsEntry[], gl: GLEntry[], from: string, to: string, budgetFor: (acctNum: string) => number | null = () => null): OperatingStatement {
  const entries = live(gl, from, to);
  const byNum = new Map(coa.map(a => [a.num, a]));
  const inFund = (a: ChartOfAccountsEntry) => a.sub !== 'header' && fundOf(a, a.num) === 'operating';
  const net = (num: string, debitNormal: boolean) => r2(entries.reduce((t, e) => t + (e.debitAcct === num ? e.amount : 0) - (e.creditAcct === num ? e.amount : 0), 0) * (debitNormal ? 1 : -1));
  const income = coa.filter(a => a.type === 'income' && inFund(a)).map(a => ({ num: a.num, name: a.name, amount: net(a.num, false), budget: null })).filter(l => l.amount !== 0);
  const allExpenses = coa.filter(a => a.type === 'expense' && inFund(a)).map(a => ({ num: a.num, name: a.name, amount: net(a.num, true), budget: budgetFor(a.num) })).filter(l => l.amount !== 0 || (l.budget ?? 0) !== 0);
  const expenses = allExpenses.filter(l => l.num !== BAD_DEBT);
  const badDebt = allExpenses.find(l => l.num === BAD_DEBT)?.amount ?? 0;
  const totalIncome = r2(income.reduce((t, l) => t + l.amount, 0));
  const totalExpenses = r2(expenses.reduce((t, l) => t + l.amount, 0) + badDebt);
  // A transfer is an entry with one side in each fund; money leaving operating is a credit on the operating side.
  const toReserves = r2(entries.reduce((t, e) => {
    const df = fundOf(byNum.get(e.debitAcct), e.debitAcct), cf = fundOf(byNum.get(e.creditAcct), e.creditAcct);
    return df === cf ? t : t + (cf === 'operating' ? e.amount : -e.amount);
  }, 0));
  const budgets = expenses.map(l => l.budget).filter((b): b is number => b != null);
  const noi = r2(totalIncome - totalExpenses);
  return { income, totalIncome, expenses, badDebt, totalExpenses, noi, toReserves, left: r2(noi - toReserves), budgetExpenses: budgets.length ? r2(budgets.reduce((t, b) => t + b, 0)) : null };
}

/** Whether an expense line is far enough off its budget to want a sentence: more than 10% and $500 over. */
export const wantsReason = (l: Pick<StatementLine, 'amount' | 'budget'>) => l.budget != null && l.amount - l.budget > 500 && l.amount > l.budget * 1.1;

export interface CashFlow {
  start: number;
  fromOwners: number;
  otherReceipts: number;
  toVendors: number;
  capital: number;
  loans: number;
  other: number;
  end: number;
  operatingEnd: number;
  reserveEnd: number;
  /** From running the building: owners and other receipts less what was paid out. */
  fromOperations: number;
}

/**
 * Where the cash went in a period, read from the bank accounts: every entry
 * with a bank account on one side is sorted by what is on the other. Moves
 * between the association's own bank accounts are left out; they change which
 * account holds the money, not how much there is.
 */
export function cashFlow(coa: ChartOfAccountsEntry[], gl: GLEntry[], from: string, to: string): CashFlow {
  const byNum = new Map(coa.map(a => [a.num, a]));
  const isBank = (num: string) => byNum.get(num)?.sub === 'bank';
  const banks = coa.filter(a => a.sub === 'bank');
  const before = gl.filter(e => e.status !== 'void' && e.date < from);
  const upTo = gl.filter(e => e.status !== 'void' && e.date <= to);
  const sum = (entries: GLEntry[], pick: (a: ChartOfAccountsEntry) => boolean = () => true) => r2(banks.filter(pick).reduce((t, a) => t + balanceOf(a.num, 'asset', entries), 0));
  const f: CashFlow = { start: sum(before), fromOwners: 0, otherReceipts: 0, toVendors: 0, capital: 0, loans: 0, other: 0, end: sum(upTo), operatingEnd: sum(upTo, a => fundOf(a, a.num) === 'operating'), reserveEnd: sum(upTo, a => fundOf(a, a.num) === 'reserve'), fromOperations: 0 };
  for (const e of live(gl, from, to)) {
    const dBank = isBank(e.debitAcct), cBank = isBank(e.creditAcct);
    if (dBank === cBank) continue;
    const signed = dBank ? e.amount : -e.amount;
    const otherNum = dBank ? e.creditAcct : e.debitAcct;
    const other = byNum.get(otherNum);
    const type = other?.type, sub = other?.sub ?? '';
    if (/loan|note|mortgage/i.test(other?.name ?? '') || sub === 'loan') f.loans += signed;
    else if (type === 'expense' && (sub === 'reserve' || fundOf(other, otherNum) === 'reserve')) f.capital += signed;
    else if (sub === 'receivable' || sub === 'deferred' || sub === 'assessment' || (type === 'income' && /assess|dues/i.test(other?.name ?? ''))) f.fromOwners += signed;
    else if (type === 'income') f.otherReceipts += signed;
    else if (type === 'expense' || sub === 'payable' || sub === 'accrued') f.toVendors += signed;
    else f.other += signed;
  }
  for (const k of ['fromOwners', 'otherReceipts', 'toVendors', 'capital', 'loans', 'other'] as const) f[k] = r2(f[k]);
  f.fromOperations = r2(f.fromOwners + f.otherReceipts + f.toVendors);
  return f;
}

export interface TrialRow { num: string; name: string; type: ChartOfAccountsEntry['type']; debit: number; credit: number }
/** Every account with a balance as of a date, in its debit or credit column. The two columns add to the same figure. */
export function trialBalance(coa: ChartOfAccountsEntry[], gl: GLEntry[], asOf: string): { rows: TrialRow[]; debits: number; credits: number; balanced: boolean } {
  const upTo = gl.filter(e => e.status !== 'void' && e.date <= asOf);
  const rows: TrialRow[] = [];
  for (const a of coa) {
    if (a.sub === 'header') continue;
    const net = r2(upTo.reduce((t, e) => t + (e.debitAcct === a.num ? e.amount : 0) - (e.creditAcct === a.num ? e.amount : 0), 0));
    if (net === 0) continue;
    rows.push({ num: a.num, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  rows.sort((x, y) => x.num.localeCompare(y.num));
  const debits = r2(rows.reduce((t, r) => t + r.debit, 0)), credits = r2(rows.reduce((t, r) => t + r.credit, 0));
  return { rows, debits, credits, balanced: Math.abs(debits - credits) < 0.005 };
}

export type PeriodId = 'month' | 'ytd' | 'last-year';
/** The dates a period covers: last month, this fiscal year to date, or the fiscal year before. */
export function periodDates(id: PeriodId, today: string, fyStart: string): { from: string; to: string; label: string; yearShare: number } {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const [y, m] = today.split('-').map(Number);
  if (id === 'month') {
    const from = day(new Date(Date.UTC(y, m - 2, 1))), to = day(new Date(Date.UTC(y, m - 1, 0)));
    return { from, to, label: new Date(from + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), yearShare: 1 / 12 };
  }
  if (id === 'last-year') {
    const s = new Date(fyStart + 'T00:00:00Z');
    const from = day(new Date(Date.UTC(s.getUTCFullYear() - 1, s.getUTCMonth(), s.getUTCDate()))), to = day(new Date(s.getTime() - 86400000));
    return { from, to, label: `${from} to ${to}`, yearShare: 1 };
  }
  const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(fyStart)) / 86400000) + 1);
  return { from: fyStart, to: today, label: `${fyStart} to ${today}`, yearShare: Math.min(1, days / 365) };
}

export interface BalanceRow { num: string; name: string; fund: Fund; amount: number }
/**
 * The balance sheet by fund as of a date: every asset and liability account
 * with a balance, each fund's totals, and how each fund balance came about
 * since `from` (the start of the fiscal year the date falls in).
 */
export function balanceSheet(coa: ChartOfAccountsEntry[], gl: GLEntry[], from: string, asOf: string) {
  const upTo = gl.filter(e => e.status !== 'void' && e.date <= asOf);
  const rows = (type: 'asset' | 'liability'): BalanceRow[] => coa.filter(a => a.sub !== 'header' && a.type === type)
    .map(a => ({ num: a.num, name: a.name, fund: fundOf(a, a.num), amount: balanceOf(a.num, type, upTo) })).filter(r => Math.abs(r.amount) >= 0.005);
  return { asOf, from, assets: rows('asset'), liabilities: rows('liability'), funds: fundStatements(coa, gl, from, asOf) };
}
