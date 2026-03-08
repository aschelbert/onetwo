import { supabaseAdmin } from '@/lib/supabase/admin'
import { SupportClient } from './support-client'

export const dynamic = 'force-dynamic'

export default async function SupportPage() {
  const db = supabaseAdmin

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
