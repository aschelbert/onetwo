import { describe, expect, it } from 'vitest';
import { archiveRows, caseRows, casesSummary, inboxRows, inboxSummary, outboxSummary, runbookStatuses, runbooksSummary, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { ALL_RUNBOOKS, RUNBOOKS, SITUATION_RUNBOOKS } from '@/ux2/boardroom/runbooks';
import { CATS } from '@/store/useIssuesStore';

const step = (s: string, done: boolean, extra: Record<string, unknown> = {}) => ({ id: s, s, done, doneDate: done ? '2026-10-01' : null, userNotes: '', ...extra });

const snap: BoardRoomSnapshot = {
  today: '2026-11-06',
  viewer: { id: 'u1', name: 'Sarah Park', email: '', linkedUnits: ['4B'], isBoard: true, role: 'Treasurer' },
  cases: [
    { id: 'c1', title: 'Unit 3A delinquent account', catId: 'financial', sitId: 'delinquent-accounts', status: 'open', priority: 'high', unit: '3A', owner: 'R. Alvarez', created: '2026-09-02', steps: [step('30-day notice', true), step('60-day notice', true), step('Formal demand letter', false), step('Board vote to record a lien', false), step('Record lien', false)], assignedTo: 'Sarah Park', assignedRole: 'Treasurer', dueDate: '2026-11-10' },
    { id: 'c2', title: 'Roof membrane repair', catId: 'maintenance', sitId: 'common-area-repairs', status: 'open', priority: 'medium', unit: '', owner: '', created: '2026-10-14', steps: [step('Scope', true), step('Approve $24,000', false, { isSpendingDecision: true })], assignedTo: 'Dan Lee', assignedRole: 'Vice President', dueDate: '2026-11-13' },
    { id: 'c3', title: 'Elevator contract renewal', catId: 'maintenance', sitId: 'vendor-management', status: 'open', priority: 'medium', unit: '', owner: '', created: '2026-09-20', steps: [step('Bids', true, { requiresBids: true }), step('Sign', false)], assignedTo: 'Marcus Jones', assignedRole: 'President', dueDate: '2026-11-01' },
    { id: 'c4', title: 'Hallway light', catId: 'maintenance', sitId: 'common-area-repairs', status: 'open', priority: 'medium', unit: '2C', owner: '', created: '2026-11-02', steps: [step('Book vendor', false)], source: 'issue', sourceId: 'i1' },
    { id: 'c5', title: 'Pool heater', catId: 'maintenance', sitId: 'common-area-repairs', status: 'on-hold', priority: 'low', unit: '', owner: '', created: '2026-08-01', steps: [step('Wait', false)], holdReason: 'Spring' },
    { id: 'c6', title: 'Covenant violation 4A', catId: 'enforcement', sitId: 'covenant-violations', status: 'closed', priority: 'medium', unit: '4A', owner: '', created: '2026-08-12', steps: [step('Letter', true), step('Cure', true)], completedAt: '2026-09-14T00:00:00Z', closeReason: 'Owner complied', boardVotes: { motion: 'No fine', date: '2026-09-10', votes: [{ name: 'a', role: 'r', vote: 'approve' }] } },
  ] as unknown as BoardRoomSnapshot['cases'],
  issues: [
    { id: 'i1', type: 'BUILDING_PUBLIC', status: 'IN_PROGRESS', title: 'Hallway light flickering', submittedDate: '2026-11-02', reportedBy: 'u9', unitNumber: '2C', upvotes: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }], comments: [] },
    { id: 'i2', type: 'BUILDING_PUBLIC', status: 'SUBMITTED', title: 'Parking swap', submittedDate: '2026-10-15', reportedBy: 'u8', unitNumber: '1A', upvotes: [], comments: [] },
    { id: 'i3', type: 'UNIT_PRIVATE', status: 'RESOLVED', title: 'Buzzer', submittedDate: '2026-06-14', reportedBy: 'u7', unitNumber: '2C', upvotes: [], comments: [{ id: 'x', author: 'Board', text: 'Fixed', date: '2026-06-20' }] },
  ] as unknown as BoardRoomSnapshot['issues'],
  letters: [
    { id: 'l1', templateId: 't1', templateName: 'Demand', recipient: 'R. Alvarez', unitNumber: '3A', subject: 'Demand letter', body: '', status: 'draft', sentDate: '', sentVia: '', createdBy: 'Sarah', caseId: 'c1' },
    { id: 'l2', templateId: 't2', templateName: 'Notice', recipient: 'All owners', unitNumber: '', subject: 'Meeting notice', body: '', status: 'sent', sentDate: '2026-11-02', sentVia: 'email', createdBy: 'Priya' },
    { id: 'l3', templateId: 't2', templateName: 'Notice', recipient: 'All owners', unitNumber: '', subject: 'Sep minutes', body: '', status: 'sent', sentDate: '2026-10-08', sentVia: 'email', createdBy: 'Priya' },
  ],
  templates: [{ id: 't1', name: 'Demand', category: 'collection', subject: '', body: '', variables: [] }, { id: 't2', name: 'Notice', category: 'notice', subject: '', body: '', variables: [] }],
  mailRecords: [
    { id: 'm1', caseId: 'c1', tenantId: 't', templateId: 't1', templateName: 'Demand', status: 'in-transit', cost: { totalCents: 750 } },
    { id: 'm2', caseId: 'c1', tenantId: 't', templateId: 't1', templateName: '60-day', status: 'delivered', cost: { totalCents: 750 } },
    { id: 'm3', caseId: 'c1', tenantId: 't', templateId: 't1', templateName: 'x', status: 'failed', cost: { totalCents: 750 } },
  ] as unknown as BoardRoomSnapshot['mailRecords'],
  categories: [
    { id: 'financial', label: 'Fiscal Lens', sits: [{ id: 'delinquent-accounts', title: 'Delinquent Accounts' }] },
    { id: 'maintenance', label: 'Maintenance & Property', sits: [{ id: 'common-area-repairs', title: 'Common Area Repairs' }, { id: 'vendor-management', title: 'Vendor Management' }] },
    { id: 'enforcement', label: 'Rule Enforcement', sits: [{ id: 'covenant-violations', title: 'Covenant Violations' }] },
  ],
  runbooksOff: ['vendor-bids'],
};

