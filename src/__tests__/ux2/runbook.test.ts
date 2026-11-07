import { describe, expect, it } from 'vitest';
import { addDays, attentionCounts, daysBetween, generateCards, rolesForObligation, type CardInput } from '@/ux2/runbook/model';

const today = '2026-11-04';

const input: CardInput = {
  obligations: [
    { id: 'f1', task: 'Biennial report', role: 'President', due: '2026-10-30', critical: true, kind: 'filing' },
    { id: 'o2', task: 'Insurance certificate review', role: 'Treasurer', due: '2026-11-20', kind: 'obligation' },
    { id: 'o3', task: 'Annual meeting notice', role: 'Secretary', due: '2027-01-02', kind: 'obligation' },
    { id: 'o4', task: 'Done thing', role: 'Secretary', due: '2026-11-01', completed: true },
  ],
  caseSteps: [
    { caseId: 'c1', caseTitle: 'Unit 3A collections', stepIndex: 3, stepTotal: 5, stepTitle: 'Demand letter', due: '2026-11-06', assigneeRole: 'BOARD_MEMBER', priority: 'high' },
    { caseId: 'c2', caseTitle: 'Roof repair', stepIndex: 2, stepTotal: 6, stepTitle: 'Third bid', waitingOnOthers: true, assigneeRole: 'BOARD_MEMBER' },
  ],
  votes: [
    { id: 'v1', title: 'Approve the roof repair', scope: 'board', closes: '2026-11-13', status: 'open', voted: false, caseId: 'c2' },
    { id: 'v2', title: 'Adopt the 2027 budget', scope: 'owner', closes: '2026-11-20', status: 'open', voted: true },
  ],
  meetings: [{ id: 'm1', title: 'Board meeting', date: '2026-11-13', noticeSent: false, noticeDue: '2026-11-03' }],
  requests: [
    { id: 'r1', title: 'Hallway light out', submittedAt: '2026-10-28', slaDays: 14, status: 'new' },
    { id: 'r2', title: 'My own request', submittedAt: '2026-11-01', slaDays: 14, status: 'in_progress', mine: true },
  ],
  insurance: [{ id: 'i1', name: 'D&O policy', expires: '2026-12-04' }],
  delinquencies: [{ unitId: 'u3a', unitLabel: 'Unit 3A', daysPastDue: 74, amount: 2950, caseId: 'c1' }],
  budgetAlerts: [{ category: 'Snow removal', budgeted: 3000, actual: 4200 }],
  setup: [{ id: 's1', title: 'Connect Stripe', done: false, path: '/funds?tab=payments' }],
};

describe('runbook card engine', () => {
  it('computes day arithmetic', () => {
    expect(daysBetween(today, '2026-11-06')).toBe(2);
    expect(daysBetween(today, '2026-10-30')).toBe(-5);
    expect(addDays('2026-10-28', 14)).toBe('2026-11-11');
  });

  it('maps officer roles to the board role', () => {
    expect(rolesForObligation('Treasurer')).toEqual(['BOARD_MEMBER']);
    expect(rolesForObligation('Manager')).toEqual(['PROPERTY_MANAGER']);
  });

  it('puts the overdue critical filing first for a board member, then the overdue notice', () => {
    const set = generateCards(input, { today, role: 'BOARD_MEMBER' });
    expect(set.forYou[0].id).toBe('filing:f1');
    expect(set.forYou[0].status).toBe('overdue');
    expect(set.forYou[1].id).toBe('meeting-notice:m1');
  });

  it('separates waiting-on-others and upcoming from what needs you', () => {
    const set = generateCards(input, { today, role: 'BOARD_MEMBER' });
    expect(set.waitingOnOthers.map(c => c.id)).toEqual(['case-step:c2:2']);
    expect(set.upcoming.map(c => c.id)).toContain('obligation:o3');
    expect(set.forYou.map(c => c.id)).not.toContain('obligation:o3');
  });

  it('skips completed obligations and votes already cast', () => {
    const ids = generateCards(input, { today, role: 'BOARD_MEMBER' });
    const all = [...ids.forYou, ...ids.waitingOnOthers, ...ids.upcoming].map(c => c.id);
    expect(all).not.toContain('obligation:o4');
    expect(all).not.toContain('vote:v2');
    expect(all).toContain('vote:v1');
  });

  it('shows residents only their own items', () => {
    const set = generateCards({ ...input, payment: { unitLabel: '4B', amount: 475, due: '2026-12-01', autopay: false } }, { today, role: 'RESIDENT' });
    const ids = [...set.forYou, ...set.waitingOnOthers, ...set.upcoming].map(c => c.id);
    expect(ids).not.toContain('filing:f1');
    expect(ids).not.toContain('request:r1');
    expect(ids).toContain('request:r2');
    expect(ids).toContain('meeting:m1');
    expect(ids).toContain('payment:4B:2026-12-01');
  });

  it('autopay suppresses the payment card', () => {
    const set = generateCards({ payment: { unitLabel: '4B', amount: 475, due: '2026-12-01', autopay: true } }, { today, role: 'RESIDENT' });
    expect(set.forYou).toEqual([]);
  });

  it('honours hidden ids', () => {
    const set = generateCards(input, { today, role: 'BOARD_MEMBER', hidden: new Set(['filing:f1']) });
    expect(set.forYou.map(c => c.id)).not.toContain('filing:f1');
  });

  it('counts attention chips the way the dashboard pills did', () => {
    const counts = attentionCounts(generateCards(input, { today, role: 'BOARD_MEMBER' }));
    expect(counts.overdueFilings).toBe(1);
    expect(counts.newRequests).toBe(1);
    expect(counts.insuranceExpiring).toBe(1);
    expect(counts.votes).toBe(1);
  });
});
