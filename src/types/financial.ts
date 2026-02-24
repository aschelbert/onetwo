export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  vendor: string;
  invoice: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  expenses: Expense[];
}

export interface ReserveItem {
  id: string;
  name: string;
  estimatedCost: number;
  currentFunding: number;
  usefulLife: number;
  lastReplaced: string;
  yearsRemaining: number;
  isContingency: boolean;
}

export interface ChartOfAccountsEntry {
  num: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  sub: string;
  parent: string | null;
  budgetCat?: string;
  reserveItem?: string;
}

export interface GLEntry {
  id: string;
  date: string;
  memo: string;
  debitAcct: string;
  creditAcct: string;
  amount: number;
  source: 'manual' | 'assessment' | 'payment' | 'expense' | 'case' | 'transfer' | 'fee';
  sourceId: string | null;
  posted: string;
  status: 'posted' | 'void';
}

export interface Unit {
  number: string;
  owner: string;
  email: string;
  phone: string;
  monthlyFee: number;
  votingPct: number;
  status: 'OCCUPIED' | 'VACANT';
  balance: number;
  moveIn: string | null;
  sqft: number;
  bedrooms: number;
  parking: string | null;
  payments: Array<{ date: string; amount: number; method: string; note: string }>;
  lateFees: Array<{ date: string; amount: number; reason: string; waived: boolean }>;
  specialAssessments: Array<{ id: string; date: string; amount: number; reason: string; paid: boolean; paidDate: string | null }>;
  stripeCustomerId?: string | null;
}

export interface BalanceSheet {
  assets: {
    operating: number;
    reserves: number;
    pettyCash: number;
    assessmentsAR: number;
    specialAR: number;
    lateFeesAR: number;
    insuranceAR: number;
    prepaid: number;
    totalCurrent: number;
    totalReceivable: number;
    total: number;
  };
  liabilities: {
    payable: number;
    prepaidAssessments: number;
    deposits: number;
    accrued: number;
    total: number;
  };
  equity: {
    operatingFund: number;
    reserveFund: number;
    retained: number;
    total: number;
  };
}

export interface UnitInvoice {
  id: string;
  unitNumber: string;
  type: 'fee' | 'special_assessment' | 'monthly';
  description: string;
  amount: number;
  status: 'sent' | 'paid' | 'overdue' | 'void';
  createdDate: string;
  dueDate: string;
  paidDate: string | null;
  paidAmount: number | null;
  paymentMethod: string | null;
  stripePaymentLink: string | null;
  glEntryId: string | null;
  paymentGlEntryId: string | null;
}

