// ============================================================================
// setup-steps.ts
// Static sub-task configuration for each onboarding step.
// Each sub-task defines a label, navigation target, and a completion check key
// that maps to the completion engine in compute-setup-progress.ts.
// ============================================================================

import type { OnboardingStepId } from '@/types/onboarding'

export interface SubTaskConfig {
  id: string
  label: string
  /** Route suffix appended to /app/{tenancy}/, or null for inline (Step 8) */
  navigateTo: string | null
  /** Key used by computeSetupProgress to look up completion */
  completionKey: string
}

export interface StepConfig {
  stepId: OnboardingStepId
  stepNumber: number
  title: string
  description: string
  required: boolean
  /** Feature flag key — if set, step is hidden when feature is disabled */
  featureGate?: string
  subTasks: SubTaskConfig[]
}

export const SETUP_STEPS: StepConfig[] = [
  {
    stepId: 'building_profile',
    stepNumber: 1,
    title: 'Building Profile',
    description: 'Set up your building\'s basic information, address, and property details.',
    required: true,
    subTasks: [
      {
        id: 'bp_name_entity',
        label: 'Enter building name & entity type',
        navigateTo: 'the-building',
        completionKey: 'bp_name_entity',
      },
      {
        id: 'bp_address',
        label: 'Enter property address',
        navigateTo: 'the-building',
        completionKey: 'bp_address',
      },
      {
        id: 'bp_details',
        label: 'Set property details',
        navigateTo: 'the-building',
        completionKey: 'bp_details',
      },
      {
        id: 'bp_fiscal_year',
        label: 'Set fiscal year end',
        navigateTo: 'the-building',
        completionKey: 'bp_fiscal_year',
      },
    ],
  },
  {
    stepId: 'governance',
    stepNumber: 2,
    title: 'Governance',
    description: 'Add board members, management company info, and legal counsel.',
    required: false,
    subTasks: [
      {
        id: 'gov_board',
        label: 'Add board members',
        navigateTo: 'board-room',
        completionKey: 'gov_board',
      },
      {
        id: 'gov_mgmt',
        label: 'Enter management company info',
        navigateTo: 'the-building',
        completionKey: 'gov_mgmt',
      },
      {
        id: 'gov_legal',
        label: 'Add legal counsel',
        navigateTo: 'board-room',
        completionKey: 'gov_legal',
      },
    ],
  },
  {
    stepId: 'legal_compliance',
    stepNumber: 3,
    title: 'Legal & Compliance',
    description: 'Upload governing documents and configure bylaws rules.',
    required: false,
    subTasks: [
      {
        id: 'legal_docs',
        label: 'Upload governing documents',
        navigateTo: 'the-archives',
        completionKey: 'legal_docs',
      },
      {
        id: 'legal_bylaws',
        label: 'Configure bylaws rules',
        navigateTo: 'the-archives',
        completionKey: 'legal_bylaws',
      },
    ],
  },
  {
    stepId: 'unit_roster',
    stepNumber: 4,
    title: 'Unit Roster',
    description: 'Add your units manually or import from a CSV file.',
    required: true,
    subTasks: [
      {
        id: 'units_add',
        label: 'Add units (manual or CSV)',
        navigateTo: 'the-building',
        completionKey: 'units_add',
      },
      {
        id: 'units_voting',
        label: 'Verify voting percentages',
        navigateTo: 'the-building',
        completionKey: 'units_voting',
      },
    ],
  },
  {
    stepId: 'financial_setup',
    stepNumber: 5,
    title: 'Financial Setup',
    description: 'Configure chart of accounts, budget categories, and reserve items.',
    required: false,
    subTasks: [
      {
        id: 'fin_coa',
        label: 'Configure chart of accounts',
        navigateTo: 'fiscal-lens',
        completionKey: 'fin_coa',
      },
      {
        id: 'fin_budget',
        label: 'Set up budget categories',
        navigateTo: 'fiscal-lens',
        completionKey: 'fin_budget',
      },
      {
        id: 'fin_reserves',
        label: 'Define reserve items',
        navigateTo: 'fiscal-lens',
        completionKey: 'fin_reserves',
      },
    ],
  },
  {
    stepId: 'payment_processing',
    stepNumber: 6,
    title: 'Payment Setup',
    description: 'Connect Stripe to collect assessment payments from residents.',
    required: false,
    featureGate: 'payment_processing',
    subTasks: [
      {
        id: 'pay_connect',
        label: 'Connect Stripe account',
        navigateTo: 'account-mgmt',
        completionKey: 'pay_connect',
      },
      {
        id: 'pay_verify',
        label: 'Verify Stripe connection',
        navigateTo: 'account-mgmt',
        completionKey: 'pay_verify',
      },
    ],
  },
  {
    stepId: 'invite_users',
    stepNumber: 7,
    title: 'Invite Users',
    description: 'Invite board members, property managers, and residents to the platform.',
    required: false,
    subTasks: [
      {
        id: 'invite_team',
        label: 'Invite team members',
        navigateTo: 'community-room',
        completionKey: 'invite_team',
      },
      {
        id: 'invite_roles',
        label: 'Assign roles',
        navigateTo: 'community-room',
        completionKey: 'invite_roles',
      },
    ],
  },
  {
    stepId: 'review_go_live',
    stepNumber: 8,
    title: 'Review & Go Live',
    description: 'Review your setup and launch your building\'s portal.',
    required: true,
    subTasks: [
      {
        id: 'review_progress',
        label: 'Review setup progress',
        navigateTo: null,
        completionKey: 'review_progress',
      },
      {
        id: 'go_live',
        label: 'Go live',
        navigateTo: null,
        completionKey: 'go_live',
      },
    ],
  },
]
