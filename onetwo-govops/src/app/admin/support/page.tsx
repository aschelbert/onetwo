import { supabaseAdmin } from '@/lib/supabase/admin'
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

  return (
    <SupportClient
      initialThreads={(threads || []) as any}
      tenancies={(tenancies || []) as any}
      feedbackItems={(feedbackItems || []) as any}
    />
  )
}
