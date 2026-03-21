'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { revalidatePath } from 'next/cache'
import type { PropertyLogFinding, PropertyLogActionItem } from '@/types/association-team'

// The property_logs table exists in the remote DB but not in the generated Database type.
// We cast to `any` at the `.from()` boundary to bypass type checks.
/* eslint-disable @typescript-eslint/no-explicit-any */

const INSURANCE_CLAIM_STEPS = [
  { step_text: 'Document incident details and gather photo evidence', sort_order: 0 },
  { step_text: 'Notify insurer within required reporting window', sort_order: 1 },
  { step_text: 'Coordinate adjuster site access', sort_order: 2 },
  { step_text: 'Track claim status and board updates', sort_order: 3 },
  { step_text: 'Close claim and record outcome in Fiscal Lens GL', sort_order: 4 },
]

export async function createPropertyLog(
  tenancySlug: string,
  data: {
    type: string
    title: string
    date: string
    conducted_by: string
    location: string
    insurance_claim_needed?: string
  }
) {
  const supabase = await createServerSupabase()
  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) throw new Error('Tenant not found')

  const claimNeeded = data.insurance_claim_needed || 'unknown'

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
      insurance_claim_needed: claimNeeded,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // If insurance claim needed, create a case automatically
  if (claimNeeded === 'yes') {
    await createInsuranceClaimCase(supabase, tenantId, tenancySlug, log)
  }

  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
  return log
}

async function createInsuranceClaimCase(
  supabase: any,
  tenantId: string,
  tenancySlug: string,
  log: any
) {
  const caseId = crypto.randomUUID()
  const localId = `c-ins-${Date.now()}`
  const title = `Insurance Claim — ${log.title} — ${log.date}`

  const { error: caseError } = await supabase
    .from('cases')
    .insert({
      id: caseId,
      tenant_id: tenantId,
      local_id: localId,
      cat_id: 'legal',
      sit_id: 'insurance-claims',
      title,
      unit: '',
      owner: '',
      approach: 'pre',
      status: 'open',
      priority: 'high',
      created_date: new Date().toISOString().split('T')[0],
      notes: `Auto-created from property log incident: ${log.title}`,
      board_votes: null,
      linked_wos: [],
      source: 'property_log',
      source_id: log.id,
    })

  if (caseError) {
    console.error('Failed to create insurance claim case:', caseError.message)
    return
  }

  // Create pre-populated case steps
  const stepRows = INSURANCE_CLAIM_STEPS.map((s, i) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    case_id: caseId,
    local_id: `s${i}`,
    step_text: s.step_text,
    timing: null,
    doc_ref: null,
    detail: null,
    warning: null,
    done: false,
    done_date: null,
    user_notes: '',
    sort_order: s.sort_order,
  }))

  const { error: stepsError } = await supabase
    .from('case_steps')
    .insert(stepRows)

  if (stepsError) {
    console.error('Failed to create case steps:', stepsError.message)
  }

  // Write case id back to property log
  const { error: updateError } = await supabase
    .from('property_logs')
    .update({ insurance_claim_case_id: caseId })
    .eq('id', log.id)

  if (updateError) {
    console.error('Failed to link case to property log:', updateError.message)
  }

  revalidatePath(`/app/${tenancySlug}/association-team/property-log`)
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
