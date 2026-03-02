import { supabase, logDbError } from '@/lib/supabase';
import type {
  SupportTicket, EmailTemplate,
  Announcement as PlatformAnnouncement,
  Permission, StripeWebhookEvent, StripePayment, StripeConfig,
  PlatformAccount, PlatformGLEntry, PlatformBudget,
} from '@/store/usePlatformAdminStore';

// ── Support Tickets ──

function rowToTicket(r: Record<string, unknown>): SupportTicket {
  return {
    id: r.id as string,
    buildingId: r.building_id as string,
    buildingName: r.building_name as string,
    subject: r.subject as string,
    description: r.description as string,
    status: r.status as SupportTicket['status'],
    priority: r.priority as SupportTicket['priority'],
    assignedTo: (r.assigned_to as string) || null,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    notes: (r.notes || []) as SupportTicket['notes'],
  };
}

export async function fetchTickets(): Promise<SupportTicket[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logDbError('fetchTickets error:', error); return null; }
  return (data || []).map(rowToTicket);
}

export async function createTicket(ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'notes'>): Promise<SupportTicket | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      building_id: ticket.buildingId, building_name: ticket.buildingName,
      subject: ticket.subject, description: ticket.description,
      status: ticket.status, priority: ticket.priority,
      assigned_to: ticket.assignedTo, created_by: ticket.createdBy,
    })
    .select()
    .single();
  if (error) { logDbError('createTicket error:', error); return null; }
  return rowToTicket(data);
}

export async function updateTicket(id: string, updates: Partial<SupportTicket>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.assignedTo !== undefined) row.assigned_to = updates.assignedTo;
  if (updates.notes !== undefined) row.notes = updates.notes;
  const { error } = await supabase.from('support_tickets').update(row).eq('id', id);
  if (error) { logDbError('updateTicket error:', error); return false; }
  return true;
}

// ── Email Templates ──

function rowToTemplate(r: Record<string, unknown>): EmailTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    subject: r.subject as string,
    body: r.body as string,
    trigger: r.trigger as EmailTemplate['trigger'],
    lastEdited: r.last_edited as string,
  };
}

export async function fetchTemplates(): Promise<EmailTemplate[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('name');
  if (error) { logDbError('fetchTemplates error:', error); return null; }
  return (data || []).map(rowToTemplate);
}

export async function createTemplate(t: Omit<EmailTemplate, 'id' | 'lastEdited'>): Promise<EmailTemplate | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('email_templates')
    .insert({ name: t.name, subject: t.subject, body: t.body, trigger: t.trigger })
    .select()
    .single();
  if (error) { logDbError('createTemplate error:', error); return null; }
  return rowToTemplate(data);
}

export async function updateTemplate(id: string, updates: Partial<EmailTemplate>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.subject !== undefined) row.subject = updates.subject;
  if (updates.body !== undefined) row.body = updates.body;
  if (updates.trigger !== undefined) row.trigger = updates.trigger;
  if (updates.lastEdited !== undefined) row.last_edited = updates.lastEdited;
  const { error } = await supabase.from('email_templates').update(row).eq('id', id);
  if (error) { logDbError('updateTemplate error:', error); return false; }
  return true;
}

// ── Platform Announcements ──

function rowToAnnouncement(r: Record<string, unknown>): PlatformAnnouncement {
  return {
    id: r.id as string,
    title: r.title as string,
    message: r.message as string,
    audience: r.audience as string,
    status: r.status as 'draft' | 'sent',
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    sentAt: (r.sent_at as string) || null,
  };
}

export async function fetchPlatformAnnouncements(): Promise<PlatformAnnouncement[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('platform_announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { logDbError('fetchPlatformAnnouncements error:', error); return null; }
  return (data || []).map(rowToAnnouncement);
}

export async function createPlatformAnnouncement(a: Omit<PlatformAnnouncement, 'id' | 'createdAt' | 'sentAt'>): Promise<PlatformAnnouncement | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('platform_announcements')
    .insert({ title: a.title, message: a.message, audience: a.audience, status: a.status, created_by: a.createdBy })
    .select()
    .single();
  if (error) { logDbError('createPlatformAnnouncement error:', error); return null; }
  return rowToAnnouncement(data);
}

