/**
 * ledgerView.ts -- Derived labels for BooksLedger columns:
 *   postedByFor(entry)   -> human label like "Money in . Alyssa"
 *   proofFor(entry)      -> proof label or red "No memo attached . add reason"
 *   statementLines(...)  -> Income Statement vs Budget table lines
 *   yearEndPackage(...)  -> year-end checklist items
 */

import type { GLEntry, GLPostedBy, BudgetCategory } from '@/types/financial';

// ── Flow -> human label mapping ──────────────────────────────────────────────

const FLOW_LABELS: Record<string, string> = {
  money_in: 'Money in',
  money_out: 'Money out',
  manual: 'Manual entry',
  assessment: 'Assessment',
  payment: 'Payment',
  expense: 'Expense',
  case: 'Case',
  transfer: 'Transfer',
  fee: 'Fee',
  refund: 'Refund',
  payroll: 'Payroll',
};

const SOURCE_TO_FLOW: Record<string, string> = {
  assessment: 'Money in',
  payment: 'Money in',
  fee: 'Money in',
  expense: 'Money out',
  case: 'Money out',
  payroll: 'Money out',
  transfer: 'Transfer',
  manual: 'Manual entry',
  refund: 'Refund',
};

/**
 * Derive a human-readable "Posted by" label for a GL entry.
 * New entries have `postedBy.flow` + optional `userName`.
 * Legacy entries only have `source`.
 */
export function postedByFor(entry: GLEntry): string {
  if (entry.postedBy) {
    const pb: GLPostedBy = entry.postedBy;
    const flowLabel = FLOW_LABELS[pb.flow] || pb.flow;
    return pb.userName ? `${flowLabel} . ${pb.userName}` : flowLabel;
  }
  // Legacy fallback: map source -> label
  return SOURCE_TO_FLOW[entry.source] || entry.source;
}

/**
 * Derive a proof label for a GL entry.
 * If proof exists, return the proof type/label.
 * For manual entries without a reason, return a red warning label.
 */
export function proofFor(entry: GLEntry): { label: string; isWarning: boolean } {
  if (entry.proof) {
    const proofLabel = entry.proof.label || entry.proof.type;
    return { label: proofLabel, isWarning: false };
  }

  if (entry.reason) {
    return { label: entry.reason, isWarning: false };
  }

  if (entry.source === 'manual' && !entry.reason) {
    return { label: 'No memo attached . add reason', isWarning: true };
  }

  // Non-manual entries without explicit proof -- infer from source
  const sourceLabels: Record<string, string> = {
    payment: 'Payment receipt',
    assessment: 'Assessment billing',
    expense: 'Vendor invoice',
    case: 'Case record',
    transfer: 'Transfer record',
    fee: 'Fee billing',
    refund: 'Refund record',
    payroll: 'Payroll record',
  };

  return { label: sourceLabels[entry.source] || '--', isWarning: false };
}

// ── Statement Lines ──────────────────────────────────────────────────────────

export interface StatementLine {
  accountNum: string;
  accountName: string;
  actual: number;
  budgeted: number;
  variance: number;
  variancePct: number;
  type: 'income' | 'expense';
}

export interface StatementLinesResult {
  incomeLines: StatementLine[];
  expenseLines: StatementLine[];
  totalIncome: number;
  totalExpenses: number;
  totalBudgetedIncome: number;
  totalBudgetedExpenses: number;
  netIncome: number;
}

/**
 * Compute Income Statement vs Budget table lines for a given period.
 */
export function statementLines(
  generalLedger: GLEntry[],
  budgetCategories: BudgetCategory[],
  chartOfAccounts: Array<{ num: string; name: string; type: string; sub: string; budgetCat?: string }>,
  period: { start: string; end: string },
): StatementLinesResult {
  const entries = generalLedger.filter(e => e.date >= period.start && e.date <= period.end);

  const incomeAccts = chartOfAccounts.filter(a => a.type === 'income' && a.sub !== 'header');
  const expenseAccts = chartOfAccounts.filter(a => a.type === 'expense' && a.sub !== 'header');

  const incomeLines: StatementLine[] = incomeAccts.map(acct => {
    let actual = 0;
    entries.forEach(e => {
      if (e.creditAcct === acct.num) actual += e.amount;
      if (e.debitAcct === acct.num) actual -= e.amount;
    });
    return {
      accountNum: acct.num,
      accountName: acct.name,
      actual,
      budgeted: 0,
      variance: -actual,
      variancePct: 0,
      type: 'income' as const,
    };
  }).filter(l => l.actual !== 0);

  const expenseLines: StatementLine[] = expenseAccts.map(acct => {
    let actual = 0;
    entries.forEach(e => {
      if (e.debitAcct === acct.num) actual += e.amount;
      if (e.creditAcct === acct.num) actual -= e.amount;
    });

    const budgetCat = budgetCategories.find(c =>
      chartOfAccounts.some(a => a.budgetCat === c.id && a.num === acct.num),
    );
    const budgeted = budgetCat?.budgeted ?? 0;
    const variance = budgeted - actual;
    const variancePct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;

    return {
      accountNum: acct.num,
      accountName: acct.name,
      actual,
      budgeted,
      variance,
      variancePct,
      type: 'expense' as const,
    };
  }).filter(l => l.actual !== 0 || l.budgeted !== 0);

  const totalIncome = incomeLines.reduce((s, l) => s + l.actual, 0);
  const totalExpenses = expenseLines.reduce((s, l) => s + l.actual, 0);
  const totalBudgetedIncome = 0; // Income is not typically budgeted at account level
  const totalBudgetedExpenses = expenseLines.reduce((s, l) => s + l.budgeted, 0);

  return {
    incomeLines,
    expenseLines,
    totalIncome,
    totalExpenses,
    totalBudgetedIncome,
    totalBudgetedExpenses,
    netIncome: totalIncome - totalExpenses,
  };
}

