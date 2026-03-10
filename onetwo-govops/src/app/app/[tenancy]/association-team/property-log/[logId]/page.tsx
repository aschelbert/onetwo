import { createServerSupabase } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PropertyLogDetail } from '@/components/association-team/property-log/PropertyLogDetail'
import type { PropertyLog } from '@/types/association-team'

export default async function PropertyLogDetailPage({
  params,
}: {
  params: Promise<{ tenancy: string; logId: string }>
}) {
  const { tenancy: tenancySlug, logId } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: log } = await (supabase as any)
    .from('property_logs')
    .select('*')
    .eq('id', logId)
    .single()

  if (!log) notFound()

  return (
    <PropertyLogDetail
      log={log as unknown as PropertyLog}
      tenancySlug={tenancySlug}
    />
  )
}
