import { supabaseAdmin } from '@/lib/supabase/admin'
import { tenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'
import { ensureTenancy, type SubJoin, type TenantJoin } from '@/lib/on-call'
import { NextRequest, NextResponse } from 'next/server'

// Support threads for a building's own users.
//
// Threads live in this (admin) project, where a building's users have no
// account. The main app calls this route with the user's main-app access
// token. The route checks that token with the main project, confirms the
// user belongs to the building, and then reads or writes that building's
// threads with the service role. Threads marked internal are never returned.

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?getonetwo\.com$|^http:\/\/localhost(:\d+)?$/
const ROLE_LABELS: Record<string, string> = {
  board_member: 'Board Member', resident: 'Resident', property_manager: 'Property Manager', staff: 'Staff',
}
const PRIORITIES = ['low', 'medium', 'high']
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024
const THREAD_COLUMNS = 'id, tenancy_id, subject, status, priority, module, assignee_name, created_by_name, created_at, updated_at'

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  if (!ALLOWED_ORIGIN.test(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function reply(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) })
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

type Caller = { name: string; role: string; tenant: TenantJoin & { id: string } }

/** Resolve the caller from their main-app token and confirm they belong to the building. */
async function authorize(req: NextRequest, tenantId: string): Promise<Caller | { error: string; status: number }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Not signed in', status: 401 }
  const { data: userData, error: userErr } = await tenantSupabaseAdmin.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) return { error: 'Not signed in', status: 401 }

  const { data: tenant } = await tenantSupabaseAdmin
    .from('tenants')
    .select('id, name, subdomain, total_units')
    .eq('id', tenantId)
    .maybeSingle()
  if (!tenant) return { error: 'Building not found', status: 404 }

  const { data: member } = await tenantSupabaseAdmin
    .from('tenant_users')
    .select('name, email, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (member) {
    return {
      name: member.name || member.email || user.email || 'Member',
      role: ROLE_LABELS[member.role as string] || 'Member',
      tenant: tenant as Caller['tenant'],
    }
  }

  // A platform admin looking at the building from the main app.
  const { data: admin } = await tenantSupabaseAdmin
    .from('platform_admins')
    .select('name')
    .eq('user_id', user.id)
    .maybeSingle()
  if (admin) return { name: admin.name || user.email || 'ONE two', role: 'Platform Admin', tenant: tenant as Caller['tenant'] }

  return { error: 'You are not a member of this building', status: 403 }
}

/** The building's thread, or null when it is not theirs or is internal. */
async function ownThread(threadId: string, tenantId: string) {
  const { data } = await supabaseAdmin
    .from('support_threads')
    .select('id')
    .eq('id', threadId)
    .eq('tenancy_id', tenantId)
    .eq('internal', false)
    .maybeSingle()
  return data
}

