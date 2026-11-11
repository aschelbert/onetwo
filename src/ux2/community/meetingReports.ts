/**
 * Reports a meeting can carry as point-in-time snapshots: each is built from
 * the app's data as of a date and then kept as a plain table, so the record
 * shows what the board and owners saw even after the books move on.
 */
import { fundStatements } from '@/lib/ledger';
import type { BudgetCategory, ReserveItem, Unit } from '@/types/financial';
import type { ReportKind, ReportSnapshot, Audience } from './meetingRecord';

export interface ReportSource {
  units: Unit[];
  budgetCategories: BudgetCategory[];
  reserveItems: ReserveItem[];
  chartOfAccounts: Parameters<typeof fundStatements>[0];
  generalLedger: Parameters<typeof fundStatements>[1];
  openRequests: { id: string; title: string; status: string; unit?: string; created: string }[];
  workOrders: { id: string; title: string; status: string; vendor?: string; amount?: number }[];
}

export const REPORTS: Record<ReportKind, { label: string; from: string; audience: Audience; dated: boolean }> = {
  balance_sheet: { label: 'Balance sheet', from: 'Funds', audience: 'all', dated: true },
  income_statement: { label: 'Income statement, year to date', from: 'Funds', audience: 'all', dated: true },
  budget_vs_actual: { label: 'Budget vs actual', from: 'Funds', audience: 'all', dated: true },
  reserve_status: { label: 'Reserve fund status', from: 'Funds', audience: 'all', dated: false },
  delinquency: { label: 'Delinquency report', from: 'Funds', audience: 'board', dated: false },
  dues_by_unit: { label: 'Dues by unit', from: 'Funds', audience: 'all', dated: false },
  open_requests: { label: 'Open requests and work orders', from: 'Community, Board Room', audience: 'all', dated: false },
  // Attached by the Annual budget runbook from its draft, as it stood; not offered in the picker.
  proposed_budget: { label: 'Proposed budget', from: 'Annual budget runbook', audience: 'all', dated: false },
};

/** The reports a person can pick to attach; the proposed budget comes from the budget runbook. */
export const PICKABLE_REPORTS = (Object.keys(REPORTS) as ReportKind[]).filter(k => k !== 'proposed_budget');

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function buildReport(kind: ReportKind, asOf: string, src: ReportSource): ReportSnapshot {
  const yearStart = `${asOf.slice(0, 4)}-01-01`;
  switch (kind) {
    case 'balance_sheet': {
      const s = fundStatements(src.chartOfAccounts, src.generalLedger, yearStart, asOf);
      const row = (label: string, k: 'assets' | 'liabilities' | 'fundBalance') => [label, usd(s.operating[k]), usd(s.reserve[k]), usd(s.total[k])];
      return { title: `Balance sheet as of ${asOf}`, columns: ['', 'Operating', 'Reserve', 'Total'], rows: [row('Assets', 'assets'), row('Liabilities', 'liabilities'), row('Fund balance', 'fundBalance')], note: s.total.ties ? undefined : 'An account is missing from the chart; totals may not tie.' };
    }
    case 'income_statement': {
      const s = fundStatements(src.chartOfAccounts, src.generalLedger, yearStart, asOf);
      const row = (label: string, k: 'revenue' | 'expenses' | 'net') => [label, usd(s.operating.period[k]), usd(s.reserve.period[k]), usd(s.total.period[k])];
      return { title: `Income statement, ${yearStart} to ${asOf}`, columns: ['', 'Operating', 'Reserve', 'Total'], rows: [row('Revenue', 'revenue'), row('Expenses', 'expenses'), row('Net', 'net')] };
    }
    case 'budget_vs_actual': {
      const rows = src.budgetCategories.map(c => {
        const spent = c.expenses.filter(e => e.date >= yearStart && e.date <= asOf).reduce((t, e) => t + e.amount, 0);
        return [c.name, usd(c.budgeted), usd(spent), c.budgeted ? `${Math.round((spent / c.budgeted) * 100)}%` : '—'];
      });
      const b = src.budgetCategories.reduce((t, c) => t + c.budgeted, 0);
      const s = src.budgetCategories.reduce((t, c) => t + c.expenses.filter(e => e.date >= yearStart && e.date <= asOf).reduce((x, e) => x + e.amount, 0), 0);
      return { title: `Budget vs actual, ${yearStart} to ${asOf}`, columns: ['Category', 'Budget', 'Spent', 'Used'], rows, totals: ['Total', usd(b), usd(s), b ? `${Math.round((s / b) * 100)}%` : '—'] };
    }
    case 'reserve_status': {
      const rows = src.reserveItems.map(r => [r.name, usd(r.estimatedCost), usd(r.currentFunding), r.estimatedCost ? `${Math.round((r.currentFunding / r.estimatedCost) * 100)}%` : '—', `${r.yearsRemaining} yr`]);
      const cost = src.reserveItems.reduce((t, r) => t + r.estimatedCost, 0), funded = src.reserveItems.reduce((t, r) => t + r.currentFunding, 0);
      return { title: `Reserve fund status, captured ${asOf}`, columns: ['Component', 'Cost', 'Funded', '%', 'Left'], rows, totals: ['Total', usd(cost), usd(funded), cost ? `${Math.round((funded / cost) * 100)}%` : '—', ''] };
    }
    case 'delinquency': {
      const late = src.units.filter(u => u.balance > 0).sort((a, b) => b.balance - a.balance);
      return { title: `Delinquency, captured ${asOf}`, columns: ['Unit', 'Owner', 'Owed', 'Months'], rows: late.map(u => [u.number, u.owner, usd(u.balance), u.monthlyFee ? (u.balance / u.monthlyFee).toFixed(1) : '—']), totals: [`${late.length} units`, '', usd(late.reduce((t, u) => t + u.balance, 0)), ''], note: 'Board only.' };
    }
    case 'dues_by_unit': {
      const rows = [...src.units].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map(u => [u.number, usd(u.monthlyFee), `${u.votingPct}%`]);
      return { title: `Dues by unit, captured ${asOf}`, columns: ['Unit', 'Monthly dues', 'Share'], rows, totals: [`${src.units.length} units`, usd(src.units.reduce((t, u) => t + u.monthlyFee, 0)), ''] };
    }
    case 'open_requests': {
      const rows = [
        ...src.openRequests.map(r => [r.title, 'Request', r.status, r.unit ? `Unit ${r.unit}` : '']),
        ...src.workOrders.map(w => [w.title, 'Work order', w.status, w.vendor ?? '']),
      ];
      return { title: `Open requests and work orders, as of ${asOf}`, columns: ['What', 'Kind', 'Status', 'Who'], rows };
    }
    case 'proposed_budget':
      // Always attached frozen, from the draft; a rebuild has no draft to read.
      return { title: `Proposed budget, as of ${asOf}`, columns: ['Line', 'Amount'], rows: [['Open the Annual budget action for the draft', '']] };
  }
}
