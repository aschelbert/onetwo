/**
 * Funds metrics — the numbers on the Funds tiles, derived from the financial
 * store the same way the Fiscal Lens header and tabs derive them. Pure
 * functions over a snapshot so the tiles are testable and the production
 * tabs underneath keep owning every mutation.
 */
import type { Unit, UnitInvoice } from '@/types/financial';
import type { WorkOrder } from '@/data/financial';
import { daysBetween } from '../runbook/model';

export interface BudgetLine {
  id?: string;
  name: string;
  budgeted: number;
  actual: number;
  acctNum?: string;
}

export interface ReserveLine {
  id: string;
  name: string;
  estimatedCost: number;
  currentFunding: number;
  yearsRemaining: number;
  isContingency?: boolean;
}

export interface FundsSnapshot {
  today: string;
  units: Unit[];
  unitInvoices: UnitInvoice[];
  workOrders: WorkOrder[];
  budget: BudgetLine[];
  reserves: ReserveLine[];
  /** Annual reserve contribution as set on Budget / Reserves. */
  annualReserveContribution: number;
  /** Recommended annual contribution from the store's calculator. */
  recommendedAnnualReserve: number;
  operatingCash: number;
  reservesCash: number;
  hoaDueDay: number;
  autoBillingEnabled: boolean;
  lastBillingRun: string | null;
  lateFee: { enabled: boolean; amount: number; graceDays: number };
  stripeConnected: boolean;
  stripeOnboardingComplete: boolean;
  /** This year's operating spend by month (Jan first), from the budget lines' expenses. */
  spendByMonth?: number[];
}

export const ONLINE_METHODS = ['stripe', 'card', 'online'];

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthName(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', long ? { month: 'long', year: 'numeric' } : { month: 'short' });
}

/** The Fiscal Lens health formula, unchanged. */
export function healthScore(collectionRate: number, reservePct: number, budgetPct: number): number {
  const c = Number.isFinite(collectionRate) ? collectionRate : 0;
  return Math.round(c * 0.4 + Math.min(reservePct, 100) * 0.3 + Math.max(0, 100 - Math.abs(budgetPct - 50)) * 0.3);
}

export function healthLabel(score: number): 'Healthy' | 'Fair' | 'At risk' {
  return score >= 80 ? 'Healthy' : score >= 60 ? 'Fair' : 'At risk';
}

export function unpaidFees(u: Unit): number {
  return u.lateFees.filter(f => !f.waived).reduce((t, f) => t + f.amount, 0);
}

export function openAssessments(u: Unit): number {
  return u.specialAssessments.filter(a => !a.paid).reduce((t, a) => t + a.amount, 0);
}

/** Dues collected this month: who paid, how, and how much is still open. */
export function collected(s: FundsSnapshot) {
  const month = monthKey(s.today);
  const billed = s.units.reduce((t, u) => t + u.monthlyFee, 0);
  let amount = 0;
  let online = 0;
  let check = 0;
  let paidUnits = 0;
  for (const u of s.units) {
    const pays = u.payments.filter(p => monthKey(p.date) === month);
    const sum = pays.reduce((t, p) => t + p.amount, 0);
    amount += sum;
    if (pays.some(p => ONLINE_METHODS.includes((p.method || '').toLowerCase()))) online++;
    else if (pays.length > 0) check++;
    if (u.balance <= 0 || sum >= u.monthlyFee) paidUnits++;
  }
  const outstanding = s.units.reduce((t, u) => t + Math.max(0, u.balance) + unpaidFees(u), 0);
  const behindUnits = s.units.filter(u => u.balance > 0).length;
  return {
    month,
    billed,
    amount,
    paidUnits,
    units: s.units.length,
    pct: s.units.length ? Math.round((paidUnits / s.units.length) * 100) : 0,
    online,
    check,
    outstanding,
    behindUnits,
  };
}

export interface BehindUnit {
  number: string;
  owner: string;
  amount: number;
  daysPastDue: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  forSale: boolean;
  /** Oldest unpaid invoice, when one exists. */
  invoice?: UnitInvoice;
}

