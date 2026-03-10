import { createServerSupabase } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TaskDetail } from '@/components/association-team/task-tracking/TaskDetail'
import { getTeamMembers } from '../actions'
import type { AssociationTask } from '@/types/association-team'

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ tenancy: string; taskId: string }>
}) {
  const { tenancy: tenancySlug, taskId } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const db = supabase as any
  const [{ data: task }, teamMembers] = await Promise.all([
    db
      .from('association_tasks')
      .select('*')
      .eq('id', taskId)
      .single(),
    getTeamMembers(tenancySlug),
  ])

  if (!task) notFound()

  // Fetch linked property log if exists
  let linkedLog = null
  if (task.property_log_id) {
    const { data } = await db
      .from('property_logs')
      .select('id, title, status')
      .eq('id', task.property_log_id)
      .single()
    linkedLog = data
  }

  const enrichedTask: AssociationTask = {
    ...(task as unknown as AssociationTask),
    assigned_user_name: teamMembers.find((m: { id: string }) => m.id === task.assigned_to)?.name,
    created_by_name: teamMembers.find((m: { id: string }) => m.id === task.created_by)?.name,
  }

  return (
    <TaskDetail
      task={enrichedTask}
      teamMembers={teamMembers}
      linkedLog={linkedLog as { id: string; title: string; status: string } | null}
      tenancySlug={tenancySlug}
    />
  )
}
