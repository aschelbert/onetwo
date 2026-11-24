import { useAuthStore } from './useAuthStore';
import { useActionRecordsStore } from './useActionRecordsStore';
import { payBlocker, type ControlRules } from '@/lib/controls';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as financialSvc from '@/lib/services/financial';
import * as unitMgrSvc from '@/lib/services/unitManager';
import { getGLAccountsForInvoice, DEFAULT_GL_MAPPING, creditOf, invoiceRemaining, isOpenInvoice, isOpeningEntry, legacyOwed, openInvoicesInOrder, OPENING_BILL_PREFIX, OPENING_INVOICE_MARK, type GLAccountMapping, type PaymentOrder } from '@/lib/financial-logic';
import { balanceOf, budgetLineAccounts, fiscalYearStart, fundOf, fundStatements, fundTotals, isLocked, LockedPeriodError, reversalOf, reversalsOf, type Fund } from '@/lib/ledger';
import { billingDate, billingDue, duesDescription, duesDueDate, isDuesInvoiceFor, lateFeesDue, periodKey, reserveTransferMemo, type BillingRunSummary } from '@/lib/billingCycle';
import type { BudgetCategory, ReserveItem, ChartOfAccountsEntry, GLEntry, Unit, UnitInvoice, UnitDocument, MoveEvent } from '@/types/financial';
import { defaultChartOfAccounts, seedBudgetCategories, seedReserveItems, seedChartOfAccounts, seedUnits, seedWorkOrders, type WorkOrder } from '@/data/financial';
import { generateLocalId } from '@/lib/generateId';
import { trackInvoiceSave } from '@/lib/services/invoicing';
import { useBuildingStore } from '@/store/useBuildingStore';

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
  unitDocuments: UnitDocument[];
  moveEvents: MoveEvent[];

  // GL account mapping
  glAccountMapping: GLAccountMapping;
  setGlAccountMapping: (partial: Partial<GLAccountMapping>) => void;

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
  /** Post one balanced entry. Throws LockedPeriodError when `date` falls in a closed period. */
  glPost: (date: string, memo: string, debitAcct: string, creditAcct: string, amount: number, source: GLEntry['source'], sourceId: string | null) => GLEntry;
  /** Post the mirror of an entry: on its own date when that month is open, else dated today. Returns null when already reversed. */
  reverseEntry: (id: string, reason: string, today?: string) => GLEntry | null;
  /** Mark an entry void so it stops counting; only for entries in an open period. */
  voidEntry: (id: string, reason?: string) => boolean;
  /** The books are closed through this date; nothing posts on or before it. */
  closedThrough: string | null;
  /** Close the books through a date (must be before today), or pass null to reopen. */
  closeBooksThrough: (date: string | null, today?: string) => void;
  canPostOn: (date: string) => boolean;
  /** Set which fund an account belongs to. */
  setAcctFund: (num: string, fund: Fund | null) => void;
  /** Bring the books over as of a cutover date. Re-entering voids the earlier opening lines and posts fresh ones, then closes the books through the cutover. */
  postOpeningBalances: (input: OpeningBalancesInput, today?: string) => OpeningBalancesState;
  openingBalances: () => OpeningBalancesState;
  getFundStatements: (from?: string, to?: string) => ReturnType<typeof fundStatements>;
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
  /** Someone checked the finished work against what was ordered; a bill is paid only after this. */
  signOffWorkOrder: (id: string, by: string, notes?: string, date?: string) => void;
  /** Change a work order before its invoice arrives: the vendor, the amount or the title (a rebooked or resized job). */
  updateWorkOrder: (id: string, patch: Partial<Pick<WorkOrder, 'title' | 'vendor' | 'amount' | 'description'>>) => void;
  /** Link a work order to the case that drives it (the Work order runbook's, or a parent case). */
  setWorkOrderCase: (id: string, caseId: string | null) => void;
  /** The vendor's invoice arrived: the expense is booked now (Dr expense line / Cr accounts payable), on the invoice date. */
  receiveInvoice: (id: string, invoiceNum: string, amount: number, invoiceDate?: string) => void;
  /** Pay a bill: clears the payable (Dr accounts payable / Cr bank). A bill invoiced before accrual posts Dr expense / Cr bank, as before. */
  payWorkOrder: (id: string, paidDate?: string, opts?: { automatic?: boolean }) => string;
  /** Why the signed-in person may not pay this bill under the building's rules, or '' when they may. */
  payBlockerFor: (id: string) => string;

  // ── Charges to units: the receivables sub-ledger. One invoice per charge; the unit's balance follows. ──
  /** Charge a unit. Posts Dr receivable / Cr income (unless `post: false`), applies any prepaid credit, and raises the balance. */
  createUnitInvoice: (unitNum: string, type: UnitInvoice['type'], amount: number, description: string, caseId?: string, dueDate?: string, opts?: InvoiceOptions) => UnitInvoice;
  /** Pay one charge (in full, or `amount` of it). */
  payUnitInvoice: (invoiceId: string, method: string, opts?: { date?: string; amount?: number }) => void;
  /** Cancel what is still open on a charge: reverses the income and receivable for the unpaid part. */
  voidUnitInvoice: (invoiceId: string, reason: string) => boolean;
  /** Turn a balance no invoice stands behind (brought over from before the register) into one invoice, without posting again. */
  billOutstandingBalance: (unitNum: string) => UnitInvoice | null;
  /**
   * Write off everything a unit still owes, after a board vote: the income stays as billed and the loss is taken
   * (Dr allowance for doubtful accounts as far as it reaches, then Dr bad debt expense / Cr the receivable). Returns the amount.
   */
  writeOffUnit: (unitNum: string, reason: string, date?: string) => number;
  /** Bring the allowance for doubtful accounts to a target: one entry for the difference (Dr bad debt expense / Cr allowance, or the reverse). Returns the change. */
  setAllowance: (target: number, date?: string, memo?: string) => number;

  // CoA mutations
  addCoASection: (num: string, name: string, type: string) => void;
  addCoAAccount: (num: string, name: string, parent: string, sub: string) => void;
  updateCoAAccount: (num: string, name: string, active: boolean) => void;
  /** Measure a budget line against one expense account ('' unlinks it). */
  setBudgetLineAccount: (categoryId: string, acctNum: string) => void;
  deleteCoAAccount: (num: string) => void;

  // Manual GL
  postManualEntry: (date: string, memo: string, debitAcct: string, creditAcct: string, amount: number) => void;
  postTransfer: (date: string, memo: string, fromAcct: string, toAcct: string, amount: number) => void;

  // Unit payment mutations
  /** Apply a payment: dues first, then special assessments, then fees, oldest due first; then any balance with no invoice behind it; the rest is a prepaid credit. */
  recordUnitPayment: (unitNum: string, amount: number, method: string, opts?: { date?: string }) => PaymentApplication;
  /** Waive a fee: voids its invoice (or reverses a fee from before the register). */
  waiveLateFee: (unitNum: string, feeIndex: number, reason?: string) => void;
  /** Charge a late fee: one invoice, one posting. */
  imposeLateFee: (unitNum: string, amount: number, reason: string, opts?: { forInvoiceId?: string | null; date?: string; dueDate?: string }) => UnitInvoice;
  /** Charge a special assessment: one invoice, one posting, in the reserve fund unless told otherwise. */
  addSpecialAssessment: (unitNum: string, amount: number, reason: string, opts?: { dueDate?: string; fund?: Fund }) => UnitInvoice;
  markSpecialAssessmentPaid: (unitNum: string, assessmentId: string, method?: string) => void;
  /** Return money the owner paid ahead. */
  refundCredit: (unitNum: string, amount: number, reason: string) => GLEntry | null;

  // Stripe
  stripeConnectId: string | null;
  stripeOnboardingComplete: boolean;
  setStripeConnect: (id: string) => void;
  setStripeOnboarding: (complete: boolean) => void;

  // Billing automation
  autoBillingEnabled: boolean;
  lastBillingRun: string | null;
  setAutoBilling: (enabled: boolean) => void;
  /** Post the monthly reserve transfer (annual contribution ÷ 12) with each billing run. */
  autoReserveTransfer: boolean;
  setAutoReserveTransfer: (enabled: boolean) => void;
  /** How a payment is applied across a unit's open charges. */
  paymentOrder: PaymentOrder;
  setPaymentOrder: (order: PaymentOrder) => void;
  /** Day of the month (1–28) the month close runbook opens its case for the month just ended. */
  monthCloseStartDay: number;
  setMonthCloseStartDay: (day: number) => void;
  /** The most one Tasker job may cost before the board votes on it. Shared by the building (financial_settings). */
  taskerLimit: number;
  /** Set it; refused (false) unless it is a whole-dollar amount from $0 up to the bylaws spending limit. */
  setTaskerLimit: (amount: number) => boolean;
  /** The Month close runbook's switch, shared with the database job that runs it every morning. */
  monthCloseEnabled: boolean;
  setMonthCloseEnabled: (on: boolean) => void;
  /** The board's choice of what members see of other units: each unit's balance, and each unit's email and phone. Both off unless switched on. */
  ownersSeeBalances: boolean;
  ownersSeeContacts: boolean;
  /** Change one of them. Resolves false, and puts the switch back, when the database did not take it. */
  setOwnerSharing: (which: 'balances' | 'contacts', on: boolean) => Promise<boolean>;
  /** Runbooks switched off, by id, shared with the database jobs that run them (collections, insurance renewal, month close). */
  runbooksOff: string[];
  setRunbookOff: (id: string, off: boolean) => void;
  /** The last professional reserve study (YYYY-MM-DD, or null when none is recorded) and how many years one lasts; the Reserve study runbook reads both. */
  reserveStudyDate: string | null;
  reserveStudyEveryYears: number;
  setReserveStudy: (date: string | null, everyYears?: number) => void;
  /** Bill every unit's dues for a month (this month by default). Bills each unit once per month. */
  runMonthlyBilling: (period?: string, today?: string) => BillingRunSummary;
  /** Charge the late fee on every dues invoice past its grace period that has none yet. Returns how many. */
  runLateFees: (today?: string) => number;
  /** What runs on its own when a board member opens the app: this month's billing if due, then late fees. */
  runBillingCycle: (today?: string) => BillingRunSummary | null;

  // Late fee settings
  lateFeeEnabled: boolean;
  lateFeeAmount: number;
  lateFeeGraceDays: number;
  lastLateFeeRun: string | null;
  setLateFeeSettings: (enabled: boolean, amount: number, graceDays: number) => void;

  // Refund a paid charge that was wrong: the money goes back and the income is reversed; the charge is void.
  refundUnitInvoice: (invoiceId: string, reason: string) => void;

  // Unit Documents
  fetchUnitDocuments: (tenantId: string) => Promise<void>;
  /** True when the file was stored and its row saved. */
  uploadDocument: (unitNumber: string, file: File, docType: string, visibleToOwner: boolean, uploadedBy: string | null, uploadedByName: string | null) => Promise<boolean>;
  deleteDocument: (id: string, storagePath: string) => Promise<boolean>;

  // Move Events
  fetchMoveEvents: (tenantId: string) => Promise<void>;
  addMoveEvent: (event: Omit<MoveEvent, 'id' | 'createdAt'>) => Promise<MoveEvent | null>;
  updateMoveEvent: (id: string, updates: Partial<MoveEvent>) => Promise<void>;
}

