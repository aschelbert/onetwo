import { createServerSupabase } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TenantProvider } from '@/lib/tenant-context'
import { TopNav } from '@/components/tenant/top-nav'
import { SetupContextPillProvider } from '@/components/onboarding/context-pill/SetupContextPillProvider'
import { SetupContextPill } from '@/components/onboarding/context-pill/SetupContextPill'

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: tenancySlug } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('*')
    .eq('slug', tenancySlug)
    .in('status', ['active', 'trial'])
    .single()

  if (!tenancy) notFound()

  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('*, user_roles(name, icon)')
    .eq('tenancy_id', tenancy.id)
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!tenantUser) {
    const { data: platformUser } = await supabase
      .from('platform_users')
      .select('id, email, display_name, platform_role')
      .eq('id', user.id)
      .eq('platform_role', 'platform_admin')
      .single()

    if (!platformUser) redirect('/unauthorized')

    const { data: permissions } = await supabase
      .rpc('resolve_permissions', {
        p_plan_id: tenancy.subscription_id,
        p_role_id: 'BOARD_MEMBER',
      })

    const accessibleModules = [...new Set(
      permissions
        ?.filter((p: { effective_access: string }) => p.effective_access !== 'not_entitled' && p.effective_access !== 'no_access')
        .map((p: { module_name: string }) => p.module_name) || []
    )]

    const contextValue = {
      tenancy: {
        id: tenancy.id,
        name: tenancy.name,
        slug: tenancy.slug,
        subscription_id: tenancy.subscription_id,
      },
      user: {
        id: `platform-admin-${user.id}`,
        email: platformUser.email,
        display_name: platformUser.display_name || platformUser.email.split('@')[0],
        role_id: 'BOARD_MEMBER',
        role_name: 'Platform Admin',
      },
      permissions: permissions || [],
      accessibleModules,
      isPlatformAdmin: true,
    }

    return (
      <TenantProvider value={contextValue}>
        <SetupContextPillProvider>
          <div className="flex flex-col h-screen bg-bg-page">
            <TopNav />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
          <SetupContextPill />
        </SetupContextPillProvider>
      </TenantProvider>
    )
  }

  const { data: permissions } = await supabase
    .rpc('resolve_permissions', {
      p_plan_id: tenancy.subscription_id,
      p_role_id: tenantUser.role_id,
    })

  const accessibleModules = [...new Set(
    permissions
      ?.filter((p: { effective_access: string }) => p.effective_access !== 'not_entitled' && p.effective_access !== 'no_access')
      .map((p: { module_name: string }) => p.module_name) || []
  )]

  const contextValue = {
    tenancy: {
      id: tenancy.id,
      name: tenancy.name,
      slug: tenancy.slug,
      subscription_id: tenancy.subscription_id,
    },
    user: {
      id: tenantUser.id,
      email: tenantUser.email,
      display_name: tenantUser.display_name || tenantUser.email.split('@')[0],
      role_id: tenantUser.role_id,
      role_name: (tenantUser.user_roles as { name: string; icon: string }).name,
    },
    permissions: permissions || [],
    accessibleModules,
  }

  return (
    <TenantProvider value={contextValue}>
      <SetupContextPillProvider>
        <div className="flex flex-col h-screen bg-bg-page">
          <TopNav />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
        <SetupContextPill />
      </SetupContextPillProvider>
    </TenantProvider>
  )
}