export async function updatePlatformAnnouncement(id: string, updates: Partial<PlatformAnnouncement>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.message !== undefined) row.message = updates.message;
  if (updates.audience !== undefined) row.audience = updates.audience;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.sentAt !== undefined) row.sent_at = updates.sentAt;
  const { error } = await supabase.from('platform_announcements').update(row).eq('id', id);
  if (error) { logDbError('updatePlatformAnnouncement error:', error); return false; }
  return true;
}

export async function deletePlatformAnnouncement(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('platform_announcements').delete().eq('id', id);
  if (error) { logDbError('deletePlatformAnnouncement error:', error); return false; }
  return true;
}

// ── Permissions ──

function rowToPermission(r: Record<string, unknown>): Permission {
  return {
    id: r.id as string,
    roleId: r.role_id as string,
    featureId: r.feature_id as string,
    actions: (r.actions || []) as string[],
    updatedAt: r.updated_at as string,
    updatedBy: (r.updated_by as string) || null,
  };
}

export async function fetchPermissions(): Promise<Permission[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('permissions').select('*').order('role_id');
  if (error) { logDbError('fetchPermissions error:', error); return null; }
  return (data || []).map(rowToPermission);
}

export async function updatePermission(roleId: string, featureId: string, actions: string[]): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('permissions')
    .update({ actions, updated_at: new Date().toISOString(), updated_by: 'admin' })
    .eq('role_id', roleId).eq('feature_id', featureId);
  if (error) { logDbError('updatePermission error:', error); return false; }
  return true;
}

export async function bulkUpdatePermissions(roleId: string, mode: string, features: string[]): Promise<boolean> {
  if (!supabase) return false;
  for (const featureId of features) {
    let actions: string[];
    if (mode === 'grant') actions = ['view', 'create', 'edit', 'delete', 'approve'];
    else if (mode === 'viewonly') actions = ['view'];
    else actions = [];
    await supabase.from('permissions')
      .update({ actions, updated_at: new Date().toISOString(), updated_by: 'admin' })
      .eq('role_id', roleId).eq('feature_id', featureId);
  }
  return true;
}

// ── Stripe Payments ──

function rowToStripePayment(r: Record<string, unknown>): StripePayment {
  return {
    id: r.id as string,
    tenantId: (r.tenant_id as string) || undefined,
    tenantName: r.tenant_name as string,
    amount: r.amount as number,
    status: r.status as StripePayment['status'],
    stripePaymentIntentId: (r.stripe_payment_intent_id as string) || undefined,
    stripeInvoiceId: (r.stripe_invoice_id as string) || undefined,
    paymentMethod: r.payment_method as string,
    last4: (r.last4 as string) || undefined,
    failureReason: (r.failure_reason as string) || undefined,
    createdAt: r.created_at as string,
  };
}

export async function fetchStripePayments(): Promise<StripePayment[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('stripe_payments').select('*').order('created_at', { ascending: false });
  if (error) { logDbError('fetchStripePayments error:', error); return null; }
  return (data || []).map(rowToStripePayment);
}

// ── Stripe Webhook Events ──

function rowToStripeWebhookEvent(r: Record<string, unknown>): StripeWebhookEvent {
  return {
    id: r.id as string,
    stripeEventId: r.stripe_event_id as string,
    type: r.type as string,
    status: r.status as StripeWebhookEvent['status'],
    tenantId: (r.tenant_id as string) || undefined,
    tenantName: (r.tenant_name as string) || undefined,
    amount: (r.amount as number) || undefined,
    payload: (r.payload || {}) as Record<string, unknown>,
    errorMessage: (r.error_message as string) || undefined,
    createdAt: r.created_at as string,
    processedAt: (r.processed_at as string) || undefined,
  };
}

export async function fetchStripeWebhookEvents(): Promise<StripeWebhookEvent[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('stripe_webhook_events').select('*').order('created_at', { ascending: false });
  if (error) { logDbError('fetchStripeWebhookEvents error:', error); return null; }
  return (data || []).map(rowToStripeWebhookEvent);
}

