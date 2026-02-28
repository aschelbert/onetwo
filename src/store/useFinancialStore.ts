import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as financialSvc from '@/lib/services/financial';
import type { BudgetCategory, ReserveItem, ChartOfAccountsEntry, GLEntry, Unit, UnitInvoice } from '@/types/financial';
import { seedBudgetCategories, seedReserveItems, seedChartOfAccounts, seedUnits, seedWorkOrders, type WorkOrder } from '@/data/financial';

// ─── GL Filter state ─────────────────────────────────
interface GLFilter {
  account: string;
  source: string;
  search: string;
}

// ─── Store interface ─────────────────────────────────
interface FinancialState {
  // Data
  tenantId: string | null;
  budgetCategories: BudgetCategory[];
  reserveItems: ReserveItem[];
  chartOfAccounts: ChartOfAccountsEntry[];
  acctStatus: Record<string, boolean>;
  generalLedger: GLEntry[];
  glNextId: number;
  units: Unit[];
  hoaDueDay: number;
  annualReserveContribution: number;
  workOrders: WorkOrder[];
  unitInvoices: UnitInvoice[];

  // UI state
  activeTab: string;
  glFilter: GLFilter;
  glPage: number;

  // DB sync
  loadFromDb: (tenantId: string) => Promise<void>;

  // Tab switching
  setActiveTab: (tab: string) => void;
  setGlFilter: (filter: Partial<GLFilter>) => void;
  setGlPage: (page: number) => void;

  // GL engine
  glPost: (date: string, memo: string, debitAcct: string, creditAcct: string, amount: number, source: GLEntry['source'], sourceId: string | null) => GLEntry;
  seedGeneralLedger: () => void;

  // Account helpers
  getAcct: (num: string) => ChartOfAccountsEntry | undefined;
  getAcctName: (num: string) => string;
  getAcctsByType: (type: string) => ChartOfAccountsEntry[];
  getAcctChildren: (parentNum: string) => ChartOfAccountsEntry[];
  acctBalance: (acctNum: string) => number;
  acctGroupBalance: (parentNum: string) => number;
  glByAccount: (acctNum: string) => GLEntry[];

  // Reports
  getBalanceSheet: () => any;
  getIncomeStatement: (startDate: string, endDate: string) => any;
  getBudgetVariance: () => any[];
  getDelinquencyAging: () => any;
  getIncomeMetrics: () => any;
  getReserveFundingStatus: () => any[];
  calculateRecommendedAnnualReserve: () => number;
  getCategorySpent: (category: BudgetCategory) => number;

  // Mutations
  addBudgetCategory: (name: string, budgeted: number) => void;
  updateBudgetCategory: (id: string, updates: { name?: string; budgeted?: number }) => void;
  deleteBudgetCategory: (id: string) => void;
  setAnnualReserveContribution: (amount: number) => void;
  getOperatingBudget: () => { annualRevenue: number; reserveContribution: number; operatingBudget: number; totalAllocated: number; unallocated: number; overAllocated: boolean };
  addExpense: (categoryId: string, expense: { description: string; amount: number; date: string; vendor: string; invoice: string }) => void;
  deleteExpense: (categoryId: string, expenseId: string) => void;
  addReserveItem: (item: Omit<ReserveItem, 'id'>) => void;
  updateReserveItem: (id: string, updates: Partial<ReserveItem>) => void;
  deleteReserveItem: (id: string) => void;
  addUnit: (unit: Omit<Unit, 'payments' | 'lateFees' | 'specialAssessments'>) => void;
  updateUnit: (unitNum: string, updates: Partial<Unit>) => void;
  removeUnit: (unitNum: string) => void;
  setHoaDueDay: (day: number) => void;

  // Work Orders
  createWorkOrder: (wo: { title: string; vendor: string; amount: number; acctNum: string; caseId?: string }) => void;
  approveWorkOrder: (id: string) => void;
  receiveInvoice: (id: string, invoiceNum: string, amount: number) => void;
  payWorkOrder: (id: string) => void;
  createUnitInvoice: (unitNum: string, type: 'fee' | 'special_assessment', amount: number, description: string, caseId?: string) => UnitInvoice;
  payUnitInvoice: (invoiceId: string, method: string) => void;

