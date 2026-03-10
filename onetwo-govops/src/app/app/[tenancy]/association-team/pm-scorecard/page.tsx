import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { redirect } from 'next/navigation'
import { PMScorecardDashboard } from '@/components/association-team/pm-scorecard/PMScorecardDashboard'
import type { PMScorecardEntry, PMScorecardReview } from '@/types/association-team'

export default async function PMScorecardPage({
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

  const db = supabase as any
  const [{ data: entries }, { data: reviews }] = await Promise.all([
    db
      .from('pm_scorecard_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    db
      .from('pm_scorecard_reviews')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <PMScorecardDashboard
      entries={(entries as unknown as PMScorecardEntry[]) || []}
      reviews={(reviews as unknown as PMScorecardReview[]) || []}
      tenancySlug={tenancySlug}
    />
  )
}
