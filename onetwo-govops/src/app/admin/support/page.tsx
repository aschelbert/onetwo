import { createServerSupabase } from '@/lib/supabase/server'
import { SupportClient } from './support-client'

export default async function SupportPage() {
  const supabase = await createServerSupabase()

  const { data: threads } = await supabase
    .from('support_threads')
    .select('*')
    .order('updated_at', { ascending: false })

  const { data: tenancies } = await (supabase as any)
    .from('tenants')
    .select('id, name, subdomain')

  const { data: feedbackItems } = await supabase
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
