import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOnboardingChecklist } from './actions'
import { ONBOARDING_STEPS } from '@/types/onboarding'

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

  // Find first incomplete step
  const firstIncomplete = ONBOARDING_STEPS.find(
    step => !checklist[step.checklistField]
  )

  const stepNumber = firstIncomplete?.number ?? 1
  redirect(`/app/onboarding/${slug}/step/${stepNumber}`)
}
