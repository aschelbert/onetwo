import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TenantHome({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: slug } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

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
