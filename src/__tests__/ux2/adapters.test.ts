import { describe, expect, it } from 'vitest';
import { buildCardInput, nextDuesDate, noticeSentFor, type StoreSnapshot } from '@/ux2/runbook/adapters';
import { generateCards } from '@/ux2/runbook/model';
import { boardEvents, ownerEvents, stewardshipFor } from '@/ux2/score/events';
import { computeScorecard } from '@/ux2/score/stewardship';

const today = '2026-11-06';

function snapshot(over: Partial<StoreSnapshot> = {}): StoreSnapshot {
  return {
    today,
    viewer: { id: 'u1', name: 'Sarah Park', email: 'sarah@example.com', role: 'BOARD_MEMBER', officerTitle: 'Treasurer', linkedUnits: ['4B'] },
    obligations: [
      { id: 'ob1', task: 'Reconcile reserve account', role: 'Treasurer', freq: 'Monthly', due: '2026-10-31', critical: true, tip: '', legalRef: '', whyItMatters: '', consequence: '', howTo: ['a', 'b'], fiduciaryDuty: 'care', scope: 'operations' },
      { id: 'ob2', task: 'Post minutes', role: 'Secretary', freq: 'Per meeting', due: '2026-11-10', critical: false, tip: '', legalRef: '', whyItMatters: '', consequence: '', howTo: [], fiduciaryDuty: 'care', scope: 'governance' },
      { id: 'ob3', task: 'Ongoing thing', role: 'Treasurer', freq: 'Ongoing', due: 'Ongoing', critical: false, tip: '', legalRef: '', whyItMatters: '', consequence: '', howTo: [], fiduciaryDuty: 'care', scope: 'operations' },
    ] as StoreSnapshot['obligations'],
    completions: {},
    filings: [
      { id: 'f1', name: 'Biennial report', category: 'state', dueDate: '2026-10-30', status: 'pending', filedDate: null, confirmationNum: '', notes: '', responsible: 'Treasurer', recurrence: 'biennial', legalRef: '', attachments: [] },
      { id: 'f2', name: 'Form 1120-H', category: 'tax', dueDate: '2026-04-15', status: 'filed', filedDate: '2026-04-20', confirmationNum: 'x', notes: '', responsible: 'Treasurer', recurrence: 'annual', legalRef: '', attachments: [] },
    ],
    communications: [{ id: 'c1', type: 'notice', subject: 'Notice of the November Board Meeting', date: '2026-11-01', method: 'email', recipients: 'All', respondedBy: null, status: 'sent', notes: '' }],
    cases: [
      { id: 'c1', title: 'Unit 3A collections', status: 'open', priority: 'high', unit: '3A', sitId: 'collections', catId: 'financial', steps: [{ id: 's1', s: 'Notice', done: true, doneDate: '2026-10-01', userNotes: '' }, { id: 's2', s: 'Demand letter', done: false, doneDate: null, userNotes: '' }], assignedTo: 'Sarah Park', assignedRole: 'Treasurer', dueDate: '2026-11-08' },
      { id: 'c2', title: 'Roof repair', status: 'on-hold', priority: 'medium', unit: '', sitId: 'capital', catId: 'building', steps: [{ id: 's1', s: 'Third bid', done: false, doneDate: null, userNotes: '' }] },
      { id: 'c3', title: 'Closed one', status: 'closed', priority: 'low', unit: '', sitId: 'x', catId: 'y', steps: [], completedAt: '2026-09-01T00:00:00Z' },
    ] as unknown as StoreSnapshot['cases'],
    issues: [
      { id: 'i1', status: 'SUBMITTED', title: 'Hallway light out', submittedDate: '2026-10-20', reportedBy: 'u9', reporterEmail: 'x@y.z', unitNumber: '2C' },
      { id: 'i2', status: 'IN_PROGRESS', title: 'My leak', submittedDate: '2026-11-01', reportedBy: 'u1', reporterEmail: 'sarah@example.com', unitNumber: '4B' },
      { id: 'i3', status: 'RESOLVED', title: 'Old one', submittedDate: '2026-08-01', reportedBy: 'u9', reporterEmail: '', unitNumber: '' },
    ] as unknown as StoreSnapshot['issues'],
    meetings: [
      { id: 'm1', title: 'November Board Meeting', type: 'BOARD', status: 'SCHEDULED', date: '2026-11-13', time: '19:00', location: '', virtualLink: '', agenda: [], notes: '', attendees: { board: [], owners: [], guests: [] }, minutes: '', votes: [], linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [] },
      { id: 'm2', title: 'Annual Meeting', type: 'ANNUAL', status: 'COMPLETED', date: '2026-09-15', time: '19:00', location: '', virtualLink: '', agenda: [], notes: '', attendees: { board: ['Sarah Park'], owners: ['Ana Ruiz'], guests: [] }, minutes: 'ok', votes: [], linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [] },
    ],
    elections: [
      { id: 'e1', title: 'Adopt the 2027 budget', status: 'open', scheduledCloseDate: '2026-11-20', ballots: [{ unitNumber: '2C' }], closedAt: null },
      { id: 'e2', title: 'Board election', status: 'certified', scheduledCloseDate: '2026-06-01', ballots: [{ unitNumber: '4B' }], closedAt: '2026-06-01T00:00:00Z' },
    ] as unknown as StoreSnapshot['elections'],
    approvals: [
      { id: 'a1', title: 'Boiler service', status: 'pending', votes: [], caseId: 'c2' },
      { id: 'a2', title: 'Paint lobby', status: 'approved', votes: [{ member: 'Sarah Park', vote: 'approve', date: '2026-10-01' }], decidedAt: '2026-10-02T00:00:00Z', caseId: '' },
    ] as unknown as StoreSnapshot['approvals'],
    insurance: [{ id: 'p1', type: 'D&O policy', carrier: '', coverage: '', premium: '', expires: '2026-12-20', policyNum: '', attachments: [] }],
    board: [{ id: 'b1', name: 'Sarah Park', role: 'Treasurer', email: '', phone: '', term: '' }, { id: 'b2', name: 'Lee Wong', role: 'President', email: '', phone: '', term: '' }],
    units: [
      { number: '3A', owner: 'Ana Ruiz', balance: 2950, monthlyFee: 475, payments: [], lateFees: [{ date: '2026-10-01', amount: 50, reason: 'late', waived: false }], specialAssessments: [] },
      { number: '4B', owner: 'Sarah Park', balance: 0, monthlyFee: 475, payments: [{ date: '2026-10-01', amount: 475, method: 'ach', note: '' }, { date: '2026-09-05', amount: 475, method: 'ach', note: '' }], lateFees: [], specialAssessments: [] },
    ] as unknown as StoreSnapshot['units'],
    unitInvoices: [],
    hoaDueDay: 1,
    budgetVariance: [{ name: 'Snow removal', budgeted: 3000, actual: 4200 }, { name: 'Landscaping', budgeted: 5000, actual: 1000 }],
    aging: { days30: [], days60: [], days90plus: [] },
    ...over,
  };
}

