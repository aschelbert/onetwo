import { describe, expect, it } from 'vitest';
import { dayLabel, groupByMonth, monthLabel } from '@/ux2/home/calendar';
import type { RunbookCard } from '@/ux2/runbook/model';

const card = (id: string, due?: string): RunbookCard => ({ id, kind: 'meeting', refId: id, title: id, due, status: 'upcoming', roles: ['BOARD_MEMBER'], action: { label: 'Open', path: '/' }, priority: 1 });

describe('home calendar grouping', () => {
  it('labels months and days', () => {
    expect(monthLabel('2027-01')).toBe('Jan 2027');
    expect(dayLabel('2026-11-13')).toBe('Nov 13');
  });

  it('keeps four months from today, rolling over the year, and sorts cards by date', () => {
    const groups = groupByMonth([card('b', '2026-11-20'), card('a', '2026-11-13'), card('c', '2027-01-02'), card('x')], '2026-11-04');
    expect(groups.map(g => g.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(groups[0].cards.map(c => c.id)).toEqual(['a', 'b']);
    expect(groups[2].cards.map(c => c.id)).toEqual(['c']);
    expect(groups[1].cards).toEqual([]);
  });
});
