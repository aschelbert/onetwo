import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { redirect } from 'next/navigation'
import { TaskList } from '@/components/association-team/task-tracking/TaskList'
import { getTeamMembers } from './actions'
import type { AssociationTask } from '@/types/association-team'

export default async function TaskTrackingPage({
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

  const [{ data: tasks }, teamMembers] = await Promise.all([
    (supabase as any)
      .from('association_tasks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    getTeamMembers(tenancySlug),
  ])

  // Join assigned user names
  const enrichedTasks = ((tasks as unknown as AssociationTask[]) || []).map((task: AssociationTask) => ({
    ...task,
    assigned_user_name: teamMembers.find((m: { id: string }) => m.id === task.assigned_to)?.name,
    created_by_name: teamMembers.find((m: { id: string }) => m.id === task.created_by)?.name,
  }))

  return (
    <TaskList
      tasks={enrichedTasks}
      teamMembers={teamMembers}
      tenancySlug={tenancySlug}
    />
  )
}
