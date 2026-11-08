/**
 * The ledger engine: pure functions over the chart of accounts and the
 * general ledger. Fund accounting the way ASC 972 (common interest realty
 * associations) presents it: an operating fund and a replacement reserve
 * fund, each with its own assets, liabilities and fund balance, with
 * transfers between them shown as their own line.
 *
 * Every account belongs to one fund (its `fund` tag, else a default by
 * code). An entry whose two accounts sit in different funds is a transfer,
 * so for any set of entries each fund's assets − liabilities equals its
 * fund balance (opening equity + revenue − expenses + transfers in). Nothing
 * here mutates state; the store calls these and the screens read the result.
 */
import type { ChartOfAccountsEntry, Fund, GLEntry } from '@/types/financial';

export type { Fund };
export const FUNDS: Fund[] = ['operating', 'reserve'];
export const FUND_LABEL: Record<Fund, string> = { operating: 'Operating fund', reserve: 'Reserve fund' };

/** Accounts that are the reserve fund's by convention when no tag says otherwise. */
const RESERVE_BY_CODE = new Set(['1020', '1120', '3020', '4020', '4040']);

/** The fund an account belongs to: its tag, else reserve for the reserve bank, special assessments, interest and 6000s, else operating. */
export function fundOf(acct: Pick<ChartOfAccountsEntry, 'num' | 'fund'> | undefined, num?: string): Fund {
  if (acct?.fund) return acct.fund;
  const code = acct?.num ?? num ?? '';
  if (RESERVE_BY_CODE.has(code) || code.startsWith('6')) return 'reserve';
  return 'operating';
}

export const isLive = (e: GLEntry) => e.status !== 'void';

const DEBIT_NORMAL = new Set(['asset', 'expense']);

/** Signed balance of one account over a set of entries: positive on its normal side. Void entries never count. */
export function balanceOf(acctNum: string, acctType: ChartOfAccountsEntry['type'], entries: GLEntry[]): number {
  let bal = 0;
  for (const e of entries) {
    if (e.status === 'void') continue;
    if (e.debitAcct === acctNum) bal += e.amount;
    if (e.creditAcct === acctNum) bal -= e.amount;
  }
  return round(DEBIT_NORMAL.has(acctType) ? bal : -bal);
}

export const round = (n: number) => { const r = Math.round(n * 100) / 100; return r === 0 ? 0 : r; };

export interface FundTotals {
  assets: number;
  liabilities: number;
  /** The fund's equity accounts (3000s) over the entries given. */
  equity: number;
  revenue: number;
  expenses: number;
  /** Money that came into this fund from the other one, net (negative when it went out). */
  transfersIn: number;
  /** equity + revenue − expenses + transfersIn; equals assets − liabilities for any set of entries. */
  fundBalance: number;
}

/** Totals for one fund over a set of entries. */
export function fundTotals(fund: Fund, coa: ChartOfAccountsEntry[], entries: GLEntry[]): FundTotals {
  const byNum = new Map(coa.map(a => [a.num, a]));
  const t: FundTotals = { assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0, transfersIn: 0, fundBalance: 0 };
  const add = (acct: ChartOfAccountsEntry | undefined, num: string, signed: number) => {
    // signed: +amount for a debit to the account, −amount for a credit
    const type = acct?.type ?? (num.startsWith('1') ? 'asset' : num.startsWith('2') ? 'liability' : num.startsWith('3') ? 'equity' : num.startsWith('4') ? 'income' : 'expense');
    switch (type) {
      case 'asset': t.assets += signed; break;
      case 'liability': t.liabilities -= signed; break;
      case 'equity': t.equity -= signed; break;
      case 'income': t.revenue -= signed; break;
      case 'expense': t.expenses += signed; break;
    }
  };
  for (const e of entries) {
    if (e.status === 'void') continue;
    const d = byNum.get(e.debitAcct), c = byNum.get(e.creditAcct);
    const df = fundOf(d, e.debitAcct), cf = fundOf(c, e.creditAcct);
    if (df === fund) add(d, e.debitAcct, e.amount);
    if (cf === fund) add(c, e.creditAcct, -e.amount);
    if (df !== cf) {
      if (df === fund) t.transfersIn += e.amount;
      else if (cf === fund) t.transfersIn -= e.amount;
    }
  }
  for (const k of Object.keys(t) as (keyof FundTotals)[]) t[k] = round(t[k]);
  t.fundBalance = round(t.equity + t.revenue - t.expenses + t.transfersIn);
  return t;
}

