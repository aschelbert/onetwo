/**
 * Looking ahead: the five-year outlook, loans, and the twelve-month cash
 * forecast. All three are worked out from what the app already holds (the
 * budget, the reserve plan, the loan register, what owners are billed), so
 * nobody types a forecast in.
 */
import type { Component, PlanAssumptions } from './reservePlan';
import { DEFAULT_ASSUMPTIONS, project } from './reservePlan';

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Loans ────────────────────────────────────────────────────────────────────
export interface Loan {
  id: string;
  name: string;
  lender: string;
  principal: number;
  ratePct: number;
  years: number;
  /** The month of the first payment, 'YYYY-MM'. */
  firstPayment: string;
  securedBy: string;
  /** Anything the lender requires while the loan is open, in words. */
  covenant: string;
  /** The capital project it paid for, when it paid for one. */
  projectId: string;
}

export function monthlyPayment(l: Pick<Loan, 'principal' | 'ratePct' | 'years'>): number {
  const n = Math.max(1, Math.round(l.years * 12)), r = l.ratePct / 100 / 12;
  return r2(r === 0 ? l.principal / n : (l.principal * r) / (1 - Math.pow(1 + r, -n)));
}

const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
const addMonths = (ym: string, n: number) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

/** Where a loan stands in a month: payments made so far, what is still owed, and how this month's payment splits. */
export function loanStanding(l: Loan, month: string) {
  const payment = monthlyPayment(l), n = Math.max(1, Math.round(l.years * 12)), r = l.ratePct / 100 / 12;
  const made = Math.min(n, Math.max(0, monthsBetween(l.firstPayment, month) + 1));
  let owed = l.principal, interestThis = 0, principalThis = 0;
  for (let i = 0; i < made; i++) {
    interestThis = r2(owed * r);
    principalThis = Math.min(owed, r2(payment - interestThis));
    owed = r2(owed - principalThis);
  }
  const active = made > 0 && monthsBetween(l.firstPayment, month) < n;
  return { payment, made, left: n - made, owed: Math.max(0, owed), paidOff: addMonths(l.firstPayment, n - 1), interestThis: active ? interestThis : 0, principalThis: active ? principalThis : 0, active };
}

