import { supabase, logDbError } from '@/lib/supabase';
import type { BudgetCategory, ReserveItem, ChartOfAccountsEntry, GLEntry, Unit, UnitInvoice } from '@/types/financial';
import type { WorkOrder } from '@/data/financial';

// ── Units (composite PK: tenant_id + number) ──

function rowToUnit(r: Record<string, unknown>): Unit {
  return {
    number: r.number as string,
    owner: r.owner as string,
    email: r.email as string,
    phone: r.phone as string,
    monthlyFee: Number(r.monthly_fee),
    votingPct: Number(r.voting_pct),
    status: r.status as 'OCCUPIED' | 'VACANT',
    balance: Number(r.balance),
    moveIn: (r.move_in as string) || null,
    sqft: Number(r.sqft),
    bedrooms: Number(r.bedrooms),
    parking: (r.parking as string) || null,
    payments: (r.payments || []) as Unit['payments'],
    lateFees: (r.late_fees || []) as Unit['lateFees'],
    specialAssessments: (r.special_assessments || []) as Unit['specialAssessments'],
    stripeCustomerId: (r.stripe_customer_id as string) || null,
  };
}

export async function fetchUnits(tenantId: string): Promise<Unit[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('number');
  if (error) { logDbError('fetchUnits error:', error); return null; }
  return (data || []).map(rowToUnit);
}

export async function upsertUnit(tenantId: string, u: Unit): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('units').upsert({
    tenant_id: tenantId,
    number: u.number, owner: u.owner, email: u.email, phone: u.phone,
    monthly_fee: u.monthlyFee, voting_pct: u.votingPct, status: u.status,
    balance: u.balance, move_in: u.moveIn, sqft: u.sqft, bedrooms: u.bedrooms,
    parking: u.parking, payments: u.payments, late_fees: u.lateFees,
    special_assessments: u.specialAssessments, stripe_customer_id: u.stripeCustomerId || null,
  }, { onConflict: 'tenant_id,number' });
  if (error) { logDbError('upsertUnit error:', error); return false; }
  return true;
}

export async function deleteUnit(tenantId: string, unitNum: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('units').delete().eq('tenant_id', tenantId).eq('number', unitNum);
  if (error) { logDbError('deleteUnit error:', error); return false; }
  return true;
}

// ── Budget Categories ──

function rowToBudgetCategory(r: Record<string, unknown>): BudgetCategory {
  return {
    id: r.id as string,
    name: r.name as string,
    budgeted: Number(r.budgeted),
    expenses: (r.expenses || []) as BudgetCategory['expenses'],
  };
}

export async function fetchBudgetCategories(tenantId: string): Promise<BudgetCategory[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('budget_categories')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { logDbError('fetchBudgetCategories error:', error); return null; }
  return (data || []).map(rowToBudgetCategory);
}

export async function createBudgetCategory(tenantId: string, c: BudgetCategory): Promise<BudgetCategory | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('budget_categories')
    .insert({ tenant_id: tenantId, name: c.name, budgeted: c.budgeted, expenses: c.expenses })
    .select()
    .single();
  if (error) { logDbError('createBudgetCategory error:', error); return null; }
  return rowToBudgetCategory(data);
}

export async function updateBudgetCategory(id: string, updates: Partial<BudgetCategory>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.budgeted !== undefined) row.budgeted = updates.budgeted;
  if (updates.expenses !== undefined) row.expenses = updates.expenses;
  const { error } = await supabase.from('budget_categories').update(row).eq('id', id);
  if (error) { logDbError('updateBudgetCategory error:', error); return false; }
  return true;
}

export async function deleteBudgetCategory(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('budget_categories').delete().eq('id', id);
  if (error) { logDbError('deleteBudgetCategory error:', error); return false; }
  return true;
}

// ── Reserve Items ──

function rowToReserveItem(r: Record<string, unknown>): ReserveItem {
  return {
    id: r.id as string,
    name: r.name as string,
    estimatedCost: Number(r.estimated_cost),
    currentFunding: Number(r.current_funding),
    usefulLife: Number(r.useful_life),
    lastReplaced: r.last_replaced as string,
    yearsRemaining: Number(r.years_remaining),
    isContingency: r.is_contingency as boolean,
  };
}

