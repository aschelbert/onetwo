import { createServerSupabase } from '@/lib/supabase/server'
import { TenanciesClient } from './tenancies-client'

export default async function TenanciesPage() {
  const supabase = await createServerSupabase()
  const [{ data: tenancies }, { data: plans }] = await Promise.all([
    supabase.from('tenancies').select('*, subscription_plans(name, color)').order('created_at', { ascending: false }),
    supabase.from('subscription_plans').select('id, name').order('sort_order'),
  ])
  return <TenanciesClient tenancies={tenancies || []} plans={plans || []} />
}
