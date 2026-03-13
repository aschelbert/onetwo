import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOnboardingChecklist } from './actions'

export default async function OnboardingIndexPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: slug } = await params
  const supabase = await createServerSupabase()

  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tenancy) redirect(`/app/${slug}`)

  const checklist = await getOnboardingChecklist(tenancy.id)

  if (checklist.go_live) {
    redirect(`/app/${slug}`)
  }

  redirect(`/app/onboarding/${slug}/setup`)
}
