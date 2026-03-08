import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function TenantHome({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: slug } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Check onboarding status
  const cookieStore = await cookies()
  const skipOnboarding = cookieStore.get('skip_onboarding')?.value === 'true'

  if (!skipOnboarding) {
    const { data: tenancy } = await supabase
      .from('tenancies')
      .select('id')
      .eq('slug', slug)
      .single()

    if (tenancy) {
      const { data: checklist } = await (supabase as any)
        .from('onboarding_checklists')
        .select('go_live')
        .eq('tenancy_id', tenancy.id)
        .maybeSingle()

      // If no checklist exists or go_live is false, redirect to onboarding
      if (!checklist || !checklist.go_live) {
        redirect(`/app/onboarding/${slug}`)
      }
    }
  }

  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('role_id')
    .eq('auth_user_id', user.id)
    .single()

  const dashboardMap: Record<string, string> = {
    'BOARD_MEMBER': 'board-dashboard',
    'PROPERTY_MANAGER': 'pm-dashboard',
    'RESIDENT': 'resident-dashboard',
    'STAFF': 'staff-dashboard',
  }

  const dashboard = dashboardMap[tenantUser?.role_id || ''] || 'board-dashboard'
  redirect(`/app/${slug}/dashboard/${dashboard}`)
}
