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
  compliant: '\u2713 Compliant',
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
    icon: '\uD83D\uDD34',
    bgClass: 'bg-[#fef2f2]',
    borderClass: 'border-[#fbc8c8]',
    textClass: 'text-[#d12626]',
  },
  moderate: {
    label: 'Moderate',
    icon: '\uD83D\uDFE1',
    bgClass: 'bg-[#fef9c3]',
    borderClass: 'border-[#fcd34d]',
    textClass: 'text-[#a16207]',
  },
  strong: {
    label: 'Strong',
    icon: '\uD83D\uDFE2',
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
    prefix: 'Deferring contributions shifts costs to future owners \u2014 estimated exposure:',
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

// ─── Preventative Maintenance Step 1 ───────────────────────────────────

export type PMCategory =
  | 'hvac'
  | 'roofing'
  | 'plumbing'
  | 'electrical'
  | 'fire_safety'
  | 'elevator'
  | 'exterior'
  | 'pest_control'
  | 'common_areas'
  | 'other'

export const PM_CATEGORY_LABELS: Record<PMCategory, string> = {
  hvac: 'HVAC',
  roofing: 'Roofing & Gutters',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  fire_safety: 'Fire & Life Safety',
  elevator: 'Elevator',
  exterior: 'Exterior Envelope',
  pest_control: 'Pest Control',
  common_areas: 'Common Areas & Landscaping',
  other: 'Other',
}

export interface PMTask {
  id: string                  // uuid, client-generated
  name: string
  category: PMCategory
  startMonth: number          // 1-12, first occurrence month
  frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'as_needed'
  vendorId: string | null     // FK to vendors.id
  vendorName: string          // denormalized for JSONB display
  notes: string
  eventCreated: boolean       // true once a case_event has been generated
}

export interface Step1PMData {
  tasks: PMTask[]
  calendarYear: number        // which year the calendar is for
}

export type Step1PMSectionId = 'tasks' | 'calendar'

export const STEP1PM_SECTIONS: Step1PMSectionId[] = ['tasks', 'calendar']

export const DEFAULT_STEP1PM_DATA: Step1PMData = {
  tasks: [],
  calendarYear: new Date().getFullYear(),
}

// ─── Vendor (matches existing DB table) ──────────────────────────────

export interface Vendor {
  id: string
  tenant_id: string
  name: string
  service: string
  contact: string
  phone: string
  email: string
  contract: string
  status: string
  w9_on_file: boolean | null
  is_sample: boolean
  created_at: string
  updated_at: string
}

// ─── Calendar computation helpers ────────────────────────────────────

export function computeTaskMonths(startMonth: number, frequency: PMTask['frequency']): number[] {
  switch (frequency) {
    case 'monthly':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    case 'quarterly': {
      const months: number[] = []
      for (let i = 0; i < 4; i++) {
        months.push(((startMonth - 1 + i * 3) % 12) + 1)
      }
      return months.sort((a, b) => a - b)
    }
    case 'semi_annual': {
      const second = ((startMonth - 1 + 6) % 12) + 1
      return [startMonth, second].sort((a, b) => a - b)
    }
    case 'annual':
      return [startMonth]
    case 'as_needed':
      return []
  }
}

export function buildCalendarGrid(tasks: PMTask[]): Record<number, PMTask[]> {
  const grid: Record<number, PMTask[]> = {}
  for (let m = 1; m <= 12; m++) grid[m] = []
  for (const task of tasks) {
    const months = computeTaskMonths(task.startMonth, task.frequency)
    for (const m of months) {
      grid[m].push(task)
    }
  }
  return grid
}

// ─── Task templates ──────────────────────────────────────────────────

export const PM_TASK_TEMPLATES: Omit<PMTask, 'id' | 'eventCreated'>[] = [
  // Spring tasks
  { name: 'Roof inspection', category: 'roofing', startMonth: 3, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Exterior caulking & sealant check', category: 'exterior', startMonth: 4, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'HVAC cooling startup & filter change', category: 'hvac', startMonth: 4, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Gutter cleaning', category: 'roofing', startMonth: 4, frequency: 'semi_annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Landscape spring prep', category: 'common_areas', startMonth: 3, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Pest control treatment', category: 'pest_control', startMonth: 4, frequency: 'quarterly', vendorId: null, vendorName: '', notes: '' },
  // Summer tasks
  { name: 'Cooling system monitoring', category: 'hvac', startMonth: 6, frequency: 'monthly', vendorId: null, vendorName: '', notes: '' },
  { name: 'Exterior painting / touch-up', category: 'exterior', startMonth: 7, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Parking lot maintenance', category: 'common_areas', startMonth: 7, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  // Fall tasks
  { name: 'HVAC heating startup & filter change', category: 'hvac', startMonth: 10, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Boiler pre-season inspection', category: 'plumbing', startMonth: 9, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Gutter cleaning (fall)', category: 'roofing', startMonth: 10, frequency: 'semi_annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Weatherization check', category: 'exterior', startMonth: 10, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Landscape winterization', category: 'common_areas', startMonth: 11, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  // Winter tasks
  { name: 'Snow & ice removal plan activation', category: 'common_areas', startMonth: 12, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Pipe freeze prevention check', category: 'plumbing', startMonth: 12, frequency: 'annual', vendorId: null, vendorName: '', notes: '' },
  { name: 'Heating system monitoring', category: 'hvac', startMonth: 12, frequency: 'monthly', vendorId: null, vendorName: '', notes: '' },
  // Year-round tasks
  { name: 'Fire extinguisher visual check', category: 'fire_safety', startMonth: 1, frequency: 'monthly', vendorId: null, vendorName: '', notes: '' },
  { name: 'Common area cleaning & lighting', category: 'common_areas', startMonth: 1, frequency: 'monthly', vendorId: null, vendorName: '', notes: '' },
  { name: 'Elevator maintenance per contract', category: 'elevator', startMonth: 1, frequency: 'monthly', vendorId: null, vendorName: '', notes: '' },
  { name: 'Fire system annual inspection', category: 'fire_safety', startMonth: 1, frequency: 'annual', vendorId: null, vendorName: '', notes: 'Per 12-A DCMR via FEMS' },
  { name: 'Elevator annual inspection', category: 'elevator', startMonth: 1, frequency: 'annual', vendorId: null, vendorName: '', notes: 'DLCP Elevator Division per 12-H DCMR' },
  { name: 'Boiler annual inspection', category: 'plumbing', startMonth: 1, frequency: 'annual', vendorId: null, vendorName: '', notes: 'DLCP Boiler Division per 12-K DCMR' },
  { name: 'Backflow preventer testing', category: 'plumbing', startMonth: 1, frequency: 'annual', vendorId: null, vendorName: '', notes: 'DC Water per 21 DCMR \u00A7 5401' },
]
