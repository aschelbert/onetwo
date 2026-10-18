import { describe, it, expect } from 'vitest';
import { buildQueue, type QueueInputs, type QueueItem } from '@/lib/queue';
import { buildSeasons, type SeasonState } from '@/lib/seasons';
import { DEFAULT_SETTINGS, type BuildingSettings } from '@/lib/buildingSettings';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { RegulatoryFiling } from '@/store/useComplianceStore';

// ── Fixtures ────────────────────────────────────────────────────────────────

const today = new Date('2026-06-15');
const todayStr = '2026-06-15';

function makeItem(overrides: Partial<ComplianceItem> & { id: string }): ComplianceItem {
  return {
    task: 'Test task',
    role: 'President',
    freq: 'Annual',
    due: '2026-06-20',
    critical: false,
    tip: '',
    legalRef: 'Test',
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

function makeSeasons(items: ComplianceItem[], completions: Record<string, boolean>): SeasonState[] {
  return buildSeasons({
    items,
    completions,
    filings: [],
    settings: DEFAULT_SETTINGS,
    tenantStatus: 'active',
    today,
  });
}

function makeInputs(overrides: Partial<QueueInputs> = {}): QueueInputs {
  const items = overrides.items ?? [];
  const completions = overrides.completions ?? {};
  return {
    me: { roleKey: 'president', name: 'Alice' },
    seasons: makeSeasons(items, completions),
    items,
    completions,
    filings: [],
    cases: [],
    requests: [],
    votes: [],
    approvals: [],
    meetings: [],
    delinquency: [],
    settings: DEFAULT_SETTINGS,
    today,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildQueue', () => {
  describe('ordering', () => {
    it('overdue beats everything', () => {
      const overdueItem = makeItem({
        id: 'x1',
        task: 'Overdue task',
        due: '2026-06-01', // past due
        primaryRole: 'secretary',
        backstopRole: 'president',
      });
      const dueSoonItem = makeItem({
        id: 'x2',
        task: 'Due soon task',
        due: '2026-06-20',
        primaryRole: 'president',
      });

      const result = buildQueue(makeInputs({
        items: [overdueItem, dueSoonItem],
        completions: {},
      }));

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const overdueIdx = result.items.findIndex(i => i.sourceId === 'x1');
      const soonIdx = result.items.findIndex(i => i.sourceId === 'x2');
      expect(overdueIdx).toBeLessThan(soonIdx);
    });

    it('my-role beats backstop', () => {
      const myRoleItem = makeItem({
        id: 'x1',
        task: 'My role task',
        due: '2026-06-20',
        primaryRole: 'president',
      });
      const backstopItem = makeItem({
        id: 'x2',
        task: 'Backstop task',
        due: '2026-06-20',
        primaryRole: 'secretary',
        backstopRole: 'president',
      });

      const result = buildQueue(makeInputs({
        items: [backstopItem, myRoleItem],
        completions: {},
      }));

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const myIdx = result.items.findIndex(i => i.sourceId === 'x1');
      const backstopIdx = result.items.findIndex(i => i.sourceId === 'x2');
      expect(myIdx).toBeLessThan(backstopIdx);
    });

    it('earlier due date beats later', () => {
      const earlyItem = makeItem({
        id: 'x1',
        task: 'Earlier task',
        due: '2026-06-18',
        primaryRole: 'president',
      });
      const laterItem = makeItem({
        id: 'x2',
        task: 'Later task',
        due: '2026-06-25',
        primaryRole: 'president',
      });

      const result = buildQueue(makeInputs({
        items: [laterItem, earlyItem],
        completions: {},
      }));

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const earlyIdx = result.items.findIndex(i => i.sourceId === 'x1');
      const laterIdx = result.items.findIndex(i => i.sourceId === 'x2');
      expect(earlyIdx).toBeLessThan(laterIdx);
    });
  });

  describe('case steps', () => {
    it('a case next step appears once', () => {
      const caseData = {
        id: 'case-1',
        title: 'Noise Complaint',
        status: 'open',
        priority: 'medium',
        nextStep: {
          title: 'Send notice',
          index: 0,
          total: 3,
          dueDate: '2026-06-20',
          ownerRole: 'president' as const,
        },
      };

      const result = buildQueue(makeInputs({ cases: [caseData] }));
      const caseItems = result.items.filter(i => i.source === 'case_step' && i.sourceId === 'case-1');
      expect(caseItems).toHaveLength(1);
      expect(caseItems[0].title).toBe('Send notice');
      expect(caseItems[0].why).toContain('Step 1/3');
    });

    it('closed case is excluded', () => {
      const caseData = {
        id: 'case-2',
        title: 'Closed Case',
        status: 'closed',
        priority: 'low',
        nextStep: {
          title: 'Already done',
          index: 2,
          total: 3,
          dueDate: '2026-06-20',
          ownerRole: 'president' as const,
        },
      };

      const result = buildQueue(makeInputs({ cases: [caseData] }));
      const caseItems = result.items.filter(i => i.sourceId === 'case-2');
      expect(caseItems).toHaveLength(0);
    });
  });

  describe('offers', () => {
    it('approval above spending limit produces an offer', () => {
      const result = buildQueue(makeInputs({
        approvals: [{
          id: 'apr-1',
          title: 'Roof Repair',
          amount: 10000,
          status: 'pending',
          votes: [],
        }],
        settings: { ...DEFAULT_SETTINGS, spendingLimit: 5000 },
      }));

      const offers = result.items.filter(i => i.source === 'offer' && i.sourceId === 'apr-1');
      expect(offers).toHaveLength(1);
      expect(offers[0].title).toContain('needs a board vote');
      expect(offers[0].why).toContain('exceeds spending limit');
    });

    it('approval below spending limit does not produce an offer', () => {
      const result = buildQueue(makeInputs({
        approvals: [{
          id: 'apr-2',
          title: 'Small Repair',
          amount: 3000,
          status: 'pending',
          votes: [],
        }],
        settings: { ...DEFAULT_SETTINGS, spendingLimit: 5000 },
      }));

      const offers = result.items.filter(i => i.source === 'offer' && i.sourceId === 'apr-2');
      expect(offers).toHaveLength(0);
    });

    it('approval with linked vote does not produce an offer', () => {
      const result = buildQueue(makeInputs({
        approvals: [{
          id: 'apr-3',
          title: 'Roof Repair',
          amount: 10000,
          status: 'pending',
          votes: [],
        }],
        votes: [{
          id: 'v-1',
          title: 'Roof Repair vote',
          status: 'active',
          myVote: null,
        }],
        settings: { ...DEFAULT_SETTINGS, spendingLimit: 5000 },
      }));

      const offers = result.items.filter(i => i.source === 'offer' && i.sourceId === 'apr-3');
      expect(offers).toHaveLength(0);
    });

    it('61-day delinquency without open collections case produces an offer', () => {
      const result = buildQueue(makeInputs({
        delinquency: [{
          unit: '302',
          balance: 5000,
          daysPastDue: 61,
        }],
        cases: [],
      }));

      const offers = result.items.filter(i => i.source === 'offer' && i.sourceId === '302');
      expect(offers).toHaveLength(1);
      expect(offers[0].title).toContain('Start collections');
      expect(offers[0].title).toContain('302');
    });

    it('61-day delinquency with open collections case produces no offer', () => {
      const result = buildQueue(makeInputs({
        delinquency: [{
          unit: '302',
          balance: 5000,
          daysPastDue: 61,
        }],
        cases: [{
          id: 'case-coll',
          title: 'Collections - Unit 302',
          status: 'open',
          priority: 'high',
        }],
      }));

      const offers = result.items.filter(i => i.source === 'offer' && i.sourceId === '302');
      expect(offers).toHaveLength(0);
    });

    it('59-day delinquency does not produce an offer', () => {
      const result = buildQueue(makeInputs({
        delinquency: [{
          unit: '303',
          balance: 3000,
          daysPastDue: 59,
        }],
      }));

      const offers = result.items.filter(i => i.source === 'offer' && i.sourceId === '303');
      expect(offers).toHaveLength(0);
    });
  });

  describe('votes', () => {
    it('vote where I have not voted appears', () => {
      const result = buildQueue(makeInputs({
        votes: [{
          id: 'v-1',
          title: 'Budget vote',
          status: 'active',
          myVote: null,
          deadline: '2026-06-25',
        }],
      }));

      const voteItems = result.items.filter(i => i.source === 'vote');
      expect(voteItems).toHaveLength(1);
      expect(voteItems[0].why).toBe('Your vote is needed');
    });

    it('vote where I already voted is excluded', () => {
      const result = buildQueue(makeInputs({
        votes: [{
          id: 'v-2',
          title: 'Budget vote',
          status: 'active',
          myVote: 'yes',
        }],
      }));

      const voteItems = result.items.filter(i => i.source === 'vote' && i.sourceId === 'v-2');
      expect(voteItems).toHaveLength(0);
    });
  });

  describe('meetings', () => {
    it('meeting within 14 days appears', () => {
      const result = buildQueue(makeInputs({
        meetings: [{
          id: 'mtg-1',
          title: 'Board Meeting',
          date: '2026-06-25',
          status: 'SCHEDULED',
        }],
      }));

      const meetingItems = result.items.filter(i => i.source === 'meeting');
      expect(meetingItems).toHaveLength(1);
    });

    it('meeting beyond 14 days is excluded', () => {
      const result = buildQueue(makeInputs({
        meetings: [{
          id: 'mtg-2',
          title: 'Board Meeting',
          date: '2026-07-15',
          status: 'SCHEDULED',
        }],
      }));

      const meetingItems = result.items.filter(i => i.source === 'meeting' && i.sourceId === 'mtg-2');
      expect(meetingItems).toHaveLength(0);
    });

    it('completed meeting is excluded', () => {
      const result = buildQueue(makeInputs({
        meetings: [{
          id: 'mtg-3',
          title: 'Board Meeting',
          date: '2026-06-20',
          status: 'COMPLETED',
        }],
      }));

      const meetingItems = result.items.filter(i => i.source === 'meeting' && i.sourceId === 'mtg-3');
      expect(meetingItems).toHaveLength(0);
    });
  });

  describe('requests', () => {
    it('SUBMITTED request appears', () => {
      const result = buildQueue(makeInputs({
        requests: [{
          id: 'req-1',
          title: 'Fix broken window',
          status: 'SUBMITTED',
          submittedAt: '2026-06-10',
          unit: '401',
        }],
      }));

      const reqItems = result.items.filter(i => i.source === 'request');
      expect(reqItems).toHaveLength(1);
      expect(reqItems[0].why).toContain('401');
    });

    it('non-SUBMITTED request is excluded', () => {
      const result = buildQueue(makeInputs({
        requests: [{
          id: 'req-2',
          title: 'Fix broken window',
          status: 'IN_PROGRESS',
          submittedAt: '2026-06-10',
        }],
      }));

      const reqItems = result.items.filter(i => i.source === 'request' && i.sourceId === 'req-2');
      expect(reqItems).toHaveLength(0);
    });
  });

  describe('filings', () => {
    it('overdue filing appears', () => {
      const filing: RegulatoryFiling = {
        id: 'rf-test',
        name: 'Overdue Filing',
        category: 'tax',
        dueDate: '2026-06-01',
        status: 'pending',
        filedDate: null,
        confirmationNum: '',
        notes: '',
        responsible: 'Treasurer',
        recurrence: 'annual',
        legalRef: 'Test',
        attachments: [],
      };

      const result = buildQueue(makeInputs({ filings: [filing] }));
      const filingItems = result.items.filter(i => i.source === 'filing');
      expect(filingItems).toHaveLength(1);
      expect(filingItems[0].dueTone).toBe('overdue');
    });

    it('filed filing is excluded', () => {
      const filing: RegulatoryFiling = {
        id: 'rf-test2',
        name: 'Filed Filing',
        category: 'tax',
        dueDate: '2026-06-01',
        status: 'filed',
        filedDate: '2026-05-15',
        confirmationNum: 'ABC',
        notes: '',
        responsible: 'Treasurer',
        recurrence: 'annual',
        legalRef: 'Test',
        attachments: [],
      };

      const result = buildQueue(makeInputs({ filings: [filing] }));
      const filingItems = result.items.filter(i => i.source === 'filing' && i.sourceId === 'rf-test2');
      expect(filingItems).toHaveLength(0);
    });
  });

  describe('runbook items', () => {
    it('completed items are excluded', () => {
      const item = makeItem({ id: 'done-1', due: '2026-06-20' });
      const result = buildQueue(makeInputs({
        items: [item],
        completions: { 'done-1': true },
      }));

      const runbookItems = result.items.filter(i => i.sourceId === 'done-1');
      expect(runbookItems).toHaveLength(0);
    });

    it('critical item due within 45 days appears', () => {
      const item = makeItem({
        id: 'crit-1',
        due: '2026-07-20', // 35 days from June 15
        critical: true,
        primaryRole: 'president',
      });

      const result = buildQueue(makeInputs({
        items: [item],
        completions: {},
      }));

      const critItems = result.items.filter(i => i.sourceId === 'crit-1');
      expect(critItems).toHaveLength(1);
    });

    it('non-critical item beyond horizon is excluded', () => {
      const item = makeItem({
        id: 'far-1',
        due: '2026-07-20',
        critical: false,
      });

      const result = buildQueue(makeInputs({
        items: [item],
        completions: {},
      }));

      const farItems = result.items.filter(i => i.sourceId === 'far-1');
      expect(farItems).toHaveLength(0);
    });

    it('items with non-date due strings are excluded', () => {
      const item = makeItem({
        id: 'ongoing-1',
        due: 'Monthly',
      });

      const result = buildQueue(makeInputs({
        items: [item],
        completions: {},
      }));

      const ongoingItems = result.items.filter(i => i.sourceId === 'ongoing-1');
      expect(ongoingItems).toHaveLength(0);
    });
  });

  describe('approvals', () => {
    it('pending approval where I have not voted appears', () => {
      const result = buildQueue(makeInputs({
        approvals: [{
          id: 'apr-x',
          title: 'Office Supplies',
          amount: 500,
          status: 'pending',
          votes: [],
        }],
      }));

      const approvalItems = result.items.filter(i => i.source === 'approval');
      expect(approvalItems).toHaveLength(1);
    });

    it('approval where I already voted is excluded', () => {
      const result = buildQueue(makeInputs({
        approvals: [{
          id: 'apr-y',
          title: 'Office Supplies',
          amount: 500,
          status: 'pending',
          votes: [{ name: 'Alice' }],
        }],
      }));

      const approvalItems = result.items.filter(i => i.source === 'approval' && i.sourceId === 'apr-y');
      expect(approvalItems).toHaveLength(0);
    });
  });

  describe('cap and total', () => {
    it('returns total and caps items at 20', () => {
      // Create 25 items that are all due soon
      const items: ComplianceItem[] = [];
      for (let n = 0; n < 25; n++) {
        items.push(makeItem({
          id: `bulk-${n}`,
          task: `Task ${n}`,
          due: '2026-06-20',
          primaryRole: 'president',
        }));
      }

      const result = buildQueue(makeInputs({
        items,
        completions: {},
      }));

      expect(result.items.length).toBeLessThanOrEqual(20);
      expect(result.total).toBe(25);
    });
  });

  describe('drawer params', () => {
    it('runbook item has correct drawer', () => {
      const item = makeItem({ id: 'x1', due: '2026-06-20' });
      const result = buildQueue(makeInputs({
        items: [item],
        completions: {},
      }));

      const qi = result.items.find(i => i.sourceId === 'x1');
      expect(qi).toBeDefined();
      expect(qi!.primaryAction.drawer).toBe('runbook');
      expect(qi!.primaryAction.params.itemId).toBe('x1');
    });

    it('case step has correct drawer', () => {
      const result = buildQueue(makeInputs({
        cases: [{
          id: 'c-1',
          title: 'Test Case',
          status: 'open',
          priority: 'medium',
          nextStep: {
            title: 'Do something',
            index: 2,
            total: 5,
            dueDate: '2026-06-20',
            ownerRole: 'president',
          },
        }],
      }));

      const qi = result.items.find(i => i.sourceId === 'c-1');
      expect(qi).toBeDefined();
      expect(qi!.primaryAction.drawer).toBe('case_step');
      expect(qi!.primaryAction.params.caseId).toBe('c-1');
      expect(qi!.primaryAction.params.stepIndex).toBe('2');
    });

    it('collections offer has correct drawer', () => {
      const result = buildQueue(makeInputs({
        delinquency: [{ unit: '501', balance: 8000, daysPastDue: 90 }],
      }));

      const qi = result.items.find(i => i.source === 'offer' && i.sourceId === '501');
      expect(qi).toBeDefined();
      expect(qi!.primaryAction.drawer).toBe('collections_offer');
      expect(qi!.primaryAction.params.unit).toBe('501');
    });
  });
});
