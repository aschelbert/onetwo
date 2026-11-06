import { describe, expect, it } from 'vitest';
import { buildAgenda, filterAgenda, groupAgenda, weekdayLabel, type AgendaSources } from '@/ux2/home/agenda';
import type { RunbookCard } from '@/ux2/runbook/model';

const card = (over: Partial<RunbookCard>): RunbookCard => ({
  id: 'case-step:s1', kind: 'case-step', refId: 's1', title: 'Compare 3 insurance quotes', why: 'All quotes in', due: '2026-11-20', daysLeft: 16,
  status: 'upcoming', roles: ['BOARD_MEMBER'], action: { label: 'Compare quotes', path: '/issues?view=case:c1' }, ...over,
} as RunbookCard);

function sources(over: Partial<AgendaSources> = {}): AgendaSources {
  return {
    today: '2026-11-04',
    viewer: { id: 'u1', name: 'Sarah Park', role: 'BOARD_MEMBER', linkedUnits: ['3A'] },
    meetings: [
      { id: 'm1', title: 'Board meeting', status: 'SCHEDULED', date: '2026-11-13', time: '7:00 PM', location: 'Community room', agenda: ['a', 'b', 'c', 'd'] } as unknown as AgendaSources['meetings'][number],
      { id: 'm0', title: 'October meeting', status: 'COMPLETED', date: '2026-10-09', time: '', location: '', agenda: [] } as unknown as AgendaSources['meetings'][number],
    ],
    elections: [
      { id: 'e1', title: '2027 budget', status: 'open', scheduledCloseDate: '2026-11-20', ballots: [1, 2, 3], quorumRequired: 12 } as unknown as AgendaSources['elections'][number],
      { id: 'e2', title: 'Old vote', status: 'certified', scheduledCloseDate: '2026-11-21', ballots: [], quorumRequired: 0 } as unknown as AgendaSources['elections'][number],
    ],
    filings: [
      { id: 'f1', name: 'Biennial report', dueDate: '2026-12-31', status: 'pending', responsible: 'Secretary' } as AgendaSources['filings'][number],
      { id: 'f2', name: 'Filed already', dueDate: '2026-12-01', status: 'filed', responsible: 'Secretary' } as AgendaSources['filings'][number],
    ],
    cards: [card({}), card({ id: 'filing:f1', kind: 'filing', refId: 'f1', title: 'dup of the filing', due: '2026-12-31' }), card({ id: 'request:r1', kind: 'request', refId: 'r1', title: 'Reply, Unit 2C', due: '2026-11-16', assigneeId: 'u1' })],
    reservations: [
      { id: 'r1', amenityId: 'a1', amenityName: 'Roof deck', date: '2026-11-08', startTime: '2:00 PM', endTime: '6:00 PM', reservedByName: 'Dan', reservedByUnit: '4B', status: 'active' } as AgendaSources['reservations'][number],
      { id: 'r2', amenityId: 'a1', amenityName: 'Roof deck', date: '2026-11-16', startTime: '12:00 PM', endTime: '3:00 PM', reservedByName: 'Sarah', reservedByUnit: '3A', status: 'pending_approval' } as AgendaSources['reservations'][number],
      { id: 'r3', amenityId: 'a1', amenityName: 'Roof deck', date: '2026-11-17', startTime: '', endTime: '', reservedByName: 'X', reservedByUnit: '1A', status: 'cancelled' } as AgendaSources['reservations'][number],
    ],
    units: [
      { number: '1B', owner: 'New Owner', moveIn: '2026-11-22' } as AgendaSources['units'][number],
      { number: '3A', owner: 'Sarah Park', moveIn: '2020-01-01' } as AgendaSources['units'][number],
    ],
    insurance: [{ id: 'i1', type: 'D&O', carrier: 'Travelers', expires: '2026-12-04' } as AgendaSources['insurance'][number]],
    maintenance: [
      { id: 'ms1', task: 'Elevator inspection', vendor: 'Lift Service Inc', frequency: 'Annual', nextDue: '2026-11-18', status: 'due-soon' } as AgendaSources['maintenance'][number],
      { id: 'ms2', task: 'Done thing', vendor: 'V', frequency: 'Annual', nextDue: '2026-11-19', status: 'completed' } as AgendaSources['maintenance'][number],
    ],
    hoaDueDay: 1,
    lateFee: { enabled: true, graceDays: 14, amount: 25 },
    ...over,
  };
}

