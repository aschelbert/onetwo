import { describe, it, expect } from 'vitest';
import { draftAgenda, type DraftAgendaArgs } from '@/features/meetings/agendaDraft';
import { DEFAULT_SETTINGS } from '@/lib/buildingSettings';
import type { Meeting } from '@/store/useMeetingsStore';
import type { SeasonState } from '@/lib/seasons';
import type { QueueItem } from '@/lib/queue';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeCompletedMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'mtg-prev',
    title: 'January Board Meeting',
    type: 'BOARD',
    status: 'COMPLETED',
    date: '2026-01-10',
    time: '19:00',
    location: 'Community Room',
    virtualLink: '',
    agenda: ['Item 1', 'Item 2'],
    notes: '',
    attendees: { board: [], owners: [], guests: [] },
    minutes: 'Some minutes',
    votes: [],
    linkedCaseIds: [],
    linkedVoteIds: [],
    documents: [],
    minutesApprovals: [],
    agendaItems: [],
    noticeSentAt: null,
    reminderScheduledFor: null,
    packetReady: false,
    conflictCheckStatus: [],
    ...overrides,
  };
}

function makeBudgetSeason(): SeasonState {
  return {
    seasonId: 'budget',
    label: 'Budget Season',
    startMonth: 10,
    endMonth: 12,
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    isCurrent: true,
    daysLeft: 60,
    completedCount: 0,
    totalCount: 2,
    milestones: [
      {
        id: 'ms-budget',
        seasonId: 'budget',
        title: 'Budget Draft',
        itemIds: [],
        flowId: 'budget',
        order: 1,
        dueRule: 'earliest_item',
        status: 'active',
        completedCount: 0,
        totalCount: 1,
        dueDate: '2026-11-30',
        ownerRole: 'treasurer',
      },
    ],
  };
}

function makeFilingSeason(): SeasonState {
  return {
    seasonId: 'filing',
    label: 'Filing Season',
    startMonth: 1,
    endMonth: 3,
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    isCurrent: true,
    daysLeft: 30,
    completedCount: 0,
    totalCount: 1,
    milestones: [],
  };
}

