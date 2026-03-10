import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountMgmtClient } from './account-mgmt-client'

export default async function AccountMgmtPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: tenancySlug } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Get tenancy with subscription plan details
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('*, subscription_plans(*)')
    .eq('slug', tenancySlug)
    .single()

  if (!tenancy) redirect('/unauthorized')

  return (
    <AccountMgmtClient
      tenancy={tenancy}
      plan={tenancy.subscription_plans}
    />
  )
}
