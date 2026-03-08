// ============================================================================
// case-steps.ts
// TypeScript types for Annual Budget workflow step data
// File location in repo: types/case-steps.ts
// ============================================================================

// ─── Reserve Component (Section 2) ───────────────────────────────────────────

export interface ReserveComponent {
  id: string                          // uuid, client-generated (crypto.randomUUID())
  name: string
  lifeRemainingYears: number | null
  estimatedCost: number | null        // dollars
  annualRequired: number | null       // dollars
  flag: 'near_term' | 'critical' | null
}

// Auto-flagging rule (computed, never stored):
// lifeRemainingYears <= 2  → 'near_term'
// lifeRemainingYears <= 0  → 'critical'
export function computeComponentFlag(lifeRemaining: number | null): ReserveComponent['flag'] {
  if (lifeRemaining === null) return null
  if (lifeRemaining <= 0) return 'critical'
  if (lifeRemaining <= 2) return 'near_term'
  return null
}

// ─── Section 1: Study Validity & Compliance ──────────────────────────────────

export interface Step2StudyValidity {
  lastStudyDate: string | null        // ISO date "YYYY-MM-DD"
  studyType: 'full' | 'update' | 'site_visit' | null
  preparer: string
  compliance: 'compliant' | 'non_compliant' | 'unknown' | null
  nextUpdateDue: string | null        // ISO date "YYYY-MM-DD"
}

export const STUDY_TYPE_LABELS: Record<NonNullable<Step2StudyValidity['studyType']>, string> = {
  full: 'Full',
  update: 'Update',
  site_visit: 'Site-Visit Only',
}

export const COMPLIANCE_LABELS: Record<NonNullable<Step2StudyValidity['compliance']>, string> = {
  compliant: '✓ Compliant',
  non_compliant: 'Non-compliant',
  unknown: 'Unknown',
}

// ─── Section 2: Component Schedule ───────────────────────────────────────────

export interface Step2ComponentSchedule {
  components: ReserveComponent[]
}

export function getTotalReplacement(components: ReserveComponent[]): number {
  return components.reduce((sum, c) => sum + (c.estimatedCost ?? 0), 0)
}

export function getTotalAnnualRequired(components: ReserveComponent[]): number {
  return components.reduce((sum, c) => sum + (c.annualRequired ?? 0), 0)
}

export function getFlaggedComponents(components: ReserveComponent[]): ReserveComponent[] {
  return components.filter((c) => c.flag !== null)
}

// ─── Section 3: Percent Funded & Risk ────────────────────────────────────────

export interface Step2PercentFunded {
  totalReplacement: number | null     // dollars — should match Section 2 totals
  reserveBalance: number | null       // dollars — from Fiscal Lens / reserve accounts
  // percentFunded is ALWAYS derived, never stored:
  // round((reserveBalance / totalReplacement) * 1000) / 10
  fundingTrend: 'up' | 'down' | 'flat' | null
  underfundedRisk: 'yes' | 'no' | 'borderline' | null
}

export type RiskBand = 'high' | 'moderate' | 'strong'

export function calcPercentFunded(
  reserveBalance: number | null,
  totalReplacement: number | null
): number | null {
  if (!reserveBalance || !totalReplacement || totalReplacement === 0) return null
  return Math.round((reserveBalance / totalReplacement) * 1000) / 10
}

export function getRiskBand(pct: number): RiskBand {
  if (pct < 30) return 'high'
  if (pct < 70) return 'moderate'
  return 'strong'
}

export const RISK_BAND_CONFIG: Record<
  RiskBand,
  { label: string; icon: string; bgClass: string; borderClass: string; textClass: string }
> = {
  high: {
    label: 'High',
    icon: '🔴',
    bgClass: 'bg-[#fef2f2]',
    borderClass: 'border-[#fbc8c8]',
    textClass: 'text-[#d12626]',
  },
  moderate: {
    label: 'Moderate',
    icon: '🟡',
    bgClass: 'bg-[#fef9c3]',
    borderClass: 'border-[#fcd34d]',
    textClass: 'text-[#a16207]',
  },
  strong: {
    label: 'Strong',
    icon: '🟢',
    bgClass: 'bg-[#ecfdf5]',
    borderClass: 'border-[#6ee7b7]',
    textClass: 'text-[#047857]',
  },
}

// ─── Section 4: Decision Framing ─────────────────────────────────────────────

export interface Step2DecisionFraming {
  avoidSpecialAssessmentsUntil: string  // free text
  reservesDropDate: string              // free text
  deferralExposure: string              // free text
}

export const FRAMING_STATEMENTS: Array<{
  field: keyof Step2DecisionFraming
  prefix: string
  suffix: string
  placeholder: string
}> = [
  {
    field: 'avoidSpecialAssessmentsUntil',
    prefix: 'If we follow this plan, we avoid special assessments until',
    suffix: '.',
    placeholder: 'year or date range',
  },
  {
    field: 'reservesDropDate',
    prefix: 'If we keep current funding, reserves drop below safe levels in',
    suffix: '.',
    placeholder: 'year or timeframe',
  },
  {
    field: 'deferralExposure',
    prefix: 'Deferring contributions shifts costs to future owners — estimated exposure:',
    suffix: '.',
    placeholder: 'dollar amount',
  },
]

// ─── Full Step 2 Data Shape ───────────────────────────────────────────────────

export interface Step2Data {
  studyValidity: Step2StudyValidity
  componentSchedule: Step2ComponentSchedule
  percentFunded: Step2PercentFunded
  decisionFraming: Step2DecisionFraming
}

export const DEFAULT_STEP2_DATA: Step2Data = {
  studyValidity: {
    lastStudyDate: null,
    studyType: null,
    preparer: '',
    compliance: null,
    nextUpdateDue: null,
  },
  componentSchedule: {
    components: [],
  },
  percentFunded: {
    totalReplacement: null,
    reserveBalance: null,
    fundingTrend: null,
    underfundedRisk: null,
  },
  decisionFraming: {
    avoidSpecialAssessmentsUntil: '',
    reservesDropDate: '',
    deferralExposure: '',
  },
}

// ─── Section IDs ─────────────────────────────────────────────────────────────

export type Step2SectionId =
  | 'study_validity'
  | 'component_schedule'
  | 'percent_funded'
  | 'decision_framing'

export const STEP2_SECTIONS: Step2SectionId[] = [
  'study_validity',
  'component_schedule',
  'percent_funded',
  'decision_framing',
]

export const STEP2_SECTION_LABELS: Record<Step2SectionId, string> = {
  study_validity: 'Study Validity & Compliance',
  component_schedule: 'Component Schedule',
  percent_funded: 'Percent Funded & Risk',
  decision_framing: 'Decision Framing',
}

// ─── Generic case step response (from DB) ────────────────────────────────────

export interface CaseStepResponse<T = Record<string, unknown>> {
  id: string
  caseId: string
  stepNumber: number
  stepData: T
  confirmedSections: string[]
  isComplete: boolean
  updatedAt: string
  updatedBy: string | null
}