/** Units with money owed, with how long the oldest unpaid charge has been open. */
export function behind(s: FundsSnapshot): BehindUnit[] {
  const out: BehindUnit[] = [];
  for (const u of s.units) {
    const owed = Math.max(0, u.balance) + unpaidFees(u);
    if (owed <= 0) continue;
    const unpaid = s.unitInvoices
      .filter(i => i.unitNumber === u.number && (i.status === 'sent' || i.status === 'overdue') && i.dueDate < s.today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    let days: number;
    if (unpaid.length > 0) days = -daysBetween(s.today, unpaid[0].dueDate);
    else days = u.monthlyFee > 0 ? Math.round((u.balance / u.monthlyFee) * 30) : 30;
    days = Math.max(1, days);
    out.push({
      number: u.number,
      owner: u.owner,
      amount: owed,
      daysPastDue: days,
      bucket: days > 90 ? '90+' : days > 60 ? '61-90' : days > 30 ? '31-60' : '0-30',
      forSale: u.status === 'FOR_SALE' || u.status === 'UNDER_CONTRACT',
      invoice: unpaid[0],
    });
  }
  return out.sort((a, b) => b.daysPastDue - a.daysPastDue || b.amount - a.amount);
}

export function agingTotals(list: BehindUnit[]) {
  const t = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const b of list) t[b.bucket] += b.amount;
  return t;
}

/** The invoice register for a month (or all months when `month` is undefined). */
export function invoiceSummary(invoices: UnitInvoice[], month?: string) {
  const list = month ? invoices.filter(i => monthKey(i.createdDate) === month) : invoices;
  const live = list.filter(i => i.status !== 'void');
  const paid = live.filter(i => i.status === 'paid');
  const open = live.filter(i => i.status !== 'paid');
  const byType = { monthly: 0, special_assessment: 0, fee: 0, amenity_fee: 0 } as Record<UnitInvoice['type'], number>;
  for (const i of live) byType[i.type]++;
  return {
    sent: live.length,
    paid: paid.length,
    paidAmount: paid.reduce((t, i) => t + (i.paidAmount ?? i.amount), 0),
    open: open.length,
    openAmount: open.reduce((t, i) => t + i.amount, 0),
    overdue: open.filter(i => i.status === 'overdue').length,
    byType,
  };
}

/** Bills are invoiced work orders; a bill is flagged when paying it would push its budget line over. */
export function bills(s: FundsSnapshot) {
  const byAcct = new Map(s.budget.filter(b => b.acctNum).map(b => [b.acctNum!, b]));
  const toApprove = s.workOrders.filter(w => w.status === 'invoiced');
  const flagged = toApprove.filter(w => {
    const line = byAcct.get(w.acctNum);
    return !!line && line.budgeted > 0 && line.actual + w.amount > line.budgeted;
  });
  const flaggedIds = new Set(flagged.map(w => w.id));
  const within = toApprove.filter(w => !flaggedIds.has(w.id));
  const dueSoon = toApprove.filter(w => w.invoiceDate && daysBetween(s.today, w.invoiceDate) >= -30);
  const sum = (list: WorkOrder[]) => list.reduce((t, w) => t + w.amount, 0);
  const month = monthKey(s.today);
  return {
    toApprove,
    amount: sum(toApprove),
    within,
    withinAmount: sum(within),
    flagged,
    flaggedAmount: sum(flagged),
    dueSoon,
    dueSoonAmount: sum(dueSoon),
    drafts: s.workOrders.filter(w => w.status === 'draft'),
    approved: s.workOrders.filter(w => w.status === 'approved'),
    paidThisMonth: s.workOrders.filter(w => w.status === 'paid' && w.paidDate && monthKey(w.paidDate) === month),
    open: s.workOrders.filter(w => w.status !== 'paid').length,
    vendors: new Set(s.workOrders.filter(w => w.status !== 'paid').map(w => w.vendor)).size,
  };
}

/** Budget against actual for the year, with where the year should be by now. */
export function budgetSummary(s: FundsSnapshot) {
  const total = s.budget.reduce((t, b) => t + b.budgeted, 0);
  const spent = s.budget.reduce((t, b) => t + b.actual, 0);
  const month = Number(s.today.slice(5, 7));
  const expectedPct = Math.round((month / 12) * 100);
  const over = s.budget.filter(b => b.budgeted > 0 && b.actual > b.budgeted).map(b => ({ ...b, overBy: b.actual - b.budgeted }));
  return {
    total,
    spent,
    pct: total > 0 ? Math.round((spent / total) * 100) : 0,
    expectedPct,
    lines: s.budget.length,
    onTrack: s.budget.length - over.length,
    over,
  };
}

/** Reserve funding and the next big replacement. */
export function reserveSummary(s: FundsSnapshot) {
  const needed = s.reserves.reduce((t, r) => t + r.estimatedCost, 0);
  const funded = s.reserves.reduce((t, r) => t + r.currentFunding, 0);
  const year = Number(s.today.slice(0, 4));
  const next = [...s.reserves].filter(r => !r.isContingency).sort((a, b) => a.yearsRemaining - b.yearsRemaining)[0];
  return {
    needed,
    funded,
    pct: needed > 0 ? Math.round((funded / needed) * 100) : 0,
    gap: Math.max(0, needed - funded),
    monthly: Math.round(s.annualReserveContribution / 12),
    recommendedMonthly: Math.round(s.recommendedAnnualReserve / 12),
    next: next ? { name: next.name, year: year + Math.max(0, Math.round(next.yearsRemaining)), cost: next.estimatedCost, funded: next.currentFunding } : null,
    onSchedule: s.annualReserveContribution >= s.recommendedAnnualReserve,
  };
}