export async function fetchReserveItems(tenantId: string): Promise<ReserveItem[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('reserve_items')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { logDbError('fetchReserveItems error:', error); return null; }
  return (data || []).map(rowToReserveItem);
}

export async function createReserveItem(tenantId: string, item: ReserveItem): Promise<ReserveItem | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('reserve_items')
    .insert({
      tenant_id: tenantId, name: item.name, estimated_cost: item.estimatedCost,
      current_funding: item.currentFunding, useful_life: item.usefulLife,
      last_replaced: item.lastReplaced, years_remaining: item.yearsRemaining,
      is_contingency: item.isContingency,
    })
    .select()
    .single();
  if (error) { logDbError('createReserveItem error:', error); return null; }
  return rowToReserveItem(data);
}

export async function updateReserveItem(id: string, updates: Partial<ReserveItem>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.estimatedCost !== undefined) row.estimated_cost = updates.estimatedCost;
  if (updates.currentFunding !== undefined) row.current_funding = updates.currentFunding;
  if (updates.usefulLife !== undefined) row.useful_life = updates.usefulLife;
  if (updates.lastReplaced !== undefined) row.last_replaced = updates.lastReplaced;
  if (updates.yearsRemaining !== undefined) row.years_remaining = updates.yearsRemaining;
  if (updates.isContingency !== undefined) row.is_contingency = updates.isContingency;
  const { error } = await supabase.from('reserve_items').update(row).eq('id', id);
  if (error) { logDbError('updateReserveItem error:', error); return false; }
  return true;
}

export async function deleteReserveItem(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('reserve_items').delete().eq('id', id);
  if (error) { logDbError('deleteReserveItem error:', error); return false; }
  return true;
}

// ── Chart of Accounts (composite PK: tenant_id + num) ──

function rowToCoA(r: Record<string, unknown>): ChartOfAccountsEntry {
  return {
    num: r.num as string,
    name: r.name as string,
    type: r.type as ChartOfAccountsEntry['type'],
    sub: r.sub as string,
    parent: (r.parent as string) || null,
    budgetCat: (r.budget_cat as string) || undefined,
    reserveItem: (r.reserve_item as string) || undefined,
  };
}

export async function fetchChartOfAccounts(tenantId: string): Promise<ChartOfAccountsEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('num');
  if (error) { logDbError('fetchChartOfAccounts error:', error); return null; }
  return (data || []).map(rowToCoA);
}

export async function upsertCoAEntry(tenantId: string, entry: ChartOfAccountsEntry): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('chart_of_accounts').upsert({
    tenant_id: tenantId, num: entry.num, name: entry.name, type: entry.type,
    sub: entry.sub, parent: entry.parent, budget_cat: entry.budgetCat || null,
    reserve_item: entry.reserveItem || null,
  }, { onConflict: 'tenant_id,num' });
  if (error) { logDbError('upsertCoAEntry error:', error); return false; }
  return true;
}

export async function deleteCoAEntry(tenantId: string, num: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('chart_of_accounts').delete().eq('tenant_id', tenantId).eq('num', num);
  if (error) { logDbError('deleteCoAEntry error:', error); return false; }
  return true;
}

// ── General Ledger ──

function rowToGLEntry(r: Record<string, unknown>): GLEntry {
  return {
    id: r.local_id as string,
    date: r.date as string,
    memo: r.memo as string,
    debitAcct: r.debit_acct as string,
    creditAcct: r.credit_acct as string,
    amount: Number(r.amount),
    source: r.source as GLEntry['source'],
    sourceId: (r.source_id as string) || null,
    posted: r.posted as string,
    status: r.status as 'posted' | 'void',
  };
}

export async function fetchGeneralLedger(tenantId: string): Promise<GLEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('general_ledger')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date');
  if (error) { logDbError('fetchGeneralLedger error:', error); return null; }
  return (data || []).map(rowToGLEntry);
}

