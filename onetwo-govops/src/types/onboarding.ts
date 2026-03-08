// ============================================================================
// onboarding.ts
// TypeScript types for the Onboarding Wizard
// ============================================================================

// ─── Checklist ───────────────────────────────────────────────────────────────

export interface OnboardingChecklist {
  id: string
  tenancy_id: string
  account_created: boolean
  building_profile_complete: boolean
  governance_configured: boolean
  bylaws_uploaded: boolean
  units_configured: boolean
  financial_setup_done: boolean
  payment_processing_configured: boolean
  first_user_invited: boolean
  go_live: boolean
  created_at: string
  updated_at: string
}

// ─── Step definition ─────────────────────────────────────────────────────────

export type OnboardingStepId =
  | 'building_profile'
  | 'governance'
  | 'legal_compliance'
  | 'unit_roster'
  | 'financial_setup'
  | 'payment_processing'
  | 'invite_users'
  | 'review_go_live'

export type ChecklistField = keyof Pick<
  OnboardingChecklist,
  | 'building_profile_complete'
  | 'governance_configured'
  | 'bylaws_uploaded'
  | 'units_configured'
  | 'financial_setup_done'
  | 'payment_processing_configured'
  | 'first_user_invited'
  | 'go_live'
>

export interface OnboardingStep {
  id: OnboardingStepId
  number: number
  title: string
  description: string
  required: boolean
  checklistField: ChecklistField
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'building_profile',
    number: 1,
    title: 'Building Profile',
    description: 'Set up your building\'s basic information, address, and property details.',
    required: true,
    checklistField: 'building_profile_complete',
  },
  {
    id: 'governance',
    number: 2,
    title: 'Governance',
    description: 'Add board members, management company info, and legal counsel.',
    required: false,
    checklistField: 'governance_configured',
  },
  {
    id: 'legal_compliance',
    number: 3,
    title: 'Legal & Compliance',
    description: 'Upload governing documents and configure bylaws rules.',
    required: false,
    checklistField: 'bylaws_uploaded',
  },
  {
    id: 'unit_roster',
    number: 4,
    title: 'Unit Roster',
    description: 'Add your units manually or import from a CSV file.',
    required: true,
    checklistField: 'units_configured',
  },
  {
    id: 'financial_setup',
    number: 5,
    title: 'Financial Setup',
    description: 'Configure chart of accounts, budget categories, and reserve items.',
    required: false,
    checklistField: 'financial_setup_done',
  },
  {
    id: 'payment_processing',
    number: 6,
    title: 'Payment Setup',
    description: 'Connect Stripe to collect assessment payments from residents.',
    required: false,
    checklistField: 'payment_processing_configured',
  },
  {
    id: 'invite_users',
    number: 7,
    title: 'Invite Users',
    description: 'Invite board members, property managers, and residents to the platform.',
    required: false,
    checklistField: 'first_user_invited',
  },
  {
    id: 'review_go_live',
    number: 8,
    title: 'Review & Go Live',
    description: 'Review your setup and launch your building\'s portal.',
    required: true,
    checklistField: 'go_live',
  },
]

// ─── Step 1: Building Profile ────────────────────────────────────────────────

export interface BuildingProfileData {
  name: string
  address: string
  city: string
  state: string
  zip: string
  year_built: string
  total_units: number | null
  entity_type: string
  fiscal_year_end_month: number
}

// ─── Step 2: Governance ──────────────────────────────────────────────────────

export interface BoardMember {
  id?: string
  name: string
  role: string
  email: string
  phone: string
  term_start: string | null
  term_end: string | null
}

export interface ManagementInfo {
  company_name: string
  contact_name: string
  title: string
  email: string
  phone: string
  emergency_phone: string
  office_hours: string
  after_hours_info: string
}

export interface LegalCounselData {
  id?: string
  firm_name: string
  attorney_name: string
  email: string
  phone: string
  specialty: string
}

// ─── Step 3: Legal & Compliance ──────────────────────────────────────────────

export interface LegalDocument {
  id: string
  tenancy_id: string
  name: string
  doc_type: string
  version: string | null
  file_size: number | null
  status: string
  storage_path: string | null
  bylaws_rules: BylawsRules | null
  created_at: string
}

export interface BylawsRules {
  quorum_percentage: number | null
  amendment_threshold: number | null
  annual_meeting_month: number | null
  assessment_increase_cap: number | null
}

// ─── Step 4: Unit Roster ─────────────────────────────────────────────────────

export interface UnitData {
  id?: string
  number: string
  owner_name: string
  email: string
  phone: string
  monthly_fee: number | null
  voting_pct: number | null
  status: string
  balance: number | null
  move_in_date: string | null
  sqft: number | null
  bedrooms: number | null
  parking: string
}

export interface UnitImportResult {
  inserted: number
  errors: { row: number; message: string }[]
}

// ─── Step 5: Financial Setup ─────────────────────────────────────────────────

export interface ChartOfAccountEntry {
  id?: string
  account_number: string
  name: string
  account_type: string
  sub_type: string | null
  parent_id: string | null
}

export interface BudgetCategory {
  id?: string
  name: string
  budgeted_amount: number
}

export interface ReserveItem {
  id?: string
  name: string
  estimated_cost: number
  current_funding: number
  useful_life: number | null
  years_remaining: number | null
  is_contingency: boolean
}

// ─── Step 6: Payment Processing ──────────────────────────────────────────────

export interface StripeConnectStatus {
  stripe_connect_id: string | null
  stripe_onboarding_complete: boolean
  charges_enabled?: boolean
  details_submitted?: boolean
}

// ─── Step 7: Invite Users ────────────────────────────────────────────────────

export interface InvitePayload {
  email: string
  role_id: string
  display_name: string
}

export interface ExistingUser {
  id: string
  email: string
  display_name: string
  role_id: string
  role_name: string
  status: string
}

// ─── Tenant Features ─────────────────────────────────────────────────────────

export interface TenantFeatures {
  payment_processing: boolean
  document_management: boolean
  maintenance_requests: boolean
  violation_tracking: boolean
  meeting_management: boolean
  financial_reporting: boolean
  resident_portal: boolean
  communication_hub: boolean
  voting_elections: boolean
  amenity_booking: boolean
}