describe('calendar agenda', () => {
  it('merges every dated source once, in date order, within four months', () => {
    const items = buildAgenda(sources());
    const ids = items.map(i => i.id);
    expect(ids).toContain('meeting:m1');
    expect(ids).not.toContain('meeting:m0');
    expect(ids).toContain('vote:e1');
    expect(ids).not.toContain('vote:e2');
    expect(ids).toContain('filing:f1');
    expect(ids).not.toContain('filing:f2');
    expect(ids).not.toContain('card:filing:f1'); // the filing is listed from its own source, not twice
    expect(ids).toContain('card:case-step:s1');
    expect(ids).toContain('reservation:r1');
    expect(ids).not.toContain('reservation:r3');
    expect(ids).toContain('move:1B');
    expect(ids).not.toContain('move:3A');
    expect(ids).toContain('insurance:i1');
    expect(ids).toContain('maintenance:ms1');
    expect(ids).not.toContain('maintenance:ms2');
    // dues on the 1st of Dec, Jan, Feb (Nov 1 is before today), late fees 14 days after each
    expect(ids.filter(i => i.startsWith('dues:'))).toEqual(['dues:2026-12-01', 'dues:2027-01-01', 'dues:2027-02-01']);
    expect(ids).toContain('latefee:2026-12-15');
    expect(ids).not.toContain('dues:2027-03-01');
    for (let i = 1; i < items.length; i++) expect(items[i].date >= items[i - 1].date).toBe(true);
  });

  it('knows what is the viewer\'s own and what owners may see', () => {
    const items = buildAgenda(sources());
    const mine = filterAgenda(items, 'mine', false).map(i => i.id);
    expect(mine).toEqual(expect.arrayContaining(['card:request:r1', 'reservation:r2']));
    expect(mine).not.toContain('reservation:r1');
    const forOwners = filterAgenda(items, 'all', true);
    expect(forOwners.every(i => i.audience === 'all')).toBe(true);
    expect(forOwners.map(i => i.id)).toEqual(expect.arrayContaining(['meeting:m1', 'vote:e1', 'reservation:r1', 'maintenance:ms1', 'dues:2026-12-01']));
    expect(forOwners.map(i => i.id)).not.toContain('filing:f1');
    expect(filterAgenda(items, 'vote', false).map(i => i.id)).toEqual(['vote:e1']);
  });

  it('an owner\'s dues are theirs and lead to Pay', () => {
    const items = buildAgenda(sources({ viewer: { id: 'o1', name: 'Dan', role: 'RESIDENT', linkedUnits: ['4B'] } }));
    const dues = items.find(i => i.id === 'dues:2026-12-01')!;
    expect(dues.mine).toBe(true);
    expect(dues.path).toBe('/my-unit/pay');
    expect(items.find(i => i.id === 'reservation:r1')!.mine).toBe(true);
  });

  it('groups by month with today always listed and weekday labels', () => {
    const groups = groupAgenda(buildAgenda(sources()), '2026-11-04');
    expect(groups.map(g => g.label)).toEqual(['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']);
    const nov = groups[0];
    expect(nov.days[0]).toMatchObject({ date: '2026-11-04', isToday: true, weekday: 'Wed', items: [] });
    expect(nov.count).toBe(nov.days.reduce((n, d) => n + d.items.length, 0));
    expect(nov.days.find(d => d.date === '2026-11-13')!.items[0].title).toBe('Board meeting');
    expect(weekdayLabel('2026-11-13')).toBe('Fri');
  });
});
