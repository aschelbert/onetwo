'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Step2Data, Step2SectionId } from '@/types/case-steps'

// The case_step_responses and cases tables exist in the database but are not
// yet in the auto-generated Supabase types. Use `any` casts until types are
// regenerated.

// ─── Load case metadata ─────────────────────────────────────────────────────

export async function getCaseById(caseId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('cases')
    .select('id, tenant_id, local_id, cat_id, sit_id, title, unit, status, approach')
    .eq('id', caseId)
    .single()

  if (error) throw new Error(error.message)
  return data as { id: string; tenant_id: string; local_id: string; cat_id: string; sit_id: string; title: string; unit: string; status: string; approach: string }
}

// ─── Load step definition from case_steps ───────────────────────────────────

export async function getCaseStepDef(caseId: string, sortOrder: number) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('case_steps')
    .select('step_text, timing, doc_ref, detail, warning, done')
    .eq('case_id', caseId)
    .eq('sort_order', sortOrder)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as {
    step_text: string
    timing: string | null
    doc_ref: string | null
    detail: string | null
    warning: string | null
    done: boolean
  } | null
}

// ─── Load step response ──────────────────────────────────────────────────────

export async function getStepResponse(caseId: string, stepNumber: number) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('case_step_responses')
    .select('*')
    .eq('case_id', caseId)
    .eq('step_number', stepNumber)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

// ─── Upsert step data (auto-save on field change) ───────────────────────────

export async function upsertStep2Data(
  caseId: string,
  stepData: Partial<Step2Data>
) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await (supabase as any)
    .from('case_step_responses')
    .upsert(
      {
        case_id: caseId,
        step_number: 2,
        step_data: stepData as unknown as Record<string, unknown>,
        updated_by: user?.id ?? null,
      },
      { onConflict: 'case_id,step_number', ignoreDuplicates: false }
    )

  if (error) throw new Error(error.message)
  revalidatePath(`/boardroom/cases/${caseId}`)
}

// ─── Confirm/deconfirm a section ─────────────────────────────────────────────

export async function toggleSectionConfirmed(
  caseId: string,
  sectionId: Step2SectionId,
  confirmed: boolean
) {
  const supabase = await createServerSupabase()
  const { data: existing } = await (supabase as any)
    .from('case_step_responses')
    .select('confirmed_sections')
    .eq('case_id', caseId)
    .eq('step_number', 2)
    .maybeSingle()

  const current: string[] = existing?.confirmed_sections ?? []
  const updated = confirmed
    ? [...new Set([...current, sectionId])]
    : current.filter((s) => s !== sectionId)

  const allSections: Step2SectionId[] = [
    'study_validity',
    'component_schedule',
    'percent_funded',
    'decision_framing',
  ]
  const isComplete = allSections.every((s) => updated.includes(s))

  await (supabase as any)
    .from('case_step_responses')
    .upsert(
      {
        case_id: caseId,
        step_number: 2,
        confirmed_sections: updated,
        is_complete: isComplete,
      },
      { onConflict: 'case_id,step_number', ignoreDuplicates: false }
    )

  revalidatePath(`/boardroom/cases/${caseId}`)
  return { confirmedSections: updated, isComplete }
}

// ─── Mark step complete (only if all 4 sections confirmed) ──────────────────

export async function markStep2Complete(caseId: string) {
  const supabase = await createServerSupabase()
  const existing = await getStepResponse(caseId, 2)
  const confirmed: string[] = existing?.confirmed_sections ?? []
  const required = ['study_validity', 'component_schedule', 'percent_funded', 'decision_framing']

  if (!required.every((s) => confirmed.includes(s))) {
    throw new Error('All 4 sections must be confirmed before marking complete.')
  }

  await (supabase as any)
    .from('case_step_responses')
    .upsert(
      { case_id: caseId, step_number: 2, is_complete: true },
      { onConflict: 'case_id,step_number', ignoreDuplicates: false }
    )

  // Also update the parent case's current step
  await (supabase as any)
    .from('cases')
    .update({ current_step: 3 })
    .eq('id', caseId)

  revalidatePath(`/boardroom/cases/${caseId}`)
}
