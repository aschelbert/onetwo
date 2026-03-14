import { createServerSupabase } from '@/lib/supabase/server'
import { SubscriptionsClient } from './subscriptions-client'

export default async function SubscriptionsPage() {
  const supabase = await createServerSupabase()
  const [{ data: plans }, { data: tenancies }, { data: roles }, { data: settings }] = await Promise.all([
    supabase.from('subscription_plans').select('*, plan_role_availability(role_id)').order('sort_order'),
    supabase.from('tenancies').select('id, subscription_id'),
    supabase.from('user_roles').select('id, name, icon'),
    supabase.from('platform_settings').select('trial_days').eq('id', 'default').maybeSingle(),
  ])
  return <SubscriptionsClient plans={plans || []} tenancies={tenancies || []} roles={roles || []} trialDays={settings?.trial_days ?? 30} />
}
