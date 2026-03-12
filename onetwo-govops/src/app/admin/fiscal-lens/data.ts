// Platform finance seed data & accounting helpers
// Client-side only — no Supabase tables for platform GL yet

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export interface PlatformAccount {
  num: string
  name: string
  type: AccountType
  subType: string
  parentNum: string | null
  isActive: boolean
  sortOrder: number
}

export interface GLEntry {
  id: string
  date: string
  memo: string
  debitAcct: string
  creditAcct: string
  amount: number
  source: string
  ref: string | null
  postedAt: string
  postedBy: string | null
}

export interface Budget {
  id: string
  acctNum: string
  name: string
  budgeted: number
  period: string
  fiscalYear: number
  isActive: boolean
}

export type ApprovalCategory = 'engineering' | 'marketing' | 'operations' | 'legal' | 'infrastructure'
export type ApprovalStatus = 'pending' | 'approved' | 'denied'

export interface SpendingApproval {
  id: string
  title: string
  description: string
  amount: number
  category: ApprovalCategory
  status: ApprovalStatus
  requestedBy: string
  votes: Array<{ voter: string; vote: 'approve' | 'deny'; date: string }>
  priority: 'low' | 'normal' | 'high' | 'urgent'
  createdAt: string
}

// ── Seed Data ──────────────────────────────────────

export const seedAccounts: PlatformAccount[] = [
  { num: '1000', name: 'Assets', type: 'asset', subType: 'header', parentNum: null, isActive: true, sortOrder: 100 },
  { num: '1010', name: 'Operating Account (Chase)', type: 'asset', subType: 'bank', parentNum: '1000', isActive: true, sortOrder: 110 },
  { num: '1020', name: 'Stripe Balance', type: 'asset', subType: 'bank', parentNum: '1000', isActive: true, sortOrder: 120 },
  { num: '1030', name: 'Savings Reserve', type: 'asset', subType: 'bank', parentNum: '1000', isActive: true, sortOrder: 130 },
  { num: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'receivable', parentNum: '1000', isActive: true, sortOrder: 140 },
  { num: '1110', name: 'Subscription AR', type: 'asset', subType: 'receivable', parentNum: '1100', isActive: true, sortOrder: 141 },
  { num: '1120', name: 'Trial Conversions Pending', type: 'asset', subType: 'receivable', parentNum: '1100', isActive: true, sortOrder: 142 },
  { num: '1200', name: 'Prepaid Expenses', type: 'asset', subType: 'prepaid', parentNum: '1000', isActive: true, sortOrder: 150 },
  { num: '2000', name: 'Liabilities', type: 'liability', subType: 'header', parentNum: null, isActive: true, sortOrder: 200 },
  { num: '2010', name: 'Accounts Payable', type: 'liability', subType: 'payable', parentNum: '2000', isActive: true, sortOrder: 210 },
  { num: '2020', name: 'Accrued Expenses', type: 'liability', subType: 'payable', parentNum: '2000', isActive: true, sortOrder: 220 },
  { num: '2030', name: 'Deferred Revenue', type: 'liability', subType: 'deferred', parentNum: '2000', isActive: true, sortOrder: 230 },
  { num: '2040', name: 'Credit Card Payable', type: 'liability', subType: 'payable', parentNum: '2000', isActive: true, sortOrder: 240 },
  { num: '3000', name: 'Equity', type: 'equity', subType: 'header', parentNum: null, isActive: true, sortOrder: 300 },
  { num: '3010', name: 'Founder Equity', type: 'equity', subType: 'equity', parentNum: '3000', isActive: true, sortOrder: 310 },
  { num: '3020', name: 'Retained Earnings', type: 'equity', subType: 'equity', parentNum: '3000', isActive: true, sortOrder: 320 },
  { num: '4000', name: 'Revenue', type: 'revenue', subType: 'header', parentNum: null, isActive: true, sortOrder: 400 },
  { num: '4010', name: 'Subscription Revenue - Monthly', type: 'revenue', subType: 'subscription', parentNum: '4000', isActive: true, sortOrder: 410 },
  { num: '4020', name: 'Subscription Revenue - Annual', type: 'revenue', subType: 'subscription', parentNum: '4000', isActive: true, sortOrder: 420 },
  { num: '4030', name: 'Setup Fees', type: 'revenue', subType: 'fees', parentNum: '4000', isActive: true, sortOrder: 430 },
  { num: '4040', name: 'Add-on Services', type: 'revenue', subType: 'services', parentNum: '4000', isActive: true, sortOrder: 440 },
  { num: '4090', name: 'Refunds & Credits', type: 'revenue', subType: 'contra', parentNum: '4000', isActive: true, sortOrder: 490 },
  { num: '5000', name: 'Cost of Goods Sold', type: 'expense', subType: 'header', parentNum: null, isActive: true, sortOrder: 500 },
  { num: '5010', name: 'Cloud Hosting (AWS/GCP)', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 510 },
  { num: '5020', name: 'Stripe Processing Fees', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 520 },
  { num: '5030', name: 'Third-party APIs & Services', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 530 },
  { num: '5040', name: 'Customer Support Tools', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 540 },
  { num: '6000', name: 'Operating Expenses', type: 'expense', subType: 'header', parentNum: null, isActive: true, sortOrder: 600 },
  { num: '6010', name: 'Payroll & Benefits', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 610 },
  { num: '6020', name: 'Contractors & Freelancers', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 620 },
  { num: '6030', name: 'Software & SaaS Tools', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 630 },
  { num: '6040', name: 'Legal & Professional', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 640 },
  { num: '6050', name: 'Marketing & Advertising', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 650 },
  { num: '6060', name: 'Office & Facilities', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 660 },
  { num: '6070', name: 'Insurance', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 670 },
  { num: '6080', name: 'Travel & Conferences', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 680 },
  { num: '6090', name: 'Bank Fees & Interest', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 690 },
  { num: '6100', name: 'Miscellaneous', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 700 },
]

