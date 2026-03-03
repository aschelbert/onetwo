import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Check if platform admin
    const { data: profile } = await supabase
      .from('platform_users')
      .select('platform_role')
      .eq('id', user.id)
      .single()

    if (profile?.platform_role === 'platform_admin') {
      redirect('/admin/dashboard')
    }

    // Check if tenant user
    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('tenancy_id, tenancies(slug)')
      .eq('auth_user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (tenantUser?.tenancies) {
      const tenancies = tenantUser.tenancies as { slug: string }
      redirect(`/app/${tenancies.slug}`)
    }
  }

  // Not logged in → login page
  redirect('/auth/login')
}
