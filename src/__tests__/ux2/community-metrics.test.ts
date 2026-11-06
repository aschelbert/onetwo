import { describe, expect, it } from 'vitest';
import { boardDecisions, firstName, leaderboardVisible, meetingRows, meetingsSummary, noticesSummary, requestRows, requestsSummary, voteRows, votesSummary, type CommunitySnapshot } from '@/ux2/community/metrics';

const meeting = (id: string, date: string, over: Partial<CommunitySnapshot['meetings'][number]> = {}) => ({
  id, title: `Meeting ${id}`, type: 'BOARD', status: 'SCHEDULED', date, time: '19:00', location: '', virtualLink: '', agenda: ['a', 'b'], notes: '',
  attendees: { board: [], owners: [], guests: [] }, minutes: '', votes: [], linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [], ...over,
});

const snap: CommunitySnapshot = {
  today: '2026-11-06',
  viewer: { id: 'u1', name: 'Sarah Park', email: 'sarah@example.com', linkedUnits: ['4B'], isBoard: true },
  announcements: [
    { id: 'a1', title: 'Elevator inspection', body: '', category: 'maintenance', postedBy: 'Marcus', postedDate: '2026-11-03', pinned: true },
    { id: 'a2', title: 'Book club', body: '', category: 'general', postedBy: 'Priya', postedDate: '2026-10-30', pinned: false },
    { id: 'a3', title: 'Old rule change', body: '', category: 'rules', postedBy: 'Priya', postedDate: '2026-06-01', pinned: false },
  ],
  communications: [{ id: 'c1', type: 'notice', subject: 'Notice of the Meeting m2', date: '2026-10-01', method: 'email', recipients: 'All', respondedBy: null, status: 'sent', notes: '' }],
  meetings: [
    meeting('m1', '2026-11-13', { attendees: { board: ['Sarah Park', 'Marcus Jones'], owners: ['Ana Ruiz'], guests: [] } }),
    meeting('m2', '2026-12-10'),
    meeting('m3', '2026-10-08', { status: 'COMPLETED', minutes: 'Minutes text', minutesApprovals: [] , votes: [{ id: 'v1', motion: 'Renew cleaning', type: 'board', status: 'passed', date: '2026-10-08', results: [], tally: { approve: 4, deny: 1, abstain: 0 } }] }),
    meeting('m4', '2026-09-10', { status: 'COMPLETED', minutes: 'Approved text', minutesApprovals: [{ name: 'Marcus', role: 'President', date: '2026-09-20' }] }),
    meeting('m5', '2026-11-20', { status: 'CANCELLED' }),
  ],
  elections: [
    { id: 'e1', title: 'Adopt the 2027 budget', type: 'budget_approval', status: 'open', scheduledCloseDate: '2026-11-20', quorumRequired: 51, ballots: [{ unitNumber: '1A', isProxy: false }, { unitNumber: '2C', isProxy: true }], closedAt: null },
    { id: 'e2', title: 'Board election', type: 'board_election', status: 'draft', scheduledCloseDate: null, quorumRequired: 51, ballots: [], closedAt: null },
    { id: 'e3', title: 'Pets rule', type: 'rule_change', status: 'closed', scheduledCloseDate: '2026-10-01', quorumRequired: 51, ballots: [{ unitNumber: '4B', isProxy: false }, { unitNumber: '1A', isProxy: false }, { unitNumber: '2C', isProxy: false }], closedAt: '2026-10-01T00:00:00Z' },
  ] as unknown as CommunitySnapshot['elections'],
  issues: [
    { id: 'i1', type: 'BUILDING_PUBLIC', status: 'SUBMITTED', title: 'Parking swap', submittedDate: '2026-10-15', reportedBy: 'u9', reporterEmail: '', unitNumber: '1A', upvotes: [{ userId: 'u1', userName: 'Sarah', unitNumber: '4B' }, { userId: 'u2', userName: 'x', unitNumber: '2C' }], comments: [] },
    { id: 'i2', type: 'UNIT_PRIVATE', status: 'IN_PROGRESS', title: 'My leak', submittedDate: '2026-11-02', reportedBy: 'u1', reporterEmail: 'sarah@example.com', unitNumber: '4B', upvotes: [], comments: [] },
    { id: 'i3', type: 'BUILDING_PUBLIC', status: 'RESOLVED', title: 'Buzzer', submittedDate: '2026-06-14', reportedBy: 'u9', reporterEmail: '', unitNumber: '2C', upvotes: [], comments: [] },
  ] as unknown as CommunitySnapshot['issues'],
  units: [{ number: '1A', status: 'ACTIVE' }, { number: '2C', status: 'ACTIVE' }, { number: '4B', status: 'ACTIVE' }, { number: '5A', status: 'FOR_SALE' }] as unknown as CommunitySnapshot['units'],
};

