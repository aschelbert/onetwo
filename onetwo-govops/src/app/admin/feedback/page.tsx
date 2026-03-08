import { createServerSupabase } from '@/lib/supabase/server'
import { FeedbackClient } from './feedback-client'

export default async function FeedbackPage() {
  const supabase = await createServerSupabase()

  const { data: feedbackItems } = await supabase
    .from('feedback_items')
    .select('*, feedback_source_threads(thread_id), feedback_assocs(tenancy_id)')
    .order('updated_at', { ascending: false })

  const { data: threads } = await supabase
    .from('support_threads')
    .select('id, tenancy_id, subject, status, updated_at')
    .order('updated_at', { ascending: false })

  const { data: tenancies } = await supabase
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
