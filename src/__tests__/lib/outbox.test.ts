import { describe, it, expect } from 'vitest';
import { buildOutbox, type OutboxItem } from '@/lib/outbox';
import type { OwnerCommunication, Announcement } from '@/store/useComplianceStore';
import type { GeneratedLetter } from '@/lib/services/letterEngine';
import type { Meeting } from '@/store/useMeetingsStore';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const pendingComm: OwnerCommunication = {
  id: 'c1',
  type: 'notice',
  subject: 'Budget Notice',
  date: '2026-03-01',
  method: 'email',
  recipients: 'All owners',
  respondedBy: null,
  status: 'pending',
  notes: '',
};

const sentComm: OwnerCommunication = {
  id: 'c2',
  type: 'minutes',
  subject: 'January Minutes',
  date: '2026-01-15',
  method: 'email+portal',
  recipients: 'All owners',
  respondedBy: 'Secretary',
  status: 'sent',
  notes: '',
};

const draftComm: OwnerCommunication = {
  id: 'c3',
  type: 'notice',
  subject: 'Draft Notice',
  date: '2026-02-20',
  method: 'email',
  recipients: 'Unit 502',
  respondedBy: null,
  status: 'draft',
  notes: '',
};

const announcement: Announcement = {
  id: 'a1',
  title: 'Community Update',
  body: 'We are pleased to announce improvements to the common areas.',
  category: 'general',
  postedBy: 'Board President',
  postedDate: '2026-02-25',
  pinned: false,
};

const draftLetter: GeneratedLetter = {
  id: 'gl1',
  templateId: 'lt1',
  templateName: 'Violation Notice',
  recipient: 'Emma Johnson',
  unitNumber: '502',
  subject: 'Violation Notice — Unit 502',
  body: 'Dear Emma...',
  status: 'draft',
  sentDate: '',
  sentVia: '',
  createdBy: 'Board',
};

const sentLetter: GeneratedLetter = {
  id: 'gl2',
  templateId: 'lt2',
  templateName: 'Collection Notice',
  recipient: 'Maria Garcia',
  unitNumber: '403',
  subject: 'Past Due — Unit 403',
  body: 'Dear Maria...',
  status: 'sent',
  sentDate: '2026-01-10',
  sentVia: 'email',
  createdBy: 'Board',
};

const scheduledMeeting: Meeting = {
  id: 'mtg1',
  title: 'February Board Meeting',
  type: 'BOARD',
  status: 'SCHEDULED',
  date: '2026-02-20',
  time: '19:00',
  location: 'Community Room',
  virtualLink: '',
  agenda: ['Review financials'],
  notes: '',
  attendees: { board: [], owners: [], guests: [] },
  minutes: '',
  votes: [],
  linkedCaseIds: [],
  linkedVoteIds: [],
  documents: [],
  minutesApprovals: [],
};

const completedMeeting: Meeting = {
  id: 'mtg2',
  title: 'January Board Meeting',
  type: 'BOARD',
  status: 'COMPLETED',
  date: '2026-01-10',
  time: '19:00',
  location: 'Community Room',
  virtualLink: '',
  agenda: [],
  notes: '',
  attendees: { board: [], owners: [], guests: [] },
  minutes: '',
  votes: [],
  linkedCaseIds: [],
  linkedVoteIds: [],
  documents: [],
  minutesApprovals: [],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildOutbox', () => {
  it('maps pending communication to needs_you', () => {
    const items = buildOutbox({
      communications: [pendingComm],
      announcements: [],
      letters: [],
      meetings: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('needs_you');
    expect(items[0].kind).toBe('notice');
    expect(items[0].actions).toContain('send');
  });

  it('maps draft communication to draft', () => {
    const items = buildOutbox({
      communications: [draftComm],
      announcements: [],
      letters: [],
      meetings: [],
    });
    expect(items[0].status).toBe('draft');
    expect(items[0].actions).toContain('edit');
  });

  it('maps sent communication to sent', () => {
    const items = buildOutbox({
      communications: [sentComm],
      announcements: [],
      letters: [],
      meetings: [],
    });
    expect(items[0].status).toBe('sent');
  });

  it('maps announcements to sent portal items', () => {
    const items = buildOutbox({
      communications: [],
      announcements: [announcement],
      letters: [],
      meetings: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('announcement');
    expect(items[0].status).toBe('sent');
    expect(items[0].channel).toContain('portal');
  });

  it('maps draft letters correctly', () => {
    const items = buildOutbox({
      communications: [],
      announcements: [],
      letters: [draftLetter],
      meetings: [],
    });
    expect(items[0].status).toBe('draft');
    expect(items[0].kind).toBe('letter');
    expect(items[0].actions).toContain('mail');
  });

  it('creates meeting reminder for SCHEDULED meeting without notice', () => {
    const items = buildOutbox({
      communications: [],
      announcements: [],
      letters: [],
      meetings: [scheduledMeeting],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('reminder');
    expect(items[0].status).toBe('scheduled');
    expect(items[0].scheduledFor).toBe('2026-02-18');
  });

  it('does NOT create reminder if notice communication already exists', () => {
    const noticeComm: OwnerCommunication = {
      id: 'cn1',
      type: 'notice',
      subject: 'February Board Meeting Notice',
      date: '2026-02-15',
      method: 'email',
      recipients: 'All owners',
      respondedBy: null,
      status: 'sent',
      notes: '',
    };
    const items = buildOutbox({
      communications: [noticeComm],
      announcements: [],
      letters: [],
      meetings: [scheduledMeeting],
    });
    // Only the communication, no reminder
    const reminders = items.filter((i) => i.kind === 'reminder');
    expect(reminders).toHaveLength(0);
  });

  it('does NOT create reminder for COMPLETED meetings', () => {
    const items = buildOutbox({
      communications: [],
      announcements: [],
      letters: [],
      meetings: [completedMeeting],
    });
    expect(items).toHaveLength(0);
  });

  it('sorts needs_you before scheduled before sent', () => {
    const items = buildOutbox({
      communications: [pendingComm, sentComm, draftComm],
      announcements: [],
      letters: [],
      meetings: [scheduledMeeting],
    });
    const statuses = items.map((i) => i.status);
    const needsIdx = statuses.indexOf('needs_you');
    const scheduledIdx = statuses.indexOf('scheduled');
    const draftIdx = statuses.indexOf('draft');
    const sentIdx = statuses.indexOf('sent');
    expect(needsIdx).toBeLessThan(scheduledIdx);
    expect(scheduledIdx).toBeLessThan(draftIdx);
    expect(draftIdx).toBeLessThan(sentIdx);
  });

  it('handles empty inputs', () => {
    const items = buildOutbox({
      communications: [],
      announcements: [],
      letters: [],
      meetings: [],
    });
    expect(items).toHaveLength(0);
  });
});
