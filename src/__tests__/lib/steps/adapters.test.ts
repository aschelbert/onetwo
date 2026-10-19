import { describe, it, expect } from 'vitest';
import { fromRunbookItem, fromCase, fromSetupStep } from '@/lib/steps/adapters';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { CaseTrackerCase } from '@/types/issues';
import type { BuildingMember } from '@/types/auth';
import type { StepConfig, CompletionContext } from '@/features/setup/setup-steps';

// ── Fixtures ────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ComplianceItem> & { id: string }): ComplianceItem {
  return {
    task: 'Test runbook task',
    role: 'President',
    freq: 'Annual',
    due: '2026-06-20',
    critical: false,
    tip: 'A helpful tip',
    legalRef: 'DC Code 29-1135.02',
    whyItMatters: '',
    consequence: '',
    howTo: [],
    fiduciaryDuty: 'care',
    scope: 'governance',
    primaryRole: 'president',
    backstopRole: undefined,
    ...overrides,
  };
}

function makeCase(overrides: Partial<CaseTrackerCase> = {}): CaseTrackerCase {
  return {
    id: 'case-1',
    catId: 'financial',
    sitId: 'annual-budgeting',
    title: 'Annual Budget 2026',
    unit: '',
    owner: 'Board',
    approach: 'pre',
    status: 'open',
    priority: 'medium',
    created: '2026-01-15',
    notes: '',
    steps: [
      { id: 's0', s: 'Review current year financials', done: false, doneDate: null, userNotes: '', t: '90 days before', d: 'Bylaws' },
      { id: 's1', s: 'Review reserve study', done: true, doneDate: '2026-02-01', userNotes: 'Done' },
      { id: 's2', s: 'Draft proposed budget', done: false, doneDate: null, userNotes: '' },
    ],
    linkedWOs: [],
    linkedLetterIds: [],
    linkedInvoiceIds: [],
    linkedMeetingIds: [],
    attachments: [],
    boardVotes: null,
    additionalApproaches: [],
    comms: [],
    assignedTo: 'Alice',
    assignedRole: 'treasurer',
    dueDate: '2026-06-30',
    ...overrides,
  };
}

const members: BuildingMember[] = [
  {
    id: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    phone: '555-0001',
    role: 'BOARD_MEMBER',
    unit: '101',
    status: 'active',
    joined: '2025-01-01',
    boardTitle: 'Treasurer',
    roleKey: 'treasurer',
  },
];

// ── fromRunbookItem ──────────────────────────────────────────────────────

describe('fromRunbookItem', () => {
  it('creates a step from a runbook item that is not completed', () => {
    const item = makeItem({ id: 'g1' });
    const step = fromRunbookItem(item, false);

    expect(step.id).toBe('milestone:g1:0');
    expect(step.containerType).toBe('milestone');
    expect(step.actionType).toBe('runbook_outcome');
    expect(step.status).toBe('open');
    expect(step.title).toBe('Test runbook task');
    expect(step.dueDate).toBe('2026-06-20');
    expect(step.legalRef).toBe('DC Code 29-1135.02');
    expect(step.detail).toBe('A helpful tip');
    expect(step.drawer.id).toBe('runbook');
    expect(step.drawer.params.itemId).toBe('g1');
  });

  it('marks step done when completion is true', () => {
    const item = makeItem({ id: 'g1' });
    const step = fromRunbookItem(item, true);
    expect(step.status).toBe('done');
  });

  it('uses milestone context when provided', () => {
    const item = makeItem({ id: 'g1' });
    const step = fromRunbookItem(item, false, { milestoneId: 'filing-governance-reset' });
    expect(step.containerId).toBe('filing-governance-reset');
    expect(step.id).toBe('milestone:filing-governance-reset:0');
  });

  it('handles non-fixed date as dueRule', () => {
    const item = makeItem({ id: 'r1', due: 'Per transfer' });
    const step = fromRunbookItem(item, false);
    expect(step.dueDate).toBeNull();
    expect(step.dueRule).toBe('Per transfer');
  });
});

