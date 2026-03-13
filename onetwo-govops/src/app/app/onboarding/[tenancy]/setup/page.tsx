import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSetupProgress } from '../actions'
import { SetupHub } from '@/components/onboarding/setup-hub/SetupHub'

export default async function SetupHubPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: slug } = await params
  const supabase = await createServerSupabase()

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!tenancy) redirect(`/app/${slug}`)

  const progress = await getSetupProgress(tenancy.id)

  if (progress.goLive) {
    redirect(`/app/${slug}`)
  }

  return (
    <SetupHub
      progress={progress}
      tenancySlug={slug}
      tenancyId={tenancy.id}
      buildingName={tenancy.name || 'Your Building'}
    />
  )
}