describe('community metrics', () => {
  it('summarises notices with pinned first, categories, recent and alerts', () => {
    const n = noticesSummary(snap);
    expect(n.all.map(a => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(n.pinned.map(a => a.id)).toEqual(['a1']);
    expect(n.byCategory).toEqual({ maintenance: 1, general: 1, rules: 1 });
    expect(n.recent.map(a => a.id)).toEqual(['a1', 'a2']);
    expect(n.alerts.map(a => a.id)).toEqual(['a1']);
  });

  it('builds meeting rows with notice status, RSVP counts and minutes state', () => {
    const rows = meetingRows(snap);
    const by = Object.fromEntries(rows.map(r => [r.meeting.id, r]));
    expect(by.m1).toMatchObject({ state: 'upcoming', daysLeft: 7, noticeSent: false, noticeDue: '2026-11-03', noticeOverdue: true, datePassed: false, rsvpUnits: 1, rsvpBoard: 2, minutes: 'none', mine: true });
    expect(by.m2).toMatchObject({ state: 'upcoming', noticeSent: true, noticeOverdue: false });
    expect(by.m3).toMatchObject({ state: 'past', minutes: 'draft' });
    expect(by.m4).toMatchObject({ state: 'past', minutes: 'approved' });
    expect(by.m5.state).toBe('cancelled');
    const sum = meetingsSummary(rows);
    expect(sum.next?.meeting.id).toBe('m1');
    expect(sum.upcoming.map(r => r.meeting.id)).toEqual(['m1', 'm2']);
    expect(sum.past.map(r => r.meeting.id)).toEqual(['m3', 'm4']);
    expect(sum.minutesToApprove.map(r => r.meeting.id)).toEqual(['m3']);
    expect(sum.noticesOverdue.map(r => r.meeting.id)).toEqual(['m1']);
  });

  it('builds vote rows with quorum from the eligible units and whether the viewer voted', () => {
    const rows = voteRows(snap);
    expect(rows.map(r => [r.election.id, r.state])).toEqual([['e1', 'open'], ['e2', 'nominations'], ['e3', 'closed']]);
    expect(rows[0]).toMatchObject({ closes: '2026-11-20', daysLeft: 14, votedUnits: 2, eligibleUnits: 4, quorumUnits: 3, quorumMet: false, voted: false, proxies: 1 });
    expect(rows[2]).toMatchObject({ votedUnits: 3, quorumMet: true, voted: true });
    const sum = votesSummary(rows);
    expect(sum.open.map(r => r.election.id)).toEqual(['e1']);
    expect(sum.needsMyVote.map(r => r.election.id)).toEqual(['e1']);
    expect(sum.nominations.map(r => r.election.id)).toEqual(['e2']);
    expect(sum.toCertify.map(r => r.election.id)).toEqual(['e3']);
  });

  it('lists board decisions from cases, meeting motions and spending, open first', () => {
    const rows = boardDecisions({
      cases: [
        { id: 'c1', title: 'Roof', boardVotes: { motion: 'Approve $24,000 from reserves', date: '2026-11-01', votes: [{ vote: 'approve' }] } },
        { id: 'c2', title: 'Elevator', boardVotes: { motion: 'Go to bid', date: '2026-10-22', votes: [{ vote: 'approve' }, { vote: 'approve' }, { vote: 'approve' }, { vote: 'approve' }, { vote: 'approve' }] } },
        { id: 'c3', title: 'None', boardVotes: null },
      ],
      meetings: snap.meetings,
      approvals: [{ id: 's1', title: 'Paint lobby', status: 'approved', decidedAt: '2026-10-02T00:00:00Z', votes: [{ vote: 'approve' }, { vote: 'approve' }, { vote: 'deny' }], caseId: '' }, { id: 's2', title: 'Boiler', status: 'pending', votes: [] }],
      boardSize: 5,
    });
    expect(rows.map(r => [r.id, r.open, r.passed])).toEqual([
      ['case:c1', true, null],
      ['spending:s2', true, null],
      ['case:c2', false, true],
      ['meeting:m3:v1', false, true],
      ['spending:s1', false, true],
    ]);
    expect(rows[2]).toMatchObject({ yes: 5, no: 0 });
    expect(rows[3]).toMatchObject({ yes: 4, no: 1, source: 'meeting' });
  });

  it('builds request rows with the step, the reply window and ownership', () => {
    const rows = requestRows(snap);
    const by = Object.fromEntries(rows.map(r => [r.issue.id, r]));
    expect(by.i1).toMatchObject({ mine: false, step: 1, stepLabel: 'Received', replyDue: '2026-10-29', replyOverdue: true, upvotes: 2, upvoted: true, public: true });
    expect(by.i2).toMatchObject({ mine: true, step: 2, stepLabel: 'Assigned', replyOverdue: false });
    expect(by.i3).toMatchObject({ step: 3, stepLabel: 'Resolved' });
    const sum = requestsSummary(rows);
    expect(sum.open.map(r => r.issue.id)).toEqual(['i2', 'i1']);
    expect(sum.mineOpen.map(r => r.issue.id)).toEqual(['i2']);
    expect(sum.buildingOpen.map(r => r.issue.id)).toEqual(['i1']);
    expect(sum.overdue.map(r => r.issue.id)).toEqual(['i1']);
  });

  it('hides owners below 70 from other owners but not from the board or themselves', () => {
    const rows = [
      { unit: '1A', name: 'Marcus', score: 93, band: 'Excellent', you: false },
      { unit: '4B', name: 'You', score: 65, band: 'Needs attention', you: true },
      { unit: '3A', name: 'R.', score: 60, band: 'Needs attention', you: false },
    ];
    expect(leaderboardVisible(rows, false).map(r => r.unit)).toEqual(['1A', '4B']);
    expect(leaderboardVisible(rows, true).map(r => r.unit)).toEqual(['1A', '4B', '3A']);
    expect(firstName('Marcus Jones')).toBe('Marcus');
    expect(firstName('M. Chen')).toBe('M. Chen');
  });
});