export interface InvoiceOptions {
  /** Which fund a special assessment belongs to (reserve by default). */
  fund?: Fund | null;
  /** The dues invoice a late fee is for. */
  forInvoiceId?: string | null;
  /** The charge date (today by default). */
  date?: string;
  /** Book the income to this account instead of the type's usual one (a fine to Fines, a certificate fee to Other income). Ignored when the chart has no such account. */
  revenueAcct?: string;
  /** False when the amount is already in the ledger (a balance brought forward): the invoice is recorded, nothing is posted, the balance stays. */
  post?: boolean;
}

/** The state of the books on the cutover date, as a treasurer finds the numbers. */
export interface OpeningBalancesInput {
  /** The cutover date, usually the last day of the month before the building joined. Must be before today. */
  asOf: string;
  operatingCash: number;
  reserveCash: number;
  /** Per unit: positive is owed as of the cutover, negative is paid ahead, zero is current. Units left out are not changed. */
  units: { number: string; amount: number }[];
  /** Vendor bills received before the cutover and not yet paid. */
  bills: { vendor: string; description: string; amount: number; acctNum: string; invoiceNum?: string }[];
}

/** What is on the books from the cutover, read back from the ledger. */
export interface OpeningBalancesState {
  asOf: string | null;
  operatingCash: number;
  reserveCash: number;
  units: Record<string, number>;
  bills: WorkOrder[];
  /** Totals the opening entries imply. */
  owed: number;
  prepaid: number;
  billsTotal: number;
  operatingFund: number;
  reserveFund: number;
  /** An opening balance already received a payment, so re-entering is refused. */
  paymentsApplied: boolean;
}

export interface PaymentApplication {
  applied: { invoiceId: string; amount: number }[];
  /** Applied to a balance no invoice stands behind. */
  toBalance: number;
  /** Left over, kept as a prepaid credit. */
  toCredit: number;
  total: number;
}

const r2 = (n: number) => { const r = Math.round(n * 100) / 100; return r === 0 ? 0 : r; };
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** The mapping with defaults for keys added since it was saved. */
const mappingOf = (m: GLAccountMapping): GLAccountMapping => ({ ...DEFAULT_GL_MAPPING, ...m });
const invoiceSource = (type: UnitInvoice['type']): GLEntry['source'] => (type === 'fee' || type === 'amenity_fee' ? 'fee' : 'assessment');

// ── Sync helpers ──

/** Resolve tenant ID from store state, falling back to module-level active tenant. */
function resolveTenantId(): string | null {
  return useFinancialStore.getState().tenantId || getActiveTenantId();
}

function syncUnit(unitNum: string) {
  if (!isBackendEnabled) return;
  const tid = resolveTenantId();
  if (!tid) return;
  const u = useFinancialStore.getState().units.find(x => x.number === unitNum);
  if (u) financialSvc.upsertUnit(tid, u).catch(err => console.error('[syncWrite] upsertUnit failed:', err));
}

function syncBudgetCategory(id: string) {
  if (!isBackendEnabled) return;
  const cat = useFinancialStore.getState().budgetCategories.find(x => x.id === id);
  if (cat) financialSvc.updateBudgetCategory(id, cat).catch(err => console.error('[syncWrite] updateBudgetCategory failed:', err));
}

// Each work order's writes go out one at a time, in order: its insert first, then
// every change. A change sent while an earlier one is still in flight could land
// first and be overwritten (an invoice landing after the payment left the bill
// "invoiced" in the database although it was paid), and a change sent before the
// insert lands updates nothing. Each write sends the work order as it is when the
// write runs, so the last one carries the latest state.
const workOrderWrites: Record<string, Promise<unknown>> = {};
/** Run one write for a work order after the ones before it. Exported for tests. */
export function queueWorkOrderWrite(localId: string, write: () => Promise<unknown>): Promise<unknown> {
  const next = (workOrderWrites[localId] ?? Promise.resolve())
    .then(write)
    .catch(err => console.error('[syncWrite] work order write failed:', err));
  workOrderWrites[localId] = next;
  return next;
}

function insertWorkOrder(tid: string, localId: string) {
  queueWorkOrderWrite(localId, () => {
    const wo = useFinancialStore.getState().workOrders.find(x => x.id === localId);
    return wo ? financialSvc.createWorkOrder(tid, wo) : Promise.resolve(false);
  });
}

function syncWorkOrder(localId: string) {
  if (!isBackendEnabled) return;
  const tid = resolveTenantId();
  if (!tid) return;
  queueWorkOrderWrite(localId, () => {
    const wo = useFinancialStore.getState().workOrders.find(x => x.id === localId);
    return wo ? financialSvc.updateWorkOrderByLocalId(tid, localId, wo) : Promise.resolve(false);
  });
}

function syncSettings() {
  if (!isBackendEnabled) return;
  const tid = resolveTenantId();
  if (!tid) return;
  const s = useFinancialStore.getState();
  financialSvc.upsertFinancialSettings(tid, {
    hoaDueDay: s.hoaDueDay,
    annualReserveContribution: s.annualReserveContribution,
    stripeConnectId: s.stripeConnectId,
    stripeOnboardingComplete: s.stripeOnboardingComplete,
    autoBillingEnabled: s.autoBillingEnabled,
    lateFeeEnabled: s.lateFeeEnabled,
    lateFeeAmount: s.lateFeeAmount,
    lateFeeGraceDays: s.lateFeeGraceDays,
    closedThrough: s.closedThrough,
    lastBillingRun: s.lastBillingRun,
    lastLateFeeRun: s.lastLateFeeRun,
    autoReserveTransfer: s.autoReserveTransfer,
    paymentOrder: s.paymentOrder,
    monthCloseStartDay: s.monthCloseStartDay,
    monthCloseEnabled: s.monthCloseEnabled,
    taskerLimit: s.taskerLimit,
    runbooksOff: s.runbooksOff,
    reserveStudyDate: s.reserveStudyDate,
    reserveStudyEveryYears: s.reserveStudyEveryYears,
    glAccountMapping: { ...DEFAULT_GL_MAPPING, ...s.glAccountMapping },
  }).catch(err => console.error('[syncWrite] upsertFinancialSettings failed:', err));
}

const todayIso = () => new Date().toISOString().split('T')[0];

/** Database rows have UUIDs. A budget line or reserve item added here keeps a local id until its insert returns. */
const isDbId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
/** Removed before their insert returned: deleted as soon as it does. */
const removedBeforeSaved = new Set<string>();

/** Whoever is signed in, for the record of who posted an entry or handled a bill. */
const actor = (): string => useAuthStore.getState().currentUser?.name ?? '';
/** The control rules the board has switched on (kept with the other standing records). */
const controlRules = (): ControlRules => (useActionRecordsStore.getState().records.find(r => r.kind === 'controls')?.data as ControlRules | undefined) ?? {};