/** Whether a loan has a payment due in a month. */
export const paysIn = (l: Loan, month: string) => { const k = monthsBetween(l.firstPayment, month); return k >= 0 && k < Math.max(1, Math.round(l.years * 12)); };
/** What the loans cost in a calendar year. */
export const loanPaymentsIn = (loans: Loan[], year: number) => r0(loans.reduce((t, l) => t + monthlyPayment(l) * Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, '0')}`).filter(m => paysIn(l, m)).length, 0));

// ── Five-year outlook ────────────────────────────────────────────────────────
export interface OutlookLine { id: string; name: string; budgeted: number }
export const OUTLOOK_YEARS = 5;
export const DEFAULT_GROWTH_PCT = 3;

/** A starting growth rate for a line, from what it is called: insurance and utilities have outrun general costs. The board sets its own. */
export function suggestedGrowth(name: string): number {
  if (/insur/i.test(name)) return 7;
  if (/utilit|electric|gas|water/i.test(name)) return 4;
  return DEFAULT_GROWTH_PCT;
}

export interface OutlookYear {
  year: number;
  operating: number;
  reserve: number;
  loans: number;
  toRaise: number;
  /** Average dues, a unit, a month. */
  dues: number;
  /** Change in dues on the year before, in percent; null for the first year. */
  change: number | null;
  replacements: { name: string; cost: number }[];
  reservesEnd: number;
  pct: number | null;
}

export interface OutlookInput {
  year: number;
  lines: OutlookLine[];
  /** Growth rate by line id, in percent a year; a line with none uses the suggestion for its name. */
  rates: Record<string, number>;
  /** What owners are billed in a year today, all units. */
  duesNow: number;
  units: number;
  reserveBalance: number;
  /** The monthly reserve contribution to run the outlook at, from next year on. */
  reserveMonthly: number;
  /** Today's monthly contribution: this year is shown as it is, so a different level shows as a change in dues next year. Defaults to `reserveMonthly`. */
  reserveMonthlyNow?: number;
  comps: Component[];
  assumptions?: PlanAssumptions;
  loans: Loan[];
}

/**
 * This year and the five after it. Operating lines grow at their own rates,
 * the reserve contribution at the plan's rate, and loans cost what their
 * schedule says. Dues move in step with what has to be raised, starting from
 * what owners are billed today, so the path is right when today's dues cover
 * today's budget and shows the gap when they do not.
 */
export function outlook(i: OutlookInput): OutlookYear[] {
  const a = i.assumptions ?? DEFAULT_ASSUMPTIONS;
  const plan = project(i.reserveBalance, i.reserveMonthly, i.comps, i.year, a, OUTLOOK_YEARS + 1);
  const rate = (l: OutlookLine) => (i.rates[l.id] ?? suggestedGrowth(l.name)) / 100;
  const rows: OutlookYear[] = [];
  let base = 0;
  for (let n = 0; n <= OUTLOOK_YEARS; n++) {
    const year = i.year + n;
    const operating = r0(i.lines.reduce((t, l) => t + l.budgeted * Math.pow(1 + rate(l), n), 0));
    const reserve = n === 0 ? r0((i.reserveMonthlyNow ?? i.reserveMonthly) * 12) : plan[n]?.contribution ?? 0;
    const loans = loanPaymentsIn(i.loans, year);
    const toRaise = operating + reserve + loans;
    if (n === 0) base = toRaise;
    const dues = base > 0 && i.units > 0 ? r0((i.duesNow * (toRaise / base)) / i.units / 12) : 0;
    const before = rows[n - 1]?.dues ?? 0;
    const due = i.comps.filter(c => year >= c.replaceYear && (year - c.replaceYear) % c.life === 0);
    rows.push({
      year, operating, reserve, loans, toRaise, dues,
      change: n === 0 || before <= 0 ? null : Math.round(((dues - before) / before) * 1000) / 10,
      replacements: due.map(c => ({ name: c.name, cost: r0(c.cost * Math.pow(1 + a.inflationPct / 100, n)) })),
      reservesEnd: plan[n]?.end ?? 0, pct: plan[n]?.pct ?? null,
    });
  }
  return rows;
}

export interface GoalCheck { text: string; ok: boolean; detail: string }
/** How the outlook reads against the goals: a dues ceiling in every year ahead, and a reserve target by its year. */
export function checkGoals(rows: OutlookYear[], goals: { measure: string; text: string; target: number; longTarget?: number | null; longBy?: string }[]): GoalCheck[] {
  const out: GoalCheck[] = [];
  for (const g of goals) {
    if (g.measure === 'dues-increase') {
      const over = rows.filter(r => r.change != null && r.change > g.target);
      out.push({ text: g.text, ok: over.length === 0, detail: over.length ? `Over ${g.target}% in ${over.map(r => `${r.year} (${r.change}%)`).join(', ')}` : `At most ${g.target}% in every year shown` });
    }
    if (g.measure === 'reserve-funded' && g.longTarget != null && g.longBy) {
      const row = rows.find(r => String(r.year) === String(g.longBy).slice(0, 4));
      if (row) out.push({ text: `${g.text}: ${g.longTarget}% by ${row.year}`, ok: (row.pct ?? 0) >= g.longTarget, detail: `${row.pct ?? 0}% funded at the end of ${row.year}` });
    }
  }
  return out;
}

// ── Twelve-month cash forecast ───────────────────────────────────────────────
export interface CashMonth { month: string; duesIn: number; operatingOut: number; billsOut: number; reserveOut: number; loansOut: number; end: number; underFloor: boolean }

export interface CashInput {
  /** The first month forecast, 'YYYY-MM' (the current month). */
  from: string;
  cash: number;
  /** Dues billed in a month, all units. */
  monthlyDues: number;
  /** The share of a month's dues that usually comes in, 0 to 1. */
  collected: number;
  /** Operating spend by calendar month, January first, for a year. */
  operatingByMonth: number[];
  /** Bills approved or invoiced and not yet paid, taken in the first month. */
  billsDue: number;
  reserveMonthly: number;
  loans: Loan[];
  floor: number;
}

/** Month-end operating cash for the next twelve months, and whether each month is under the floor the board set. */
export function cashForecast(i: CashInput): CashMonth[] {
  const out: CashMonth[] = [];
  let cash = i.cash;
  for (let n = 0; n < 12; n++) {
    const month = addMonths(i.from, n), m = Number(month.slice(5, 7)) - 1;
    const duesIn = r0(i.monthlyDues * Math.min(1, Math.max(0, i.collected)));
    const operatingOut = r0(i.operatingByMonth[m] ?? 0);
    const billsOut = n === 0 ? r0(i.billsDue) : 0;
    const loansOut = r0(i.loans.filter(l => paysIn(l, month)).reduce((t, l) => t + monthlyPayment(l), 0));
    cash = cash + duesIn - operatingOut - billsOut - i.reserveMonthly - loansOut;
    out.push({ month, duesIn, operatingOut, billsOut, reserveOut: r0(i.reserveMonthly), loansOut, end: r0(cash), underFloor: cash < i.floor });
  }
  return out;
}
