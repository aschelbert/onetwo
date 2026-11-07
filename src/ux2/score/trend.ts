/**
 * Rolling stewardship: how the building's score moved over time, and which
 * recent events moved it. Pure, so the Community overview can test it.
 *
 * A point on the trend is the score each person would have had on that day
 * (their events from the trailing scoring window up to that day), averaged
 * per group. A mover is one scored event, measured by how much it changed
 * that person's score: the score with it, minus the score without it.
 */
import { addDays, daysBetween } from '../runbook/model';
import { average, computeScorecard, type ScoreEvent } from './stewardship';
import { SCORE_WINDOW_DAYS } from './events';

export interface Person {
  name: string;
  group: 'board' | 'owner';
  /** Unit numbers, for owners' "first name · unit" labels. */
  units: string[];
  events: ScoreEvent[];
}

export interface TrendPoint { date: string; building: number; board: number; owners: number }

export type TrendRange = '12m' | '90d' | '30d';
export const RANGE_DAYS: Record<TrendRange, number> = { '12m': 365, '90d': 90, '30d': 30 };
const RANGE_STEP: Record<TrendRange, number> = { '12m': 14, '90d': 7, '30d': 2 };

/** Score on `date` from the events in the trailing window ending that day. */
export function scoreAsOf(events: ScoreEvent[], date: string, windowDays = SCORE_WINDOW_DAYS): number {
  const inWindow = events.filter(e => { const d = daysBetween(date, e.date); return d <= 0 && d > -windowDays; });
  return computeScorecard(inWindow).total;
}

export function trend(people: Person[], today: string, range: TrendRange): TrendPoint[] {
  const span = RANGE_DAYS[range];
  const step = RANGE_STEP[range];
  const dates: string[] = [];
  for (let back = span; back > 0; back -= step) dates.push(addDays(today, -back));
  dates.push(today);
  return dates.map(date => {
    const board = people.filter(p => p.group === 'board').map(p => scoreAsOf(p.events, date));
    const owners = people.filter(p => p.group === 'owner').map(p => scoreAsOf(p.events, date));
    return { date, board: average(board), owners: average(owners), building: average([...board, ...owners]) };
  });
}

export interface Mover {
  person: Person;
  event: ScoreEvent;
  /** Change in that person's score from this one event; positive lifts it. */
  delta: number;
}

/** Events in the last `days` days, split into the ones that lifted scores and the ones that pulled them down. */
export function movers(people: Person[], today: string, days = 30, limit = 4): { up: Mover[]; down: Mover[] } {
  const all: Mover[] = [];
  for (const person of people) {
    const windowed = person.events.filter(e => { const d = daysBetween(today, e.date); return d <= 0 && d > -SCORE_WINDOW_DAYS; });
    const withAll = computeScorecard(windowed).total;
    for (const event of windowed) {
      const d = daysBetween(today, event.date);
      if (d > 0 || d <= -days) continue;
      const without = computeScorecard(windowed.filter(e => e !== event)).total;
      const delta = withAll - without;
      // A full-credit event can round to 0 on a big record; it still lifted, so count it as +1.
      const shown = delta !== 0 ? delta : event.earned >= event.available ? 1 : event.earned < event.available ? -1 : 0;
      if (shown !== 0) all.push({ person, event, delta: shown });
    }
  }
  const byRecent = (a: Mover, b: Mover) => b.event.date.localeCompare(a.event.date) || Math.abs(b.delta) - Math.abs(a.delta);
  return {
    up: all.filter(m => m.delta > 0).sort(byRecent).slice(0, limit),
    down: all.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta || byRecent(a, b)).slice(0, limit),
  };
}

/** Points the building average moved across the range: last point minus first. */
export function change(points: TrendPoint[]): number {
  if (points.length < 2) return 0;
  return points[points.length - 1].building - points[0].building;
}