describe('board room metrics', () => {
  it('lists open cases overdue first with where it is, next and driver', () => {
    const rows = caseRows(snap);
    expect(rows.map(r => r.c.id)).toEqual(['c3', 'c1', 'c2', 'c4', 'c5']);
    const c1 = rows.find(r => r.c.id === 'c1')!;
    expect(c1).toMatchObject({ category: 'Fiscal Lens', situation: 'Delinquent Accounts', stepIndex: 3, stepTotal: 5, stepTitle: 'Formal demand letter', done: 2, driver: 'Sarah Park', daysLeft: 4, overdue: false, mine: true, fromRequest: false });
    expect(rows.find(r => r.c.id === 'c2')!.next).toBe('Spending decision · Approve $24,000');
    expect(rows.find(r => r.c.id === 'c3')).toMatchObject({ overdue: true, next: 'Sign' });
    expect(rows.find(r => r.c.id === 'c4')).toMatchObject({ fromRequest: true, driver: '—' });
    const sum = casesSummary(rows);
    expect(sum.open.map(r => r.c.id)).toEqual(['c3', 'c1', 'c2', 'c4']);
    expect(sum.onHold.map(r => r.c.id)).toEqual(['c5']);
    expect(sum.mine.map(r => r.c.id)).toEqual(['c1']);
    expect(sum.overdue.map(r => r.c.id)).toEqual(['c3']);
    expect(sum.byCategory).toEqual({ 'Fiscal Lens': 1, 'Maintenance & Property': 4 });
  });

  it('runs the 14-day clock on the inbox and links the converted case', () => {
    const rows = inboxRows(snap);
    expect(rows.map(r => r.issue.id)).toEqual(['i2', 'i1', 'i3']);
    expect(rows[0]).toMatchObject({ state: 'new', replyDue: '2026-10-29', daysLeft: -8, overdue: true, ackDue: '2026-10-17', assignee: 'Unassigned' });
    expect(rows[1]).toMatchObject({ state: 'in_progress', replyDue: '2026-11-16', daysLeft: 10, overdue: false, upvotes: 3 });
    expect(rows[1].linkedCase?.id).toBe('c4');
    const sum = inboxSummary(rows);
    expect(sum.open.length).toBe(2);
    expect(sum.overdue.map(r => r.issue.id)).toEqual(['i2']);
    expect(sum.unacknowledged.map(r => r.issue.id)).toEqual(['i2']);
    expect(sum.closed.map(r => r.issue.id)).toEqual(['i3']);
  });

  it('summarises the outbox: drafts, sent, in transit, delivered and spend', () => {
    const o = outboxSummary(snap);
    expect(o.drafts.map(l => l.id)).toEqual(['l1']);
    expect(o.sent.map(l => l.id)).toEqual(['l2', 'l3']);
    expect(o.sentThisMonth).toBe(1);
    expect(o.inTransit.map(m => m.id)).toEqual(['m1']);
    expect(o.delivered.map(m => m.id)).toEqual(['m2']);
    expect(o.spentCents).toBe(1500);
    expect(o.templates.length).toBe(2);
  });

  it('builds the archive from closed cases, resolved requests and sent letters, newest first', () => {
    const rows = archiveRows(snap);
    expect(rows.map(r => r.id)).toEqual(['letter:l2', 'letter:l3', 'case:c6', 'request:i3']);
    expect(rows[2]).toMatchObject({ kind: 'case', closed: '2026-09-14', outcome: 'Owner complied', year: '2026', entries: 3, caseId: 'c6' });
    expect(rows[3]).toMatchObject({ kind: 'request', closed: '2026-06-20', outcome: 'Resolved', entries: 2 });
  });

  it('reports every workflow: the 32 runbooks, the other wizard situations and custom actions, with switches, use, open cases and last run', () => {
    expect(RUNBOOKS.length).toBe(32);
    // Every situation Take Action offers is on the list, once as its own runbook when no catalogue runbook runs on it.
    const sits = CATS.flatMap(c => c.sits.map(s => s.id));
    for (const id of sits) expect(ALL_RUNBOOKS.some(r => r.sitId === id)).toBe(true);
    expect(SITUATION_RUNBOOKS.every(r => r.kind === 'situation' && r.automated === 0 && r.id === `sit-${r.sitId}`)).toBe(true);
    expect(SITUATION_RUNBOOKS.map(r => r.sitId)).toContain('fine-hearings');
    const list = runbookStatuses(snap);
    const by = Object.fromEntries(list.map(r => [r.def.id, r]));
    expect(by['vendor-bids'].on).toBe(false);
    expect(by['collections']).toMatchObject({ on: true });
    expect(by['collections'].openCases.map(c => c.id)).toEqual(['c1']);
    expect(by['covenant-violation'].lastRan).toEqual({ date: '2026-09-14', title: 'Covenant violation 4A' });
    expect(by['work-order'].openCases.map(c => c.id)).toEqual(['c2', 'c4', 'c5']);
    expect(by['work-order']).toMatchObject({ used: 3, lastStarted: '2026-11-02' });
    expect(by['covenant-violation']).toMatchObject({ used: 1 });
    expect(by['elections'].used).toBe(0);
    expect(by['sit-fine-hearings']).toMatchObject({ used: 0, on: true });
    const sum = runbooksSummary(list);
    expect(sum).toMatchObject({ total: ALL_RUNBOOKS.length, on: ALL_RUNBOOKS.length - 1 });
    expect(sum.used).toBe(4);
    expect(sum.withOpenCase.map(r => r.def.id)).toEqual(['vendor-bids', 'collections', 'work-order']);
  });

  it('turns an action made with its own steps into a custom runbook of its own', () => {
    const custom = { id: 'c9', title: 'Lobby art install', catId: 'general', sitId: 'custom-123', status: 'open', priority: 'low', unit: '', owner: '', created: '2026-11-03', steps: [step('Pick the art', true), step('Hang it', false)] };
    const list = runbookStatuses({ ...snap, cases: [...snap.cases, custom] as unknown as BoardRoomSnapshot['cases'] });
    const r = list.find(x => x.def.id === 'custom-123')!;
    expect(r.def).toMatchObject({ kind: 'custom', name: 'Lobby art install', stepTitles: ['Pick the art', 'Hang it'] });
    expect(r).toMatchObject({ used: 1, lastStarted: '2026-11-03' });
    expect(r.openCases.map(c => c.id)).toEqual(['c9']);
  });
});
