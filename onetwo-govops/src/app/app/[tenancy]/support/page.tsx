import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SupportClient } from './support-client'

export default async function TenantSupportPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: tenancySlug } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Get tenancy by slug
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('id, name, slug')
    .eq('slug', tenancySlug)
    .single()

  if (!tenancy) redirect('/unauthorized')

  // Fetch threads for this tenancy
  const { data: threads } = await supabase
    .from('support_threads')
    .select('*')
    .eq('tenancy_id', tenancy.id)
    .order('updated_at', { ascending: false })

  return <SupportClient threads={threads || []} tenancyId={tenancy.id} tenancySlug={tenancy.slug} />
}
