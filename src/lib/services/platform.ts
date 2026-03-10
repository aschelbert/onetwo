import { supabase, logDbError } from '@/lib/supabase';
import type {
  Tenant, SubscriptionTier,
  SupportTicket, EmailTemplate,
  Announcement as PlatformAnnouncement,
  Permission, StripeWebhookEvent, StripePayment, StripeConfig,
  PlatformAccount, PlatformGLEntry, PlatformBudget,
} from '@/store/usePlatformAdminStore';
import { TIER_FEATURES } from '@/store/usePlatformAdminStore';

// ── Tenants ──

const TIER_PRICES: Record<SubscriptionTier, number> = { compliance_pro: 179, community_plus: 279, management_suite: 399 };

export async function fetchTenants(): Promise<Tenant[] | null> {
  if (!supabase) return null;
  // Ensure we have a valid session before querying RLS-protected tables
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  // Fetch tenants and all per-tenant data in parallel
  const [
    { data: tenantRows, error: tErr },
    { data: subRows, error: sErr },
    { data: featureRows },
    { data: checklistRows },
    { data: userRows },
    { data: caseRows },
    { data: unitRows },
  ] = await Promise.all([
    supabase.from('tenants').select('*').order('name'),
    supabase.from('subscriptions').select('*'),
    supabase.from('tenant_features').select('*'),
    supabase.from('onboarding_checklists').select('*'),
    supabase.from('tenant_users').select('tenant_id, status'),
    supabase.from('cases').select('tenant_id, status'),
    supabase.from('units').select('tenant_id, status'),
  ]);
  if (tErr) { logDbError('fetchTenants error:', tErr); return null; }
  if (sErr) { logDbError('fetchTenants subscriptions error:', sErr); return null; }

  const subMap = new Map<string, Record<string, unknown>>();
  for (const s of subRows || []) subMap.set(s.tenant_id as string, s);

  const featMap = new Map<string, Record<string, unknown>>();
  for (const f of featureRows || []) featMap.set(f.tenant_id as string, f);

  const checklistMap = new Map<string, Record<string, unknown>>();
  for (const c of checklistRows || []) checklistMap.set(c.tenant_id as string, c);

  // Aggregate per-tenant stats
  const userCounts = new Map<string, number>();
  for (const u of userRows || []) {
    const tid = u.tenant_id as string;
    userCounts.set(tid, (userCounts.get(tid) || 0) + 1);
  }

  const openCaseCounts = new Map<string, number>();
  for (const c of caseRows || []) {
    if ((c.status as string) !== 'closed') {
      const tid = c.tenant_id as string;
      openCaseCounts.set(tid, (openCaseCounts.get(tid) || 0) + 1);
    }
  }

  const unitCounts = new Map<string, number>();
  const occupiedCounts = new Map<string, number>();
  for (const u of unitRows || []) {
    const tid = u.tenant_id as string;
    unitCounts.set(tid, (unitCounts.get(tid) || 0) + 1);
    if ((u.status as string) === 'occupied') {
      occupiedCounts.set(tid, (occupiedCounts.get(tid) || 0) + 1);
    }
  }

  return (tenantRows || []).map((r): Tenant => {
    const id = r.id as string;
    const sub = subMap.get(id);
    const tier = ((sub?.tier as string) || 'compliance_pro') as SubscriptionTier;
    const validTier = (tier in TIER_FEATURES) ? tier : 'compliance_pro' as SubscriptionTier;
    const addr = typeof r.address === 'string' ? JSON.parse(r.address) : (r.address || {});
    const subStatus = (sub?.status as string) || 'trialing';
    // Map DB subscription status to app status
    const statusMap: Record<string, string> = { trialing: 'trial', active: 'active', past_due: 'past_due', canceled: 'cancelled' };
    const appSubStatus = (statusMap[subStatus] || subStatus) as Tenant['subscription']['status'];

    // Per-tenant features from DB, falling back to tier defaults
    const feat = featMap.get(id);
    const features: Tenant['features'] = feat ? {
      fiscalLens: feat.fiscal_lens as boolean,
      caseOps: feat.case_ops as boolean,
      complianceRunbook: feat.compliance_runbook as boolean,
      aiAdvisor: feat.ai_advisor as boolean,
      documentVault: feat.document_vault as boolean,
      paymentProcessing: feat.payment_processing as boolean,
      votesResolutions: feat.votes_resolutions as boolean,
      communityPortal: feat.community_portal as boolean,
      vendorManagement: feat.vendor_management as boolean,
      reserveStudyTools: feat.reserve_study_tools as boolean,
    } : { ...TIER_FEATURES[validTier] };

    // Per-tenant onboarding from DB
    const cl = checklistMap.get(id);
    const onboardingChecklist: Tenant['onboardingChecklist'] = cl ? {
      accountCreated: cl.account_created as boolean,
      buildingProfileComplete: cl.building_profile_complete as boolean,
      unitsConfigured: cl.units_configured as boolean,
      firstUserInvited: cl.first_user_invited as boolean,
      bylawsUploaded: cl.bylaws_uploaded as boolean,
      financialSetupDone: cl.financial_setup_done as boolean,
      goLive: cl.go_live as boolean,
    } : {
      accountCreated: true,
      buildingProfileComplete: !!(addr.street),
      unitsConfigured: false,
      firstUserInvited: false,
      bylawsUploaded: false,
      financialSetupDone: false,
      goLive: (r.status as string) === 'active',
    };

    return {
      id,
      name: r.name as string,
      subdomain: r.subdomain as string,
      address: { street: addr.street || '', city: addr.city || '', state: addr.state || '', zip: addr.zip || '' },
      totalUnits: (r.total_units as number) || 0,
      yearBuilt: (r.year_built as string) || '',
      status: (r.status as Tenant['status']) || 'onboarding',
      createdAt: ((r.created_at as string) || '').split('T')[0],
      subscription: {
        tier: validTier,
        status: appSubStatus,
        startDate: ((sub?.created_at as string) || '').split('T')[0],
        nextBillingDate: ((sub?.current_period_end as string) || (sub?.trial_ends_at as string) || '').split('T')[0],
        monthlyRate: (sub?.monthly_rate as number) ? ((sub?.monthly_rate as number) / 100) : TIER_PRICES[validTier],
        trialEndsAt: (sub?.trial_ends_at as string)?.split('T')[0] || null,
      },
      stats: {
        activeUsers: userCounts.get(id) || 0,
        occupiedUnits: occupiedCounts.get(id) || 0,
        collectionRate: 0,
        complianceScore: 0,
        openCases: openCaseCounts.get(id) || 0,
        monthlyRevenue: 0,
      },
      primaryContact: {
        name: (r.primary_contact_name as string) || '',
        email: (r.primary_contact_email as string) || '',
        phone: (r.primary_contact_phone as string) || '',
        role: 'Primary Contact',
      },
      features,
      onboardingChecklist,
    };
  });
}

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

// ── Tenant Features ──

export async function syncTenantFeatures(tenantId: string, features: Tenant['features']): Promise<boolean> {
  if (!supabase) return false;
  const row = {
    tenant_id: tenantId,
    fiscal_lens: features.fiscalLens,
    case_ops: features.caseOps,
    compliance_runbook: features.complianceRunbook,
    ai_advisor: features.aiAdvisor,
    document_vault: features.documentVault,
    payment_processing: features.paymentProcessing,
    votes_resolutions: features.votesResolutions,
    community_portal: features.communityPortal,
    vendor_management: features.vendorManagement,
    reserve_study_tools: features.reserveStudyTools,
  };
  const { error } = await supabase
    .from('tenant_features')
    .upsert(row, { onConflict: 'tenant_id' });
  if (error) { logDbError('syncTenantFeatures error:', error); return false; }
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
  const { data, error } = await supabase.from('stripe_config').select('*').eq('id', 'default').maybeSingle();
  if (error) { logDbError('fetchStripeConfig error:', error); return null; }
  if (!data) return null;
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
