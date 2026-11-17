import { createServerSupabase } from '@/lib/supabase/server'
import { syncOnCallRequests, type OnCallRow } from '@/lib/on-call'
import { OnCallClient } from './on-call-client'

export const dynamic = 'force-dynamic'

export default async function OnCallPage() {
  const supabase = await createServerSupabase()
  const [{ data: { user } }, { data: users }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('platform_users').select('id, email, display_name').order('created_at', { ascending: true }),
  ])

  let rows: OnCallRow[] = []
  let opened = 0
  let errors: string[] = []
  try {
    ({ rows, opened, errors } = await syncOnCallRequests())
  } catch (e) {
    errors = [e instanceof Error ? e.message : String(e)]
  }

  return <OnCallClient rows={rows} users={users || []} currentUserId={user?.id || ''} opened={opened} errors={errors} />
}
