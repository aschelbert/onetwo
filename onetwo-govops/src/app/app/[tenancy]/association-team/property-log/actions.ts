'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { revalidatePath } from 'next/cache'
import type { PropertyLogFinding, PropertyLogActionItem } from '@/types/association-team'

// The property_logs table exists in the remote DB but not in the generated Database type.
// We cast to `any` at the `.from()` boundary to bypass type checks.
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function createPropertyLog(
  tenancySlug: string,
  data: {
    type: string
    title: string
    date: string
    conducted_by: string
    location: string
  }
) {
  const supabase = await createServerSupabase()
  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) throw new Error('Tenant not found')

  const { data: log, error } = await (supabase as any)
    .from('property_logs')
    .insert({
      tenant_id: tenantId,
      type: data.type,
      title: data.title,
      date: data.date,
      conducted_by: data.conducted_by,
      location: data.location,
      status: 'open',
      findings: [],
      action_items: [],
      notes: '',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
  return log
}

export async function updatePropertyLog(
  tenancySlug: string,
  logId: string,
  data: Record<string, unknown>
) {
  const supabase = await createServerSupabase()

  const { error } = await (supabase as any)
    .from('property_logs')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}

export async function updatePropertyLogStatus(
  tenancySlug: string,
  logId: string,
  status: string
) {
  return updatePropertyLog(tenancySlug, logId, { status })
}

export async function deletePropertyLog(
  tenancySlug: string,
  logId: string
) {
  const supabase = await createServerSupabase()

  const { error } = await (supabase as any)
    .from('property_logs')
    .delete()
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}

// ─── Findings (jsonb array read-modify-write) ───────────────────

export async function addFinding(
  tenancySlug: string,
  logId: string,
  finding: PropertyLogFinding
) {
  const supabase = await createServerSupabase()
  const { data: log } = await (supabase as any)
    .from('property_logs')
    .select('findings')
    .eq('id', logId)
    .single()

  const findings = [...((log?.findings as PropertyLogFinding[]) || []), finding]

  const { error } = await (supabase as any)
    .from('property_logs')
    .update({ findings, updated_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}

export async function updateFinding(
  tenancySlug: string,
  logId: string,
  findingId: string,
  updates: Partial<PropertyLogFinding>
) {
  const supabase = await createServerSupabase()
  const { data: log } = await (supabase as any)
    .from('property_logs')
    .select('findings')
    .eq('id', logId)
    .single()

  const findings = ((log?.findings as PropertyLogFinding[]) || []).map((f: PropertyLogFinding) =>
    f.id === findingId ? { ...f, ...updates } : f
  )

  const { error } = await (supabase as any)
    .from('property_logs')
    .update({ findings, updated_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}

export async function removeFinding(
  tenancySlug: string,
  logId: string,
  findingId: string
) {
  const supabase = await createServerSupabase()
  const { data: log } = await (supabase as any)
    .from('property_logs')
    .select('findings')
    .eq('id', logId)
    .single()

  const findings = ((log?.findings as PropertyLogFinding[]) || []).filter(
    (f: PropertyLogFinding) => f.id !== findingId
  )

  const { error } = await (supabase as any)
    .from('property_logs')
    .update({ findings, updated_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}

// ─── Action Items (jsonb array read-modify-write) ───────────────

export async function addActionItem(
  tenancySlug: string,
  logId: string,
  item: PropertyLogActionItem
) {
  const supabase = await createServerSupabase()
  const { data: log } = await (supabase as any)
    .from('property_logs')
    .select('action_items')
    .eq('id', logId)
    .single()

  const action_items = [...((log?.action_items as PropertyLogActionItem[]) || []), item]

  const { error } = await (supabase as any)
    .from('property_logs')
    .update({ action_items, updated_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}

export async function updateActionItem(
  tenancySlug: string,
  logId: string,
  itemId: string,
  updates: Partial<PropertyLogActionItem>
) {
  const supabase = await createServerSupabase()
  const { data: log } = await (supabase as any)
    .from('property_logs')
    .select('action_items')
    .eq('id', logId)
    .single()

  const action_items = ((log?.action_items as PropertyLogActionItem[]) || []).map((item: PropertyLogActionItem) =>
    item.id === itemId ? { ...item, ...updates } : item
  )

  const { error } = await (supabase as any)
    .from('property_logs')
    .update({ action_items, updated_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}

export async function removeActionItem(
  tenancySlug: string,
  logId: string,
  itemId: string
) {
  const supabase = await createServerSupabase()
  const { data: log } = await (supabase as any)
    .from('property_logs')
    .select('action_items')
    .eq('id', logId)
    .single()

  const action_items = ((log?.action_items as PropertyLogActionItem[]) || []).filter(
    (item: PropertyLogActionItem) => item.id !== itemId
  )

  const { error } = await (supabase as any)
    .from('property_logs')
    .update({ action_items, updated_at: new Date().toISOString() })
    .eq('id', logId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
}
