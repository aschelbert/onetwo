import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { SupportClient } from './support-client'
import { syncOnCallRequests } from '@/lib/on-call'

export const dynamic = 'force-dynamic'

export default async function SupportPage() {
  const db = supabaseAdmin

  // Open threads for buildings waiting for an On Call advisor before listing.
  try { await syncOnCallRequests() } catch (e) { console.error('On Call sync failed:', e) }

  const { data: threads } = await db
    .from('support_threads')
    .select('*')
    .order('updated_at', { ascending: false })

  const { data: tenancies } = await db
    .from('tenancies')
    .select('id, name, slug, subscription_plans(name, color)')

  const { data: feedbackItems } = await db
    .from('feedback_items')
    .select('id, title, status')
    .order('title')

  const { data: consoleUsers } = await db
    .from('platform_users')
    .select('id, email, display_name')
    .order('created_at', { ascending: true })
  const { data: { user } } = await (await createServerSupabase()).auth.getUser()

  return (
    <SupportClient
      consoleUsers={consoleUsers || []}
      currentUserId={user?.id || ''}
      initialThreads={(threads || []) as any}
      tenancies={(tenancies || []) as any}
      feedbackItems={(feedbackItems || []) as any}
    />
  )
}
