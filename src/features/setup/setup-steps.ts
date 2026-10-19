// Sub-task configuration for the Setup Hub.
// Each sub-task has a label, navigation target, and a completion check
// derived from existing onboarding state + building/financial stores.

import type { OnboardingState } from '@/components/TenantProvider';

export interface SubTaskConfig {
  id: string;
  label: string;
  /** Route path to navigate to, or null for inline (Step 6) */
  navigateTo: string | null;
  /** If set, call useFinancialStore.setActiveTab(this) before navigating */
  financialTab?: string;
  /** Function that checks completion from available data */
  checkComplete: (ctx: CompletionContext) => boolean;
}

export interface StepConfig {
  stepNumber: number;
  title: string;
  description: string;
  required: boolean;
  subTasks: SubTaskConfig[];
}

export interface CompletionContext {
  onboarding: OnboardingState;
  boardCount: number;
  hasManagement: boolean;
  counselCount: number;
  docsCount: number;
  hasBylawsRules: boolean;
  unitCount: number;
  hasVotingPct: boolean;
  coaCount: number;
  glEntryCount: number;
  budgetCount: number;
  reserveCount: number;
  userCount: number;
  hasRoledUsers: boolean;
  hasDetails: boolean;
  insuranceCount: number;
  vendorCount: number;
  allRequiredComplete?: boolean;
  // Profile completion (deferred from simplified signup)
  hasPhone: boolean;
  hasBoardTitle: boolean;
  hasFullAddress: boolean;
}

export const SETUP_STEPS: StepConfig[] = [
  {
    stepNumber: 1,
    title: 'Units and owners',
    description: 'Add your units with owner names and contact info.',
    required: true,
    subTasks: [
      {
        id: 'units_add',
        label: 'Configure units & owners',
        navigateTo: '/building?tab=units',
        checkComplete: (ctx) => ctx.onboarding.unitsConfigured || ctx.unitCount >= 1,
      },
    ],
  },
  {
    stepNumber: 2,
    title: 'Bylaws facts and board roles',
    description: 'Upload bylaws and assign board seats.',
    required: true,
    subTasks: [
      {
        id: 'bylaws_upload',
        label: 'Upload bylaws & documents',
        navigateTo: '/building?tab=legal',
        checkComplete: (ctx) => ctx.onboarding.bylawsUploaded || ctx.docsCount >= 1,
      },
      {
        id: 'board_roles',
        label: 'Assign board seats',
        navigateTo: '/boardroom?tab=roles',
        checkComplete: (ctx) => ctx.boardCount >= 2,
      },
    ],
  },
  {
    stepNumber: 3,
    title: 'Bank accounts and opening balances',
    description: 'Add your bank accounts with opening balances.',
    required: true,
    subTasks: [
      {
        id: 'fin_coa',
        label: 'Set up chart of accounts',
        navigateTo: '/financial',
        financialTab: 'coa',
        checkComplete: (ctx) => ctx.coaCount >= 1,
      },
      {
        id: 'fin_gl',
        label: 'Enter opening balances',
        navigateTo: '/financial',
        financialTab: 'ledger',
        checkComplete: (ctx) => ctx.glEntryCount >= 1,
      },
    ],
  },
  {
    stepNumber: 4,
    title: 'Insurance, documents, vendors',
    description: 'Add insurance policies, key documents, and vendor contacts.',
    required: false,
    subTasks: [
      {
        id: 'legal_insurance',
        label: 'Add insurance policies',
        navigateTo: '/building?tab=insurance',
        checkComplete: (ctx) => ctx.insuranceCount >= 1,
      },
      {
        id: 'legal_vendors',
        label: 'Add vendors & service providers',
        navigateTo: '/building?tab=vendors',
        checkComplete: (ctx) => ctx.vendorCount >= 1,
      },
    ],
  },
];
