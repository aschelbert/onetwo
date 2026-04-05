import type { ChartOfAccountsEntry, GLEntry, Unit } from '@/types/financial';

// ─── GL Account Mapping ─────────────────────────────
export type GLAccountMapping = {
  bankAccount: string;
  assessmentsReceivable: string;
  specialAssessmentsReceivable: string;
  lateFeeReceivable: string;
  regularAssessmentRevenue: string;
  specialAssessmentRevenue: string;
  lateFeeRevenue: string;
  amenityRevenue: string;
};

export const DEFAULT_GL_MAPPING: GLAccountMapping = {
  bankAccount: '1010',
  assessmentsReceivable: '1110',
  specialAssessmentsReceivable: '1120',
  lateFeeReceivable: '1130',
  regularAssessmentRevenue: '4010',
  specialAssessmentRevenue: '4020',
  lateFeeRevenue: '4030',
  amenityRevenue: '4060',
};

/**
 * Returns the GL accounts (AR + revenue) for a given unit invoice type.
 */
export function getGLAccountsForInvoice(
  type: 'fee' | 'special_assessment' | 'amenity_fee' | 'monthly',
  mapping: GLAccountMapping = DEFAULT_GL_MAPPING,
): { arAcct: string; revenueAcct: string } {
  switch (type) {
    case 'fee':
      return { arAcct: mapping.lateFeeReceivable, revenueAcct: mapping.lateFeeRevenue };
    case 'amenity_fee':
      return { arAcct: mapping.lateFeeReceivable, revenueAcct: mapping.amenityRevenue };
    case 'special_assessment':
      return { arAcct: mapping.specialAssessmentsReceivable, revenueAcct: mapping.specialAssessmentRevenue };
    case 'monthly':
      return { arAcct: mapping.assessmentsReceivable, revenueAcct: mapping.regularAssessmentRevenue };
  }
}

/**
 * Compute the balance for a single account number.
 * Debit-normal accounts (asset, expense): debits add, credits subtract.
 * Credit-normal accounts (liability, equity, income): credits add, debits subtract.
 */
export function computeAcctBalance(
  acctNum: string,
  chartOfAccounts: ChartOfAccountsEntry[],
  generalLedger: GLEntry[],
): number {
  const acct = chartOfAccounts.find(a => a.num === acctNum);
  if (!acct) return 0;
  const isDebitNormal = acct.type === 'asset' || acct.type === 'expense';
  let bal = 0;
  generalLedger.forEach(e => {
    if (e.debitAcct === acctNum) bal += e.amount;
    if (e.creditAcct === acctNum) bal -= e.amount;
  });
  return isDebitNormal ? bal : -bal;
}

/**
 * Recursively compute the balance for a parent account and all its children.
 */
export function computeAcctGroupBalance(
  parentNum: string,
  chartOfAccounts: ChartOfAccountsEntry[],
  generalLedger: GLEntry[],
): number {
  const children = chartOfAccounts.filter(a => a.parent === parentNum);
  if (children.length === 0) return computeAcctBalance(parentNum, chartOfAccounts, generalLedger);
  return children.reduce((sum, child) => {
    const childChildren = chartOfAccounts.filter(a => a.parent === child.num);
    if (childChildren.length > 0) return sum + computeAcctGroupBalance(child.num, chartOfAccounts, generalLedger);
    return sum + computeAcctBalance(child.num, chartOfAccounts, generalLedger);
  }, 0);
}

/**
 * Compute delinquency aging buckets based on unit balance vs monthly fee ratio.
 */
export function computeDelinquencyAging(units: Unit[]): {
  current: Unit[];
  days30: Unit[];
  days60: Unit[];
  days90plus: Unit[];
  totalOutstanding: number;
} {
  const delinquent = units.filter(u => u.balance > 0);
  return {
    current: delinquent.filter(u => u.balance <= u.monthlyFee),
    days30: delinquent.filter(u => u.balance > u.monthlyFee && u.balance <= u.monthlyFee * 2),
    days60: delinquent.filter(u => u.balance > u.monthlyFee * 2 && u.balance <= u.monthlyFee * 3),
    days90plus: delinquent.filter(u => u.balance > u.monthlyFee * 3),
    totalOutstanding: delinquent.reduce((s, u) => s + u.balance, 0),
  };
}
