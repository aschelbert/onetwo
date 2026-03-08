import { supabaseAdmin } from '@/lib/supabase/admin'
import { FeedbackClient } from './feedback-client'

export const dynamic = 'force-dynamic'

export default async function FeedbackPage() {
  const db = supabaseAdmin

  const { data: feedbackItems } = await db
    .from('feedback_items')
    .select('*, feedback_source_threads(thread_id), feedback_assocs(tenancy_id)')
    .order('updated_at', { ascending: false })

  const { data: threads } = await db
    .from('support_threads')
    .select('id, tenancy_id, subject, status, updated_at')
    .order('updated_at', { ascending: false })

  const { data: tenancies } = await db
    .from('tenancies')
    .select('id, name, slug, subscription_plans(name, color)')

  return (
    <FeedbackClient
      initialFeedback={(feedbackItems || []) as any}
      threads={(threads || []) as any}
      tenancies={(tenancies || []) as any}
    />
  )
}
