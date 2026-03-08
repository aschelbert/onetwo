import { createServerSupabase } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TenantProvider } from '@/lib/tenant-context'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'
import { getOnboardingChecklist, getTenantFeatures } from './actions'
import Link from 'next/link'

export default async function OnboardingLayout({
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

  // Fetch tenant user OR fall back to platform admin
  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('*, user_roles(name, icon)')
    .eq('tenancy_id', tenancy.id)
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .single()

  let isPlatformAdmin = false
  let platformUser: any = null

  if (!tenantUser) {
    const { data: pu } = await supabase
      .from('platform_users')
      .select('id, email, display_name, platform_role')
      .eq('id', user.id)
      .eq('platform_role', 'platform_admin')
      .single()

    if (!pu) redirect('/unauthorized')
    isPlatformAdmin = true
    platformUser = pu
  }

  const { data: permissions } = await supabase
    .rpc('resolve_permissions', {
      p_plan_id: tenancy.subscription_id,
      p_role_id: tenantUser?.role_id || 'BOARD_MEMBER',
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
      id: tenantUser?.id || `platform-admin-${user.id}`,
      email: tenantUser?.email || platformUser?.email,
      display_name: tenantUser?.display_name || platformUser?.display_name || tenantUser?.email?.split('@')[0] || '',
      role_id: tenantUser?.role_id || 'BOARD_MEMBER',
      role_name: (tenantUser?.user_roles as any)?.name || 'Platform Admin',
    },
    permissions: permissions || [],
    accessibleModules,
    isPlatformAdmin,
  }

  const checklist = await getOnboardingChecklist(tenancy.id)
  const features = await getTenantFeatures(tenancy.id)

  return (
    <TenantProvider value={contextValue}>
      <div className="min-h-screen bg-[#f8f9fa]">
        {/* Header */}
        <header className="bg-white border-b border-[#e6e8eb] px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[18px] font-bold text-[#1a1f25]">ONE two</span>
              <span className="text-[13px] text-[#929da8]">|</span>
              <span className="text-[13px] font-medium text-[#45505a]">{tenancy.name} Setup</span>
            </div>
            <Link
              href={`/app/${tenancySlug}`}
              className="text-[13px] font-medium text-[#6e7b8a] hover:text-[#1a1f25] transition-colors"
              prefetch={false}
            >
              I&apos;ll finish later →
            </Link>
          </div>
        </header>

        {/* Stepper */}
        <div className="bg-white border-b border-[#e6e8eb]">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <OnboardingStepper
              checklist={checklist}
              showPaymentStep={features?.payment_processing ?? false}
              tenancySlug={tenancySlug}
            />
          </div>
        </div>

        {/* Content */}
        <main className="max-w-3xl mx-auto px-6 py-8">
          {children}
        </main>
      </div>
    </TenantProvider>
  )
}
