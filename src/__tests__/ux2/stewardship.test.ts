import { describe, expect, it } from 'vitest';
import { average, bandFor, computeScorecard, radarPoints, scoreDimension, timelinessCredit, type ScoreEvent } from '@/ux2/score/stewardship';

const ev = (id: string, dimension: ScoreEvent['dimension'], earned: number, available = 1): ScoreEvent => ({ id, dimension, date: '2026-11-01', label: id, earned, available });

describe('stewardship score', () => {
  it('credits on time fully, a week late by half, a month late by a quarter, later nothing', () => {
    expect(timelinessCredit(0)).toBe(1);
    expect(timelinessCredit(-3)).toBe(1);
    expect(timelinessCredit(7)).toBe(0.5);
    expect(timelinessCredit(8)).toBe(0.25);
    expect(timelinessCredit(31)).toBe(0);
  });

  it('scores a dimension against its weight', () => {
    const d = scoreDimension('Timeliness', [ev('a', 'Timeliness', 1), ev('b', 'Timeliness', 0.5), ev('c', 'Timeliness', 1), ev('d', 'Timeliness', 1)]);
    expect(d.pct).toBe(88);
    expect(d.points).toBeCloseTo(30.6, 1);
  });

  it('treats a dimension with nothing asked as full credit', () => {
    expect(scoreDimension('Reach', []).points).toBe(10);
  });

  it('totals to 100 when everything was on time', () => {
    const card = computeScorecard([ev('a', 'Timeliness', 1), ev('b', 'Compliance', 1), ev('c', 'Oversight', 1), ev('d', 'Reach', 1), ev('e', 'Impact', 1)]);
    expect(card.total).toBe(100);
    expect(card.band).toBe('Excellent');
  });

  it('bands scores', () => {
    expect(bandFor(91)).toBe('Excellent');
    expect(bandFor(84)).toBe('Good');
    expect(bandFor(72)).toBe('Fair');
    expect(bandFor(60)).toBe('Needs attention');
  });

  it('averages a building', () => {
    expect(average([91, 93, 88, 86, 79])).toBe(87);
    expect(average([])).toBe(0);
  });

  it('draws the radar with the first axis straight up', () => {
    const pts = radarPoints([100, 0, 0, 0, 0]).split(' ');
    expect(pts[0]).toBe('150.0,42.0');
    expect(pts[1]).toBe('150.0,150.0');
  });
});