// ── fromCase ──────────────────────────────────────────────────────────────

describe('fromCase', () => {
  it('creates one Step per case step', () => {
    const c = makeCase();
    const steps = fromCase(c, undefined, members);

    expect(steps).toHaveLength(3);
    expect(steps[0].id).toBe('case:case-1:0');
    expect(steps[0].containerType).toBe('case');
    expect(steps[0].actionType).toBe('case_step');
    expect(steps[0].title).toBe('Review current year financials');
    expect(steps[0].index).toBe(0);
    expect(steps[0].total).toBe(3);
    expect(steps[0].status).toBe('open');
    expect(steps[0].ownerRole).toBe('treasurer');
    expect(steps[0].ownerName).toBe('Alice');
    expect(steps[0].dueDate).toBe('2026-06-30');
    expect(steps[0].drawer.id).toBe('case_step');
    expect(steps[0].drawer.params.caseId).toBe('case-1');
  });

  it('marks completed steps as done', () => {
    const c = makeCase();
    const steps = fromCase(c, undefined, members);
    expect(steps[1].status).toBe('done');
    expect(steps[1].completedAt).toBe('2026-02-01');
  });

  it('returns empty array for case with no steps', () => {
    const c = makeCase({ steps: null });
    const steps = fromCase(c, undefined, members);
    expect(steps).toHaveLength(0);
  });

  it('identifies proof requirements from checks', () => {
    const c = makeCase({
      steps: [
        {
          id: 's0',
          s: 'Step with checks',
          done: false,
          doneDate: null,
          userNotes: '',
          checks: [{ id: 'ck1', label: 'Check 1', checked: false, checkedDate: null }],
        },
      ],
    });
    const steps = fromCase(c, undefined, []);
    expect(steps[0].proofRequired).toBe(true);
  });
});

// ── fromSetupStep ─────────────────────────────────────────────────────────

describe('fromSetupStep', () => {
  const stepConfig: StepConfig = {
    stepNumber: 1,
    title: 'Building Profile',
    description: 'Set up building info.',
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
        label: 'Add building details',
        navigateTo: '/building?tab=details',
        checkComplete: (ctx) => ctx.hasDetails,
      },
    ],
  };

  const baseCtx: CompletionContext = {
    onboarding: {
      buildingProfileComplete: true,
      unitsConfigured: false,
      firstUserInvited: false,
      bylawsUploaded: false,
      goLive: false,
    } as CompletionContext['onboarding'],
    boardCount: 0,
    hasManagement: false,
    counselCount: 0,
    docsCount: 0,
    hasBylawsRules: false,
    unitCount: 0,
    hasVotingPct: false,
    coaCount: 0,
    glEntryCount: 0,
    budgetCount: 0,
    reserveCount: 0,
    userCount: 0,
    hasRoledUsers: false,
    hasDetails: false,
    insuranceCount: 0,
    vendorCount: 0,
    hasPhone: false,
    hasBoardTitle: false,
    hasFullAddress: false,
  };

  it('creates one step per sub-task', () => {
    const steps = fromSetupStep(stepConfig, baseCtx);
    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe('setup:1:0');
    expect(steps[0].containerType).toBe('setup');
    expect(steps[0].actionType).toBe('setup_task');
    expect(steps[0].title).toBe('Set up building profile');
    expect(steps[0].total).toBe(2);
  });

  it('respects completion context', () => {
    const steps = fromSetupStep(stepConfig, baseCtx);
    // buildingProfileComplete is true
    expect(steps[0].status).toBe('done');
    // hasDetails is false
    expect(steps[1].status).toBe('open');
  });

  it('includes navigation params', () => {
    const steps = fromSetupStep(stepConfig, baseCtx);
    expect(steps[0].drawer.params.navigateTo).toBe('/building');
    expect(steps[0].drawer.params.subTaskId).toBe('bp_profile');
  });
});
