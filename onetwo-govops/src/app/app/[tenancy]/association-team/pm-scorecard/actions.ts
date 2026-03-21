'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { revalidatePath } from 'next/cache'
import type { ScorecardData, ScorecardMetric } from '@/types/association-team'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Legacy actions (still used by review panel) ────────────────

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

// ─── Computed scorecard data ────────────────────────────────────

function getQuarterRange(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3
  const start = new Date(year, startMonth, 1).toISOString()
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59).toISOString()
  return { start, end }
}

function getCurrentQuarter(): { year: number; quarter: number } {
  const now = new Date()
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 }
}

export async function computeScorecardData(tenancySlug: string): Promise<ScorecardData> {
  const supabase = await createServerSupabase()
  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) throw new Error('Tenant not found')

  const db = supabase as any
  const { year, quarter } = getCurrentQuarter()
  const { start, end } = getQuarterRange(year, quarter)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  // Fetch all data in parallel
  const [
    reviewsRes,
    issuesRes,
    reviewNotesRes,
    casesRes,
    caseCommsRes,
    tasksRes,
    logsRes,
    unitsRes,
    finSettingsRes,
    budgetRes,
    complianceRes,
  ] = await Promise.all([
    // Board reviews for current quarter
    db.from('pm_scorecard_reviews').select('overall_rating, created_at')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    // Issues for response time
    db.from('issues').select('id, submitted_date, created_at')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    // Issue review notes (all for tenant, we filter by issue ids)
    db.from('issue_review_notes').select('issue_id, date, created_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: true }),
    // Cases for response time
    db.from('cases').select('id, created_at, created_date')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    // Case communications
    db.from('case_communications').select('case_id, date, created_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: true }),
    // Tasks for completion rate
    db.from('association_tasks').select('status, due_date, completed_at, created_at')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    // Property logs for current month
    db.from('property_logs').select('id, date, created_at')
      .eq('tenant_id', tenantId).gte('created_at', monthStart).lte('created_at', monthEnd),
    // Units for collection rate
    db.from('units').select('balance')
      .eq('tenant_id', tenantId),
    // Financial settings
    db.from('financial_settings').select('annual_reserve_contribution')
      .eq('tenant_id', tenantId).single(),
    // Budget categories
    db.from('budget_categories').select('budgeted, expenses')
      .eq('tenant_id', tenantId),
    // Compliance completions
    db.from('compliance_completions').select('completed')
      .eq('tenant_id', tenantId),
  ])

  // ── 1. Board Review Rating ─────────────────────────────────────
  const reviews = reviewsRes.data || []
  let boardReviewRating: ScorecardMetric
  if (reviews.length > 0) {
    const avgRating = reviews.reduce((s: number, r: any) => s + (r.overall_rating || 0), 0) / reviews.length
    // overall_rating is 0-100, normalize to 0-5 for display, keep 0-100 for score
    const stars = Math.round((avgRating / 20) * 10) / 10
    boardReviewRating = {
      label: 'Board Review Rating',
      value: Math.round(avgRating),
      display: `${stars} / 5`,
      trend: null,
      source: 'from Board Reviews',
    }
  } else {
    boardReviewRating = {
      label: 'Board Review Rating',
      value: null,
      display: 'No reviews',
      trend: null,
      source: 'from Board Reviews',
    }
  }

  // ── 2. Speed of Communication ──────────────────────────────────
  const issues = issuesRes.data || []
  const reviewNotes = reviewNotesRes.data || []
  const cases = casesRes.data || []
  const caseComms = caseCommsRes.data || []

  const responseTimes: number[] = []

  // Issues: submitted_date → first review note date
  for (const issue of issues) {
    const firstNote = reviewNotes.find((n: any) => n.issue_id === issue.id)
    if (firstNote) {
      const submitted = new Date(issue.submitted_date).getTime()
      const responded = new Date(firstNote.date || firstNote.created_at).getTime()
      const hours = Math.max(0, (responded - submitted) / (1000 * 60 * 60))
      responseTimes.push(hours)
    }
  }

  // Cases: created_at → first case_communication date
  for (const c of cases) {
    const firstComm = caseComms.find((cm: any) => cm.case_id === c.id)
    if (firstComm) {
      const created = new Date(c.created_at || c.created_date).getTime()
      const responded = new Date(firstComm.date || firstComm.created_at).getTime()
      const hours = Math.max(0, (responded - created) / (1000 * 60 * 60))
      responseTimes.push(hours)
    }
  }

  let speedOfCommunication: ScorecardMetric
  if (responseTimes.length > 0) {
    const avgHours = Math.round(responseTimes.reduce((s, h) => s + h, 0) / responseTimes.length)
    // Score: <=24h = 100, 48h = 75, 72h = 50, 96h+ = 25, 168h+ = 0
    const score = Math.max(0, Math.min(100, Math.round(100 - ((avgHours - 24) / 144) * 100)))
    speedOfCommunication = {
      label: 'Speed of Communication',
      value: Math.max(0, Math.min(100, score)),
      display: `${avgHours}h avg`,
      trend: null,
      source: 'from Issues & Cases',
    }
  } else {
    speedOfCommunication = {
      label: 'Speed of Communication',
      value: null,
      display: 'No data',
      trend: null,
      source: 'from Issues & Cases',
    }
  }

  // ── 3. Task Completion Rate ────────────────────────────────────
  const tasks = tasksRes.data || []
  const totalTasks = tasks.length
  const onTimeDone = tasks.filter((t: any) => {
    if (t.status !== 'done') return false
    if (!t.due_date || !t.completed_at) return true // done without due date counts as on-time
    return new Date(t.completed_at) <= new Date(t.due_date + 'T23:59:59')
  }).length

  let taskCompletionRate: ScorecardMetric
  if (totalTasks > 0) {
    const rate = Math.round((onTimeDone / totalTasks) * 100)
    taskCompletionRate = {
      label: 'Task Completion Rate',
      value: rate,
      display: `${rate}%`,
      trend: null,
      source: 'from Task Tracking',
    }
  } else {
    taskCompletionRate = {
      label: 'Task Completion Rate',
      value: null,
      display: 'No tasks',
      trend: null,
      source: 'from Task Tracking',
    }
  }

  // ── 4. Property Log Completion ─────────────────────────────────
  const logs = logsRes.data || []
  const logCount = logs.length
  const expected = 4 // 1 per week, 4 per month
  const logRate = Math.min(100, Math.round((logCount / expected) * 100))

  const propertyLogCompletion: ScorecardMetric = {
    label: 'Property Log Completion',
    value: logRate,
    display: `${logCount} / ${expected}`,
    trend: null,
    source: 'from Property Log',
  }

  // ── Aggregate PM Score ─────────────────────────────────────────
  const pmMetrics = [boardReviewRating, speedOfCommunication, taskCompletionRate, propertyLogCompletion]
  const scoredMetrics = pmMetrics.filter((m) => m.value !== null)
  const aggregateScore =
    scoredMetrics.length > 0
      ? Math.round(scoredMetrics.reduce((s, m) => s + m.value!, 0) / scoredMetrics.length)
      : null

  // ── 5. Financial Health ────────────────────────────────────────
  const units = unitsRes.data || []
  const totalUnits = units.length
  const paidUpUnits = units.filter((u: any) => Number(u.balance) <= 0).length
  const collectionRate = totalUnits > 0 ? Math.round((paidUpUnits / totalUnits) * 100) : null

  const reserveContrib = finSettingsRes.data?.annual_reserve_contribution || 0

  const budgetCats = budgetRes.data || []
  const totalBudgeted = budgetCats.reduce((s: number, b: any) => s + Number(b.budgeted || 0), 0)
  const totalSpent = budgetCats.reduce((s: number, b: any) => {
    const expenses = b.expenses || []
    return s + (Array.isArray(expenses) ? expenses.reduce((es: number, e: any) => es + Number(e.amount || 0), 0) : 0)
  }, 0)
  const budgetAdherence = totalBudgeted > 0 ? Math.round(Math.max(0, (1 - (totalSpent - totalBudgeted) / totalBudgeted)) * 100) : null

  // Composite financial score: weighted average of collection rate + budget adherence
  const finComponents: number[] = []
  if (collectionRate !== null) finComponents.push(collectionRate)
  if (budgetAdherence !== null) finComponents.push(Math.min(100, budgetAdherence))
  const financialScore = finComponents.length > 0
    ? Math.round(finComponents.reduce((s, v) => s + v, 0) / finComponents.length)
    : null

  const displayParts: string[] = []
  if (collectionRate !== null) displayParts.push(`${collectionRate}% collected`)
  if (reserveContrib > 0) displayParts.push(`$${Number(reserveContrib).toLocaleString()} reserve`)

  const financialHealth: ScorecardMetric = {
    label: 'Financial Health',
    value: financialScore,
    display: displayParts.length > 0 ? displayParts.join(' · ') : 'No data',
    trend: null,
    source: 'from Fiscal Lens',
  }

  // ── 6. Compliance Health ───────────────────────────────────────
  const compItems = complianceRes.data || []
  const totalComp = compItems.length
  const completedComp = compItems.filter((c: any) => c.completed).length
  const complianceRate = totalComp > 0 ? Math.round((completedComp / totalComp) * 100) : null

  const complianceHealth: ScorecardMetric = {
    label: 'Compliance Health',
    value: complianceRate,
    display: totalComp > 0 ? `${completedComp} / ${totalComp} items` : 'No items',
    trend: null,
    source: 'from Compliance Tracker',
  }

  return {
    pmPerformance: {
      boardReviewRating,
      speedOfCommunication,
      taskCompletionRate,
      propertyLogCompletion,
      aggregateScore,
    },
    buildingHealth: {
      financialHealth,
      complianceHealth,
    },
  }
}
