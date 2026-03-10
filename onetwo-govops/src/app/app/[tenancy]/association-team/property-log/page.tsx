import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { redirect } from 'next/navigation'
import { PropertyLogList } from '@/components/association-team/property-log/PropertyLogList'
import type { PropertyLog } from '@/types/association-team'

export default async function PropertyLogPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: tenancySlug } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) redirect('/unauthorized')

  const { data: logs } = await (supabase as any)
    .from('property_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return (
    <PropertyLogList
      logs={(logs as unknown as PropertyLog[]) || []}
      tenancySlug={tenancySlug}
    />
  )
}