  // CoA mutations
  addCoASection: (num: string, name: string, type: string) => void;
  addCoAAccount: (num: string, name: string, parent: string, sub: string) => void;
  updateCoAAccount: (num: string, name: string, active: boolean) => void;
  deleteCoAAccount: (num: string) => void;

  // Manual GL
  postManualEntry: (date: string, memo: string, debitAcct: string, creditAcct: string, amount: number) => void;
  postTransfer: (date: string, memo: string, fromAcct: string, toAcct: string, amount: number) => void;

  // Unit payment mutations
  recordUnitPayment: (unitNum: string, amount: number, method: string) => void;
  waiveLateFee: (unitNum: string, feeIndex: number) => void;
  imposeLateFee: (unitNum: string, amount: number, reason: string) => void;
  addSpecialAssessment: (unitNum: string, amount: number, reason: string) => void;
  markSpecialAssessmentPaid: (unitNum: string, assessmentId: string) => void;

  // Stripe
  stripeConnectId: string | null;
  stripeOnboardingComplete: boolean;
  setStripeConnect: (id: string) => void;
  setStripeOnboarding: (complete: boolean) => void;
}

// ── Sync helpers ──

function syncUnit(unitNum: string) {
  if (!isBackendEnabled) return;
  const s = useFinancialStore.getState();
  if (!s.tenantId) return;
  const u = s.units.find(x => x.number === unitNum);
  if (u) financialSvc.upsertUnit(s.tenantId, u);
}

function syncBudgetCategory(id: string) {
  if (!isBackendEnabled) return;
  const cat = useFinancialStore.getState().budgetCategories.find(x => x.id === id);
  if (cat) financialSvc.updateBudgetCategory(id, cat);
}

function syncWorkOrder(localId: string) {
  if (!isBackendEnabled) return;
  const s = useFinancialStore.getState();
  if (!s.tenantId) return;
  const wo = s.workOrders.find(x => x.id === localId);
  if (wo) financialSvc.updateWorkOrderByLocalId(s.tenantId, localId, wo);
}

function syncSettings() {
  if (!isBackendEnabled) return;
  const s = useFinancialStore.getState();
  if (!s.tenantId) return;
  financialSvc.upsertFinancialSettings(s.tenantId, {
    hoaDueDay: s.hoaDueDay,
    annualReserveContribution: s.annualReserveContribution,
    stripeConnectId: s.stripeConnectId,
    stripeOnboardingComplete: s.stripeOnboardingComplete,
  });
}

