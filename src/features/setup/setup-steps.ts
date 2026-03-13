// Sub-task configuration for the Setup Hub.
// Each sub-task has a label, navigation target, and a completion key
// derived from existing onboarding state + building/financial stores.

import type { OnboardingState } from '@/components/TenantProvider';

export interface SubTaskConfig {
  id: string;
  label: string;
  /** Route path to navigate to, or null for inline (Step 6) */
  navigateTo: string | null;
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
  budgetCount: number;
  reserveCount: number;
  userCount: number;
  hasRoledUsers: boolean;
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
    ],
  },
  {
    stepNumber: 2,
    title: 'Legal & Compliance',
    description: 'Upload governing documents and configure bylaws rules.',
    required: false,
    subTasks: [
      {
        id: 'legal_docs',
        label: 'Upload bylaws & documents',
        navigateTo: '/building?tab=legal',
        checkComplete: (ctx) => ctx.onboarding.bylawsUploaded || ctx.docsCount >= 1,
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
    description: 'Configure chart of accounts, budget categories, and reserve items.',
    required: false,
    subTasks: [
      {
        id: 'fin_setup',
        label: 'Set up financials',
        navigateTo: '/financial',
        checkComplete: (ctx) => ctx.onboarding.financialSetupDone || ctx.coaCount >= 1,
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
    title: 'Review & Go Live',
    description: 'Review your setup and launch your building\'s portal.',
    required: true,
    subTasks: [
      {
        id: 'go_live',
        label: 'Review & go live',
        navigateTo: null,
        checkComplete: (ctx) => ctx.onboarding.goLive,
      },
    ],
  },
];