// ── Stripe Config ──

export async function fetchStripeConfig(): Promise<StripeConfig | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('stripe_config').select('*').eq('id', 'default').single();
  if (error) { logDbError('fetchStripeConfig error:', error); return null; }
  return {
    mode: data.mode as StripeConfig['mode'],
    publishableKey: data.publishable_key as string,
    webhookUrl: data.webhook_url as string,
    connectedAt: data.connected_at as string,
    lastWebhookReceived: (data.last_webhook_received as string) || undefined,
  };
}

// ── Platform Accounts ──

function rowToPlatformAccount(r: Record<string, unknown>): PlatformAccount {
  return {
    num: r.num as string,
    name: r.name as string,
    type: r.type as PlatformAccount['type'],
    subType: r.sub_type as string,
    parentNum: (r.parent_num as string) || null,
    isActive: r.is_active as boolean,
    sortOrder: r.sort_order as number,
  };
}

export async function fetchPlatformAccounts(): Promise<PlatformAccount[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('platform_accounts').select('*').order('sort_order');
  if (error) { logDbError('fetchPlatformAccounts error:', error); return null; }
  return (data || []).map(rowToPlatformAccount);
}

export async function createPlatformAccount(account: PlatformAccount): Promise<PlatformAccount | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('platform_accounts')
    .insert({ num: account.num, name: account.name, type: account.type, sub_type: account.subType, parent_num: account.parentNum, is_active: account.isActive, sort_order: account.sortOrder })
    .select().single();
  if (error) { logDbError('createPlatformAccount error:', error); return null; }
  return rowToPlatformAccount(data);
}

// ── Platform GL Entries ──

function rowToGLEntry(r: Record<string, unknown>): PlatformGLEntry {
  return {
    id: r.id as string,
    date: r.date as string,
    memo: r.memo as string,
    debitAcct: r.debit_acct as string,
    creditAcct: r.credit_acct as string,
    amount: r.amount as number,
    source: r.source as string,
    ref: (r.ref as string) || null,
    postedAt: r.posted_at as string,
    postedBy: (r.posted_by as string) || null,
  };
}

export async function fetchPlatformGLEntries(): Promise<PlatformGLEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('platform_gl_entries').select('*').order('date', { ascending: false });
  if (error) { logDbError('fetchPlatformGLEntries error:', error); return null; }
  return (data || []).map(rowToGLEntry);
}

export async function createPlatformGLEntry(entry: Omit<PlatformGLEntry, 'id' | 'postedAt' | 'postedBy'>): Promise<PlatformGLEntry | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('platform_gl_entries')
    .insert({ date: entry.date, memo: entry.memo, debit_acct: entry.debitAcct, credit_acct: entry.creditAcct, amount: entry.amount, source: entry.source, ref: entry.ref })
    .select().single();
  if (error) { logDbError('createPlatformGLEntry error:', error); return null; }
  return rowToGLEntry(data);
}

// ── Platform Budgets ──

function rowToBudget(r: Record<string, unknown>): PlatformBudget {
  return {
    id: r.id as string,
    acctNum: r.acct_num as string,
    name: r.name as string,
    budgeted: r.budgeted as number,
    period: r.period as string,
    fiscalYear: r.fiscal_year as number,
    isActive: r.is_active as boolean,
  };
}

export async function fetchPlatformBudgets(): Promise<PlatformBudget[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('platform_budgets').select('*').order('acct_num');
  if (error) { logDbError('fetchPlatformBudgets error:', error); return null; }
  return (data || []).map(rowToBudget);
}

export async function updatePlatformBudget(id: string, updates: Partial<PlatformBudget>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.budgeted !== undefined) row.budgeted = updates.budgeted;
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.isActive !== undefined) row.is_active = updates.isActive;
  const { error } = await supabase.from('platform_budgets').update(row).eq('id', id);
  if (error) { logDbError('updatePlatformBudget error:', error); return false; }
  return true;
}