export const seedGLEntries: GLEntry[] = [
  { id: 'PGL5000', date: '2025-06-01', memo: 'Founder initial investment', debitAcct: '1010', creditAcct: '3010', amount: 150000, source: 'equity', ref: null, postedAt: '2025-06-01T00:00:00Z', postedBy: 'system' },
  { id: 'PGL5001', date: '2025-12-31', memo: 'Retained earnings carry-forward', debitAcct: '1010', creditAcct: '3020', amount: 28000, source: 'equity', ref: null, postedAt: '2025-12-31T00:00:00Z', postedBy: 'system' },
  { id: 'PGL5002', date: '2026-01-01', memo: 'Subscription - 1302 R Street NW (Jan)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-001', postedAt: '2026-01-01T10:00:00Z', postedBy: 'system' },
  { id: 'PGL5003', date: '2026-01-01', memo: 'Subscription - Capitol Hill Terraces (Annual)', debitAcct: '1020', creditAcct: '4020', amount: 2508, source: 'stripe', ref: 'tn-002', postedAt: '2026-01-01T00:05:00Z', postedBy: 'system' },
  { id: 'PGL5004', date: '2026-01-01', memo: 'Subscription - Dupont Circle Lofts (Jan)', debitAcct: '1020', creditAcct: '4010', amount: 399, source: 'stripe', ref: 'tn-003', postedAt: '2026-01-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5005', date: '2026-01-01', memo: 'Subscription - Georgetown Mews (Jan)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-005', postedAt: '2026-01-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5006', date: '2026-02-01', memo: 'Subscription - 1302 R Street NW (Feb)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-001', postedAt: '2026-02-01T10:00:00Z', postedBy: 'system' },
  { id: 'PGL5007', date: '2026-02-15', memo: 'Subscription - Dupont Circle Lofts (Feb)', debitAcct: '1020', creditAcct: '4010', amount: 399, source: 'stripe', ref: 'tn-003', postedAt: '2026-02-15T14:22:00Z', postedBy: 'system' },
  { id: 'PGL5008', date: '2026-03-01', memo: 'Subscription - 1302 R Street NW (Mar)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-001', postedAt: '2026-03-01T10:00:00Z', postedBy: 'system' },
  { id: 'PGL5009', date: '2026-02-28', memo: 'Subscription - Dupont Circle Lofts (Mar)', debitAcct: '1020', creditAcct: '4010', amount: 399, source: 'stripe', ref: 'tn-003', postedAt: '2026-02-28T14:22:00Z', postedBy: 'system' },
  { id: 'PGL5010', date: '2026-01-15', memo: 'Stripe payout to Chase', debitAcct: '1010', creditAcct: '1020', amount: 3200, source: 'payout', ref: null, postedAt: '2026-01-15T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5011', date: '2026-02-15', memo: 'Stripe payout to Chase', debitAcct: '1010', creditAcct: '1020', amount: 900, source: 'payout', ref: null, postedAt: '2026-02-15T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5012', date: '2026-03-01', memo: 'Stripe payout to Chase', debitAcct: '1010', creditAcct: '1020', amount: 550, source: 'payout', ref: null, postedAt: '2026-03-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5013', date: '2026-01-31', memo: 'Stripe fees - January', debitAcct: '5020', creditAcct: '1020', amount: 52.27, source: 'stripe_fee', ref: null, postedAt: '2026-01-31T23:59:00Z', postedBy: 'system' },
  { id: 'PGL5014', date: '2026-02-28', memo: 'Stripe fees - February', debitAcct: '5020', creditAcct: '1020', amount: 17.48, source: 'stripe_fee', ref: null, postedAt: '2026-02-28T23:59:00Z', postedBy: 'system' },
  { id: 'PGL5015', date: '2026-01-31', memo: 'AWS hosting - January', debitAcct: '5010', creditAcct: '1010', amount: 2180, source: 'expense', ref: 'aws-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5016', date: '2026-02-28', memo: 'AWS hosting - February', debitAcct: '5010', creditAcct: '1010', amount: 2350, source: 'expense', ref: 'aws-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5017', date: '2026-01-31', memo: 'Twilio + SendGrid - January', debitAcct: '5030', creditAcct: '1010', amount: 285, source: 'expense', ref: 'api-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5018', date: '2026-02-28', memo: 'Twilio + SendGrid - February', debitAcct: '5030', creditAcct: '1010', amount: 310, source: 'expense', ref: 'api-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5019', date: '2026-01-31', memo: 'Intercom - January', debitAcct: '5040', creditAcct: '1010', amount: 189, source: 'expense', ref: 'support-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5020', date: '2026-02-28', memo: 'Intercom - February', debitAcct: '5040', creditAcct: '1010', amount: 189, source: 'expense', ref: 'support-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5021', date: '2026-01-31', memo: 'Payroll - January', debitAcct: '6010', creditAcct: '1010', amount: 17500, source: 'payroll', ref: 'jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5022', date: '2026-02-28', memo: 'Payroll - February', debitAcct: '6010', creditAcct: '1010', amount: 17500, source: 'payroll', ref: 'feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5023', date: '2026-01-31', memo: '1099 Contractors - January', debitAcct: '6020', creditAcct: '1010', amount: 4200, source: 'payroll', ref: 'jan-1099', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5024', date: '2026-02-28', memo: '1099 Contractors - February', debitAcct: '6020', creditAcct: '1010', amount: 4800, source: 'payroll', ref: 'feb-1099', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5025', date: '2026-01-31', memo: 'SaaS tools (GitHub, Figma, Linear, etc.)', debitAcct: '6030', creditAcct: '2040', amount: 780, source: 'expense', ref: 'tools-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5026', date: '2026-02-28', memo: 'SaaS tools (GitHub, Figma, Linear, etc.)', debitAcct: '6030', creditAcct: '2040', amount: 780, source: 'expense', ref: 'tools-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5027', date: '2026-01-15', memo: 'Legal retainer - Q1', debitAcct: '6040', creditAcct: '1010', amount: 4500, source: 'expense', ref: 'legal-q1', postedAt: '2026-01-15T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5028', date: '2026-02-01', memo: 'Google Ads - February', debitAcct: '6050', creditAcct: '2040', amount: 2800, source: 'expense', ref: 'mktg-feb', postedAt: '2026-02-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5029', date: '2026-01-01', memo: 'E&O Insurance - Monthly', debitAcct: '6070', creditAcct: '1010', amount: 580, source: 'expense', ref: 'ins-jan', postedAt: '2026-01-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5030', date: '2026-02-01', memo: 'E&O Insurance - Monthly', debitAcct: '6070', creditAcct: '1010', amount: 580, source: 'expense', ref: 'ins-feb', postedAt: '2026-02-01T12:00:00Z', postedBy: 'system' },
]

