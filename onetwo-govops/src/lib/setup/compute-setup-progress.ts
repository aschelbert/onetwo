// ============================================================================
// compute-setup-progress.ts
// Server-side engine that derives sub-task completion from real DB data.
// No extra tracking tables — completion is computed from existing tables.
// ============================================================================

import { createServerSupabase } from '@/lib/supabase/server'
import { SETUP_STEPS } from './setup-steps'
import type { SetupProgress, SetupStepProgress, SetupStepStatus, TenantFeatures } from '@/types/onboarding'

interface CompletionMap {
  [key: string]: boolean
}

async function buildCompletionMap(
  tenancyId: string,
  features: TenantFeatures | null
): Promise<CompletionMap> {
  const supabase = await createServerSupabase()
  const map: CompletionMap = {}

  // ─── Step 1: Building Profile ─────────────────────────────────────────────
  const { data: tenancy } = await (supabase as any)
    .from('tenancies')
    .select('name, entity_type, address, city, state, year_built, total_units, fiscal_year_end_month')
    .eq('id', tenancyId)
    .single() as { data: any }

  map.bp_name_entity = !!(tenancy?.name && tenancy?.entity_type)
  map.bp_address = !!(tenancy?.address && tenancy?.city && tenancy?.state)
  map.bp_details = !!(tenancy?.year_built && tenancy?.total_units)
  map.bp_fiscal_year = !!(tenancy?.fiscal_year_end_month)

  // ─── Step 2: Governance ───────────────────────────────────────────────────
  const { count: boardCount } = await (supabase as any)
    .from('board_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  const { data: mgmtInfo } = await (supabase as any)
    .from('management_info')
    .select('company_name')
    .eq('tenancy_id', tenancyId)
    .maybeSingle()

  const { count: counselCount } = await (supabase as any)
    .from('legal_counsel')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  map.gov_board = (boardCount ?? 0) >= 1
  map.gov_mgmt = !!(mgmtInfo?.company_name)
  map.gov_legal = (counselCount ?? 0) >= 1

  // ─── Step 3: Legal & Compliance ───────────────────────────────────────────
  const { count: docCount } = await (supabase as any)
    .from('legal_documents')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)
    .eq('status', 'active')

  const { data: bylawsDoc } = await (supabase as any)
    .from('legal_documents')
    .select('bylaws_rules')
    .eq('tenancy_id', tenancyId)
    .eq('status', 'active')
    .not('bylaws_rules', 'is', null)
    .limit(1)
    .maybeSingle()

  map.legal_docs = (docCount ?? 0) >= 1
  map.legal_bylaws = !!(bylawsDoc?.bylaws_rules &&
    (bylawsDoc.bylaws_rules.quorum_percentage !== null ||
     bylawsDoc.bylaws_rules.amendment_threshold !== null ||
     bylawsDoc.bylaws_rules.annual_meeting_month !== null))

  // ─── Step 4: Unit Roster ──────────────────────────────────────────────────
  const { count: unitCount } = await (supabase as any)
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  const { count: votingCount } = await (supabase as any)
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)
    .gt('voting_pct', 0)

  map.units_add = (unitCount ?? 0) >= 1
  map.units_voting = (unitCount ?? 0) >= 1 && (votingCount ?? 0) >= 1

  // ─── Step 5: Financial Setup ──────────────────────────────────────────────
  const { count: coaCount } = await (supabase as any)
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  const { count: budgetCount } = await (supabase as any)
    .from('budget_categories')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  const { count: reserveCount } = await (supabase as any)
    .from('reserve_items')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  map.fin_coa = (coaCount ?? 0) >= 1
  map.fin_budget = (budgetCount ?? 0) >= 1
  map.fin_reserves = (reserveCount ?? 0) >= 1

  // ─── Step 6: Payment Processing ───────────────────────────────────────────
  if (features?.payment_processing) {
    try {
      const { data: stripeStatus } = await supabase.functions.invoke('connect-stripe-account', {
        body: { action: 'check_status', tenancy_id: tenancyId },
      })
      map.pay_connect = !!(stripeStatus?.charges_enabled)
      map.pay_verify = !!(stripeStatus?.details_submitted)
    } catch {
      map.pay_connect = false
      map.pay_verify = false
    }
  } else {
    map.pay_connect = false
    map.pay_verify = false
  }

  // ─── Step 7: Invite Users ─────────────────────────────────────────────────
  const { count: userCount } = await supabase
    .from('tenant_users')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  const { count: roledCount } = await supabase
    .from('tenant_users')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)
    .not('role_id', 'is', null)

  map.invite_team = (userCount ?? 0) >= 2
  map.invite_roles = (userCount ?? 0) >= 2 && (roledCount ?? 0) >= 2

  // ─── Step 8: Review & Go Live ─────────────────────────────────────────────
  // review_progress is derived: all required steps complete
  // go_live is derived from checklist
  const { data: checklist } = await (supabase as any)
    .from('onboarding_checklists')
    .select('go_live')
    .eq('tenancy_id', tenancyId)
    .maybeSingle()

  map.go_live = !!(checklist?.go_live)
  // review_progress is set after we compute required step completion (below)
  map.review_progress = false // placeholder, computed after step assembly

  return map
}

export async function computeSetupProgress(
  tenancyId: string,
  features: TenantFeatures | null
): Promise<SetupProgress> {
  const completionMap = await buildCompletionMap(tenancyId, features)

  // Filter steps based on feature gates
  const visibleSteps = SETUP_STEPS.filter(step => {
    if (step.featureGate && features) {
      return features[step.featureGate as keyof TenantFeatures] === true
    }
    if (step.featureGate && !features) {
      return false
    }
    return true
  })

  // First pass: compute each step (except review_progress which depends on other steps)
  let firstIncompleteFound = false
  const steps: SetupStepProgress[] = visibleSteps.map(step => {
    const subTasks = step.subTasks.map(st => ({
      id: st.id,
      label: st.label,
      navigateTo: st.navigateTo,
      isComplete: completionMap[st.completionKey] ?? false,
    }))

    const completedCount = subTasks.filter(st => st.isComplete).length
    const totalCount = subTasks.length
    const isComplete = completedCount === totalCount

    let status: SetupStepStatus
    if (isComplete) {
      status = 'complete'
    } else if (!firstIncompleteFound) {
      status = 'active'
      firstIncompleteFound = true
    } else {
      status = 'pending'
    }

    return {
      stepId: step.stepId,
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      required: step.required,
      status,
      subTasks,
      completedCount,
      totalCount,
    }
  })

  // Check if all required steps (excluding review_go_live) are complete
  const allRequiredComplete = steps
    .filter(s => s.required && s.stepId !== 'review_go_live')
    .every(s => s.status === 'complete')

  // Update review_progress sub-task in Step 8
  const step8 = steps.find(s => s.stepId === 'review_go_live')
  if (step8) {
    const reviewTask = step8.subTasks.find(st => st.id === 'review_progress')
    if (reviewTask) {
      reviewTask.isComplete = allRequiredComplete
      step8.completedCount = step8.subTasks.filter(st => st.isComplete).length
    }
  }

  const totalSubTasks = steps.reduce((sum, s) => sum + s.totalCount, 0)
  const completedSubTasks = steps.reduce((sum, s) => sum + s.completedCount, 0)
  const percentComplete = totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0

  return {
    steps,
    totalSubTasks,
    completedSubTasks,
    percentComplete,
    allRequiredComplete,
    goLive: completionMap.go_live ?? false,
  }
}
