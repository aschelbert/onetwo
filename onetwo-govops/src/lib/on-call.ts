import { supabaseAdmin } from '@/lib/supabase/admin'
import { tenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'

// On Call advisor assignments.
//
// The tenant (HOA) project keeps one row per building with the On Call
// add-on in on_call_assignments; a trigger there creates the row the moment
// the add-on is switched on. This module turns each unassigned row into a
// support thread here, and writes the assignment back when an Admin Console
// user takes the building.

export type OnCallRow = {
  tenant_id: string
  building: string
  slug: string
  plan: string
  subscription_status: string
  status: 'requested' | 'assigned'
  requested_at: string
  advisor_name: string | null
  advisor_email: string | null
  advisor_console_user_id: string | null
  assigned_at: string | null
  assigned_by: string | null
  support_thread_id: string | null
}

export type TenantJoin = { name: string; subdomain: string; total_units: number | null }
export type SubJoin = { tier: string | null; status: string | null; billing_interval: string | null; trial_ends_at: string | null }

const PLAN_ID: Record<string, string> = { facilities: 'plus-facilities', self_managed: 'self-managed' }
const TENANCY_STATUS: Record<string, string> = { trialing: 'trial', active: 'active', past_due: 'active', canceled: 'churned' }

async function loadRows(): Promise<{ rows: OnCallRow[]; details: Map<string, { tenant: TenantJoin; sub: SubJoin | null }> }> {
  const { data: assignments, error } = await tenantSupabaseAdmin
    .from('on_call_assignments')
    .select('*')
    .order('requested_at', { ascending: false })
  if (error) throw new Error(`Reading On Call assignments failed: ${error.message}`)
  const ids = (assignments || []).map(a => a.tenant_id as string)
  if (ids.length === 0) return { rows: [], details: new Map() }

  const [{ data: tenants }, { data: subs }] = await Promise.all([
    tenantSupabaseAdmin.from('tenants').select('id, name, subdomain, total_units').in('id', ids),
    tenantSupabaseAdmin.from('subscriptions').select('tenant_id, tier, status, billing_interval, trial_ends_at').in('tenant_id', ids),
  ])
  const tenantById = new Map((tenants || []).map(t => [t.id as string, t as unknown as TenantJoin]))
  const subById = new Map((subs || []).map(s => [s.tenant_id as string, s as unknown as SubJoin]))

  const details = new Map<string, { tenant: TenantJoin; sub: SubJoin | null }>()
  const rows: OnCallRow[] = []
  for (const a of assignments || []) {
    const tenant = tenantById.get(a.tenant_id)
    if (!tenant) continue
    const sub = subById.get(a.tenant_id) || null
    details.set(a.tenant_id, { tenant, sub })
    rows.push({
      tenant_id: a.tenant_id,
      building: tenant.name,
      slug: tenant.subdomain,
      plan: sub?.tier === 'facilities' ? 'Plus Facilities' : 'Self-Managed',
      subscription_status: sub?.status || 'unknown',
      status: a.status,
      requested_at: a.requested_at,
      advisor_name: a.advisor_name,
      advisor_email: a.advisor_email,
      advisor_console_user_id: a.advisor_console_user_id,
      assigned_at: a.assigned_at,
      assigned_by: a.assigned_by,
      support_thread_id: a.support_thread_id,
    })
  }
  return { rows, details }
}

/** Support threads belong to a tenancy here, so the building needs its row in this project. */
export async function ensureTenancy(tenantId: string, tenant: TenantJoin, sub: SubJoin | null) {
  const { data: existing } = await supabaseAdmin.from('tenancies').select('id').eq('id', tenantId).maybeSingle()
  if (existing) return
  const { error } = await supabaseAdmin.from('tenancies').insert({
    id: tenantId,
    name: tenant.name,
    slug: tenant.subdomain,
    units: tenant.total_units || 0,
    subscription_id: PLAN_ID[sub?.tier || ''] || 'self-managed',
    status: (TENANCY_STATUS[sub?.status || ''] || 'trial') as never,
    billing_cycle: (sub?.billing_interval === 'annual' ? 'yearly' : 'monthly') as never,
    trial_ends_at: sub?.trial_ends_at || null,
  })
  if (error) throw new Error(`Adding ${tenant.name} to tenancies failed: ${error.message}`)
}

/**
 * Open a support thread for every building that is waiting for an advisor
 * and does not have one yet. Safe to run as often as you like.
 */
export async function syncOnCallRequests(): Promise<{ rows: OnCallRow[]; opened: number; errors: string[] }> {
  const { rows, details } = await loadRows()
  let opened = 0
  const errors: string[] = []

  for (const row of rows) {
    if (row.status !== 'requested' || row.support_thread_id) continue
    try {
      const d = details.get(row.tenant_id)!
      await ensureTenancy(row.tenant_id, d.tenant, d.sub)
      const { data: thread, error: threadErr } = await supabaseAdmin
        .from('support_threads')
        .insert({
          tenancy_id: row.tenant_id,
          subject: `On Call advisor needed: ${row.building}`,
          priority: 'high',
          module: 'On Call',
          // For the ONE two team only; the building never sees this thread.
          internal: true,
          created_by_name: 'ONE two',
        })
        .select('id')
        .single()
      if (threadErr || !thread) throw new Error(threadErr?.message || 'no thread returned')
      await supabaseAdmin.from('support_messages').insert({
        thread_id: thread.id,
        sender_type: 'tenant',
        sender_name: 'ONE two',
        sender_role: 'System',
        body: `${row.building} (${row.plan}) has the On Call add-on and no advisor yet. Assign yourself, or another console user, under Operations › On Call Advisors.`,
      })
      // Claim the request only if no one else has opened a thread for it meanwhile.
      const { data: claimed } = await tenantSupabaseAdmin
        .from('on_call_assignments')
        .update({ support_thread_id: thread.id, updated_at: new Date().toISOString() })
        .eq('tenant_id', row.tenant_id)
        .is('support_thread_id', null)
        .select('tenant_id')
      if (!claimed || claimed.length === 0) {
        await supabaseAdmin.from('support_threads').delete().eq('id', thread.id)
        continue
      }
      row.support_thread_id = thread.id
      opened++
    } catch (e) {
      errors.push(`${row.building}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { rows, opened, errors }
}

export async function assignOnCallAdvisor(tenantId: string, consoleUserId: string, assignedBy: string) {
  const { data: advisor } = await supabaseAdmin
    .from('platform_users')
    .select('id, email, display_name')
    .eq('id', consoleUserId)
    .single()
  if (!advisor) throw new Error('That console user was not found')
  const advisorName = advisor.display_name?.trim() || advisor.email.split('@')[0]

  const { data: tenant } = await tenantSupabaseAdmin.from('tenants').select('name').eq('id', tenantId).single()
  if (!tenant) throw new Error('That building was not found')

  const now = new Date().toISOString()
  const { data: updated, error } = await tenantSupabaseAdmin
    .from('on_call_assignments')
    .update({
      status: 'assigned',
      advisor_name: advisorName,
      advisor_email: advisor.email,
      advisor_console_user_id: advisor.id,
      assigned_at: now,
      assigned_by: assignedBy,
      updated_at: now,
    })
    .eq('tenant_id', tenantId)
    .select('support_thread_id')
  if (error) throw new Error(`Saving the assignment failed: ${error.message}`)
  if (!updated || updated.length === 0) throw new Error('This building does not have the On Call add-on')

  // Tell the building.
  const { error: noticeErr } = await tenantSupabaseAdmin.from('announcements').insert({
    tenant_id: tenantId,
    title: 'Your On Call advisor has been assigned',
    body: `${advisorName} is now the On Call advisor for ${tenant.name}. You can reach them at ${advisor.email}, and they are listed under Building › Directory.`,
    category: 'general',
    posted_by: 'ONE two',
    pinned: true,
  })

  const threadId = updated[0].support_thread_id as string | null
  if (threadId) {
    await supabaseAdmin.from('support_threads').update({ assignee_name: advisorName, status: 'resolved' }).eq('id', threadId)
    await supabaseAdmin.from('support_messages').insert({
      thread_id: threadId,
      sender_type: 'admin',
      sender_name: assignedBy,
      body: `${advisorName} (${advisor.email}) is assigned as the On Call advisor for ${tenant.name}.`,
    })
  }
  return { building: tenant.name as string, advisorName, noticePosted: !noticeErr, noticeError: noticeErr?.message || null }
}

/** Take the advisor off a building. The request goes back to waiting and a new thread opens on the next sync. */
export async function unassignOnCallAdvisor(tenantId: string) {
  const { error } = await tenantSupabaseAdmin
    .from('on_call_assignments')
    .update({
      status: 'requested',
      advisor_name: null,
      advisor_email: null,
      advisor_console_user_id: null,
      assigned_at: null,
      assigned_by: null,
      support_thread_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`Removing the advisor failed: ${error.message}`)
}
