'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { revalidatePath } from 'next/cache'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function upsertScorecardEntry(
  tenancySlug: string,
  data: {
    id?: string
    period: string
    category: string
    score: number
    notes: string
    scored_by: string
  }
) {
  const supabase = await createServerSupabase()
  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) throw new Error('Tenant not found')

  if (data.id) {
    const { error } = await (supabase as any)
      .from('pm_scorecard_entries')
      .update({
        score: data.score,
        notes: data.notes,
        scored_by: data.scored_by,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)

    if (error) throw new Error(error.message)
  } else {
    const { error } = await (supabase as any)
      .from('pm_scorecard_entries')
      .insert({
        tenant_id: tenantId,
        period: data.period,
        category: data.category,
        score: data.score,
        notes: data.notes,
        scored_by: data.scored_by,
      })

    if (error) throw new Error(error.message)
  }

  revalidatePath(`/app/${tenancySlug}/association-team/pm-scorecard`)
}

export async function createScorecardReview(
  tenancySlug: string,
  data: {
    period: string
    overall_rating: number
    summary: string
    strengths: string[]
    improvements: string[]
    reviewed_by: string
  }
) {
  const supabase = await createServerSupabase()
  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) throw new Error('Tenant not found')

  const { data: review, error } = await (supabase as any)
    .from('pm_scorecard_reviews')
    .insert({
      tenant_id: tenantId,
      period: data.period,
      overall_rating: data.overall_rating,
      summary: data.summary,
      strengths: data.strengths,
      improvements: data.improvements,
      reviewed_by: data.reviewed_by,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/pm-scorecard`)
  return review
}

export async function updateScorecardReview(
  tenancySlug: string,
  reviewId: string,
  data: Record<string, unknown>
) {
  const supabase = await createServerSupabase()

  const { error } = await (supabase as any)
    .from('pm_scorecard_reviews')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', reviewId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/${tenancySlug}/association-team/pm-scorecard`)
}
