import type { ChartOfAccountsEntry, GLEntry, Unit } from '@/types/financial';

/**
 * Returns the GL accounts (AR + revenue) for a given unit invoice type.
 */
export function getGLAccountsForInvoice(type: 'fee' | 'special_assessment' | 'amenity_fee' | 'monthly'): { arAcct: string; revenueAcct: string } {
  switch (type) {
    case 'fee':
      return { arAcct: '1130', revenueAcct: '4030' };
    case 'amenity_fee':
      return { arAcct: '1130', revenueAcct: '4060' };
    case 'special_assessment':
      return { arAcct: '1120', revenueAcct: '4020' };
    case 'monthly':
      return { arAcct: '1110', revenueAcct: '4010' };
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