export const seedBudgets: Budget[] = [
  { id: 'pb1', acctNum: '5010', name: 'Cloud Hosting', budgeted: 2400, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb2', acctNum: '5020', name: 'Stripe Fees', budgeted: 180, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb3', acctNum: '5030', name: 'Third-party APIs', budgeted: 350, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb4', acctNum: '5040', name: 'Support Tools', budgeted: 200, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb5', acctNum: '6010', name: 'Payroll & Benefits', budgeted: 18000, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb6', acctNum: '6020', name: 'Contractors', budgeted: 5000, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb7', acctNum: '6030', name: 'Software Tools', budgeted: 800, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb8', acctNum: '6040', name: 'Legal & Professional', budgeted: 1500, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb9', acctNum: '6050', name: 'Marketing', budgeted: 3000, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb10', acctNum: '6070', name: 'Insurance', budgeted: 600, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
]

export const seedApprovals: SpendingApproval[] = [
  { id: 'pa-001', title: 'Upgrade AWS RDS to r6g.xlarge', description: 'Current DB instance hitting 85% CPU during peak. Need to scale up for growing tenant base.', amount: 1200, category: 'infrastructure', status: 'pending', requestedBy: 'Alex Rivera', votes: [{ voter: 'Alyssa Schelbert', vote: 'approve', date: '2026-02-28' }], priority: 'high', createdAt: '2026-02-27' },
  { id: 'pa-002', title: 'Google Ads campaign — Q2 push', description: 'Expand PPC campaign targeting DC-area HOA boards. Expected 15-20 new trial signups.', amount: 5000, category: 'marketing', status: 'pending', requestedBy: 'Morgan Lee', votes: [], priority: 'normal', createdAt: '2026-03-01' },
  { id: 'pa-003', title: 'Annual SOC 2 Type II audit', description: 'Required for enterprise sales pipeline. Vendor: Drata + auditor.', amount: 18000, category: 'operations', status: 'approved', requestedBy: 'Alyssa Schelbert', votes: [{ voter: 'Alex Rivera', vote: 'approve', date: '2026-02-15' }, { voter: 'Jordan Kim', vote: 'approve', date: '2026-02-16' }], priority: 'high', createdAt: '2026-02-10' },
  { id: 'pa-004', title: 'Outside counsel — HOA compliance review', description: 'Legal review of DC-specific HOA regulations for compliance module.', amount: 7500, category: 'legal', status: 'pending', requestedBy: 'Jordan Kim', votes: [{ voter: 'Alex Rivera', vote: 'approve', date: '2026-03-02' }], priority: 'normal', createdAt: '2026-03-01' },
  { id: 'pa-005', title: 'Contract UI engineer (3-month)', description: 'Accelerate community portal and voting module build-out.', amount: 24000, category: 'engineering', status: 'denied', requestedBy: 'Alex Rivera', votes: [{ voter: 'Alyssa Schelbert', vote: 'deny', date: '2026-02-20' }, { voter: 'Jordan Kim', vote: 'deny', date: '2026-02-21' }], priority: 'normal', createdAt: '2026-02-18' },
]

// ── Accounting Helpers ──────────────────────────────

export function accountBalance(acctNum: string, accounts: PlatformAccount[], entries: GLEntry[]): number {
  const account = accounts.find(a => a.num === acctNum)
  if (!account) return 0
  const isDebitNormal = account.type === 'asset' || account.type === 'expense'
  let balance = 0
  for (const entry of entries) {
    if (entry.debitAcct === acctNum) balance += entry.amount
    if (entry.creditAcct === acctNum) balance -= entry.amount
  }
  return isDebitNormal ? balance : -balance
}

export function groupBalance(parentNum: string, accounts: PlatformAccount[], entries: GLEntry[]): number {
  const children = accounts.filter(a => a.parentNum === parentNum)
  if (children.length === 0) return accountBalance(parentNum, accounts, entries)
  return children.reduce((sum, child) => {
    const grandchildren = accounts.filter(a => a.parentNum === child.num)
    return sum + (grandchildren.length > 0
      ? groupBalance(child.num, accounts, entries)
      : accountBalance(child.num, accounts, entries))
  }, 0)
}

export function getBudgetVariance(budget: Budget, monthsElapsed: number, accounts: PlatformAccount[], entries: GLEntry[]) {
  const actual = Math.abs(accountBalance(budget.acctNum, accounts, entries))
  const ytdBudget = budget.budgeted * monthsElapsed
  const variance = ytdBudget - actual
  const burnPct = ytdBudget > 0 ? Math.round((actual / ytdBudget) * 100) : 0
  return {
    name: budget.name, acctNum: budget.acctNum, monthlyBudget: budget.budgeted,
    avgMonthly: monthsElapsed > 0 ? actual / monthsElapsed : 0,
    ytdActual: actual, ytdBudget, variance, burnPct,
    status: burnPct > 100 ? 'over' as const : burnPct > 85 ? 'warning' as const : 'healthy' as const,
  }
}

export function generatePnL(fromDate: string, toDate: string, accounts: PlatformAccount[], entries: GLEntry[]) {
  const filtered = entries.filter(e => e.date >= fromDate && e.date <= toDate)
  const revenue = accounts.filter(a => a.type === 'revenue' && a.subType !== 'header' && a.subType !== 'contra')
    .map(a => ({ num: a.num, name: a.name, amount: accountBalance(a.num, accounts, filtered) }))
    .filter(a => a.amount !== 0)
  const cogs = accounts.filter(a => a.parentNum === '5000')
    .map(a => ({ num: a.num, name: a.name, amount: accountBalance(a.num, accounts, filtered) }))
    .filter(a => a.amount !== 0)
  const opex = accounts.filter(a => a.parentNum === '6000')
    .map(a => ({ num: a.num, name: a.name, amount: accountBalance(a.num, accounts, filtered) }))
    .filter(a => a.amount !== 0)
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0)
  const totalCOGS = cogs.reduce((s, r) => s + r.amount, 0)
  const grossProfit = totalRevenue - totalCOGS
  const totalOpEx = opex.reduce((s, r) => s + r.amount, 0)
  const netIncome = grossProfit - totalOpEx
  return { revenue, cogs, opex, totalRevenue, totalCOGS, grossProfit, totalOpEx, netIncome }
}