export async function createGLEntry(tenantId: string, entry: GLEntry): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('general_ledger').insert({
    tenant_id: tenantId, local_id: entry.id, date: entry.date, memo: entry.memo,
    debit_acct: entry.debitAcct, credit_acct: entry.creditAcct, amount: entry.amount,
    source: entry.source, source_id: entry.sourceId, posted: entry.posted, status: entry.status,
  });
  if (error) { logDbError('createGLEntry error:', error); return false; }
  return true;
}

// ── Work Orders ──

function rowToWorkOrder(r: Record<string, unknown>): WorkOrder {
  return {
    id: r.local_id as string,
    title: r.title as string,
    vendor: r.vendor as string,
    description: r.description as string,
    acctNum: r.acct_num as string,
    amount: Number(r.amount),
    status: r.status as WorkOrder['status'],
    caseId: (r.case_id as string) || null,
    createdDate: r.created_date as string,
    approvedDate: (r.approved_date as string) || null,
    invoiceNum: (r.invoice_num as string) || null,
    invoiceDate: (r.invoice_date as string) || null,
    paidDate: (r.paid_date as string) || null,
    glEntryId: (r.gl_entry_id as string) || null,
    attachments: (r.attachments || []) as WorkOrder['attachments'],
  };
}

export async function fetchWorkOrders(tenantId: string): Promise<WorkOrder[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_date', { ascending: false });
  if (error) { logDbError('fetchWorkOrders error:', error); return null; }
  return (data || []).map(rowToWorkOrder);
}

export async function createWorkOrder(tenantId: string, wo: WorkOrder): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('work_orders').insert({
    tenant_id: tenantId, local_id: wo.id, title: wo.title, vendor: wo.vendor,
    description: wo.description, acct_num: wo.acctNum, amount: wo.amount,
    status: wo.status, case_id: wo.caseId, created_date: wo.createdDate,
    approved_date: wo.approvedDate, invoice_num: wo.invoiceNum,
    invoice_date: wo.invoiceDate, paid_date: wo.paidDate,
    gl_entry_id: wo.glEntryId, attachments: wo.attachments,
  });
  if (error) { logDbError('createWorkOrder error:', error); return false; }
  return true;
}

export async function updateWorkOrderByLocalId(tenantId: string, localId: string, updates: Partial<WorkOrder>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.vendor !== undefined) row.vendor = updates.vendor;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.acctNum !== undefined) row.acct_num = updates.acctNum;
  if (updates.amount !== undefined) row.amount = updates.amount;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.caseId !== undefined) row.case_id = updates.caseId;
  if (updates.approvedDate !== undefined) row.approved_date = updates.approvedDate;
  if (updates.invoiceNum !== undefined) row.invoice_num = updates.invoiceNum;
  if (updates.invoiceDate !== undefined) row.invoice_date = updates.invoiceDate;
  if (updates.paidDate !== undefined) row.paid_date = updates.paidDate;
  if (updates.glEntryId !== undefined) row.gl_entry_id = updates.glEntryId;
  if (updates.attachments !== undefined) row.attachments = updates.attachments;
  const { error } = await supabase.from('work_orders').update(row).eq('tenant_id', tenantId).eq('local_id', localId);
  if (error) { logDbError('updateWorkOrder error:', error); return false; }
  return true;
}

// ── Unit Invoices ──

function rowToUnitInvoice(r: Record<string, unknown>): UnitInvoice {
  return {
    id: r.id as string,
    unitNumber: r.unit_number as string,
    type: r.type as UnitInvoice['type'],
    description: r.description as string,
    amount: Number(r.amount),
    status: r.status as UnitInvoice['status'],
    createdDate: r.created_date as string,
    dueDate: r.due_date as string,
    paidDate: (r.paid_date as string) || null,
    paidAmount: r.paid_amount != null ? Number(r.paid_amount) : null,
    paymentMethod: (r.payment_method as string) || null,
    stripePaymentLink: (r.stripe_payment_link as string) || null,
    glEntryId: (r.gl_entry_id as string) || null,
    paymentGlEntryId: (r.payment_gl_entry_id as string) || null,
  };
}

