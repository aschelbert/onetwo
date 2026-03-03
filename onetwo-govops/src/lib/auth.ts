import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type AuditAction = Database['public']['Enums']['audit_action']

export async function withAdminAuth(
  handler: (db: typeof supabaseAdmin, userId: string, userEmail: string) => Promise<NextResponse>
) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('platform_users')
    .select('platform_role, email')
    .eq('id', user.id)
    .single()

  if (profile?.platform_role !== 'platform_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return handler(supabaseAdmin, user.id, profile.email)
}

export async function logAudit(
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  await supabaseAdmin.from('audit_log').insert({
    actor,
    action: action as AuditAction,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata: (metadata || {}) as unknown as Database['public']['Tables']['audit_log']['Insert']['metadata'],
  })
}
