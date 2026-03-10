'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { revalidatePath } from 'next/cache'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function getTeamMembers(tenancySlug: string) {
  const supabase = await createServerSupabase()
  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) return []

  const { data } = await (supabase as any)
    .from('tenant_users')
    .select('id, display_name, email, role')
    .eq('tenant_id', tenantId)

  return (data || []).map((u: any) => ({
    id: u.id,
    name: u.display_name || u.email?.split('@')[0] || 'Unknown',
    role: u.role,
  }))
}

export async function createTask(
  tenancySlug: string,
  data: {
    title: string
    description: string
    category: string
    priority: string
    assigned_to: string | null
    due_date: string | null
    property_log_id?: string | null
    created_by: string
  }
) {
  const supabase = await createServerSupabase()
  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) throw new Error('Tenant not found')

  const { data: task, error } = await (supabase as any)
    .from('association_tasks')
    .insert({
      tenant_id: tenantId,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: 'todo',
      assigned_to: data.assigned_to || null,
      created_by: data.created_by,
      due_date: data.due_date || null,
      property_log_id: data.property_log_id || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/task-tracking`)
  return task
}

export async function updateTask(
  tenancySlug: string,
  taskId: string,
  data: Record<string, unknown>
) {
  const supabase = await createServerSupabase()

  const { error } = await (supabase as any)
    .from('association_tasks')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/task-tracking`)
}

export async function updateTaskStatus(
  tenancySlug: string,
  taskId: string,
  status: string
) {
  const updates: Record<string, unknown> = { status }
  if (status === 'done') updates.completed_at = new Date().toISOString()
  if (status !== 'done') updates.completed_at = null

  return updateTask(tenancySlug, taskId, updates)
}

export async function assignTask(
  tenancySlug: string,
  taskId: string,
  assignedTo: string | null
) {
  return updateTask(tenancySlug, taskId, { assigned_to: assignedTo })
}

export async function deleteTask(
  tenancySlug: string,
  taskId: string
) {
  const supabase = await createServerSupabase()

  const { error } = await (supabase as any)
    .from('association_tasks')
    .delete()
    .eq('id', taskId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/task-tracking`)
}