// ── Year End Package ─────────────────────────────────────────────────────────

export interface YearEndChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail: string;
}

export interface YearEndInputs {
  periodCloses: Array<{ period: string; closedAt: string | null; locked: boolean }>;
  generalLedger: GLEntry[];
  workOrders: Array<{ vendor: string; amount: number; paidDate: string | null; status: string }>;
  buildingName: string;
  buildingState: string;
  entityType: string;
}

/**
 * Generate year-end package checklist items.
 */
export function yearEndPackage(year: number, inputs: YearEndInputs): YearEndChecklistItem[] {
  const items: YearEndChecklistItem[] = [];
  const yearStr = String(year);

  // 1. Closed periods count
  const yearPeriods = Array.from({ length: 12 }, (_, i) =>
    `${yearStr}-${String(i + 1).padStart(2, '0')}`,
  );
  const closedPeriods = yearPeriods.filter(p =>
    inputs.periodCloses.some(pc => pc.period === p && pc.closedAt),
  );
  items.push({
    key: 'periods_closed',
    label: 'Monthly periods closed',
    done: closedPeriods.length >= 12,
    detail: `${closedPeriods.length} of 12 months closed`,
  });

  // 2. 1120-H draft ready
  const yearEntries = inputs.generalLedger.filter(e => e.date.startsWith(yearStr));
  const hasIncome = yearEntries.some(e => e.source === 'assessment' || e.source === 'payment');
  items.push({
    key: 'form_1120h',
    label: 'Form 1120-H draft',
    done: closedPeriods.length >= 12 && hasIncome,
    detail: closedPeriods.length >= 12
      ? 'All periods closed. 1120-H data ready for CPA review.'
      : `Close remaining ${12 - closedPeriods.length} period(s) before generating 1120-H.`,
  });

  // 3. DC D-20 checklist (or state tax form)
  const isIncorporated = inputs.entityType === 'incorporated';
  const isDC = inputs.buildingState === 'DC' || inputs.buildingState === 'District of Columbia';
  const localFormName = isDC
    ? (isIncorporated ? 'D-20' : 'D-30')
    : 'State tax return';
  items.push({
    key: 'local_tax',
    label: `${localFormName} checklist`,
    done: closedPeriods.length >= 12,
    detail: isDC
      ? `${inputs.buildingName} files ${localFormName} with DC OTR. ${closedPeriods.length >= 12 ? 'Ready.' : 'Close all periods first.'}`
      : `State tax filing for ${inputs.buildingState}. ${closedPeriods.length >= 12 ? 'Ready.' : 'Close all periods first.'}`,
  });

  // 4. 1099-NEC for vendors over $600
  const yearWOs = inputs.workOrders.filter(
    wo => wo.paidDate && wo.paidDate.startsWith(yearStr) && wo.status === 'paid',
  );
  const vendorTotals: Record<string, number> = {};
  yearWOs.forEach(wo => {
    vendorTotals[wo.vendor] = (vendorTotals[wo.vendor] || 0) + wo.amount;
  });
  const vendors1099 = Object.entries(vendorTotals)
    .filter(([, total]) => total >= 600)
    .map(([vendor, total]) => ({ vendor, total }));
  items.push({
    key: 'form_1099nec',
    label: '1099-NEC for vendors',
    done: vendors1099.length === 0 || closedPeriods.length >= 12,
    detail: vendors1099.length === 0
      ? 'No vendors paid $600+ this year.'
      : `${vendors1099.length} vendor(s) over $600: ${vendors1099.map(v => v.vendor).join(', ')}`,
  });

  return items;
}
