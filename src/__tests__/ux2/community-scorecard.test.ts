import { describe, expect, it } from 'vitest';
import { band, categoryAverages, deriveOverall, lowestCategory, overallOf, periodsFor, quarterOf, recentPeriods, trend, ttm } from '@/ux2/community/scorecard';
import type { ScorecardReview } from '@/lib/services/scorecard';

const review = (period: string, scores: Partial<Record<string, number>>, id = period): ScorecardReview => ({
  id, period, overallRating: 0, summary: 's', strengths: [], improvements: [], reviewedBy: 'R',
  categoryRatings: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v!, notes: '' }])),
});

describe('PM scorecard metrics', () => {
  it('names quarters and lists recent ones newest first, plus any older reviewed quarter', () => {
    expect(quarterOf('2026-11-06')).toBe('2026-Q4');
    expect(quarterOf('2026-01-01')).toBe('2026-Q1');
    expect(recentPeriods('2026-11-06', 5)).toEqual(['2026-Q4', '2026-Q3', '2026-Q2', '2026-Q1', '2025-Q4']);
    expect(periodsFor([review('2023-Q2', {})], '2026-11-06')[0]).toBe('2026-Q4');
    expect(periodsFor([review('2023-Q2', {})], '2026-11-06')).toContain('2023-Q2');
  });

  it('averages categories across reviews and derives the overall from rated categories only', () => {
    const rs = [review('2026-Q1', { responsiveness: 4, financial: 5, maintenance: 3 }, 'a'), review('2026-Q1', { responsiveness: 2, financial: 5 }, 'b')];
    const avgs = categoryAverages(rs);
    expect(avgs).toMatchObject({ responsiveness: 3, financial: 5, maintenance: 3, communication: 0, compliance: 0 });
    expect(overallOf(avgs)).toBe(3.7);
    expect(deriveOverall({ responsiveness: { score: 4, notes: '' }, financial: { score: 5, notes: '' }, compliance: { score: 0, notes: '' } })).toBe(4.5);
    expect(deriveOverall({})).toBe(0);
    expect(lowestCategory(avgs)).toMatchObject({ key: 'responsiveness', score: 3 });
  });

  it('builds the trend and the trailing year from the last four scored quarters', () => {
    const rs = [review('2026-Q3', { financial: 5 }), review('2026-Q2', { financial: 3 }), review('2025-Q4', { financial: 4 }), review('2025-Q2', { financial: 1 }), review('2025-Q1', { financial: 1 }, 'old')];
    const rows = trend(rs, recentPeriods('2026-11-06', 8));
    expect(rows[0]).toMatchObject({ period: '2026-Q4', count: 0, overall: 0 });
    expect(rows.find(r => r.period === '2026-Q3')!.overall).toBe(5);
    expect(ttm(rows)).toBe(3.3); // (5 + 3 + 4 + 1) / 4
    expect(ttm(trend([], ['2026-Q4']))).toBeNull();
  });

  it('bands scores', () => {
    expect(band(4.6)).toMatchObject({ label: 'Excellent', tone: 'teal' });
    expect(band(4)).toMatchObject({ label: 'Strong' });
    expect(band(3.2)).toMatchObject({ label: 'Fair', tone: 'amber' });
    expect(band(1)).toMatchObject({ label: 'Needs attention', tone: 'red' });
    expect(band(0)).toMatchObject({ label: 'Not rated', tone: 'ghost' });
  });
});
