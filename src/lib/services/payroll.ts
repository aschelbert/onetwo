import { supabase, logDbError } from '@/lib/supabase';

/* ── Types ─────────────────────────────────────────────────── */

export interface StaffMember {
  id: string;
  name: string;
  type: 'employee' | 'contractor';
  role: string;
  rate: number;
  email: string;
  phone: string;
  taxId: string;
  startDate: string;
  status: 'active' | 'inactive';
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}

export interface TimeEntry {
  id: string;
  staffId: string;
  date: string;
  hours: number;
  description: string;
}

export interface PayRun {
  id: string;
  staffId: string;
  periodStart: string;
  periodEnd: string;
  hoursWorked: number;
  grossPay: number;
  deductions: number;
  withholdingPct: number;
  netPay: number;
  status: 'draft' | 'processing' | 'paid' | 'failed';
  paidDate: string | null;
  glEntryId: string | null;
  paymentMethod: 'stripe' | 'manual' | null;
  stripeTransferId: string | null;
  withholdingGlEntryId: string | null;
}

export interface Form1099 {
  id: string;
  staffId: string;
  year: number;
  totalCompensation: number;
  status: 'draft' | 'generated' | 'sent';
  generatedDate: string | null;
  sentDate: string | null;
}

/* ── Row converters: Staff ─────────────────────────────────── */

function rowToStaff(r: Record<string, unknown>): StaffMember {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as StaffMember['type'],
    role: (r.role || '') as string,
    rate: Number(r.rate) || 0,
    email: (r.email || '') as string,
    phone: (r.phone || '') as string,
    taxId: (r.tax_id || '') as string,
    startDate: (r.start_date || '') as string,
    status: (r.status || 'active') as StaffMember['status'],
    stripeAccountId: (r.stripe_account_id || null) as string | null,
    stripeOnboardingComplete: !!r.stripe_onboarding_complete,
  };
}

function staffToRow(s: Partial<StaffMember>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (s.name !== undefined) row.name = s.name;
  if (s.type !== undefined) row.type = s.type;
  if (s.role !== undefined) row.role = s.role;
  if (s.rate !== undefined) row.rate = s.rate;
  if (s.email !== undefined) row.email = s.email;
  if (s.phone !== undefined) row.phone = s.phone;
  if (s.taxId !== undefined) row.tax_id = s.taxId;
  if (s.startDate !== undefined) row.start_date = s.startDate;
  if (s.status !== undefined) row.status = s.status;
  if (s.stripeAccountId !== undefined) row.stripe_account_id = s.stripeAccountId;
  if (s.stripeOnboardingComplete !== undefined) row.stripe_onboarding_complete = s.stripeOnboardingComplete;
  return row;
}

/* ── Row converters: TimeEntry ─────────────────────────────── */

function rowToTimeEntry(r: Record<string, unknown>): TimeEntry {
  return {
    id: r.id as string,
    staffId: r.staff_id as string,
    date: r.date as string,
    hours: Number(r.hours) || 0,
    description: (r.description || '') as string,
  };
}

function timeEntryToRow(e: Partial<TimeEntry>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (e.staffId !== undefined) row.staff_id = e.staffId;
  if (e.date !== undefined) row.date = e.date;
  if (e.hours !== undefined) row.hours = e.hours;
  if (e.description !== undefined) row.description = e.description;
  return row;
}

/* ── Row converters: PayRun ────────────────────────────────── */

function rowToPayRun(r: Record<string, unknown>): PayRun {
  return {
    id: r.id as string,
    staffId: r.staff_id as string,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    hoursWorked: Number(r.hours_worked) || 0,
    grossPay: Number(r.gross_pay) || 0,
    deductions: Number(r.deductions) || 0,
    withholdingPct: Number(r.withholding_pct) || 0,
    netPay: Number(r.net_pay) || 0,
    status: (r.status || 'draft') as PayRun['status'],
    paidDate: (r.paid_date || null) as string | null,
    glEntryId: (r.gl_entry_id || null) as string | null,
    paymentMethod: (r.payment_method || null) as PayRun['paymentMethod'],
    stripeTransferId: (r.stripe_transfer_id || null) as string | null,
    withholdingGlEntryId: (r.withholding_gl_entry_id || null) as string | null,
  };
}

function payRunToRow(pr: Partial<PayRun>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (pr.staffId !== undefined) row.staff_id = pr.staffId;
  if (pr.periodStart !== undefined) row.period_start = pr.periodStart;
  if (pr.periodEnd !== undefined) row.period_end = pr.periodEnd;
  if (pr.hoursWorked !== undefined) row.hours_worked = pr.hoursWorked;
  if (pr.grossPay !== undefined) row.gross_pay = pr.grossPay;
  if (pr.deductions !== undefined) row.deductions = pr.deductions;
  if (pr.withholdingPct !== undefined) row.withholding_pct = pr.withholdingPct;
  if (pr.netPay !== undefined) row.net_pay = pr.netPay;
  if (pr.status !== undefined) row.status = pr.status;
  if (pr.paidDate !== undefined) row.paid_date = pr.paidDate;
  if (pr.glEntryId !== undefined) row.gl_entry_id = pr.glEntryId;
  if (pr.paymentMethod !== undefined) row.payment_method = pr.paymentMethod;
  if (pr.stripeTransferId !== undefined) row.stripe_transfer_id = pr.stripeTransferId;
  if (pr.withholdingGlEntryId !== undefined) row.withholding_gl_entry_id = pr.withholdingGlEntryId;
  return row;
}