export async function fetchUnitInvoices(tenantId: string): Promise<UnitInvoice[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('unit_invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_date', { ascending: false });
  if (error) { logDbError('fetchUnitInvoices error:', error); return null; }
  return (data || []).map(rowToUnitInvoice);
}

export async function createUnitInvoice(tenantId: string, inv: UnitInvoice): Promise<UnitInvoice | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('unit_invoices')
    .insert({
      tenant_id: tenantId, unit_number: inv.unitNumber, type: inv.type,
      description: inv.description, amount: inv.amount, status: inv.status,
      created_date: inv.createdDate, due_date: inv.dueDate, paid_date: inv.paidDate,
      paid_amount: inv.paidAmount, payment_method: inv.paymentMethod,
      stripe_payment_link: inv.stripePaymentLink, gl_entry_id: inv.glEntryId,
      payment_gl_entry_id: inv.paymentGlEntryId,
    })
    .select()
    .single();
  if (error) { logDbError('createUnitInvoice error:', error); return null; }
  return rowToUnitInvoice(data);
}

export async function updateUnitInvoice(id: string, updates: Partial<UnitInvoice>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.paidDate !== undefined) row.paid_date = updates.paidDate;
  if (updates.paidAmount !== undefined) row.paid_amount = updates.paidAmount;
  if (updates.paymentMethod !== undefined) row.payment_method = updates.paymentMethod;
  if (updates.paymentGlEntryId !== undefined) row.payment_gl_entry_id = updates.paymentGlEntryId;
  const { error } = await supabase.from('unit_invoices').update(row).eq('id', id);
  if (error) { logDbError('updateUnitInvoice error:', error); return false; }
  return true;
}

// ── Financial Settings (one-to-one) ──

export interface FinancialSettingsRow {
  hoaDueDay: number;
  annualReserveContribution: number;
  stripeConnectId: string | null;
  stripeOnboardingComplete: boolean;
}

export async function fetchFinancialSettings(tenantId: string): Promise<FinancialSettingsRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('financial_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) { logDbError('fetchFinancialSettings error:', error); return null; }
  if (!data) return null;
  return {
    hoaDueDay: Number(data.hoa_due_day),
    annualReserveContribution: Number(data.annual_reserve_contribution),
    stripeConnectId: data.stripe_connect_id || null,
    stripeOnboardingComplete: data.stripe_onboarding_complete as boolean,
  };
}

export async function upsertFinancialSettings(tenantId: string, s: Partial<FinancialSettingsRow>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = { tenant_id: tenantId };
  if (s.hoaDueDay !== undefined) row.hoa_due_day = s.hoaDueDay;
  if (s.annualReserveContribution !== undefined) row.annual_reserve_contribution = s.annualReserveContribution;
  if (s.stripeConnectId !== undefined) row.stripe_connect_id = s.stripeConnectId;
  if (s.stripeOnboardingComplete !== undefined) row.stripe_onboarding_complete = s.stripeOnboardingComplete;
  const { error } = await supabase.from('financial_settings').upsert(row, { onConflict: 'tenant_id' });
  if (error) { logDbError('upsertFinancialSettings error:', error); return false; }
  return true;
}

// ── Bulk fetch for loadFromDb ──

export async function fetchAllFinancialData(tenantId: string) {
  const [units, budgetCategories, reserveItems, chartOfAccounts, generalLedger, workOrders, unitInvoices, settings] = await Promise.all([
    fetchUnits(tenantId),
    fetchBudgetCategories(tenantId),
    fetchReserveItems(tenantId),
    fetchChartOfAccounts(tenantId),
    fetchGeneralLedger(tenantId),
    fetchWorkOrders(tenantId),
    fetchUnitInvoices(tenantId),
    fetchFinancialSettings(tenantId),
  ]);
  return { units, budgetCategories, reserveItems, chartOfAccounts, generalLedger, workOrders, unitInvoices, settings };
}
