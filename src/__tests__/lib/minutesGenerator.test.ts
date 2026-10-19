import { describe, it, expect } from 'vitest';
import { generateMinutes } from '@/features/meetings/minutesGenerator';
import type { Meeting, AgendaItem } from '@/store/useMeetingsStore';
import type { BoardMember } from '@/store/useBuildingStore';

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'mtg-test',
    title: 'February Board Meeting',
    type: 'BOARD',
    status: 'COMPLETED',
    date: '2026-02-20',
    time: '19:00',
    location: 'Community Room',
    virtualLink: '',
    agenda: [],
    notes: '',
    attendees: { board: ['Alice', 'Bob', 'Carol'], owners: [], guests: [] },
    minutes: '',
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
    calledToOrderAt: '2026-02-20T00:00:00.000Z',
    adjournedAt: '2026-02-20T01:00:00.000Z',
    quorumMet: true,
    boardAttendance: [
      { name: 'Alice', present: true, byVideo: false },
      { name: 'Bob', present: true, byVideo: false },
      { name: 'Carol', present: true, byVideo: false },
    ],
    ownersPresent: 5,
    ...overrides,
  };
}

function makeMembers(): BoardMember[] {
  return [
    { id: 'bm1', name: 'Alice', role: 'President', email: 'a@test.com', phone: '', term: '' },
    { id: 'bm2', name: 'Bob', role: 'Vice President', email: 'b@test.com', phone: '', term: '' },
    { id: 'bm3', name: 'Carol', role: 'Treasurer', email: 'c@test.com', phone: '', term: '' },
    { id: 'bm4', name: 'Dave', role: 'Secretary', email: 'd@test.com', phone: '', term: '' },
  ];
}

function makeItems(overrides: Partial<AgendaItem>[] = []): AgendaItem[] {
  const defaults: AgendaItem[] = [
    {
      id: 'ai1', position: 0, title: 'Call to Order',
      sourceType: 'standing', sourceId: null, requiresVote: false, locked: true,
      notes: '', outcome: 'noted',
    },
    {
      id: 'ai2', position: 1, title: 'Approve elevator contract',
      sourceType: 'manual', sourceId: null, requiresVote: true, locked: false,
      motionText: 'Approve the elevator maintenance contract for $12,000',
      movedBy: 'Alice', secondedBy: 'Bob',
      tally: { Alice: 'yes', Bob: 'yes', Carol: 'yes' },
      outcome: 'passed',
      notes: 'Discussion about vendor pricing.',
    },
    {
      id: 'ai3', position: 2, title: 'Adjourn',
      sourceType: 'standing', sourceId: null, requiresVote: false, locked: true,
      notes: '', outcome: 'noted',
    },
  ];
  return defaults.map((item, i) => ({ ...item, ...(overrides[i] || {}) }));
}

describe('generateMinutes', () => {
  it('passed vote renders "Passed 3 to 0"', () => {
    const result = generateMinutes({
      meeting: makeMeeting(),
      items: makeItems(),
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('Passed 3 to 0');
    expect(result.html).toContain('Passed 3 to 0');
  });

  it('tabled item renders "Tabled"', () => {
    const items = makeItems();
    items[1] = {
      ...items[1],
      outcome: 'tabled',
      tally: { Alice: 'yes', Bob: 'no', Carol: 'abstain' },
    };

    const result = generateMinutes({
      meeting: makeMeeting(),
      items,
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('Tabled');
    // Should NOT show a vote count for tabled items
    expect(result.text).not.toMatch(/Tabled \d+ to \d+/);
  });

  it('absent members listed', () => {
    const meeting = makeMeeting({
      boardAttendance: [
        { name: 'Alice', present: true, byVideo: false },
        { name: 'Bob', present: true, byVideo: false },
        { name: 'Carol', present: false, byVideo: false },
        { name: 'Dave', present: false, byVideo: false },
      ],
    });

    const result = generateMinutes({
      meeting,
      items: makeItems(),
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('Absent: Carol, Dave');
    expect(result.html).toContain('Carol, Dave');
  });

  it('includes meeting header with title, date, location', () => {
    const result = generateMinutes({
      meeting: makeMeeting(),
      items: makeItems(),
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('February Board Meeting');
    expect(result.text).toContain('Community Room');
    expect(result.html).toContain('<h1>February Board Meeting</h1>');
  });

  it('includes adjournment section', () => {
    const result = generateMinutes({
      meeting: makeMeeting(),
      items: makeItems(),
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('adjourned');
    expect(result.html).toContain('Adjournment');
  });

  it('includes conflict of interest declarations', () => {
    const items = makeItems();
    items[1] = {
      ...items[1],
      conflictsDeclared: ['Alice'],
    };

    const result = generateMinutes({
      meeting: makeMeeting(),
      items,
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('Conflicts declared: Alice');
  });

  it('shows by-video indicator for remote attendees', () => {
    const meeting = makeMeeting({
      boardAttendance: [
        { name: 'Alice', present: true, byVideo: true },
        { name: 'Bob', present: true, byVideo: false },
        { name: 'Carol', present: true, byVideo: false },
      ],
    });

    const result = generateMinutes({
      meeting,
      items: makeItems(),
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('Alice (video)');
  });

  it('shows owners present count', () => {
    const result = generateMinutes({
      meeting: makeMeeting({ ownersPresent: 12 }),
      items: makeItems(),
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('Owners present: 12');
  });

  it('failed vote renders "Failed X to Y"', () => {
    const items = makeItems();
    items[1] = {
      ...items[1],
      tally: { Alice: 'no', Bob: 'no', Carol: 'yes' },
      outcome: 'failed',
    };

    const result = generateMinutes({
      meeting: makeMeeting(),
      items,
      members: makeMembers(),
      settings: { quorumPct: 25 },
    });

    expect(result.text).toContain('Failed 1 to 2');
  });
});
