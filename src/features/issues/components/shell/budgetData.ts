import type { BudgetFinancials } from '@/types/issues';

// ─── Section keys (match action IDs in CATS annual-budgeting step 0) ───
export const SECTION_KEYS = [
  'reconciliations',
  'budget-variance',
  'collections',
  'reserves',
  'projections',
] as const;

// ─── Phase bar segments ───
export const PHASES = [
  { id: 'gather',  label: 'Analyze',    color: '#6366f1' },
  { id: 'draft',   label: 'Build',      color: '#f59e0b' },
  { id: 'present', label: 'Approve',    color: '#10b981' },
  { id: 'adopt',   label: 'Distribute', color: '#3b82f6' },
] as const;

// ─── Demo financials for seed case ───
export const ANNUAL_BUDGET_FINANCIALS: BudgetFinancials = {
  accounts: [
    { num: '1010', name: 'Operating Checking',     budget: 0,      actual: 124_530 },
    { num: '1020', name: 'Reserve Money Market',    budget: 0,      actual: 387_200 },
    { num: '1030', name: 'Reserve CD',              budget: 0,      actual: 150_000 },
  ],
  budgetLines: [
    { label: 'Management Fee',         amount: 42_000 },
    { label: 'Insurance',              amount: 38_500 },
    { label: 'Utilities',              amount: 31_200 },
    { label: 'Landscaping',            amount: 18_000 },
    { label: 'Elevator Maintenance',   amount: 14_400 },
    { label: 'Cleaning / Janitorial',  amount: 12_000 },
    { label: 'Repairs & Maintenance',  amount: 24_000 },
    { label: 'Legal & Professional',   amount:  8_000 },
    { label: 'Administrative',         amount:  6_500 },
    { label: 'Contingency (5%)',       amount: 10_730 },
  ],
  reserveComponents: [
    { name: 'Roof Replacement',    balance: 142_000, funded: 68 },
    { name: 'Elevator Modernize',  balance: 95_000,  funded: 55 },
    { name: 'Exterior Paint',      balance: 62_000,  funded: 78 },
    { name: 'Plumbing Risers',     balance: 38_200,  funded: 42 },
  ],
  delinquent: {
    units: 4,
    total: 8_750,
    aging: [
      { bucket: '30 days',  amount: 2_100 },
      { bucket: '60 days',  amount: 3_400 },
      { bucket: '90+ days', amount: 3_250 },
    ],
  },
  collectionRates: [
    { month: 'Sep', rate: 96 },
    { month: 'Oct', rate: 97 },
    { month: 'Nov', rate: 95 },
    { month: 'Dec', rate: 93 },
    { month: 'Jan', rate: 94 },
    { month: 'Feb', rate: 96 },
  ],
  totalUnits: 48,
  currentMonthly: 685,
};

// ─── Derived baseline calculations ───
export interface Baseline {
  expenseBaseline: { label: string; amount: number }[];
  totalExpenseBaseline: number;
  reserveContribution: number;
  grossRevenue: number;
  netRevenue: number;
  totalCosts: number;
  netPosition: number;
  requiredMonthly: number;
  increaseNeeded: number;
}

export function deriveBaseline(f: BudgetFinancials): Baseline {
  const expenseBaseline = f.budgetLines.map(b => ({ label: b.label, amount: b.amount }));
  const totalExpenseBaseline = expenseBaseline.reduce((s, e) => s + e.amount, 0);

  // Reserve contribution = sum of component balances * avg shortfall
  const avgFunded = f.reserveComponents.reduce((s, r) => s + r.funded, 0) / (f.reserveComponents.length || 1);
  const reserveContribution = Math.round(totalExpenseBaseline * 0.15); // 15% of operating as reserve contrib

  const grossRevenue = f.currentMonthly * f.totalUnits * 12;
  const netRevenue = grossRevenue - Math.round(grossRevenue * (1 - (f.collectionRates.reduce((s, r) => s + r.rate, 0) / f.collectionRates.length / 100)));
  const totalCosts = totalExpenseBaseline + reserveContribution;
  const netPosition = netRevenue - totalCosts;

  const requiredMonthly = Math.ceil(totalCosts / f.totalUnits / 12);
  const increaseNeeded = requiredMonthly - f.currentMonthly;

  return {
    expenseBaseline,
    totalExpenseBaseline,
    reserveContribution,
    grossRevenue,
    netRevenue,
    totalCosts,
    netPosition,
    requiredMonthly,
    increaseNeeded,
  };
}