export function getBalanceSheet(accounts: PlatformAccount[], entries: GLEntry[]) {
  const cash = accountBalance('1010', accounts, entries) + accountBalance('1020', accounts, entries) + accountBalance('1030', accounts, entries)
  const receivables = groupBalance('1100', accounts, entries)
  const prepaid = accountBalance('1200', accounts, entries)
  const totalAssets = cash + receivables + prepaid

  const payables = accountBalance('2010', accounts, entries) + accountBalance('2040', accounts, entries)
  const accrued = accountBalance('2020', accounts, entries)
  const deferred = accountBalance('2030', accounts, entries)
  const totalLiabilities = payables + accrued + deferred

  const founder = accountBalance('3010', accounts, entries)
  const retained = accountBalance('3020', accounts, entries)
  const totalEquity = founder + retained

  return {
    assets: { cash, receivables, prepaid, total: totalAssets },
    liabilities: { payables, accrued, deferred, total: totalLiabilities },
    equity: { founder, retained, total: totalEquity },
  }
}

export function getHealthScore(accounts: PlatformAccount[], entries: GLEntry[], budgets: Budget[], monthsElapsed: number): number {
  const revenueAccounts = accounts.filter(a => a.type === 'revenue' && a.subType !== 'header' && a.subType !== 'contra')
  const totalRevenue = revenueAccounts.reduce((s, a) => s + accountBalance(a.num, accounts, entries), 0)
  const totalCOGS = groupBalance('5000', accounts, entries)
  const totalOpEx = groupBalance('6000', accounts, entries)
  const cashBalance = accountBalance('1010', accounts, entries) + accountBalance('1020', accounts, entries)
  const monthlyBurn = monthsElapsed > 0 ? (totalCOGS + totalOpEx) / monthsElapsed : 0
  const runway = monthlyBurn > 0 ? cashBalance / monthlyBurn : 999
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCOGS) / totalRevenue) * 100 : 0

  const activeBudgets = budgets.filter(b => b.isActive)
  const totalBudgeted = activeBudgets.reduce((s, b) => s + b.budgeted * monthsElapsed, 0)
  const totalActual = activeBudgets.reduce((s, b) => s + Math.abs(accountBalance(b.acctNum, accounts, entries)), 0)
  const budgetAdherence = totalBudgeted > 0 ? Math.min(100, Math.max(0, 100 - ((totalActual - totalBudgeted) / totalBudgeted) * 100)) : 100

  const gmScore = Math.min(100, Math.max(0, grossMargin * 1.25))
  const rwScore = Math.min(100, Math.max(0, (runway / 18) * 100))
  const baScore = budgetAdherence

  return Math.round(gmScore * 0.4 + rwScore * 0.3 + baScore * 0.3)
}

export function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export function fmtDate(d: string): string {
  if (!d) return '--'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
