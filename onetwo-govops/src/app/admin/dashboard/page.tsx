import { createServerSupabase } from '@/lib/supabase/server'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const [
    { data: tenancies },
    { data: plans },
    { data: recentAudit },
    { data: recentWebhooks },
    { data: roles },
  ] = await Promise.all([
    supabase.from('tenancies').select('*, subscription_plans(name, color, price_monthly, price_yearly)'),
    supabase.from('subscription_plans').select('*').order('sort_order'),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('webhook_events').select('*, tenancies(name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('user_roles').select('*').order('sort_order'),
  ])
  return <DashboardClient tenancies={tenancies || []} plans={plans || []} recentAudit={recentAudit || []} recentWebhooks={recentWebhooks || []} roles={roles || []} />
}