export const useFinancialStore = create<FinancialState>()(persist((set, get) => ({
  tenantId: null,
  budgetCategories: seedBudgetCategories,
  reserveItems: seedReserveItems,
  chartOfAccounts: [...seedChartOfAccounts],
  acctStatus: Object.fromEntries(seedChartOfAccounts.map((a) => [a.num, true])),
  generalLedger: [],
  glNextId: 1000,
  units: seedUnits,
  hoaDueDay: 15,
  annualReserveContribution: 12000,
  workOrders: [...seedWorkOrders],
  unitInvoices: [],

  activeTab: 'dashboard',
  glFilter: { account: '', source: '', search: '' },
  glPage: 0,

  // ─── DB Hydration ──────────────────────────────────
  loadFromDb: async (tenantId: string) => {
    set({ tenantId });
    const data = await financialSvc.fetchAllFinancialData(tenantId);
    const updates: Partial<FinancialState> = {};
    if (data.units) updates.units = data.units;
    if (data.budgetCategories) updates.budgetCategories = data.budgetCategories;
    if (data.reserveItems) updates.reserveItems = data.reserveItems;
    if (data.chartOfAccounts) {
      updates.chartOfAccounts = data.chartOfAccounts;
      updates.acctStatus = Object.fromEntries(data.chartOfAccounts.map(a => [a.num, true]));
    }
    if (data.generalLedger) {
      updates.generalLedger = data.generalLedger;
      // Set glNextId high enough to avoid collisions
      const maxId = data.generalLedger.reduce((max, e) => {
        const num = parseInt(e.id.replace('GL', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 999);
      updates.glNextId = maxId + 1;
    }
    if (data.workOrders) updates.workOrders = data.workOrders;
    if (data.unitInvoices) updates.unitInvoices = data.unitInvoices;
    if (data.settings) {
      updates.hoaDueDay = data.settings.hoaDueDay;
      updates.annualReserveContribution = data.settings.annualReserveContribution;
      updates.stripeConnectId = data.settings.stripeConnectId;
      updates.stripeOnboardingComplete = data.settings.stripeOnboardingComplete;
    }
    if (Object.keys(updates).length > 0) set(updates);
  },

  setActiveTab: (tab) => set({ activeTab: tab, glPage: 0 }),
  setGlFilter: (filter) => set((s) => ({ glFilter: { ...s.glFilter, ...filter }, glPage: 0 })),
  setGlPage: (page) => set({ glPage: page }),

  // ─── GL Engine ─────────────────────────────────────
  glPost: (date, memo, debitAcct, creditAcct, amount, source, sourceId) => {
    const state = get();
    const entry: GLEntry = {
      id: 'GL' + state.glNextId,
      date,
      memo,
      debitAcct,
      creditAcct,
      amount: Math.round(amount * 100) / 100,
      source,
      sourceId,
      posted: new Date().toISOString(),
      status: 'posted',
    };
    set({ generalLedger: [...state.generalLedger, entry], glNextId: state.glNextId + 1 });
    if (isBackendEnabled && state.tenantId) {
      financialSvc.createGLEntry(state.tenantId, entry);
    }
    return entry;
  },

  seedGeneralLedger: () => {
    const state = get();
    const entries: GLEntry[] = [];
    let nextId = 1000;

    const post = (date: string, memo: string, debitAcct: string, creditAcct: string, amount: number, source: GLEntry['source'], sourceId: string | null) => {
      entries.push({
        id: 'GL' + nextId++,
        date, memo, debitAcct, creditAcct,
        amount: Math.round(amount * 100) / 100,
        source, sourceId,
        posted: new Date().toISOString(),
        status: 'posted',
      });
    };

    // 1. Assessment billings
    state.units.forEach((u) => {
      if (u.status === 'OCCUPIED') {
        post('2026-01-01', `Assessment - Unit ${u.number} (Jan)`, '1110', '4010', u.monthlyFee, 'assessment', u.number);
        post('2026-02-01', `Assessment - Unit ${u.number} (Feb)`, '1110', '4010', u.monthlyFee, 'assessment', u.number);
      }
    });

    // 2. Payments received
    state.units.forEach((u) => {
      if (u.status === 'OCCUPIED') {
        post('2026-01-15', `Payment received - Unit ${u.number} (Jan)`, '1010', '1110', u.monthlyFee, 'payment', u.number);
        if (u.balance === 0) {
          post('2026-02-10', `Payment received - Unit ${u.number} (Feb)`, '1010', '1110', u.monthlyFee, 'payment', u.number);
        }
      }
    });

    // 3. Late fees
    state.units.forEach((u) => {
      if (u.balance > 0 && u.balance > u.monthlyFee) {
        post('2026-02-05', `Late fee - Unit ${u.number}`, '1130', '4030', 25, 'fee', u.number);
      }
    });

    // 4. Operating expenses from budget categories
    state.budgetCategories.forEach((cat) => {
      const glAcct = state.chartOfAccounts.find((a) => a.budgetCat === cat.id);
      const acctNum = glAcct ? glAcct.num : '5070';
      cat.expenses.forEach((exp) => {
        post(exp.date, exp.description, acctNum, '1010', exp.amount, 'expense', exp.invoice);
      });
    });

    // 5. Reserve fund balances
    state.reserveItems.forEach((item) => {
      if (item.currentFunding > 0) {
        post('2025-12-31', `Reserve balance - ${item.name}`, '1020', '3020', item.currentFunding, 'transfer', item.id);
      }
    });

    // 6. Opening operating balance
    const totalExpenses = state.budgetCategories.reduce((s, c) => s + c.expenses.reduce((s2, e) => s2 + e.amount, 0), 0);
    const totalCollected = state.units.filter((u) => u.status === 'OCCUPIED').reduce((s, u) => s + u.monthlyFee * 2, 0);
    const openingBalance = totalCollected - totalExpenses + 15000;
    post('2025-12-31', 'Opening operating fund balance', '1010', '3010', openingBalance, 'manual', null);

    set({ generalLedger: entries, glNextId: nextId });
  },

  // ─── Account helpers ───────────────────────────────
  getAcct: (num) => get().chartOfAccounts.find((a) => a.num === num),
  getAcctName: (num) => {
    const a = get().chartOfAccounts.find((x) => x.num === num);
    return a ? `${a.num} · ${a.name}` : num;
  },
  getAcctsByType: (type) => get().chartOfAccounts.filter((a) => a.type === type && a.sub !== 'header'),
  getAcctChildren: (parentNum) => get().chartOfAccounts.filter((a) => a.parent === parentNum),
  glByAccount: (acctNum) => get().generalLedger.filter((e) => e.debitAcct === acctNum || e.creditAcct === acctNum),

  acctBalance: (acctNum) => {
    const acct = get().chartOfAccounts.find((a) => a.num === acctNum);
    if (!acct) return 0;
    const isDebitNormal = acct.type === 'asset' || acct.type === 'expense';
    let bal = 0;
    get().generalLedger.forEach((e) => {
      if (e.debitAcct === acctNum) bal += e.amount;
      if (e.creditAcct === acctNum) bal -= e.amount;
    });
    return isDebitNormal ? bal : -bal;
  },

  acctGroupBalance: (parentNum) => {
    const children = get().getAcctChildren(parentNum);
    if (children.length === 0) return get().acctBalance(parentNum);
    return children.reduce((sum, child) => {
      const childChildren = get().getAcctChildren(child.num);
      if (childChildren.length > 0) return sum + get().acctGroupBalance(child.num);
      return sum + get().acctBalance(child.num);
    }, 0);
  },

  // ─── Reports ───────────────────────────────────────
  getBalanceSheet: () => {
    const { acctBalance } = get();
    const assets = {
      operating: acctBalance('1010'), reserves: acctBalance('1020'), pettyCash: acctBalance('1030'),
      assessmentsAR: acctBalance('1110'), specialAR: acctBalance('1120'), lateFeesAR: acctBalance('1130'),
      insuranceAR: acctBalance('1140'), prepaid: acctBalance('1200'),
      totalCurrent: 0, totalReceivable: 0, total: 0,
    };
    assets.totalCurrent = assets.operating + assets.reserves + assets.pettyCash;
    assets.totalReceivable = assets.assessmentsAR + assets.specialAR + assets.lateFeesAR + assets.insuranceAR;
    assets.total = assets.totalCurrent + assets.totalReceivable + assets.prepaid;

    const liabilities = {
      payable: acctBalance('2010'), prepaidAssessments: acctBalance('2020'),
      deposits: acctBalance('2030'), accrued: acctBalance('2040'), total: 0,
    };
    liabilities.total = liabilities.payable + liabilities.prepaidAssessments + liabilities.deposits + liabilities.accrued;

    const equity = {
      operatingFund: acctBalance('3010'), reserveFund: acctBalance('3020'),
      retained: acctBalance('3030'), total: 0,
    };
    equity.total = equity.operatingFund + equity.reserveFund + equity.retained;

    return { assets, liabilities, equity };
  },

  getIncomeStatement: (startDate, endDate) => {
    const { generalLedger, getAcctsByType } = get();
    const entries = generalLedger.filter((e) => e.date >= startDate && e.date <= endDate);
    const income: Record<string, { name: string; amount: number }> = {};
    const expenses: Record<string, { name: string; amount: number }> = {};

    getAcctsByType('income').forEach((a) => {
      let total = 0;
      entries.forEach((e) => {
        if (e.creditAcct === a.num) total += e.amount;
        if (e.debitAcct === a.num) total -= e.amount;
      });
      if (total !== 0) income[a.num] = { name: a.name, amount: total };
    });

    getAcctsByType('expense').forEach((a) => {
      let total = 0;
      entries.forEach((e) => {
        if (e.debitAcct === a.num) total += e.amount;
        if (e.creditAcct === a.num) total -= e.amount;
      });
      if (total !== 0) expenses[a.num] = { name: a.name, amount: total };
    });

    const totalIncome = Object.values(income).reduce((s, i) => s + i.amount, 0);
    const totalExpenses = Object.values(expenses).reduce((s, e) => s + e.amount, 0);
    return { income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses };
  },

  getBudgetVariance: () => {
    const { budgetCategories, chartOfAccounts, acctBalance, getCategorySpent } = get();
    return budgetCategories.map((cat) => {
      const glAcct = chartOfAccounts.find((a) => a.budgetCat === cat.id);
      const actual = glAcct ? acctBalance(glAcct.num) : getCategorySpent(cat);
      const budgeted = cat.budgeted;
      const variance = budgeted - actual;
      const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
      return { id: cat.id, name: cat.name, budgeted, actual, variance, pct, acctNum: glAcct?.num };
    });
  },

  getDelinquencyAging: () => {
    const delinquent = get().units.filter((u) => u.balance > 0);
    return {
      current: delinquent.filter((u) => u.balance <= u.monthlyFee),
      days30: delinquent.filter((u) => u.balance > u.monthlyFee && u.balance <= u.monthlyFee * 2),
      days60: delinquent.filter((u) => u.balance > u.monthlyFee * 2 && u.balance <= u.monthlyFee * 3),
      days90plus: delinquent.filter((u) => u.balance > u.monthlyFee * 3),
      totalOutstanding: delinquent.reduce((s, u) => s + u.balance, 0),
    };
  },

  getIncomeMetrics: () => {
    const { units } = get();
    const monthlyExpected = units.reduce((sum, u) => sum + u.monthlyFee, 0);
    const totalOutstanding = units.reduce((sum, u) => sum + u.balance, 0);
    const monthlyCollected = monthlyExpected - totalOutstanding;
    const collectionRate = Math.round((monthlyCollected / monthlyExpected) * 100);
    return {
      totalUnits: units.length,
      occupiedUnits: units.filter((u) => u.status === 'OCCUPIED').length,
      currentUnits: units.filter((u) => u.balance === 0).length,
      delinquentUnits: units.filter((u) => u.balance > 0).length,
      monthlyExpected, monthlyCollected, totalOutstanding, collectionRate,
      annualExpected: monthlyExpected * 12, annualCollected: monthlyCollected * 12,
    };
  },

  getReserveFundingStatus: () => {
    return get().reserveItems.map((item) => {
      const funded = item.currentFunding;
      const needed = item.estimatedCost;
      const gap = needed - funded;
      const pct = needed > 0 ? Math.round((funded / needed) * 100) : 100;
      const annualNeeded = item.yearsRemaining > 0 ? Math.round(gap / item.yearsRemaining) : 0;
      return { ...item, gap, pct, annualNeeded };
    });
  },

  calculateRecommendedAnnualReserve: () => {
    const nonContingency = get().reserveItems.filter((i) => !i.isContingency);
    let total = 0;
    nonContingency.forEach((item) => {
      if (item.yearsRemaining > 0) {
        total += (item.estimatedCost - item.currentFunding) / item.yearsRemaining;
      }
    });
    return total;
  },

  getCategorySpent: (category) => category.expenses.reduce((sum, exp) => sum + exp.amount, 0),

  // ─── Mutations ─────────────────────────────────────
  addBudgetCategory: (name, budgeted) => {
    const id = 'cat' + Date.now();
    const cat: BudgetCategory = { id, name, budgeted, expenses: [] };
    set((s) => ({ budgetCategories: [...s.budgetCategories, cat] }));
    if (isBackendEnabled && get().tenantId) {
      financialSvc.createBudgetCategory(get().tenantId!, cat).then(dbRow => {
        if (dbRow) set(s => ({ budgetCategories: s.budgetCategories.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateBudgetCategory: (id, updates) => {
    set((s) => ({
      budgetCategories: s.budgetCategories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
    if (isBackendEnabled) financialSvc.updateBudgetCategory(id, updates);
  },

  deleteBudgetCategory: (id) => {
    set((s) => ({
      budgetCategories: s.budgetCategories.filter((c) => c.id !== id),
    }));
    if (isBackendEnabled) financialSvc.deleteBudgetCategory(id);
  },

  setAnnualReserveContribution: (amount) => {
    set({ annualReserveContribution: amount });
    syncSettings();
  },

  getOperatingBudget: () => {
    const { units, annualReserveContribution, budgetCategories } = get();
    const annualRevenue = units.reduce((sum, u) => sum + u.monthlyFee, 0) * 12;
    const operatingBudget = annualRevenue - annualReserveContribution;
    const totalAllocated = budgetCategories.reduce((sum, c) => sum + c.budgeted, 0);
    const unallocated = operatingBudget - totalAllocated;
    return { annualRevenue, reserveContribution: annualReserveContribution, operatingBudget, totalAllocated, unallocated, overAllocated: totalAllocated > operatingBudget };
  },

  addExpense: (categoryId, expense) => {
    set((s) => ({
      budgetCategories: s.budgetCategories.map((c) =>
        c.id === categoryId
          ? { ...c, expenses: [...c.expenses, { id: 'exp' + Date.now(), ...expense }].sort((a, b) => b.date.localeCompare(a.date)) }
          : c
      ),
    }));
    syncBudgetCategory(categoryId);
  },

  deleteExpense: (categoryId, expenseId) => {
    set((s) => ({
      budgetCategories: s.budgetCategories.map((c) =>
        c.id === categoryId ? { ...c, expenses: c.expenses.filter((e) => e.id !== expenseId) } : c
      ),
    }));
    syncBudgetCategory(categoryId);
  },

  addReserveItem: (item) => {
    const id = 'res' + Date.now();
    const newItem: ReserveItem = { id, ...item };
    set((s) => ({ reserveItems: [...s.reserveItems, newItem] }));
    if (isBackendEnabled && get().tenantId) {
      financialSvc.createReserveItem(get().tenantId!, newItem).then(dbRow => {
        if (dbRow) set(s => ({ reserveItems: s.reserveItems.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateReserveItem: (id, updates) => {
    set((s) => ({
      reserveItems: s.reserveItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    if (isBackendEnabled) financialSvc.updateReserveItem(id, updates);
  },

  deleteReserveItem: (id) => {
    set((s) => ({ reserveItems: s.reserveItems.filter((i) => i.id !== id) }));
    if (isBackendEnabled) financialSvc.deleteReserveItem(id);
  },

  addUnit: (unit) => {
    set((s) => ({ units: [...s.units, { ...unit, payments: [], lateFees: [], specialAssessments: [] }] }));
    if (isBackendEnabled && get().tenantId) {
      financialSvc.upsertUnit(get().tenantId!, { ...unit, payments: [], lateFees: [], specialAssessments: [] });
    }
  },

  setHoaDueDay: (day) => {
    set({ hoaDueDay: day });
    syncSettings();
  },

  createWorkOrder: (wo) => {
    const state = get();
    const newWo: WorkOrder = {
      id: 'WO-' + String(state.workOrders.length + 1).padStart(3, '0'),
      title: wo.title, vendor: wo.vendor, description: wo.title, amount: wo.amount, acctNum: wo.acctNum,
      status: 'draft' as const, createdDate: new Date().toISOString().split('T')[0],
      caseId: wo.caseId || null, invoiceNum: null, invoiceDate: null, approvedDate: null, paidDate: null, glEntryId: null,
      attachments: [],
    };
    set((s) => ({ workOrders: [...s.workOrders, newWo] }));
    if (isBackendEnabled && state.tenantId) {
      financialSvc.createWorkOrder(state.tenantId, newWo);
    }
  },

  approveWorkOrder: (id) => {
    set((s) => ({
      workOrders: s.workOrders.map((w) =>
        w.id === id && w.status === 'draft' ? { ...w, status: 'approved' as const, approvedDate: new Date().toISOString().split('T')[0] } : w
      ),
    }));
    syncWorkOrder(id);
  },

  receiveInvoice: (id, invoiceNum, amount) => {
    set((s) => ({
      workOrders: s.workOrders.map((w) =>
        w.id === id && w.status === 'approved' ? { ...w, status: 'invoiced' as const, invoiceNum, amount } : w
      ),
    }));
    syncWorkOrder(id);
  },

  payWorkOrder: (id) => {
    const wo = get().workOrders.find((w) => w.id === id);
    if (!wo || wo.status !== 'invoiced') return;
    const paidDate = new Date().toISOString().split('T')[0];
    const entry = get().glPost(paidDate, `${wo.title} — ${wo.vendor}${wo.caseId ? ' (' + wo.caseId + ')' : ''}`, wo.acctNum, '1010', wo.amount, wo.caseId ? 'case' : 'expense', wo.caseId || wo.invoiceNum);
    set((s) => ({
      workOrders: s.workOrders.map((w) =>
        w.id === id ? { ...w, status: 'paid' as const, paidDate, glEntryId: entry.id } : w
      ),
    }));
    syncWorkOrder(id);
  },

  addCoASection: (num, name, type) =>
    set((s) => {
      if (s.chartOfAccounts.find((a) => a.num === num)) return s;
      const entry: ChartOfAccountsEntry = { num, name, type: type as any, sub: 'header', parent: null };
      const updated = [...s.chartOfAccounts, entry];
      updated.sort((a, b) => a.num.localeCompare(b.num));
      if (isBackendEnabled && s.tenantId) financialSvc.upsertCoAEntry(s.tenantId, entry);
      return { chartOfAccounts: updated };
    }),

  addCoAAccount: (num, name, parent, sub) =>
    set((s) => {
      if (s.chartOfAccounts.find((a) => a.num === num)) return s;
      let p = s.chartOfAccounts.find((a) => a.num === parent);
      while (p && p.sub !== 'header') p = s.chartOfAccounts.find((a) => a.num === p!.parent!);
      const type = p ? p.type : ('expense' as const);
      const entry: ChartOfAccountsEntry = { num, name, type, sub, parent };
      const updated = [...s.chartOfAccounts, entry];
      updated.sort((a, b) => a.num.localeCompare(b.num));
      if (isBackendEnabled && s.tenantId) financialSvc.upsertCoAEntry(s.tenantId, entry);
      return { chartOfAccounts: updated };
    }),

  updateCoAAccount: (num, name, active) => {
    set((s) => ({
      chartOfAccounts: s.chartOfAccounts.map((a) => (a.num === num ? { ...a, name } : a)),
      acctStatus: { ...s.acctStatus, [num]: active },
    }));
    if (isBackendEnabled) {
      const s = get();
      const entry = s.chartOfAccounts.find(a => a.num === num);
      if (entry && s.tenantId) financialSvc.upsertCoAEntry(s.tenantId, entry);
    }
  },

  deleteCoAAccount: (num) =>
    set((s) => {
      if (s.generalLedger.some((e) => e.debitAcct === num || e.creditAcct === num)) return s;
      if (isBackendEnabled && s.tenantId) financialSvc.deleteCoAEntry(s.tenantId, num);
      return { chartOfAccounts: s.chartOfAccounts.filter((a) => a.num !== num) };
    }),

  postManualEntry: (date, memo, debitAcct, creditAcct, amount) => {
    get().glPost(date, memo, debitAcct, creditAcct, amount, 'manual', null);
  },

  postTransfer: (date, memo, fromAcct, toAcct, amount) => {
    get().glPost(date, memo, toAcct, fromAcct, amount, 'transfer', null);
  },

  recordUnitPayment: (unitNum, amount, method) => {
    const today = new Date().toISOString().split('T')[0];
    get().glPost(today, `Payment received - Unit ${unitNum}`, '1010', '1110', amount, 'payment', unitNum);
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        balance: Math.max(0, u.balance - amount),
        payments: [...u.payments, { date: today, amount, method, note: `Payment via ${method}` }],
      } : u),
    }));
    syncUnit(unitNum);
  },

  waiveLateFee: (unitNum, feeIndex) => {
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        lateFees: u.lateFees.map((f, i) => i === feeIndex ? { ...f, waived: true } : f),
      } : u),
    }));
    syncUnit(unitNum);
  },

  imposeLateFee: (unitNum, amount, reason) => {
    const today = new Date().toISOString().split('T')[0];
    get().glPost(today, `Late fee assessed - Unit ${unitNum}`, '1130', '4030', amount, 'fee', unitNum);
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        lateFees: [...u.lateFees, { date: today, amount, reason, waived: false }],
      } : u),
    }));
    syncUnit(unitNum);
  },

  updateUnit: (unitNum, updates) => {
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? { ...u, ...updates } : u),
    }));
    syncUnit(unitNum);
  },

  removeUnit: (unitNum) => {
    set(s => ({ units: s.units.filter(u => u.number !== unitNum) }));
    if (isBackendEnabled && get().tenantId) {
      financialSvc.deleteUnit(get().tenantId!, unitNum);
    }
  },

  addSpecialAssessment: (unitNum, amount, reason) => {
    const today = new Date().toISOString().split('T')[0];
    const id = 'sa-' + Date.now();
    get().glPost(today, `Special assessment - Unit ${unitNum}: ${reason}`, '1120', '4020', amount, 'assessment', unitNum);
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        balance: u.balance + amount,
        specialAssessments: [...u.specialAssessments, { id, date: today, amount, reason, paid: false, paidDate: null }],
      } : u),
    }));
    syncUnit(unitNum);
  },

  markSpecialAssessmentPaid: (unitNum, assessmentId) => {
    const today = new Date().toISOString().split('T')[0];
    const unit = get().units.find(u => u.number === unitNum);
    const sa = unit?.specialAssessments.find(a => a.id === assessmentId);
    if (!sa || sa.paid) return;
    get().glPost(today, `Special assessment payment - Unit ${unitNum}`, '1010', '1120', sa.amount, 'payment', unitNum);
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        balance: Math.max(0, u.balance - sa.amount),
        specialAssessments: u.specialAssessments.map(a => a.id === assessmentId ? { ...a, paid: true, paidDate: today } : a),
      } : u),
    }));
    syncUnit(unitNum);
  },

  // Stripe Connect
  stripeConnectId: null,
  stripeOnboardingComplete: false,
  setStripeConnect: (id) => {
    set({ stripeConnectId: id });
    syncSettings();
  },
  setStripeOnboarding: (complete) => {
    set({ stripeOnboardingComplete: complete });
    syncSettings();
  },

  // Unit Invoices
  createUnitInvoice: (unitNum, type, amount, description, caseId?) => {
    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const id = 'INV-U' + Date.now().toString(36).toUpperCase();
    const glAcct = type === 'fee' ? '1130' : '1120';
    const glRev = type === 'fee' ? '4030' : '4020';
    const glEntry = get().glPost(today, `Invoice ${id} - Unit ${unitNum}: ${description}`, glAcct, glRev, amount, type === 'fee' ? 'fee' : 'assessment', unitNum);
    const invoice: UnitInvoice = {
      id, unitNumber: unitNum, type, description, amount,
      status: 'sent', createdDate: today, dueDate, paidDate: null,
      paidAmount: null, paymentMethod: null, stripePaymentLink: null,
      glEntryId: glEntry?.id || null, paymentGlEntryId: null,
      ...(caseId ? { caseId } : {}),
    };
    set(s => ({ unitInvoices: [...s.unitInvoices, invoice] }));
    if (isBackendEnabled && get().tenantId) {
      financialSvc.createUnitInvoice(get().tenantId!, invoice).then(dbRow => {
        if (dbRow) set(s => ({ unitInvoices: s.unitInvoices.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
    return invoice;
  },

  payUnitInvoice: (invoiceId, method) => {
    const today = new Date().toISOString().split('T')[0];
    const inv = get().unitInvoices.find(i => i.id === invoiceId);
    if (!inv || inv.status === 'paid') return;
    const glEntry = get().glPost(today, `Payment received - Invoice ${inv.id} Unit ${inv.unitNumber}`, '1010', inv.type === 'fee' ? '1130' : '1120', inv.amount, 'payment', inv.unitNumber);
    set(s => ({
      unitInvoices: s.unitInvoices.map(i => i.id === invoiceId ? {
        ...i, status: 'paid' as const, paidDate: today, paidAmount: inv.amount,
        paymentMethod: method, paymentGlEntryId: glEntry?.id || null,
      } : i),
      units: s.units.map(u => u.number === inv.unitNumber ? {
        ...u,
        balance: Math.max(0, u.balance - inv.amount),
        payments: [...u.payments, { date: today, amount: inv.amount, method, note: `Invoice ${inv.id}` }],
      } : u),
    }));
    if (isBackendEnabled) {
      financialSvc.updateUnitInvoice(invoiceId, {
        status: 'paid', paidDate: today, paidAmount: inv.amount,
        paymentMethod: method, paymentGlEntryId: glEntry?.id || null,
      });
      syncUnit(inv.unitNumber);
    }
  },
}), {
  name: 'onetwo-financial',
  partialize: (state) => ({
    budgetCategories: state.budgetCategories,
    reserveItems: state.reserveItems,
    chartOfAccounts: state.chartOfAccounts,
    acctStatus: state.acctStatus,
    generalLedger: state.generalLedger,
    glNextId: state.glNextId,
    units: state.units,
    hoaDueDay: state.hoaDueDay,
    annualReserveContribution: state.annualReserveContribution,
    workOrders: state.workOrders,
    unitInvoices: state.unitInvoices,
    stripeConnectId: state.stripeConnectId,
    stripeOnboardingComplete: state.stripeOnboardingComplete,
  }),
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