/* ── Row converters: Form1099 ──────────────────────────────── */

function rowToForm1099(r: Record<string, unknown>): Form1099 {
  return {
    id: r.id as string,
    staffId: r.staff_id as string,
    year: Number(r.year) || 0,
    totalCompensation: Number(r.total_compensation) || 0,
    status: (r.status || 'draft') as Form1099['status'],
    generatedDate: (r.generated_date || null) as string | null,
    sentDate: (r.sent_date || null) as string | null,
  };
}

function form1099ToRow(f: Partial<Form1099>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (f.staffId !== undefined) row.staff_id = f.staffId;
  if (f.year !== undefined) row.year = f.year;
  if (f.totalCompensation !== undefined) row.total_compensation = f.totalCompensation;
  if (f.status !== undefined) row.status = f.status;
  if (f.generatedDate !== undefined) row.generated_date = f.generatedDate;
  if (f.sentDate !== undefined) row.sent_date = f.sentDate;
  return row;
}

/* ── Staff CRUD ────────────────────────────────────────────── */

export async function fetchStaff(tenantId: string): Promise<StaffMember[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('payroll_staff')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');
  if (error) { logDbError('fetchStaff error:', error); return null; }
  return (data || []).map(rowToStaff);
}

export async function createStaff(tenantId: string, s: Omit<StaffMember, 'id'>): Promise<StaffMember | null> {
  if (!supabase) return null;
  const row = staffToRow(s);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('payroll_staff')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createStaff error:', error); return null; }
  return rowToStaff(data);
}

export async function updateStaff(id: string, updates: Partial<StaffMember>): Promise<boolean> {
  if (!supabase) return false;
  const row = staffToRow(updates);
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from('payroll_staff').update(row).eq('id', id);
  if (error) { logDbError('updateStaff error:', error); return false; }
  return true;
}

/* ── TimeEntry CRUD ────────────────────────────────────────── */

export async function fetchTimeEntries(tenantId: string): Promise<TimeEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('payroll_time_entries')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { logDbError('fetchTimeEntries error:', error); return null; }
  return (data || []).map(rowToTimeEntry);
}

export async function createTimeEntry(tenantId: string, staffDbId: string, e: Omit<TimeEntry, 'id' | 'staffId'>): Promise<TimeEntry | null> {
  if (!supabase) return null;
  const row = timeEntryToRow(e);
  row.tenant_id = tenantId;
  row.staff_id = staffDbId;
  const { data, error } = await supabase
    .from('payroll_time_entries')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createTimeEntry error:', error); return null; }
  return rowToTimeEntry(data);
}

export async function updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<boolean> {
  if (!supabase) return false;
  const row = timeEntryToRow(updates);
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from('payroll_time_entries').update(row).eq('id', id);
  if (error) { logDbError('updateTimeEntry error:', error); return false; }
  return true;
}

export async function deleteTimeEntry(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('payroll_time_entries').delete().eq('id', id);
  if (error) { logDbError('deleteTimeEntry error:', error); return false; }
  return true;
}

/* ── PayRun CRUD ───────────────────────────────────────────── */

export async function fetchPayRuns(tenantId: string): Promise<PayRun[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('payroll_pay_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('period_start', { ascending: false });
  if (error) { logDbError('fetchPayRuns error:', error); return null; }
  return (data || []).map(rowToPayRun);
}

export async function createPayRun(tenantId: string, pr: Omit<PayRun, 'id'>): Promise<PayRun | null> {
  if (!supabase) return null;
  const row = payRunToRow(pr);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('payroll_pay_runs')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createPayRun error:', error); return null; }
  return rowToPayRun(data);
}

export async function updatePayRun(id: string, updates: Partial<PayRun>): Promise<boolean> {
  if (!supabase) return false;
  const row = payRunToRow(updates);
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from('payroll_pay_runs').update(row).eq('id', id);
  if (error) { logDbError('updatePayRun error:', error); return false; }
  return true;
}

/* ── Form1099 CRUD ─────────────────────────────────────────── */

export async function fetchForm1099s(tenantId: string): Promise<Form1099[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('payroll_form_1099s')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: false });
  if (error) { logDbError('fetchForm1099s error:', error); return null; }
  return (data || []).map(rowToForm1099);
}

export async function createForm1099(tenantId: string, f: Omit<Form1099, 'id'>): Promise<Form1099 | null> {
  if (!supabase) return null;
  const row = form1099ToRow(f);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('payroll_form_1099s')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createForm1099 error:', error); return null; }
  return rowToForm1099(data);
}

export async function updateForm1099(id: string, updates: Partial<Form1099>): Promise<boolean> {
  if (!supabase) return false;
  const row = form1099ToRow(updates);
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from('payroll_form_1099s').update(row).eq('id', id);
  if (error) { logDbError('updateForm1099 error:', error); return false; }
  return true;
}
