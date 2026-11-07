import { describe, expect, it } from 'vitest';
import { change, movers, scoreAsOf, trend, type Person } from '@/ux2/score/trend';
import type { ScoreEvent } from '@/ux2/score/stewardship';

const ev = (id: string, date: string, earned: number, dimension: ScoreEvent['dimension'] = 'Timeliness'): ScoreEvent => ({ id, date, dimension, label: id, earned, available: 1 });

const today = '2026-11-07';
const board: Person = { name: 'Marcus Jones', group: 'board', units: ['6A'], events: [ev('b1', '2026-08-01', 1), ev('b2', '2026-11-01', 1, 'Compliance')] };
const owner: Person = { name: 'Jordan Rivera', group: 'owner', units: ['2C'], events: [ev('o1', '2026-08-01', 1), ev('o2', '2026-10-25', 0), ev('o3', '2026-11-03', 1, 'Reach')] };

describe('stewardship trend', () => {
  it('scores a person as of a date from the events up to that date only', () => {
    expect(scoreAsOf(owner.events, '2026-09-01')).toBe(100);
    expect(scoreAsOf(owner.events, '2026-10-30')).toBeLessThan(100);
  });

  it('builds a series per group ending today, and the change across it', () => {
    const pts = trend([board, owner], today, '90d');
    expect(pts[pts.length - 1].date).toBe(today);
    expect(pts[0].date < pts[pts.length - 1].date).toBe(true);
    const last = pts[pts.length - 1];
    expect(last.board).toBe(100);
    expect(last.owners).toBeLessThan(100);
    expect(last.building).toBe(Math.round((last.board + last.owners) / 2));
    expect(change(pts)).toBeLessThan(0);
    expect(trend([board, owner], today, '12m').length).toBeGreaterThan(pts.length);
  });

  it('splits recent events into the ones that lifted scores and the ones that pulled them down', () => {
    const m = movers([board, owner], today, 30);
    expect(m.down.map(x => x.event.id)).toEqual(['o2']);
    expect(m.down[0].delta).toBeLessThan(0);
    expect(m.up.map(x => x.event.id)).toContain('o3');
    expect(m.up.every(x => x.delta > 0)).toBe(true);
    // Older than the window: not a recent mover.
    expect([...m.up, ...m.down].some(x => x.event.id === 'b1')).toBe(false);
  });
});