describe('store adapters', () => {
  it('keeps dated obligations for the viewer\'s officer title and all filings they own', () => {
    const input = buildCardInput(snapshot());
    expect(input.obligations!.map(o => o.id)).toEqual(['ob1', 'f1', 'f2']);
    expect(input.obligations!.find(o => o.id === 'f2')!.completed).toBe(true);
  });

  it('shows every dated obligation when the viewer has no officer title', () => {
    const input = buildCardInput(snapshot({ viewer: { id: 'u1', name: 'Pat', email: '', role: 'PROPERTY_MANAGER', linkedUnits: [] } }));
    expect(input.obligations!.map(o => o.id)).toEqual(['ob1', 'ob2', 'f1', 'f2']);
  });

  it('maps the first open step of each live case and marks on-hold cases as waiting', () => {
    const input = buildCardInput(snapshot());
    expect(input.caseSteps).toHaveLength(2);
    expect(input.caseSteps![0]).toMatchObject({ caseId: 'c1', stepIndex: 2, stepTotal: 2, stepTitle: 'Demand letter', assigneeRole: 'BOARD_MEMBER', due: '2026-11-08' });
    expect(input.caseSteps![1].waitingOnOthers).toBe(true);
  });

  it('turns pending spending decisions and open elections into votes with the viewer\'s status', () => {
    const input = buildCardInput(snapshot());
    expect(input.votes).toEqual([
      { id: 'sa:a1', title: 'Spending decision · Boiler service', scope: 'board', status: 'open', voted: false, caseId: 'c2' },
      { id: 'e1', title: 'Adopt the 2027 budget', scope: 'owner', closes: '2026-11-20', status: 'open', voted: false },
    ]);
  });

  it('reads notice status from the communications log', () => {
    const s = snapshot();
    expect(noticeSentFor(s.meetings[0], s.communications)).toBe(true);
    expect(noticeSentFor({ ...s.meetings[0], title: 'Special Meeting', date: '2026-12-02' }, s.communications)).toBe(false);
    expect(buildCardInput(s).meetings![0]).toMatchObject({ id: 'm1', noticeSent: true, noticeDue: '2026-11-03', rsvped: false });
  });

  it('flags the viewer\'s own requests and leaves resolved ones out', () => {
    const input = buildCardInput(snapshot());
    expect(input.requests!.map(r => [r.id, r.mine, r.status])).toEqual([['i1', false, 'new'], ['i2', true, 'in_progress']]);
  });

  it('builds delinquencies from the aging buckets and links the collections case', () => {
    const s = snapshot();
    s.aging = { days30: [], days60: [s.units[0]], days90plus: [] };
    const d = buildCardInput(s).delinquencies!;
    expect(d).toEqual([{ unitId: '3A', unitLabel: 'Unit 3A', daysPastDue: 60, amount: 3000, caseId: 'c1' }]);
  });

  it('gives an owner a payment card for the next dues inside ten days', () => {
    const s = snapshot({ viewer: { id: 'u2', name: 'Sarah Park', email: '', role: 'RESIDENT', linkedUnits: ['4B'] }, today: '2026-11-25' });
    expect(buildCardInput(s).payment).toEqual({ unitLabel: 'Unit 4B', amount: 475, due: '2026-12-01', autopay: false });
    expect(nextDuesDate('2026-11-01', 1)).toBe('2026-11-01');
    expect(nextDuesDate('2026-12-15', 1)).toBe('2027-01-01');
  });

  it('runs end to end: the overdue filing leads for a treasurer', () => {
    const s = snapshot();
    const set = generateCards(buildCardInput(s), { today, role: 'BOARD_MEMBER', userId: 'Sarah Park' });
    expect(set.forYou[0].id).toBe('filing:f1');
    expect(set.forYou.map(c => c.id)).toContain('obligation:ob1');
    expect(set.forYou.map(c => c.id)).toContain('vote:sa:a1');
    expect(set.waitingOnOthers.map(c => c.id)).toEqual(['case-step:c2:1', ]);
  });
});