function makeArgs(overrides: Partial<DraftAgendaArgs> = {}): DraftAgendaArgs {
  return {
    kind: 'board',
    date: '2026-02-20',
    queue: [],
    openCases: [],
    approvalsNeedingVote: [],
    season: makeFilingSeason(),
    lastMeeting: undefined,
    settings: DEFAULT_SETTINGS,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('draftAgenda', () => {
  it('always includes Call to Order and Adjourn as standing items', () => {
    const items = draftAgenda(makeArgs());
    expect(items[0].title).toBe('Call to Order');
    expect(items[0].sourceType).toBe('standing');
    expect(items[0].locked).toBe(true);

    const last = items[items.length - 1];
    expect(last.title).toBe('Adjourn');
    expect(last.sourceType).toBe('standing');
    expect(last.locked).toBe(true);
  });

  it('includes Approve Minutes when a prior COMPLETED meeting exists', () => {
    const items = draftAgenda(makeArgs({ lastMeeting: makeCompletedMeeting() }));
    const minutesItem = items.find(i => i.title.startsWith('Approve Minutes'));
    expect(minutesItem).toBeDefined();
    expect(minutesItem!.requiresVote).toBe(true);
    expect(minutesItem!.sourceType).toBe('standing');
  });

  it('does NOT include Approve Minutes when no prior completed meeting', () => {
    const items = draftAgenda(makeArgs({ lastMeeting: undefined }));
    const minutesItem = items.find(i => i.title.startsWith('Approve Minutes'));
    expect(minutesItem).toBeUndefined();
  });

  it('includes Treasurer Report as standing', () => {
    const items = draftAgenda(makeArgs());
    const treasurerReport = items.find(i => i.title === 'Treasurer Report');
    expect(treasurerReport).toBeDefined();
    expect(treasurerReport!.sourceType).toBe('standing');
  });

  it('budget season produces a locked budget vote item', () => {
    const items = draftAgenda(makeArgs({ season: makeBudgetSeason() }));
    const budgetItem = items.find(i => i.title === 'Budget Adoption');
    expect(budgetItem).toBeDefined();
    expect(budgetItem!.requiresVote).toBe(true);
    expect(budgetItem!.locked).toBe(true);
    expect(budgetItem!.sourceType).toBe('season');
  });

  it('approval above spending limit produces a requires_vote item', () => {
    const items = draftAgenda(makeArgs({
      approvalsNeedingVote: [
        { id: 'apr-1', title: 'Elevator Repair', amount: 15000 },
      ],
      settings: { ...DEFAULT_SETTINGS, spendingLimit: 5000 },
    }));
    const approvalItem = items.find(i => i.title.includes('Elevator Repair'));
    expect(approvalItem).toBeDefined();
    expect(approvalItem!.requiresVote).toBe(true);
    expect(approvalItem!.sourceType).toBe('approval');
  });

  it('approval at or below spending limit is NOT added', () => {
    const items = draftAgenda(makeArgs({
      approvalsNeedingVote: [
        { id: 'apr-2', title: 'Small Repair', amount: 3000 },
      ],
      settings: { ...DEFAULT_SETTINGS, spendingLimit: 5000 },
    }));
    const approvalItem = items.find(i => i.title.includes('Small Repair'));
    expect(approvalItem).toBeUndefined();
  });

  it('open cases with next step are included', () => {
    const items = draftAgenda(makeArgs({
      openCases: [
        { id: 'case-1', title: 'Noise Complaint', nextStep: { title: 'Send warning letter' } },
      ],
    }));
    const caseItem = items.find(i => i.title.includes('Noise Complaint'));
    expect(caseItem).toBeDefined();
    expect(caseItem!.sourceType).toBe('case');
  });

  it('open cases without next step are NOT included', () => {
    const items = draftAgenda(makeArgs({
      openCases: [
        { id: 'case-2', title: 'Parking Issue' },
      ],
    }));
    const caseItem = items.find(i => i.title.includes('Parking Issue'));
    expect(caseItem).toBeUndefined();
  });

  it('runbook queue items are included', () => {
    const queueItem: QueueItem = {
      id: 'runbook-rb1',
      source: 'runbook',
      sourceId: 'rb1',
      title: 'File Annual Report',
      why: 'Due 2026-03-01',
      roleKey: 'secretary',
      roleState: 'mine',
      containerLine: 'Filing Season',
      dueDate: '2026-03-01',
      dueTone: 'soon',
      priority: 20,
      primaryAction: { label: 'Open', drawer: 'runbook', params: { itemId: 'rb1' } },
      secondaryActions: [],
    };

    const items = draftAgenda(makeArgs({ queue: [queueItem] }));
    const runbookItem = items.find(i => i.title === 'File Annual Report');
    expect(runbookItem).toBeDefined();
    expect(runbookItem!.sourceType).toBe('runbook');
  });

  it('annual meeting adds election and annual report standing items', () => {
    const items = draftAgenda(makeArgs({ kind: 'annual' }));
    const electionItem = items.find(i => i.title === 'Board Election');
    const reportItem = items.find(i => i.title === 'Annual Financial Report');
    expect(electionItem).toBeDefined();
    expect(electionItem!.requiresVote).toBe(true);
    expect(electionItem!.locked).toBe(true);
    expect(reportItem).toBeDefined();
    expect(reportItem!.locked).toBe(true);
  });

  it('board meeting does NOT add election or annual report items', () => {
    const items = draftAgenda(makeArgs({ kind: 'board' }));
    const electionItem = items.find(i => i.title === 'Board Election');
    const reportItem = items.find(i => i.title === 'Annual Financial Report');
    expect(electionItem).toBeUndefined();
    expect(reportItem).toBeUndefined();
  });

  it('no duplicate titles in output', () => {
    const queueItem: QueueItem = {
      id: 'runbook-rb-dup',
      source: 'runbook',
      sourceId: 'rb-dup',
      title: 'Treasurer Report',
      why: 'Due soon',
      roleKey: 'treasurer',
      roleState: 'mine',
      containerLine: 'Compliance',
      dueDate: '2026-02-25',
      dueTone: 'soon',
      priority: 20,
      primaryAction: { label: 'Open', drawer: 'runbook', params: { itemId: 'rb-dup' } },
      secondaryActions: [],
    };

    const items = draftAgenda(makeArgs({ queue: [queueItem] }));
    const titles = items.map(i => i.title.toLowerCase().trim());
    const uniqueTitles = new Set(titles);
    expect(titles.length).toBe(uniqueTitles.size);
  });

  it('positions are sequential from 0', () => {
    const items = draftAgenda(makeArgs({
      lastMeeting: makeCompletedMeeting(),
      season: makeBudgetSeason(),
      approvalsNeedingVote: [{ id: 'a1', title: 'Big Spend', amount: 10000 }],
    }));

    items.forEach((item, idx) => {
      expect(item.position).toBe(idx);
    });
  });
});
