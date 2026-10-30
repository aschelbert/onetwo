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
}

export const SETUP_STEPS: StepConfig[] = [
  {
    stepNumber: 1,
    title: 'Building Profile',
    description: 'Set up your building\'s basic information, address, and property details.',
    required: true,
    subTasks: [
      {
        id: 'bp_profile',
        label: 'Set up building profile',
        navigateTo: '/building',
        checkComplete: (ctx) => ctx.onboarding.buildingProfileComplete,
      },
      {
        id: 'bp_details',
        label: 'Add building details & amenities',
        navigateTo: '/building?tab=details',
        checkComplete: (ctx) => ctx.hasDetails,
      },
    ],
  },
  {
    stepNumber: 2,
    title: 'Legal & Compliance',
    description: 'Upload governing documents, add insurance policies, and register vendors.',
    required: false,
    subTasks: [
      {
        id: 'legal_docs',
        label: 'Upload bylaws & documents',
        navigateTo: '/building?tab=legal',
        checkComplete: (ctx) => ctx.onboarding.bylawsUploaded || ctx.docsCount >= 1,
      },
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
  {
    stepNumber: 3,
    title: 'Unit Roster',
    description: 'Add your units manually or import from a CSV file.',
    required: true,
    subTasks: [
      {
        id: 'units_add',
        label: 'Configure units & fees',
        navigateTo: '/building?tab=units',
        checkComplete: (ctx) => ctx.onboarding.unitsConfigured || ctx.unitCount >= 1,
      },
    ],
  },
  {
    stepNumber: 4,
    title: 'Financial Setup',
    description: 'Set up your chart of accounts, record year-to-date transactions, configure your budget, and define reserve items.',
    required: false,
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
        label: 'Enter year-to-date GL transactions',
        navigateTo: '/financial',
        financialTab: 'ledger',
        checkComplete: (ctx) => ctx.glEntryCount >= 1,
      },
      {
        id: 'fin_budget',
        label: 'Configure annual budget',
        navigateTo: '/financial',
        financialTab: 'budget',
        checkComplete: (ctx) => ctx.budgetCount >= 1,
      },
      {
        id: 'fin_reserves',
        label: 'Define reserve fund items',
        navigateTo: '/financial',
        financialTab: 'reserves',
        checkComplete: (ctx) => ctx.reserveCount >= 1,
      },
    ],
  },
  {
    stepNumber: 5,
    title: 'Invite Users',
    description: 'Invite board members, property managers, and residents to the platform.',
    required: false,
    subTasks: [
      {
        id: 'invite_team',
        label: 'Invite board members',
        navigateTo: '/building?tab=contacts',
        checkComplete: (ctx) => ctx.onboarding.firstUserInvited || ctx.boardCount >= 1,
      },
    ],
  },
  {
    stepNumber: 6,
    title: 'Review & Complete',
    description: 'Review your setup and complete onboarding.',
    required: true,
    subTasks: [
      {
        id: 'go_live',
        label: 'Review & complete setup',
        navigateTo: null,
        checkComplete: (ctx) => ctx.onboarding.goLive,
      },
    ],
  },
];
