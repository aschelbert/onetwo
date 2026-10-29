import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/PageHeader'
import { KpiCard } from '@/components/KpiCard'
import { WhoDoesWhatSection } from '@/components/building/WhoDoesWhatSection'
import type { BoardMember } from '@/types/onboarding'

export default async function TheBuildingPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: tenancySlug } = await params
  const supabase = await createServerSupabase()

  // Look up tenancy to get the ID
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id')
    .eq('slug', tenancySlug)
    .single()

  let boardMembers: BoardMember[] = []
  if (tenancy) {
    const { data } = await (supabase as any)
      .from('board_members')
      .select('*')
      .eq('tenancy_id', tenancy.id)
      .order('created_at', { ascending: true })
    boardMembers = (data as BoardMember[]) || []
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="The Building"
        subtitle="Property details, units, vendors, maintenance & compliance"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Legal & Bylaws" value="--%" sub="Documents" variant="warn" />
        <KpiCard label="Insurance" value="--%" sub="Policies" variant="warn" />
        <KpiCard label="Governance" value="--%" sub="Board members" variant="warn" />
        <KpiCard label="Delinquency Rate" value="--%" sub="Units" variant="ok" />
      </div>

      <WhoDoesWhatSection boardMembers={boardMembers} />
    </div>
  )
}
