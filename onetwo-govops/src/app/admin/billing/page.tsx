import { createServerSupabase } from '@/lib/supabase/server'
import { BillingClient } from './billing-client'

export default async function BillingPage() {
  const supabase = await createServerSupabase()
  const { data: events } = await supabase
    .from('webhook_events')
    .select('*, tenancies(name)')
    .order('created_at', { ascending: false })
    .limit(50)
  return <BillingClient events={events || []} />
}
