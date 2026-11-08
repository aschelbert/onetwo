import type { ChartOfAccountsEntry, Fund, GLEntry, Unit, UnitInvoice } from '@/types/financial';

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
  /** Money owners paid ahead (a liability until the next dues are billed). */
  prepaidAssessments: string;
  /** Bills received and not yet paid. */
  accountsPayable: string;
  reserveBankAccount: string;
  /** Fund balance (equity) accounts, where opening balances land. */
  operatingFundBalance: string;
  reserveFundBalance: string;
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
  prepaidAssessments: '2020',
  accountsPayable: '2010',
  reserveBankAccount: '1020',
  operatingFundBalance: '3010',
  reserveFundBalance: '3020',
};

// ─── Opening balances ─────────────────────────────────
/** Every opening entry names what it is in `sourceId`: opening:cash:operating, opening:unit:4B, opening:bill:OB-1. */
export const OPENING_PREFIX = 'opening:';
export const isOpeningEntry = (e: GLEntry) => e.status !== 'void' && !!e.sourceId && e.sourceId.startsWith(OPENING_PREFIX);
/** An invoice standing for a balance brought over at the cutover. */
export const OPENING_INVOICE_MARK = 'opening';
export const OPENING_BILL_PREFIX = 'OB-';

/**
 * Returns the GL accounts (AR + revenue) for a given unit invoice type.
 */
export function getGLAccountsForInvoice(
  type: 'fee' | 'special_assessment' | 'amenity_fee' | 'monthly',
  mapping: GLAccountMapping = DEFAULT_GL_MAPPING,
  fund?: Fund | null,
): { arAcct: string; revenueAcct: string } {
  switch (type) {
    case 'fee':
      return { arAcct: mapping.lateFeeReceivable, revenueAcct: mapping.lateFeeRevenue };
    case 'amenity_fee':
      return { arAcct: mapping.lateFeeReceivable, revenueAcct: mapping.amenityRevenue };
    case 'special_assessment':
      // An operating special assessment (an operating shortfall) is assessment income of the operating fund.
      if (fund === 'operating') return { arAcct: mapping.assessmentsReceivable, revenueAcct: mapping.regularAssessmentRevenue };
      return { arAcct: mapping.specialAssessmentsReceivable, revenueAcct: mapping.specialAssessmentRevenue };
    case 'monthly':
      return { arAcct: mapping.assessmentsReceivable, revenueAcct: mapping.regularAssessmentRevenue };
  }
}

// ─── Unit balances ───────────────────────────────────
/**
 * A unit's `balance` is everything charged through the invoice register
 * (dues, fees, special assessments) less payments; it is negative when the
 * owner has paid ahead. Fees recorded before the register have no invoice
 * and are owed on top of it.
 */
export const isOpenInvoice = (i: UnitInvoice) => i.status === 'sent' || i.status === 'overdue';
export const invoiceRemaining = (i: UnitInvoice) => (isOpenInvoice(i) ? Math.max(0, Math.round((i.amount - (i.paidAmount ?? 0)) * 100) / 100) : 0);
/** Fees from before the invoice register that are still owed. */
export const legacyFees = (u: Unit) => u.lateFees.filter(f => !f.waived && !f.paid && !f.invoiceId);
export const legacyFeesOwed = (u: Unit) => legacyFees(u).reduce((t, f) => t + f.amount, 0);
/** What the owner owes today. */
export const amountOwed = (u: Unit) => Math.max(0, u.balance) + legacyFeesOwed(u);
/** Money the owner has paid ahead. */
export const creditOf = (u: Unit) => Math.max(0, -u.balance);
/** The part of a unit's balance that no invoice stands behind (brought over from before the register, or opening balances). */
export function legacyOwed(u: Unit, invoices: UnitInvoice[]): number {
  const open = invoices.filter(i => i.unitNumber === u.number).reduce((t, i) => t + invoiceRemaining(i), 0);
  return Math.max(0, Math.round((u.balance - open) * 100) / 100);
}

/** The order a payment is applied in: dues, then special assessments, then fees; oldest due first within each. */
export const APPLICATION_ORDER: Record<UnitInvoice['type'], number> = { monthly: 0, special_assessment: 1, fee: 2, amenity_fee: 2 };
export function openInvoicesInOrder(unitNum: string, invoices: UnitInvoice[]): UnitInvoice[] {
  return invoices
    .filter(i => i.unitNumber === unitNum && invoiceRemaining(i) > 0)
    .sort((a, b) => APPLICATION_ORDER[a.type] - APPLICATION_ORDER[b.type] || a.dueDate.localeCompare(b.dueDate) || a.createdDate.localeCompare(b.createdDate));
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
    if (e.status === 'void') return;
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