/** Allowance for doubtful accounts: a credit balance against the receivables. Added to a building's chart the first time it is used. */
export const ALLOWANCE_ACCT = '1190';
export const BAD_DEBT_ACCT = '5300';
/** How a written-off charge is marked: the charge stands as billed, unlike a void. */
export const WRITTEN_OFF_MARK = 'Written off';

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
  unitDocuments: [],
  moveEvents: [],
  glAccountMapping: { ...DEFAULT_GL_MAPPING },

  setGlAccountMapping: (partial) => {
    set(s => ({ glAccountMapping: { ...s.glAccountMapping, ...partial } }));
    syncSettings();
  },

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
      let chart = data.chartOfAccounts;
      if (!chart.some(a => a.parent)) {
        // A building with no chart yet (the default chart used to live only in the browser) gets the default
        // one, written to the database so every screen can name its accounts. Sections the board already
        // added are kept.
        const have = new Set(chart.map(a => a.num));
        const missing = defaultChartOfAccounts.filter(a => !have.has(a.num));
        chart = [...chart, ...missing].sort((a, b) => a.num.localeCompare(b.num));
        if (missing.length) financialSvc.upsertCoAEntries(tenantId, missing);
      }
      updates.chartOfAccounts = chart;
      updates.acctStatus = Object.fromEntries(chart.map(a => [a.num, true]));
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
    // Fetch unit documents and move events
    const [unitDocs, moveEvts] = await Promise.all([
      unitMgrSvc.fetchUnitDocuments(tenantId),
      unitMgrSvc.fetchMoveEvents(tenantId),
    ]);
    if (unitDocs) updates.unitDocuments = unitDocs;
    if (moveEvts) updates.moveEvents = moveEvts;
    if (data.settings) {
      updates.hoaDueDay = data.settings.hoaDueDay;
      updates.annualReserveContribution = data.settings.annualReserveContribution;
      updates.stripeConnectId = data.settings.stripeConnectId;
      updates.stripeOnboardingComplete = data.settings.stripeOnboardingComplete;
      updates.autoBillingEnabled = data.settings.autoBillingEnabled;
      updates.lastBillingRun = data.settings.lastBillingRun;
      updates.lateFeeEnabled = data.settings.lateFeeEnabled;
      updates.lateFeeAmount = data.settings.lateFeeAmount;
      updates.lateFeeGraceDays = data.settings.lateFeeGraceDays;
      updates.lastLateFeeRun = data.settings.lastLateFeeRun;
      updates.closedThrough = data.settings.closedThrough;
      updates.autoReserveTransfer = data.settings.autoReserveTransfer;
      updates.paymentOrder = data.settings.paymentOrder;
      updates.monthCloseStartDay = data.settings.monthCloseStartDay || 1;
      updates.monthCloseEnabled = data.settings.monthCloseEnabled ?? true;
      updates.runbooksOff = data.settings.runbooksOff ?? [];
      updates.ownersSeeBalances = data.settings.ownersSeeBalances === true;
      updates.ownersSeeContacts = data.settings.ownersSeeContacts === true;
      updates.reserveStudyDate = data.settings.reserveStudyDate ?? null;
      updates.reserveStudyEveryYears = data.settings.reserveStudyEveryYears || 3;
      updates.taskerLimit = Number.isFinite(data.settings.taskerLimit) ? data.settings.taskerLimit : 300;
      // The saved mapping wins over this browser's copy; keys added since it was saved take their defaults.
      if (data.settings.glAccountMapping) updates.glAccountMapping = { ...DEFAULT_GL_MAPPING, ...(data.settings.glAccountMapping as Partial<GLAccountMapping>) };
    }
    if (Object.keys(updates).length > 0) set(updates);
  },

  setActiveTab: (tab) => set({ activeTab: tab, glPage: 0 }),
  setGlFilter: (filter) => set((s) => ({ glFilter: { ...s.glFilter, ...filter }, glPage: 0 })),
  setGlPage: (page) => set({ glPage: page }),

  // ─── GL Engine ─────────────────────────────────────
  glPost: (date, memo, debitAcct, creditAcct, amount, source, sourceId) => {
    const state = get();
    if (isLocked(date, state.closedThrough)) throw new LockedPeriodError(date, state.closedThrough!);
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
      // Dues billed by the billing run are the run's; everything else is whoever is signed in.
      postedBy: source === 'assessment' ? 'Billing run' : actor() || undefined,
      status: 'posted',
    };
    set({ generalLedger: [...state.generalLedger, entry], glNextId: state.glNextId + 1 });
    if (isBackendEnabled) {
      const tid = state.tenantId || getActiveTenantId();
      if (tid) financialSvc.createGLEntry(tid, entry);
    }
    return entry;
  },

  reverseEntry: (id, reason, today = todayIso()) => {
    const s = get();
    const original = s.generalLedger.find(e => e.id === id);
    if (!original || original.status === 'void' || reversalsOf(id, s.generalLedger).length > 0) return null;
    const date = isLocked(original.date, s.closedThrough) ? today : original.date;
    const r = reversalOf(original, date, reason);
    return s.glPost(r.date, r.memo, r.debitAcct, r.creditAcct, r.amount, r.source, r.sourceId);
  },

  voidEntry: (id, reason) => {
    const s = get();
    const e = s.generalLedger.find(x => x.id === id);
    if (!e || e.status === 'void' || isLocked(e.date, s.closedThrough)) return false;
    set(st => ({ generalLedger: st.generalLedger.map(x => (x.id === id ? { ...x, status: 'void' as const } : x)) }));
    if (isBackendEnabled) {
      const tid = s.tenantId || getActiveTenantId();
      if (tid) financialSvc.setGLEntryStatus(tid, id, 'void', reason).catch(err => console.error('[syncWrite] setGLEntryStatus failed:', err));
    }
    return true;
  },

  closedThrough: null,
  closeBooksThrough: (date, today = todayIso()) => {
    if (date !== null && date >= today) throw new Error('The books can only be closed through a day before today.');
    set({ closedThrough: date });
    syncSettings();
  },
  canPostOn: (date) => !isLocked(date, get().closedThrough),

  setAcctFund: (num, fund) => {
    set(s => ({ chartOfAccounts: s.chartOfAccounts.map(a => (a.num === num ? { ...a, fund: fund ?? undefined } : a)) }));
    if (isBackendEnabled) {
      const s = get();
      const entry = s.chartOfAccounts.find(a => a.num === num);
      const tid = s.tenantId || getActiveTenantId();
      if (entry && tid) financialSvc.upsertCoAEntry(tid, entry);
    }
  },

  openingBalances: () => {
    const s = get();
    const m = mappingOf(s.glAccountMapping);
    const out: OpeningBalancesState = { asOf: null, operatingCash: 0, reserveCash: 0, units: {}, bills: [], owed: 0, prepaid: 0, billsTotal: 0, operatingFund: 0, reserveFund: 0, paymentsApplied: false };
    for (const e of s.generalLedger) {
      if (!isOpeningEntry(e)) continue;
      out.asOf = out.asOf && out.asOf > e.date ? out.asOf : e.date;
      const kind = e.sourceId!.split(':')[1];
      const key = e.sourceId!.split(':').slice(2).join(':');
      if (kind === 'cash') { if (key === 'reserve') out.reserveCash = r2(out.reserveCash + e.amount); else out.operatingCash = r2(out.operatingCash + e.amount); }
      else if (kind === 'unit') out.units[key] = r2((out.units[key] ?? 0) + (e.debitAcct === m.assessmentsReceivable ? e.amount : -e.amount));
      else if (kind === 'bill') out.billsTotal = r2(out.billsTotal + e.amount);
    }
    out.bills = s.workOrders.filter(w => w.id.startsWith(OPENING_BILL_PREFIX));
    for (const v of Object.values(out.units)) { if (v > 0) out.owed = r2(out.owed + v); else out.prepaid = r2(out.prepaid - v); }
    out.operatingFund = r2(out.operatingCash + out.owed - out.prepaid - out.billsTotal);
    out.reserveFund = out.reserveCash;
    out.paymentsApplied = s.unitInvoices.some(i => i.forInvoiceId === OPENING_INVOICE_MARK && i.status !== 'void' && (i.paidAmount ?? 0) > 0);
    return out;
  },

  postOpeningBalances: (input, today = todayIso()) => {
    const s = get();
    if (!input.asOf || input.asOf >= today) throw new Error('The cutover date must be a day before today, usually the last day of the month before you joined.');
    const prior = s.generalLedger.filter(isOpeningEntry);
    const priorMax = prior.reduce((mx, e) => (e.date > mx ? e.date : mx), '');
    if (s.closedThrough && (!prior.length || s.closedThrough > priorMax)) throw new Error(`The books are closed through ${s.closedThrough}. Reopen them under Accounts and ledger before changing the opening balances.`);
    if (get().openingBalances().paymentsApplied) throw new Error('A payment was already applied to an opening balance. Adjust that unit with a new charge or a credit instead of re-entering the opening balances.');
    const m = mappingOf(s.glAccountMapping);
    const touched = new Set<string>();
    const previousLock = s.closedThrough;
    set({ closedThrough: null });
    try {
      // Earlier opening lines come out first: the entries are voided, the opening invoices removed, the unpaid opening bills dropped.
      const priorUnits = new Map<string, number>();
      for (const e of prior) {
        get().voidEntry(e.id, 'Opening balances re-entered');
        const [, kind, ...rest] = e.sourceId!.split(':');
        if (kind === 'unit') { const n = rest.join(':'); priorUnits.set(n, r2((priorUnits.get(n) ?? 0) + (e.debitAcct === m.assessmentsReceivable ? e.amount : -e.amount))); }
      }
      set(st => ({
        units: st.units.map(u => (priorUnits.has(u.number) ? { ...u, balance: r2(u.balance - priorUnits.get(u.number)!) } : u)),
        unitInvoices: st.unitInvoices.filter(i => !(i.forInvoiceId === OPENING_INVOICE_MARK && i.status !== 'void')),
        workOrders: st.workOrders.filter(w => !(w.id.startsWith(OPENING_BILL_PREFIX) && w.status === 'invoiced')),
      }));
      for (const n of priorUnits.keys()) touched.add(n);

      const post = get().glPost;
      if (input.operatingCash > 0) post(input.asOf, 'Opening balance · operating account', m.bankAccount, m.operatingFundBalance, r2(input.operatingCash), 'manual', 'opening:cash:operating');
      if (input.reserveCash > 0) post(input.asOf, 'Opening balance · reserve account', m.reserveBankAccount, m.reserveFundBalance, r2(input.reserveCash), 'manual', 'opening:cash:reserve');
      for (const { number, amount } of input.units) {
        const unit = get().units.find(u => u.number === number);
        if (!unit) continue;
        const amt = r2(amount);
        if (amt > 0) {
          post(input.asOf, `Opening balance owed · Unit ${number}`, m.assessmentsReceivable, m.operatingFundBalance, amt, 'assessment', `opening:unit:${number}`);
          set(st => ({ units: st.units.map(u => (u.number === number ? { ...u, balance: amt } : u)) }));
          get().createUnitInvoice(number, 'monthly', amt, `Balance brought forward · as of ${input.asOf}`, undefined, input.asOf, { date: input.asOf, post: false, forInvoiceId: OPENING_INVOICE_MARK });
        } else if (amt < 0) {
          post(input.asOf, `Opening credit · Unit ${number} paid ahead`, m.operatingFundBalance, m.prepaidAssessments, -amt, 'payment', `opening:unit:${number}`);
          set(st => ({ units: st.units.map(u => (u.number === number ? { ...u, balance: amt } : u)) }));
        } else {
          set(st => ({ units: st.units.map(u => (u.number === number ? { ...u, balance: 0 } : u)) }));
        }
        touched.add(number);
      }
      let k = get().workOrders.filter(w => w.id.startsWith(OPENING_BILL_PREFIX)).reduce((mx, w) => Math.max(mx, Number(w.id.slice(OPENING_BILL_PREFIX.length)) || 0), 0);
      for (const b of input.bills) {
        const amt = r2(b.amount);
        if (!(amt > 0)) continue;
        const id = `${OPENING_BILL_PREFIX}${++k}`;
        const entry = post(input.asOf, `Opening bill · ${b.vendor} · ${b.description}`, m.operatingFundBalance, m.accountsPayable, amt, 'expense', `opening:bill:${id}`);
        const wo: WorkOrder = { id, title: b.description, vendor: b.vendor, description: b.description, acctNum: b.acctNum, amount: amt, status: 'invoiced', caseId: null, createdDate: input.asOf, approvedDate: input.asOf, invoiceNum: b.invoiceNum || id, invoiceDate: input.asOf, paidDate: null, glEntryId: null, attachments: [], accrualGlEntryId: entry.id };
        set(st => ({ workOrders: [...st.workOrders, wo] }));
        if (isBackendEnabled) { const tid = get().tenantId || getActiveTenantId(); if (tid) insertWorkOrder(tid, wo.id); }
      }
      get().closeBooksThrough(input.asOf, today);
    } catch (err) {
      set({ closedThrough: previousLock });
      throw err;
    }
    for (const n of touched) syncUnit(n);
    return get().openingBalances();
  },

  getFundStatements: (from, to) => {
    const s = get();
    const end = to ?? todayIso();
    const start = from ?? fiscalYearStart(end, useBuildingStore.getState().details?.fiscalYearEnd || '12-31');
    return fundStatements(s.chartOfAccounts, s.generalLedger, start, end);
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

    // Use only original seed units for demo GL data — never generate
    // entries for dynamically added units.
    const demoUnits = seedUnits;

    // 1. Assessment billings
    demoUnits.forEach((u) => {
      post('2026-01-01', `Assessment - Unit ${u.number} (Jan)`, '1110', '4010', u.monthlyFee, 'assessment', u.number);
      post('2026-02-01', `Assessment - Unit ${u.number} (Feb)`, '1110', '4010', u.monthlyFee, 'assessment', u.number);
    });

    // 2. Payments received
    demoUnits.forEach((u) => {
      post('2026-01-15', `Payment received - Unit ${u.number} (Jan)`, '1010', '1110', u.monthlyFee, 'payment', u.number);
      if (u.balance === 0) {
        post('2026-02-10', `Payment received - Unit ${u.number} (Feb)`, '1010', '1110', u.monthlyFee, 'payment', u.number);
      }
    });

    // 3. Late fees
    demoUnits.forEach((u) => {
      if (u.balance > 0 && u.balance > u.monthlyFee) {
        post('2026-02-05', `Late fee - Unit ${u.number}`, '1130', '4030', 25, 'fee', u.number);
      }
    });

    // 4. Operating expenses from budget categories
    seedBudgetCategories.forEach((cat) => {
      const glAcct = state.chartOfAccounts.find((a) => a.budgetCat === cat.id);
      const acctNum = glAcct ? glAcct.num : '5070';
      cat.expenses.forEach((exp) => {
        post(exp.date, exp.description, acctNum, '1010', exp.amount, 'expense', exp.invoice);
      });
    });

    // 5. Reserve fund balances
    seedReserveItems.forEach((item) => {
      if (item.currentFunding > 0) {
        post('2025-12-31', `Reserve balance - ${item.name}`, '1020', '3020', item.currentFunding, 'transfer', item.id);
      }
    });

    // 6. Opening operating balance
    const totalExpenses = seedBudgetCategories.reduce((s, c) => s + c.expenses.reduce((s2, e) => s2 + e.amount, 0), 0);
    const totalCollected = demoUnits.reduce((s, u) => s + u.monthlyFee * 2, 0);
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
    return balanceOf(acctNum, acct.type, get().generalLedger);
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

    // Fund balances carry the result to date (revenue − expenses, plus transfers), so assets = liabilities + equity
    // without a year-end close. `retained` is the 3030 account alone, kept out of the operating fund figure so
    // operating + reserve + retained still adds to the total.
    const { chartOfAccounts, generalLedger } = get();
    const op = fundTotals('operating', chartOfAccounts, generalLedger);
    const rs = fundTotals('reserve', chartOfAccounts, generalLedger);
    const retained = acctBalance('3030');
    const equity = {
      operatingFund: Math.round((op.fundBalance - retained) * 100) / 100, reserveFund: rs.fundBalance,
      retained, total: 0,
      /** Revenue less expenses to date across both funds, the part of equity not yet closed to a fund balance account. */
      resultToDate: Math.round((op.revenue - op.expenses + rs.revenue - rs.expenses) * 100) / 100,
    };
    equity.total = Math.round((op.fundBalance + rs.fundBalance) * 100) / 100;

    return { assets, liabilities, equity, funds: { operating: op, reserve: rs } };
  },

  getIncomeStatement: (startDate, endDate) => {
    const { generalLedger, getAcctsByType } = get();
    const entries = generalLedger.filter((e) => e.status !== 'void' && e.date >= startDate && e.date <= endDate);
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
    const { budgetCategories, chartOfAccounts, generalLedger, getCategorySpent } = get();
    // Actuals are this fiscal year's, not all time: the budget is a year's budget.
    const today = todayIso();
    const fyStart = fiscalYearStart(today, useBuildingStore.getState().details?.fiscalYearEnd || '12-31');
    const thisYear = generalLedger.filter(e => e.date >= fyStart && e.date <= today);
    return budgetCategories.map((cat) => {
      // A line is measured against its ledger accounts; one with no account falls back to expenses typed on the line itself.
      const accts = budgetLineAccounts(cat, chartOfAccounts);
      const actual = accts.length ? Math.round(accts.reduce((t, a) => t + balanceOf(a.num, a.type, thisYear), 0) * 100) / 100 : getCategorySpent(cat);
      const budgeted = cat.budgeted;
      const variance = budgeted - actual;
      const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
      return { id: cat.id, name: cat.name, budgeted, actual, variance, pct, acctNum: accts[0]?.num, acctNums: accts.map(a => a.num) };
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
      occupiedUnits: units.length,
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
    const id = generateLocalId('cat');
    const cat: BudgetCategory = { id, name, budgeted, expenses: [] };
    set((s) => ({ budgetCategories: [...s.budgetCategories, cat] }));
    if (isBackendEnabled) {
      const tid = get().tenantId || getActiveTenantId();
      if (tid) financialSvc.createBudgetCategory(tid, cat).then(dbRow => {
        if (dbRow && removedBeforeSaved.delete(id)) { financialSvc.deleteBudgetCategory(dbRow.id); return; }
        if (dbRow) {
          const latest = get().budgetCategories.find(x => x.id === id);
          set(s => ({ budgetCategories: s.budgetCategories.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
          // Anything changed while it was being saved goes up now.
          if (latest && (latest.name !== cat.name || latest.budgeted !== cat.budgeted)) financialSvc.updateBudgetCategory(dbRow.id, { name: latest.name, budgeted: latest.budgeted });
          // Accounts linked to the line while it was saving follow it to its saved id.
          const chart = get().chartOfAccounts;
          if (chart.some(a => a.budgetCat === id)) {
            set(s => ({ chartOfAccounts: s.chartOfAccounts.map(a => a.budgetCat === id ? { ...a, budgetCat: dbRow.id } : a) }));
            get().chartOfAccounts.filter(a => a.budgetCat === dbRow.id).forEach(a => { void financialSvc.upsertCoAEntry(tid, a); });
          }
          // Update any building assets referencing the old local ID
          const bStore = useBuildingStore.getState();
          bStore.assets.filter(a => a.budgetCategoryId === id).forEach(a => {
            bStore.updateAsset(a.id, { budgetCategoryId: dbRow.id });
          });
        }
      }).catch(err => {
        console.error('[syncWrite] createBudgetCategory failed:', err);
        set(s => ({ budgetCategories: s.budgetCategories.filter(x => x.id !== id) }));
      });
    }
  },

  updateBudgetCategory: (id, updates) => {
    set((s) => ({
      budgetCategories: s.budgetCategories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
    if (isBackendEnabled && isDbId(id)) financialSvc.updateBudgetCategory(id, updates);
  },

  deleteBudgetCategory: (id) => {
    set((s) => ({
      budgetCategories: s.budgetCategories.filter((c) => c.id !== id),
    }));
    if (isBackendEnabled) { if (isDbId(id)) financialSvc.deleteBudgetCategory(id); else removedBeforeSaved.add(id); }
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
          ? { ...c, expenses: [...c.expenses, { id: generateLocalId('exp'), ...expense }].sort((a, b) => b.date.localeCompare(a.date)) }
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
    const id = generateLocalId('res');
    const newItem: ReserveItem = { id, ...item };
    set((s) => ({ reserveItems: [...s.reserveItems, newItem] }));
    if (isBackendEnabled) {
      const tid = get().tenantId || getActiveTenantId();
      if (tid) financialSvc.createReserveItem(tid, newItem).then(dbRow => {
        if (dbRow && removedBeforeSaved.delete(id)) { financialSvc.deleteReserveItem(dbRow.id); return; }
        if (dbRow) {
          const latest = get().reserveItems.find(x => x.id === id);
          set(s => ({ reserveItems: s.reserveItems.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
          // Anything changed while it was being saved goes up now.
          if (latest) { const { id: _local, ...rest } = latest; void _local; financialSvc.updateReserveItem(dbRow.id, rest); }
          // Update any building assets referencing the old local ID
          const bStore = useBuildingStore.getState();
          bStore.assets.filter(a => a.reserveItemId === id).forEach(a => {
            bStore.updateAsset(a.id, { reserveItemId: dbRow.id });
          });
        }
      }).catch(err => {
        console.error('[syncWrite] createReserveItem failed:', err);
        set(s => ({ reserveItems: s.reserveItems.filter(x => x.id !== id) }));
      });
    }
  },

  updateReserveItem: (id, updates) => {
    set((s) => ({
      reserveItems: s.reserveItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    if (isBackendEnabled && isDbId(id)) financialSvc.updateReserveItem(id, updates);
  },

  deleteReserveItem: (id) => {
    set((s) => ({ reserveItems: s.reserveItems.filter((i) => i.id !== id) }));
    if (isBackendEnabled) { if (isDbId(id)) financialSvc.deleteReserveItem(id); else removedBeforeSaved.add(id); }
  },

  addUnit: (unit) => {
    const fullUnit: Unit = { ...unit, payments: [], lateFees: [], specialAssessments: [] };
    set((s) => ({ units: [...s.units, fullUnit] }));
    if (isBackendEnabled) {
      const tid = get().tenantId || getActiveTenantId();
      if (tid) {
        financialSvc.upsertUnit(tid, fullUnit).then(ok => {
          if (!ok) console.error('[addUnit] upsertUnit returned false for unit:', unit.number);
        }).catch(err => {
          console.error('[addUnit] upsertUnit failed for unit:', unit.number, err);
        });
      } else {
        console.warn('[addUnit] No tenantId available — unit not persisted to DB:', unit.number);
      }
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
      attachments: [], people: actor() ? { raisedBy: actor() } : null,
    };
    set((s) => ({ workOrders: [...s.workOrders, newWo] }));
    if (isBackendEnabled) {
      const tid = state.tenantId || getActiveTenantId();
      if (tid) insertWorkOrder(tid, newWo.id);
    }
  },

  setWorkOrderCase: (id, caseId) => {
    set((s) => ({ workOrders: s.workOrders.map((w) => (w.id === id ? { ...w, caseId } : w)) }));
    syncWorkOrder(id);
  },
  updateWorkOrder: (id, patch) => {
    set((s) => ({ workOrders: s.workOrders.map((w) => (w.id === id && (w.status === 'draft' || w.status === 'approved') ? { ...w, ...patch } : w)) }));
    syncWorkOrder(id);
  },
  approveWorkOrder: (id) => {
    set((s) => ({
      workOrders: s.workOrders.map((w) =>
        w.id === id && w.status === 'draft' ? { ...w, status: 'approved' as const, approvedDate: new Date().toISOString().split('T')[0], people: { ...(w.people ?? {}), ...(actor() ? { approvedBy: actor() } : {}) } } : w
      ),
    }));
    syncWorkOrder(id);
  },

  signOffWorkOrder: (id, by, notes = '', date = todayIso()) => {
    set((s) => ({ workOrders: s.workOrders.map((w) => (w.id === id && w.status !== 'draft' ? { ...w, signoff: { date, by, notes: notes.trim() } } : w)) }));
    syncWorkOrder(id);
  },

  receiveInvoice: (id, invoiceNum, amount, invoiceDate) => {
    const s = get();
    const wo = s.workOrders.find((w) => w.id === id);
    if (!wo || wo.status !== 'approved') return;
    const today = todayIso();
    const date = invoiceDate && !isLocked(invoiceDate, s.closedThrough) ? invoiceDate : today;
    const m = mappingOf(s.glAccountMapping);
    const amt = r2(amount);
    // Accrual: the expense belongs to the month the bill arrived, whether or not it is paid yet.
    const entry = amt > 0 ? s.glPost(date, `${wo.title} — ${wo.vendor} · invoice ${invoiceNum}${wo.caseId ? ' (' + wo.caseId + ')' : ''}`, wo.acctNum, m.accountsPayable, amt, wo.caseId ? 'case' : 'expense', wo.caseId || invoiceNum) : null;
    set((st) => ({
      workOrders: st.workOrders.map((w) =>
        w.id === id ? { ...w, status: 'invoiced' as const, invoiceNum, amount: amt, invoiceDate: invoiceDate ?? today, accrualGlEntryId: entry?.id ?? null } : w
      ),
    }));
    syncWorkOrder(id);
  },

  payBlockerFor: (id) => {
    const wo = get().workOrders.find((w) => w.id === id);
    return wo ? payBlocker(wo.people, actor(), controlRules()) : '';
  },

  payWorkOrder: (id, paidDate = todayIso(), opts) => {
    const s = get();
    const wo = s.workOrders.find((w) => w.id === id);
    if (!wo || wo.status !== 'invoiced') return '';
    // With the two-person rule on, whoever raised or approved a bill cannot pay it. A job paid automatically under the Tasker limit is not a person paying.
    const why = opts?.automatic ? '' : payBlocker(wo.people, actor(), controlRules());
    if (why) return why;
    const payer = opts?.automatic ? 'Automatic, under the Tasker limit' : actor();
    const m = mappingOf(s.glAccountMapping);
    // A reserve expense is paid from the reserve bank account.
    const acct = s.chartOfAccounts.find(a => a.num === wo.acctNum);
    const bank = fundOf(acct, wo.acctNum) === 'reserve' ? m.reserveBankAccount : m.bankAccount;
    const memo = `${wo.title} — ${wo.vendor}${wo.invoiceNum ? ` · invoice ${wo.invoiceNum}` : ''}${wo.caseId ? ' (' + wo.caseId + ')' : ''}`;
    const source: GLEntry['source'] = wo.caseId ? 'case' : 'expense';
    // Accrued bills clear the payable; bills invoiced before accrual book the expense now, as they always did.
    const entry = wo.accrualGlEntryId
      ? s.glPost(paidDate, `Paid · ${memo}`, m.accountsPayable, bank, wo.amount, source, wo.caseId || wo.invoiceNum)
      : s.glPost(paidDate, memo, wo.acctNum, bank, wo.amount, source, wo.caseId || wo.invoiceNum);
    set((st) => ({
      workOrders: st.workOrders.map((w) =>
        w.id === id ? { ...w, status: 'paid' as const, paidDate, glEntryId: entry.id, people: { ...(w.people ?? {}), ...(payer ? { paidBy: payer } : {}) } } : w
      ),
    }));
    syncWorkOrder(id);
    return '';
  },

  addCoASection: (num, name, type) =>
    set((s) => {
      if (s.chartOfAccounts.find((a) => a.num === num)) return s;
      const entry: ChartOfAccountsEntry = { num, name, type: type as any, sub: 'header', parent: null };
      const updated = [...s.chartOfAccounts, entry];
      updated.sort((a, b) => a.num.localeCompare(b.num));
      if (isBackendEnabled) { const tid = s.tenantId || getActiveTenantId(); if (tid) financialSvc.upsertCoAEntry(tid, entry); }
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
      if (isBackendEnabled) { const tid = s.tenantId || getActiveTenantId(); if (tid) financialSvc.upsertCoAEntry(tid, entry); }
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
      const tid = s.tenantId || getActiveTenantId();
      if (entry && tid) financialSvc.upsertCoAEntry(tid, entry);
    }
  },

  setBudgetLineAccount: (categoryId, acctNum) => {
    const before = get().chartOfAccounts;
    const next = before.map(a => {
      if (a.num === acctNum) return a.budgetCat === categoryId ? a : { ...a, budgetCat: categoryId };
      if (a.budgetCat === categoryId) { const { budgetCat: _b, ...rest } = a; return rest; }
      return a;
    });
    set({ chartOfAccounts: next });
    if (isBackendEnabled) {
      const tid = get().tenantId || getActiveTenantId();
      if (tid) next.filter((a, i) => a !== before[i]).forEach(a => { void financialSvc.upsertCoAEntry(tid, a); });
    }
  },

  deleteCoAAccount: (num) =>
    set((s) => {
      if (s.generalLedger.some((e) => e.debitAcct === num || e.creditAcct === num)) return s;
      const tid = s.tenantId || getActiveTenantId();
      if (isBackendEnabled && tid) financialSvc.deleteCoAEntry(tid, num);
      return { chartOfAccounts: s.chartOfAccounts.filter((a) => a.num !== num) };
    }),

  postManualEntry: (date, memo, debitAcct, creditAcct, amount) => {
    get().glPost(date, memo, debitAcct, creditAcct, amount, 'manual', null);
  },

  postTransfer: (date, memo, fromAcct, toAcct, amount) => {
    get().glPost(date, memo, toAcct, fromAcct, amount, 'transfer', null);
  },

  recordUnitPayment: (unitNum, amount, method, opts: { date?: string } = {}) => {
    const date = opts.date ?? todayIso();
    const s = get();
    const m = mappingOf(s.glAccountMapping);
    const unit = s.units.find(u => u.number === unitNum);
    const result: PaymentApplication = { applied: [], toBalance: 0, toCredit: 0, total: r2(amount) };
    if (!unit || !(amount > 0)) return result;
    let left = r2(amount);
    const changed = new Map<string, Partial<UnitInvoice>>();
    for (const inv of openInvoicesInOrder(unitNum, s.unitInvoices, s.paymentOrder)) {
      if (left <= 0) break;
      const take = r2(Math.min(left, invoiceRemaining(inv)));
      const { arAcct } = getGLAccountsForInvoice(inv.type, m, inv.fund);
      const gl = s.glPost(date, `Payment received - Invoice ${inv.id} Unit ${unitNum}`, m.bankAccount, arAcct, take, 'payment', unitNum);
      const paid = r2((inv.paidAmount ?? 0) + take);
      const full = paid >= inv.amount - 0.005;
      changed.set(inv.id, { paidAmount: paid, status: full ? 'paid' : inv.status, paidDate: full ? date : inv.paidDate, paymentMethod: method, paymentGlEntryId: gl.id });
      result.applied.push({ invoiceId: inv.id, amount: take });
      left = r2(left - take);
    }
    if (left > 0) {
      // A balance brought over from before the register, with no invoice behind it.
      const toBal = r2(Math.min(left, legacyOwed(unit, s.unitInvoices)));
      if (toBal > 0) {
        s.glPost(date, `Payment received - Unit ${unitNum}`, m.bankAccount, m.assessmentsReceivable, toBal, 'payment', unitNum);
        result.toBalance = toBal;
        left = r2(left - toBal);
      }
    }
    if (left > 0) {
      s.glPost(date, `Paid ahead - Unit ${unitNum}`, m.bankAccount, m.prepaidAssessments, left, 'payment', unitNum);
      result.toCredit = left;
    }
    const note = result.applied.length
      ? `${result.applied.map(a => a.invoiceId).join(', ')}${result.toCredit ? ` · ${result.toCredit.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} credit` : ''}`
      : result.toCredit && !result.toBalance ? 'Paid ahead' : `Payment via ${method}`;
    const paidInvoiceIds = new Set([...changed.entries()].filter(([, c]) => c.status === 'paid').map(([id]) => id));
    set(st => ({
      unitInvoices: st.unitInvoices.map(i => (changed.has(i.id) ? { ...i, ...changed.get(i.id) } : i)),
      units: st.units.map(u => u.number === unitNum ? {
        ...u,
        balance: r2(u.balance - amount),
        payments: [...u.payments, { date, amount: r2(amount), method, note }],
        lateFees: u.lateFees.map(f => (f.invoiceId && paidInvoiceIds.has(f.invoiceId) ? { ...f, paid: true } : f)),
        specialAssessments: u.specialAssessments.map(a => (a.invoiceId && paidInvoiceIds.has(a.invoiceId) ? { ...a, paid: true, paidDate: date } : a)),
      } : u),
    }));
    if (isBackendEnabled) for (const [id, c] of changed) if (isDbId(id)) financialSvc.updateUnitInvoice(id, c);
    syncUnit(unitNum);
    return result;
  },

  waiveLateFee: (unitNum, feeIndex, reason = 'Waived by the board') => {
    const s = get();
    const unit = s.units.find(u => u.number === unitNum);
    const fee = unit?.lateFees[feeIndex];
    if (!unit || !fee || fee.waived) return;
    if (fee.invoiceId) {
      const inv = s.unitInvoices.find(i => i.id === fee.invoiceId);
      if (inv && isOpenInvoice(inv)) { s.voidUnitInvoice(inv.id, reason); return; }
      if (inv && inv.status === 'paid') return; // already paid: a refund, not a waiver
    } else {
      // A fee from before the register: its posting was Dr fees owed / Cr late fee income. Reverse it.
      const m = mappingOf(s.glAccountMapping);
      s.glPost(todayIso(), `Late fee waived - Unit ${unitNum}: ${reason}`, m.lateFeeRevenue, m.lateFeeReceivable, fee.amount, 'fee', unitNum);
    }
    set(st => ({
      units: st.units.map(u => u.number === unitNum ? { ...u, lateFees: u.lateFees.map((f, i) => (i === feeIndex ? { ...f, waived: true } : f)) } : u),
    }));
    syncUnit(unitNum);
  },

  imposeLateFee: (unitNum, amount, reason, opts: { forInvoiceId?: string | null; date?: string; dueDate?: string } = {}) => {
    const date = opts.date ?? todayIso();
    const inv = get().createUnitInvoice(unitNum, 'fee', amount, reason, undefined, opts.dueDate ?? date, { date, forInvoiceId: opts.forInvoiceId ?? null });
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        lateFees: [...u.lateFees, { date, amount, reason, waived: false, invoiceId: inv.id, paid: inv.status === 'paid' }],
      } : u),
    }));
    syncUnit(unitNum);
    return inv;
  },

  updateUnit: (unitNum, updates) => {
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? { ...u, ...updates } : u),
    }));
    syncUnit(unitNum);
  },

  removeUnit: (unitNum) => {
    set(s => ({ units: s.units.filter(u => u.number !== unitNum) }));
    if (isBackendEnabled) {
      const tid = get().tenantId || getActiveTenantId();
      if (tid) {
        financialSvc.deleteUnit(tid, unitNum).catch(err => console.error('[removeUnit] failed:', err));
      }
    }
  },

  addSpecialAssessment: (unitNum, amount, reason, opts: { dueDate?: string; fund?: Fund } = {}) => {
    const today = todayIso();
    const id = generateLocalId('sa-');
    const inv = get().createUnitInvoice(unitNum, 'special_assessment', amount, reason, undefined, opts.dueDate, { fund: opts.fund ?? 'reserve' });
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        specialAssessments: [...u.specialAssessments, { id, date: today, amount, reason, paid: inv.status === 'paid', paidDate: inv.paidDate, invoiceId: inv.id }],
      } : u),
    }));
    syncUnit(unitNum);
    return inv;
  },

  markSpecialAssessmentPaid: (unitNum, assessmentId, method = 'check') => {
    const today = todayIso();
    const unit = get().units.find(u => u.number === unitNum);
    const sa = unit?.specialAssessments.find(a => a.id === assessmentId);
    if (!sa || sa.paid) return;
    if (sa.invoiceId && get().unitInvoices.some(i => i.id === sa.invoiceId)) { get().payUnitInvoice(sa.invoiceId, method); return; }
    // An assessment from before the register: it is in the balance; post the payment and settle it.
    const m = mappingOf(get().glAccountMapping);
    get().glPost(today, `Special assessment payment - Unit ${unitNum}`, m.bankAccount, m.specialAssessmentsReceivable, sa.amount, 'payment', unitNum);
    set(s => ({
      units: s.units.map(u => u.number === unitNum ? {
        ...u,
        balance: r2(u.balance - sa.amount),
        payments: [...u.payments, { date: today, amount: sa.amount, method, note: `Special assessment · ${sa.reason}` }],
        specialAssessments: u.specialAssessments.map(a => a.id === assessmentId ? { ...a, paid: true, paidDate: today } : a),
      } : u),
    }));
    syncUnit(unitNum);
  },

  refundCredit: (unitNum, amount, reason) => {
    const s = get();
    const unit = s.units.find(u => u.number === unitNum);
    if (!unit) return null;
    const take = r2(Math.min(amount, creditOf(unit)));
    if (take <= 0) return null;
    const m = mappingOf(s.glAccountMapping);
    const entry = s.glPost(todayIso(), `Credit returned - Unit ${unitNum}: ${reason}`, m.prepaidAssessments, m.bankAccount, take, 'refund', unitNum);
    set(st => ({ units: st.units.map(u => u.number === unitNum ? { ...u, balance: r2(u.balance + take) } : u) }));
    syncUnit(unitNum);
    return entry;
  },

  // Billing automation
  autoBillingEnabled: false,
  lastBillingRun: null,
  setAutoBilling: (enabled) => {
    set({ autoBillingEnabled: enabled });
    syncSettings();
  },
  autoReserveTransfer: true,
  setAutoReserveTransfer: (enabled) => {
    set({ autoReserveTransfer: enabled });
    syncSettings();
  },
  paymentOrder: 'dues-first',
  setPaymentOrder: (order) => {
    set({ paymentOrder: order });
    syncSettings();
  },
  taskerLimit: 300,
  setTaskerLimit: (amount) => {
    const n = Math.round(Number(amount));
    const ceiling = useBuildingStore.getState().bylawsConfig.boardSpendingLimit;
    if (!Number.isFinite(n) || n < 0 || n > ceiling) return false;
    set({ taskerLimit: n });
    syncSettings();
    return true;
  },
  monthCloseStartDay: 1,
  setMonthCloseStartDay: (day) => {
    const n = Math.round(Number(day));
    if (!Number.isFinite(n) || n < 1 || n > 28) return;
    set({ monthCloseStartDay: n });
    syncSettings();
  },
  monthCloseEnabled: true,
  setMonthCloseEnabled: (on) => {
    if (get().monthCloseEnabled === on) return;
    set({ monthCloseEnabled: on });
    syncSettings();
  },
  ownersSeeBalances: false,
  ownersSeeContacts: false,
  setOwnerSharing: async (which, on) => {
    const key = which === 'balances' ? 'ownersSeeBalances' : 'ownersSeeContacts';
    const was = get()[key];
    if (was === on) return true;
    set({ [key]: on } as Pick<FinancialState, typeof key>);
    if (!isBackendEnabled) return true;
    const tid = resolveTenantId();
    // Saved on its own, not with the other settings: a database that has not had this column added yet must not fail every other setting.
    const ok = tid ? await financialSvc.upsertFinancialSettings(tid, { [key]: on }).catch(() => false) : false;
    if (!ok) set({ [key]: was } as Pick<FinancialState, typeof key>);
    return ok;
  },
  reserveStudyDate: null,
  reserveStudyEveryYears: 3,
  setReserveStudy: (date, everyYears) => {
    const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
    const n = everyYears === undefined ? get().reserveStudyEveryYears : Math.round(Number(everyYears));
    set({ reserveStudyDate: d, reserveStudyEveryYears: Number.isFinite(n) && n >= 1 && n <= 10 ? n : get().reserveStudyEveryYears });
    syncSettings();
  },
  runbooksOff: [],
  setRunbookOff: (id, off) => {
    const cur = get().runbooksOff;
    if (off === cur.includes(id)) return;
    set({ runbooksOff: off ? [...cur, id] : cur.filter(x => x !== id) });
    syncSettings();
  },

  runMonthlyBilling: (period, today = todayIso()) => {
    const s = get();
    const p = period ?? periodKey(today);
    const summary: BillingRunSummary = { period: p, billed: 0, amount: 0, alreadyBilled: 0, noAmount: 0, reserveTransfer: 0, lateFees: 0 };
    // Dues post on the 1st; when that day is already in a closed month they post today, named for their month.
    const date = isLocked(billingDate(p), s.closedThrough) ? today : billingDate(p);
    const due = duesDueDate(p, s.hoaDueDay);
    for (const u of s.units) {
      if (!(u.monthlyFee > 0)) { summary.noAmount++; continue; }
      if (get().unitInvoices.some(i => i.unitNumber === u.number && i.status !== 'void' && isDuesInvoiceFor(i, p))) { summary.alreadyBilled++; continue; }
      get().createUnitInvoice(u.number, 'monthly', u.monthlyFee, duesDescription(p), undefined, due, { date });
      summary.billed++;
      summary.amount = r2(summary.amount + u.monthlyFee);
    }
    const monthly = r2(s.annualReserveContribution / 12);
    if (s.autoReserveTransfer && monthly > 0) {
      const memo = reserveTransferMemo(p);
      if (!get().generalLedger.some(e => e.status !== 'void' && e.source === 'transfer' && e.memo === memo)) {
        const m = mappingOf(s.glAccountMapping);
        get().glPost(date, memo, m.reserveBankAccount, m.bankAccount, monthly, 'transfer', null);
        summary.reserveTransfer = monthly;
      }
    }
    set({ lastBillingRun: new Date(`${today}T12:00:00Z`).toISOString() });
    syncSettings();
    return summary;
  },

  runLateFees: (today = todayIso()) => {
    const s = get();
    if (!s.lateFeeEnabled || !(s.lateFeeAmount > 0)) return 0;
    const due = lateFeesDue(today, s.unitInvoices, s.lateFeeGraceDays);
    for (const inv of due) {
      get().imposeLateFee(inv.unitNumber, s.lateFeeAmount, `Late fee · ${inv.description.replace(/^Dues · /, '')}`, { forInvoiceId: inv.id, date: today, dueDate: today });
    }
    if (due.length) { set({ lastLateFeeRun: new Date(`${today}T12:00:00Z`).toISOString() }); syncSettings(); }
    return due.length;
  },

  runBillingCycle: (today = todayIso()) => {
    const s = get();
    const period = billingDue(today, s.autoBillingEnabled, s.lastBillingRun);
    const summary = period ? get().runMonthlyBilling(period, today) : null;
    const fees = get().runLateFees(today);
    if (summary) { summary.lateFees = fees; return summary; }
    return fees ? { period: periodKey(today), billed: 0, amount: 0, alreadyBilled: 0, noAmount: 0, reserveTransfer: 0, lateFees: fees } : null;
  },

  // Late fee settings
  lateFeeEnabled: false,
  lateFeeAmount: 25,
  lateFeeGraceDays: 15,
  lastLateFeeRun: null,
  setLateFeeSettings: (enabled, amount, graceDays) => {
    set({ lateFeeEnabled: enabled, lateFeeAmount: amount, lateFeeGraceDays: graceDays });
    syncSettings();
  },

  // Refund
  refundUnitInvoice: (invoiceId, reason) => {
    const today = todayIso();
    const s = get();
    const inv = s.unitInvoices.find(i => i.id === invoiceId);
    const paid = inv ? r2(inv.paidAmount ?? (inv.status === 'paid' ? inv.amount : 0)) : 0;
    if (!inv || inv.status === 'void' || paid <= 0) return;
    const remaining = invoiceRemaining(inv);

    // With a live backend the server does it all: the Stripe refund, then the same entries posted once by
    // refund_unit_invoice. The screen shows the result straight away and the ledger reloads behind it.
    if (isBackendEnabled && supabase && isDbId(invoiceId)) {
      set(st => ({
        unitInvoices: st.unitInvoices.map(i => (i.id === invoiceId ? { ...i, status: 'void' as const, refundAmount: paid, refundDate: today, refundReason: reason } : i)),
        units: st.units.map(u => u.number === inv.unitNumber ? { ...u, balance: r2(u.balance - remaining), lateFees: u.lateFees.map(f => (f.invoiceId === invoiceId ? { ...f, waived: true } : f)), specialAssessments: u.specialAssessments.filter(a => a.invoiceId !== invoiceId) } : u),
      }));
      const tid = s.tenantId || getActiveTenantId();
      supabase.functions.invoke('refund-unit-payment', { body: { invoiceId, reason } })
        .then(({ data, error }) => {
          if (error || data?.error) console.error('refund-unit-payment error:', error ?? data?.error);
          if (tid) return get().loadFromDb(tid);
        })
        .catch(err => console.error('refund-unit-payment error:', err));
      return;
    }

    // Local books (demo, tests): the charge was wrong, so the money goes back (Dr income / Cr bank) and whatever was still open is cancelled.
    const m = mappingOf(s.glAccountMapping);
    const { arAcct, revenueAcct } = getGLAccountsForInvoice(inv.type, m, inv.fund);
    const glEntry = s.glPost(today, `Refund - Invoice ${inv.id} Unit ${inv.unitNumber}: ${reason}`, revenueAcct, m.bankAccount, paid, 'refund', inv.unitNumber);
    if (remaining > 0) s.glPost(today, `Void - Invoice ${inv.id} Unit ${inv.unitNumber}: ${reason}`, revenueAcct, arAcct, remaining, invoiceSource(inv.type), inv.unitNumber);
    const patch: Partial<UnitInvoice> = { status: 'void', refundAmount: paid, refundDate: today, refundReason: reason, refundGlEntryId: glEntry.id };
    set(st => ({
      unitInvoices: st.unitInvoices.map(i => (i.id === invoiceId ? { ...i, ...patch } : i)),
      units: st.units.map(u => u.number === inv.unitNumber ? {
        ...u,
        // The paid part was already out of the balance; only the cancelled remainder comes off now.
        balance: r2(u.balance - remaining),
        lateFees: u.lateFees.map(f => (f.invoiceId === invoiceId ? { ...f, waived: true } : f)),
        specialAssessments: u.specialAssessments.filter(a => a.invoiceId !== invoiceId),
      } : u),
    }));
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

  // Unit Documents
  fetchUnitDocuments: async (tenantId) => {
    const docs = await unitMgrSvc.fetchUnitDocuments(tenantId);
    if (docs) set({ unitDocuments: docs });
  },
  uploadDocument: async (unitNumber, file, docType, visibleToOwner, uploadedBy, uploadedByName) => {
    const tenantId = get().tenantId;
    if (!tenantId) return false;
    const doc = await unitMgrSvc.uploadUnitDocument(tenantId, unitNumber, file, docType, visibleToOwner, uploadedBy, uploadedByName);
    if (doc) set(s => ({ unitDocuments: [doc, ...s.unitDocuments] }));
    return !!doc;
  },
  deleteDocument: async (id, storagePath) => {
    const ok = await unitMgrSvc.deleteUnitDocument(id, storagePath);
    if (ok) set(s => ({ unitDocuments: s.unitDocuments.filter(d => d.id !== id) }));
    return ok;
  },

  // Move Events
  fetchMoveEvents: async (tenantId) => {
    const events = await unitMgrSvc.fetchMoveEvents(tenantId);
    if (events) set({ moveEvents: events });
  },
  addMoveEvent: async (event) => {
    const tenantId = get().tenantId;
    if (!tenantId) {
      // Offline: create a local-only event
      const local: MoveEvent = { ...event, id: generateLocalId('mv-'), createdAt: new Date().toISOString() };
      set(s => ({ moveEvents: [local, ...s.moveEvents] }));
      return local;
    }
    const created = await unitMgrSvc.createMoveEvent(tenantId, event);
    if (created) set(s => ({ moveEvents: [created, ...s.moveEvents] }));
    return created;
  },
  updateMoveEvent: async (id, updates) => {
    const ok = await unitMgrSvc.updateMoveEvent(id, updates);
    if (ok) set(s => ({ moveEvents: s.moveEvents.map(e => e.id === id ? { ...e, ...updates } : e) }));
  },

  // Unit Invoices
  createUnitInvoice: (unitNum, type, amount, description, caseId?, dueDate?, opts: InvoiceOptions = {}) => {
    const s = get();
    const date = opts.date ?? todayIso();
    const effectiveDueDate = dueDate || addDays(date, 30);
    const id = generateLocalId('INV-U');
    const m = mappingOf(s.glAccountMapping);
    const fund = type === 'special_assessment' ? (opts.fund ?? 'reserve') : null;
    const usual = getGLAccountsForInvoice(type, m, fund);
    const arAcct = usual.arAcct;
    const revenueAcct = opts.revenueAcct && s.chartOfAccounts.some(a => a.num === opts.revenueAcct && a.type === 'income') ? opts.revenueAcct : usual.revenueAcct;
    const post = opts.post !== false;
    const amt = r2(amount);
    const glEntry = post ? s.glPost(date, `Invoice ${id} - Unit ${unitNum}: ${description}`, arAcct, revenueAcct, amt, invoiceSource(type), unitNum) : null;
    // Money the owner paid ahead pays the new charge first.
    const unit = s.units.find(u => u.number === unitNum);
    const credit = post && unit ? r2(Math.min(creditOf(unit), amt)) : 0;
    if (credit > 0) s.glPost(date, `Prepaid credit applied - Invoice ${id} Unit ${unitNum}`, m.prepaidAssessments, arAcct, credit, 'payment', unitNum);
    const settled = credit >= amt - 0.005;
    const invoice: UnitInvoice = {
      id, unitNumber: unitNum, type, description, amount: amt,
      status: settled ? 'paid' : 'sent', createdDate: date, dueDate: effectiveDueDate, paidDate: settled ? date : null,
      paidAmount: credit > 0 ? credit : null, paymentMethod: credit > 0 ? 'credit' : null, stripePaymentLink: null,
      glEntryId: glEntry?.id || null, paymentGlEntryId: null,
      fund, forInvoiceId: opts.forInvoiceId ?? null,
      ...(caseId ? { caseId } : {}),
    };
    set(st => ({
      unitInvoices: [...st.unitInvoices, invoice],
      units: post ? st.units.map(u => (u.number === unitNum ? { ...u, balance: r2(u.balance + amt) } : u)) : st.units,
    }));
    if (post) syncUnit(unitNum);
    if (isBackendEnabled) {
      const tid = s.tenantId || getActiveTenantId();
      if (tid) trackInvoiceSave(id, financialSvc.createUnitInvoice(tid, invoice).then(dbRow => {
        if (!dbRow) return null;
        // The row has its database id now: the invoice, and everything that names it, follow.
        const latest = get().unitInvoices.find(x => x.id === id);
        set(st => ({
          unitInvoices: st.unitInvoices.map(x => (x.id === id ? { ...x, id: dbRow.id } : x.forInvoiceId === id ? { ...x, forInvoiceId: dbRow.id } : x)),
          units: st.units.map(u => u.number === unitNum ? {
            ...u,
            lateFees: u.lateFees.map(f => (f.invoiceId === id ? { ...f, invoiceId: dbRow.id } : f)),
            specialAssessments: u.specialAssessments.map(a => (a.invoiceId === id ? { ...a, invoiceId: dbRow.id } : a)),
          } : u),
        }));
        // A payment that landed while the insert was in flight goes up now.
        if (latest && (latest.status !== invoice.status || latest.paidAmount !== invoice.paidAmount)) financialSvc.updateUnitInvoice(dbRow.id, { status: latest.status, paidAmount: latest.paidAmount, paidDate: latest.paidDate, paymentMethod: latest.paymentMethod, paymentGlEntryId: latest.paymentGlEntryId });
        syncUnit(unitNum);
        return dbRow.id as string;
      }).catch(err => {
        console.error('[syncWrite] createUnitInvoice failed:', err);
        return null;
      }));
    }
    return invoice;
  },

  payUnitInvoice: (invoiceId, method, opts: { date?: string; amount?: number } = {}) => {
    const date = opts.date ?? todayIso();
    const s = get();
    const inv = s.unitInvoices.find(i => i.id === invoiceId);
    if (!inv || !isOpenInvoice(inv)) return;
    const remaining = invoiceRemaining(inv);
    const take = r2(Math.min(opts.amount ?? remaining, remaining));
    if (take <= 0) return;
    const m = mappingOf(s.glAccountMapping);
    const { arAcct } = getGLAccountsForInvoice(inv.type, m, inv.fund);
    const glEntry = s.glPost(date, `Payment received - Invoice ${inv.id} Unit ${inv.unitNumber}`, m.bankAccount, arAcct, take, 'payment', inv.unitNumber);
    const paid = r2((inv.paidAmount ?? 0) + take);
    const full = paid >= inv.amount - 0.005;
    const patch: Partial<UnitInvoice> = { status: full ? 'paid' : inv.status, paidDate: full ? date : inv.paidDate, paidAmount: paid, paymentMethod: method, paymentGlEntryId: glEntry.id };
    set(st => ({
      unitInvoices: st.unitInvoices.map(i => (i.id === invoiceId ? { ...i, ...patch } : i)),
      units: st.units.map(u => u.number === inv.unitNumber ? {
        ...u,
        balance: r2(u.balance - take),
        payments: [...u.payments, { date, amount: take, method, note: `Invoice ${inv.id}` }],
        lateFees: full ? u.lateFees.map(f => (f.invoiceId === invoiceId ? { ...f, paid: true } : f)) : u.lateFees,
        specialAssessments: full ? u.specialAssessments.map(a => (a.invoiceId === invoiceId ? { ...a, paid: true, paidDate: date } : a)) : u.specialAssessments,
      } : u),
    }));
    if (isBackendEnabled && isDbId(invoiceId)) financialSvc.updateUnitInvoice(invoiceId, patch);
    syncUnit(inv.unitNumber);
  },

  voidUnitInvoice: (invoiceId, reason) => {
    const s = get();
    const inv = s.unitInvoices.find(i => i.id === invoiceId);
    if (!inv || !isOpenInvoice(inv)) return false;
    const remaining = invoiceRemaining(inv);
    const m = mappingOf(s.glAccountMapping);
    const { arAcct, revenueAcct } = getGLAccountsForInvoice(inv.type, m, inv.fund);
    if (remaining > 0) s.glPost(todayIso(), `Void - Invoice ${inv.id} Unit ${inv.unitNumber}: ${reason}`, revenueAcct, arAcct, remaining, invoiceSource(inv.type), inv.unitNumber);
    set(st => ({
      unitInvoices: st.unitInvoices.map(i => (i.id === invoiceId ? { ...i, status: 'void' as const, refundReason: reason } : i)),
      units: st.units.map(u => u.number === inv.unitNumber ? {
        ...u,
        balance: r2(u.balance - remaining),
        lateFees: u.lateFees.map(f => (f.invoiceId === invoiceId ? { ...f, waived: true } : f)),
        specialAssessments: u.specialAssessments.filter(a => a.invoiceId !== invoiceId),
      } : u),
    }));
    if (isBackendEnabled && isDbId(invoiceId)) financialSvc.updateUnitInvoice(invoiceId, { status: 'void', refundReason: reason });
    syncUnit(inv.unitNumber);
    return true;
  },

  writeOffUnit: (unitNum, reason, date = todayIso()) => {
    get().addCoAAccount(ALLOWANCE_ACCT, 'Allowance for Doubtful Accounts', '1100', 'receivable');
    get().addCoAAccount(BAD_DEBT_ACCT, 'Bad Debt Expense', '5000', 'operating');
    get().billOutstandingBalance(unitNum);
    const s = get();
    const m = mappingOf(s.glAccountMapping);
    const open = s.unitInvoices.filter(i => i.unitNumber === unitNum && isOpenInvoice(i));
    // The allowance is a credit balance on an asset account, so it reads negative.
    let allowance = Math.max(0, -balanceOf(ALLOWANCE_ACCT, 'asset', s.generalLedger));
    let total = 0;
    for (const inv of open) {
      const remaining = invoiceRemaining(inv);
      if (remaining <= 0) continue;
      const { arAcct } = getGLAccountsForInvoice(inv.type, m, inv.fund);
      const fromAllowance = r2(Math.min(allowance, remaining));
      if (fromAllowance > 0) s.glPost(date, `Write-off - Invoice ${inv.id} Unit ${unitNum}: ${reason}`, ALLOWANCE_ACCT, arAcct, fromAllowance, 'manual', unitNum);
      if (remaining - fromAllowance > 0) s.glPost(date, `Write-off - Invoice ${inv.id} Unit ${unitNum}: ${reason}`, BAD_DEBT_ACCT, arAcct, r2(remaining - fromAllowance), 'manual', unitNum);
      allowance = r2(allowance - fromAllowance);
      total = r2(total + remaining);
      if (isBackendEnabled && isDbId(inv.id)) financialSvc.updateUnitInvoice(inv.id, { status: 'void', refundReason: `${WRITTEN_OFF_MARK}: ${reason}` });
    }
    const ids = new Set(open.map(i => i.id));
    set(st => ({
      unitInvoices: st.unitInvoices.map(i => (ids.has(i.id) ? { ...i, status: 'void' as const, refundReason: `${WRITTEN_OFF_MARK}: ${reason}` } : i)),
      units: st.units.map(u => u.number === unitNum ? { ...u, balance: r2(u.balance - total), lateFees: u.lateFees.map(f => (f.invoiceId && ids.has(f.invoiceId) ? { ...f, waived: true } : f)), specialAssessments: u.specialAssessments.filter(a => !a.invoiceId || !ids.has(a.invoiceId)) } : u),
    }));
    syncUnit(unitNum);
    return total;
  },

  setAllowance: (target, date = todayIso(), memo = 'Allowance for doubtful accounts') => {
    get().addCoAAccount(ALLOWANCE_ACCT, 'Allowance for Doubtful Accounts', '1100', 'receivable');
    get().addCoAAccount(BAD_DEBT_ACCT, 'Bad Debt Expense', '5000', 'operating');
    const s = get();
    const now = Math.max(0, -balanceOf(ALLOWANCE_ACCT, 'asset', s.generalLedger));
    const change = r2(Math.max(0, target) - now);
    if (change > 0) s.glPost(date, memo, BAD_DEBT_ACCT, ALLOWANCE_ACCT, change, 'manual', null);
    if (change < 0) s.glPost(date, memo, ALLOWANCE_ACCT, BAD_DEBT_ACCT, -change, 'manual', null);
    return change;
  },

  billOutstandingBalance: (unitNum) => {
    const s = get();
    const unit = s.units.find(u => u.number === unitNum);
    if (!unit) return null;
    const owed = legacyOwed(unit, s.unitInvoices);
    if (owed <= 0) return null;
    return s.createUnitInvoice(unitNum, 'monthly', owed, 'Balance brought forward', undefined, todayIso(), { post: false });
  },
}), {
  name: 'onetwo-financial',
  version: 2,
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
    unitDocuments: state.unitDocuments,
    moveEvents: state.moveEvents,
    stripeConnectId: state.stripeConnectId,
    stripeOnboardingComplete: state.stripeOnboardingComplete,
    autoBillingEnabled: state.autoBillingEnabled,
    lateFeeEnabled: state.lateFeeEnabled,
    lateFeeAmount: state.lateFeeAmount,
    lateFeeGraceDays: state.lateFeeGraceDays,
    glAccountMapping: state.glAccountMapping,
    closedThrough: state.closedThrough,
    lastBillingRun: state.lastBillingRun,
    lastLateFeeRun: state.lastLateFeeRun,
    autoReserveTransfer: state.autoReserveTransfer,
    paymentOrder: state.paymentOrder,
    monthCloseStartDay: state.monthCloseStartDay,
    monthCloseEnabled: state.monthCloseEnabled,
    ownersSeeBalances: state.ownersSeeBalances,
    ownersSeeContacts: state.ownersSeeContacts,
    taskerLimit: state.taskerLimit,
    runbooksOff: state.runbooksOff,
    reserveStudyDate: state.reserveStudyDate,
    reserveStudyEveryYears: state.reserveStudyEveryYears,
  }),
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
    budgetCategories: persisted?.budgetCategories?.length ? persisted.budgetCategories : current.budgetCategories,
    reserveItems: persisted?.reserveItems?.length ? persisted.reserveItems : current.reserveItems,
    chartOfAccounts: persisted?.chartOfAccounts?.length ? persisted.chartOfAccounts : current.chartOfAccounts,
    units: persisted?.units?.length ? persisted.units : current.units,
    workOrders: persisted?.workOrders?.length ? persisted.workOrders : current.workOrders,
  }),
}));