async function uploadAttachment(threadId: string, attachment: unknown): Promise<{ url: string | null; error?: string }> {
  if (!attachment || typeof attachment !== 'object') return { url: null }
  const { type, data } = attachment as { type?: string; data?: string }
  const ext = type ? IMAGE_TYPES[type] : undefined
  if (!ext || typeof data !== 'string') return { url: null, error: 'Attachments must be PNG, JPEG, WebP or GIF images' }
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) return { url: null, error: 'Images must be under 3 MB' }
  const path = `${threadId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabaseAdmin.storage.from('support-attachments').upload(path, bytes, { contentType: type })
  if (error) return { url: null, error: `The image could not be uploaded: ${error.message}` }
  return { url: supabaseAdmin.storage.from('support-attachments').getPublicUrl(path).data.publicUrl }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const tenantId = typeof body?.tenant_id === 'string' ? body.tenant_id : ''
    if (!tenantId) return reply(req, { error: 'Missing tenant_id' }, 400)

    const caller = await authorize(req, tenantId)
    if ('error' in caller) return reply(req, { error: caller.error }, caller.status)

    switch (body.action) {
      case 'list': {
        const { data, error } = await supabaseAdmin
          .from('support_threads')
          .select(THREAD_COLUMNS)
          .eq('tenancy_id', tenantId)
          .eq('internal', false)
          .order('updated_at', { ascending: false })
          .limit(100)
        if (error) return reply(req, { error: error.message }, 500)
        return reply(req, { threads: data || [] })
      }

      case 'messages': {
        if (typeof body.thread_id !== 'string' || !(await ownThread(body.thread_id, tenantId))) {
          return reply(req, { error: 'Thread not found' }, 404)
        }
        const { data, error } = await supabaseAdmin
          .from('support_messages')
          .select('id, thread_id, sender_type, sender_name, sender_role, body, attachment_url, created_at')
          .eq('thread_id', body.thread_id)
          .order('created_at', { ascending: true })
        if (error) return reply(req, { error: error.message }, 500)
        return reply(req, { messages: data || [] })
      }

      case 'create': {
        const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : ''
        const text = typeof body.body === 'string' ? body.body.trim().slice(0, 10000) : ''
        if (!subject || !text) return reply(req, { error: 'A subject and a message are required' }, 400)

        // Threads hang off the building's row in this project; add it on first use.
        const { data: sub } = await tenantSupabaseAdmin
          .from('subscriptions')
          .select('tier, status, billing_interval, trial_ends_at')
          .eq('tenant_id', tenantId)
          .maybeSingle()
        await ensureTenancy(tenantId, caller.tenant, (sub as SubJoin | null) || null)

        const { data: thread, error } = await supabaseAdmin
          .from('support_threads')
          .insert({
            tenancy_id: tenantId,
            subject,
            module: typeof body.module === 'string' ? body.module.slice(0, 60) : 'Other',
            priority: PRIORITIES.includes(body.priority) ? body.priority : 'medium',
            created_by_name: caller.name,
          })
          .select(THREAD_COLUMNS)
          .single()
        if (error || !thread) return reply(req, { error: error?.message || 'The thread could not be created' }, 500)

        const upload = await uploadAttachment(thread.id, body.attachment)
        const { data: message } = await supabaseAdmin
          .from('support_messages')
          .insert({ thread_id: thread.id, sender_type: 'tenant', sender_name: caller.name, sender_role: caller.role, body: text, attachment_url: upload.url })
          .select('id, thread_id, sender_type, sender_name, sender_role, body, attachment_url, created_at')
          .single()
        return reply(req, { thread, message, attachmentError: upload.error || null })
      }

      case 'reply': {
        if (typeof body.thread_id !== 'string' || !(await ownThread(body.thread_id, tenantId))) {
          return reply(req, { error: 'Thread not found' }, 404)
        }
        const text = typeof body.body === 'string' ? body.body.trim().slice(0, 10000) : ''
        const upload = await uploadAttachment(body.thread_id, body.attachment)
        if (!text && !upload.url) return reply(req, { error: upload.error || 'Write a message first' }, 400)

        const { data: message, error } = await supabaseAdmin
          .from('support_messages')
          .insert({ thread_id: body.thread_id, sender_type: 'tenant', sender_name: caller.name, sender_role: caller.role, body: text, attachment_url: upload.url })
          .select('id, thread_id, sender_type, sender_name, sender_role, body, attachment_url, created_at')
          .single()
        if (error || !message) return reply(req, { error: error?.message || 'The message could not be sent' }, 500)
        // A reply from the building reopens a resolved thread.
        await supabaseAdmin
          .from('support_threads')
          .update({ status: 'open', updated_at: new Date().toISOString() })
          .eq('id', body.thread_id)
        return reply(req, { message, attachmentError: upload.error || null })
      }

      default:
        return reply(req, { error: 'Unknown action' }, 400)
    }
  } catch (e) {
    console.error('tenant-support error:', e)
    return reply(req, { error: e instanceof Error ? e.message : 'Something went wrong' }, 500)
  }
}