describe('stewardship events', () => {
  it('scores a treasurer on filings, obligations, requests, cases, meetings and decisions', () => {
    const ev = boardEvents(snapshot(), { name: 'Sarah Park', officerTitle: 'Treasurer' });
    const by = Object.fromEntries(ev.map(e => [e.id, e]));
    expect(by['filing:f2']).toMatchObject({ dimension: 'Compliance', earned: 0.5, reason: 'Filed 5 days late' });
    expect(by['filing:f1']).toMatchObject({ earned: 0 });
    expect(by['obligation:ob1']).toMatchObject({ earned: 0 });
    expect(by['request:i1']).toMatchObject({ dimension: 'Timeliness', earned: 0 });
    expect(by['request:i3']).toMatchObject({ earned: 1 });
    expect(by['case:c3']).toMatchObject({ dimension: 'Oversight', earned: 1 });
    expect(by['meeting:m2']).toMatchObject({ dimension: 'Reach', earned: 1 });
    expect(by['decision:a2']).toMatchObject({ dimension: 'Impact', earned: 1 });
    expect(computeScorecard(ev).total).toBeLessThan(100);
  });

  it('scores an owner on dues, owner meetings and ballots', () => {
    const ev = ownerEvents(snapshot(), { name: 'Sarah Park', units: ['4B'] });
    const by = Object.fromEntries(ev.map(e => [e.id, e]));
    expect(by['dues:4B:2026-10']).toMatchObject({ dimension: 'Timeliness', earned: 1 });
    expect(by['dues:4B:2026-09']).toMatchObject({ earned: 0.5, reason: 'Paid 4 days late' });
    expect(by['meeting:m2']).toMatchObject({ dimension: 'Reach', earned: 1 });
    expect(by['election:e2']).toMatchObject({ dimension: 'Impact', earned: 1 });
  });

  it('compares a board member with the board and an owner with the owners', () => {
    expect(stewardshipFor(snapshot()).group).toBe('board');
    const owner = stewardshipFor(snapshot({ viewer: { id: 'u2', name: 'Ana Ruiz', email: '', role: 'RESIDENT', linkedUnits: ['3A'] } }));
    expect(owner.group).toBe('owners');
    expect(owner.building.dims).toHaveLength(5);
    expect(owner.you.total).toBeGreaterThanOrEqual(0);
  });
});