/** Operating cash against a month of budgeted spend. */
export function monthsOfCash(s: FundsSnapshot): { months: number; monthlyOut: number } {
  const monthlyOut = s.budget.reduce((t, b) => t + b.budgeted, 0) / 12;
  return { months: monthlyOut > 0 ? Math.round((s.operatingCash / monthlyOut) * 10) / 10 : 0, monthlyOut: Math.round(monthlyOut) };
}

export interface DuesScenario {
  id: 'keep' | 'recommended' | 'minimum';
  label: string;
  /** Average monthly dues per unit. */
  dues: number;
  /** Change against today's average dues, as a fraction. */
  change: number;
  reserveAnnual: number;
  linesAnnual: number;
  note: string;
}

/**
 * Next year's draft: the lines grow by `growth`; the three dues options are
 * today's dues (and what they would leave for reserves), the dues that fund
 * the recommended reserve contribution, and the minimum that covers the lines
 * plus today's transfer. Computed, never saved: the budget runbook turns the
 * chosen one into the real budget.
 */
export function nextYearScenarios(s: FundsSnapshot, growth = 0.03): { year: number; current: number; scenarios: DuesScenario[] } {
  const units = Math.max(1, s.units.length);
  const revenue = s.units.reduce((t, u) => t + u.monthlyFee, 0) * 12;
  const current = Math.round(revenue / 12 / units);
  const lines = Math.round(s.budget.reduce((t, b) => t + b.budgeted, 0) * (1 + growth));
  const per = (reserveAnnual: number) => Math.round((lines + reserveAnnual) / 12 / units);
  const keep = s.annualReserveContribution;
  const rec = Math.max(keep, s.recommendedAnnualReserve);
  const mk = (id: DuesScenario['id'], label: string, dues: number, reserveAnnual: number, note: string): DuesScenario =>
    ({ id, label, dues, change: current > 0 ? (dues - current) / current : 0, reserveAnnual, linesAnnual: lines, note });
  const keepReserve = Math.max(0, revenue - lines);
  const keepNote = keepReserve >= rec
    ? "Today's dues cover the lines and the recommended reserve transfer."
    : keepReserve > 0
      ? `Today's dues leave $${keepReserve.toLocaleString()} a year for reserves, ${keepReserve >= keep ? "enough for today's transfer" : "less than today's transfer"}.`
      : "Today's dues no longer cover the lines.";
  return {
    year: Number(s.today.slice(0, 4)) + 1,
    current,
    scenarios: [
      mk('keep', 'Dues stay', current, keepReserve, keepNote),
      mk('recommended', 'Fund reserves as recommended', per(rec), rec, 'Closes the reserve gap on schedule; no special assessment expected.'),
      mk('minimum', "Cover the lines and today's transfer", per(keep), keep, "The lowest dues that still pay every line and keep today's reserve transfer."),
    ],
  };
}

/** The "Done for you" lines under the Overview tiles. */
export function doneForYou(s: FundsSnapshot): { label: string; detail: string; on: boolean }[] {
  const day = Math.min(Math.max(s.hoaDueDay || 1, 1), 28);
  const billed = s.units.reduce((t, u) => t + u.monthlyFee, 0);
  const lateDay = Math.min(day + (s.lateFee.graceDays || 0), 28);
  return [
    {
      label: 'Billing',
      detail: s.autoBillingEnabled
        ? `Runs on the ${ordinal(day)} · $${billed.toLocaleString()} to ${s.units.length} units${s.lastBillingRun ? ` · last ran ${s.lastBillingRun.slice(0, 10)}` : ''}`
        : `Off · dues are due on the ${ordinal(day)}; invoices are sent by hand`,
      on: s.autoBillingEnabled,
    },
    {
      label: 'Late fees',
      detail: s.lateFee.enabled ? `$${s.lateFee.amount} after ${s.lateFee.graceDays} days · applies on the ${ordinal(lateDay)}` : 'Off · no automatic late fee',
      on: s.lateFee.enabled,
    },
    {
      label: 'Reserve transfer',
      detail: s.annualReserveContribution > 0 ? `$${Math.round(s.annualReserveContribution / 12).toLocaleString()} a month · $${s.annualReserveContribution.toLocaleString()} a year` : 'No monthly transfer set',
      on: s.annualReserveContribution > 0,
    },
  ];
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