export interface FundStatement extends FundTotals {
  fund: Fund;
  label: string;
  /** Fund balance at the start of the period (everything dated before `from`). */
  openingBalance: number;
  /** Revenue, expenses and transfers inside the period. */
  period: { revenue: number; expenses: number; transfersIn: number; net: number };
  /** True when assets − liabilities equals the fund balance (always, unless an account is missing from the chart). */
  ties: boolean;
}

/**
 * The statement of one fund as of a date: balance sheet totals as of `to`,
 * the period's activity between `from` and `to`, and the opening balance.
 */
export function fundStatement(fund: Fund, coa: ChartOfAccountsEntry[], gl: GLEntry[], from: string, to: string): FundStatement {
  const upTo = gl.filter(e => e.date <= to);
  const all = fundTotals(fund, coa, upTo);
  const before = fundTotals(fund, coa, upTo.filter(e => e.date < from));
  const inPeriod = fundTotals(fund, coa, upTo.filter(e => e.date >= from));
  return {
    fund,
    label: FUND_LABEL[fund],
    ...all,
    openingBalance: before.fundBalance,
    period: { revenue: inPeriod.revenue, expenses: inPeriod.expenses, transfersIn: inPeriod.transfersIn, net: round(inPeriod.revenue - inPeriod.expenses + inPeriod.transfersIn) },
    ties: Math.abs(round(all.assets - all.liabilities) - all.fundBalance) < 0.005,
  };
}

/** Both funds plus the combined column, for the Statements screen and the packets. */
export function fundStatements(coa: ChartOfAccountsEntry[], gl: GLEntry[], from: string, to: string) {
  const operating = fundStatement('operating', coa, gl, from, to);
  const reserve = fundStatement('reserve', coa, gl, from, to);
  const sum = (k: keyof FundTotals) => round(operating[k] + reserve[k]);
  return {
    operating,
    reserve,
    total: {
      assets: sum('assets'), liabilities: sum('liabilities'), equity: sum('equity'), revenue: sum('revenue'), expenses: sum('expenses'),
      transfersIn: sum('transfersIn'), fundBalance: sum('fundBalance'),
      openingBalance: round(operating.openingBalance + reserve.openingBalance),
      period: { revenue: round(operating.period.revenue + reserve.period.revenue), expenses: round(operating.period.expenses + reserve.period.expenses), transfersIn: round(operating.period.transfersIn + reserve.period.transfersIn), net: round(operating.period.net + reserve.period.net) },
      ties: operating.ties && reserve.ties,
    },
  };
}

/** The first day of the fiscal year that contains `date`, for a fiscal year ending on `fiscalYearEnd` ("MM-DD"). */
export function fiscalYearStart(date: string, fiscalYearEnd = '12-31'): string {
  const [emRaw, edRaw] = fiscalYearEnd.split('-').map(Number);
  const em = Number.isFinite(emRaw) && emRaw >= 1 && emRaw <= 12 ? emRaw : 12;
  const ed = Number.isFinite(edRaw) && edRaw >= 1 ? edRaw : 31;
  const y = Number(date.slice(0, 4));
  // The day after the fiscal year end, in the year such that start <= date.
  const endThisYear = new Date(Date.UTC(y, em - 1, ed));
  const startAfter = new Date(endThisYear.getTime() + 86400000);
  const candidate = startAfter.toISOString().slice(0, 10);
  if (candidate <= date) return candidate;
  const prev = new Date(Date.UTC(y - 1, em - 1, ed));
  return new Date(prev.getTime() + 86400000).toISOString().slice(0, 10);
}

/** The last day of the month `date` falls in. */
export function monthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The last day of the month before `date`. */
export function priorMonthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

/** True when a posting dated `date` falls in a closed period. */
export const isLocked = (date: string, closedThrough: string | null | undefined) => !!closedThrough && date <= closedThrough;

export class LockedPeriodError extends Error {
  constructor(public date: string, public closedThrough: string) {
    super(`The books are closed through ${closedThrough}; an entry dated ${date} cannot be posted. Post it dated today instead.`);
    this.name = 'LockedPeriodError';
  }
}

/** The mirror of an entry, for a reversal. */
export function reversalOf(e: GLEntry, date: string, reason: string): Omit<GLEntry, 'id' | 'posted' | 'status'> {
  return {
    date,
    memo: `Reversal of ${e.id} · ${reason || e.memo}`,
    debitAcct: e.creditAcct,
    creditAcct: e.debitAcct,
    amount: e.amount,
    source: e.source,
    sourceId: e.id,
  };
}

/** Entries that already reverse the given one (by the sourceId link). */
export const reversalsOf = (id: string, gl: GLEntry[]) => gl.filter(e => isLive(e) && e.sourceId === id && e.memo.startsWith(`Reversal of ${id}`));
