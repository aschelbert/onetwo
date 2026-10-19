import { describe, it, expect } from 'vitest';
import { buildIcs, type CalendarFiling } from '@/lib/calendarFeed';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { Meeting } from '@/store/useMeetingsStore';
import { DEFAULT_SETTINGS } from '@/lib/buildingSettings';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const item: ComplianceItem = {
  id: 'ci1',
  task: 'File annual report',
  role: 'President',
  freq: 'Annual',
  due: '2026-04-01',
  critical: true,
  tip: 'File on time',
  legalRef: 'DC Code 29-102',
  whyItMatters: 'Legal requirement',
  consequence: 'Late filing penalties',
  howTo: ['Step 1'],
  fiduciaryDuty: 'obedience',
  scope: 'governance',
  primaryRole: 'president',
};

const recurringItem: ComplianceItem = {
  id: 'ci2',
  task: 'Monthly financial review',
  role: 'Treasurer',
  freq: 'Monthly',
  due: 'Monthly',
  critical: false,
  tip: 'Review each month',
  legalRef: 'Bylaws Art V',
  whyItMatters: 'Fiscal oversight',
  consequence: 'Mismanagement',
  howTo: ['Review'],
  fiduciaryDuty: 'care',
  scope: 'governance',
  primaryRole: 'treasurer',
};

const filing: CalendarFiling = {
  id: 'rf1',
  name: 'DC Biennial Report',
  dueDate: '2026-04-15',
  responsible: 'President',
  category: 'government',
};

const meeting: Meeting = {
  id: 'mtg1',
  title: 'February Board Meeting',
  type: 'BOARD',
  status: 'SCHEDULED',
  date: '2026-02-20',
  time: '19:00',
  location: 'Community Room',
  virtualLink: '',
  agenda: ['Review financials', 'Elevator proposal'],
  notes: '',
  attendees: { board: [], owners: [], guests: [] },
  minutes: '',
  votes: [],
  linkedCaseIds: [],
  linkedVoteIds: [],
  documents: [],
  minutesApprovals: [],
};

const cancelledMeeting: Meeting = {
  ...meeting,
  id: 'mtg-c',
  status: 'CANCELLED',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildIcs', () => {
  it('produces valid ICS header and footer', () => {
    const ics = buildIcs([], [], [], null, DEFAULT_SETTINGS);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//ONE two//Governance Calendar//EN');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('produces one VEVENT per obligation with fixed due date', () => {
    const ics = buildIcs([item], [], [], null, DEFAULT_SETTINGS);
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(1);
  });

  it('formats DTSTART as YYYYMMDD', () => {
    const ics = buildIcs([item], [], [], null, DEFAULT_SETTINGS);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260401');
  });

  it('excludes recurring items without fixed dates', () => {
    const ics = buildIcs([recurringItem], [], [], null, DEFAULT_SETTINGS);
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(0);
  });

  it('includes filings as VEVENTs', () => {
    const ics = buildIcs([], [filing], [], null, DEFAULT_SETTINGS);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260415');
    expect(ics).toContain('DC Biennial Report');
  });

  it('includes meetings as VEVENTs', () => {
    const ics = buildIcs([], [], [meeting], null, DEFAULT_SETTINGS);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260220');
    expect(ics).toContain('February Board Meeting');
    expect(ics).toContain('Community Room');
  });

  it('excludes cancelled meetings', () => {
    const ics = buildIcs([], [], [cancelledMeeting], null, DEFAULT_SETTINGS);
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(0);
  });

  it('filters items by role when specified', () => {
    const ics = buildIcs([item], [filing], [], 'treasurer', DEFAULT_SETTINGS);
    // item has primaryRole=president, filing has responsible=President
    // Neither matches treasurer
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(0);
  });

  it('includes items matching role', () => {
    const ics = buildIcs([item], [filing], [], 'president', DEFAULT_SETTINGS);
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(2); // item + filing
  });

  it('includes all items when role is null', () => {
    const ics = buildIcs([item, recurringItem], [filing], [meeting], null, DEFAULT_SETTINGS);
    // item (fixed date) + filing + meeting = 3 (recurringItem excluded, no fixed date)
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(3);
  });

  it('escapes special characters in ICS content', () => {
    const specialItem: ComplianceItem = {
      ...item,
      id: 'ci-special',
      task: 'Review bylaws; update rules, regulations',
      legalRef: 'DC Code 29-102, Section 5',
    };
    const ics = buildIcs([specialItem], [], [], null, DEFAULT_SETTINGS);
    expect(ics).toContain('Review bylaws\\; update rules\\, regulations');
  });
});
