/**
 * PM scorecard metrics (pure). The board rates the property manager each
 * quarter in five categories; a review's overall is the mean of its rated
 * categories. These helpers turn the reviews in `useScorecardStore` into the
 * tiles, bars and trend the Community › PM scorecard tab shows.
 */
import type { Category, CategoryRatings, ScorecardReview } from '@/lib/services/scorecard';
import type { ChipTone } from '../components';

export const CATEGORIES: { key: Category; label: string; description: string }[] = [
  { key: 'responsiveness', label: 'Responsiveness', description: 'How fast requests and emergencies get a reply and a fix' },
  { key: 'financial', label: 'Financial', description: 'Budget reporting, fee collection, accuracy of the books' },
  { key: 'maintenance', label: 'Maintenance', description: 'Upkeep, vendor management, repairs done right' },
  { key: 'communication', label: 'Communication', description: 'Board updates and what owners hear, and when' },
  { key: 'compliance', label: 'Compliance', description: 'Filings on time, the law and the bylaws followed' },
];

export type CategoryAverages = Record<Category, number>;

/** 'YYYY-Qn' for an ISO date. */
export function quarterOf(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** The last `count` quarters ending with today's, newest first. */
export function recentPeriods(today: string, count = 8): string[] {
  const [y, m] = today.split('-').map(Number);
  let q = Math.floor((m - 1) / 3) + 1;
  let year = y;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${year}-Q${q}`);
    q -= 1;
    if (q === 0) { q = 4; year -= 1; }
  }
  return out;
}

/** Recent quarters plus any older quarter that has a review, newest first. */
export function periodsFor(reviews: ScorecardReview[], today: string): string[] {
  const set = new Set(recentPeriods(today));
  for (const r of reviews) set.add(r.period);
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function categoryAverages(reviews: ScorecardReview[]): CategoryAverages {
  const out = { responsiveness: 0, financial: 0, maintenance: 0, communication: 0, compliance: 0 } as CategoryAverages;
  for (const c of CATEGORIES) {
    const scores = reviews.map(r => r.categoryRatings?.[c.key]?.score).filter((s): s is number => typeof s === 'number' && s > 0);
    out[c.key] = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  }
  return out;
}

/** Mean of the rated categories, one decimal; 0 when nothing is rated. */
export function overallOf(avgs: CategoryAverages): number {
  const rated = CATEGORIES.map(c => avgs[c.key]).filter(v => v > 0);
  return rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : 0;
}

/** The overall a review form derives from its category ratings. */
export function deriveOverall(ratings: CategoryRatings): number {
  const scores = Object.values(ratings).map(r => r?.score ?? 0).filter(s => s > 0);
  return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
}

export interface TrendRow { period: string; overall: number; categories: CategoryAverages; count: number }

/** One row per period, newest first; `count` 0 means no review that quarter. */
export function trend(reviews: ScorecardReview[], periods: string[]): TrendRow[] {
  return periods.map(period => {
    const rs = reviews.filter(r => r.period === period);
    const categories = categoryAverages(rs);
    return { period, overall: overallOf(categories), categories, count: rs.length };
  });
}

/** Trailing twelve months: the mean of the last four scored quarters, or null. */
export function ttm(rows: TrendRow[]): number | null {
  const scored = rows.filter(r => r.count > 0).slice(0, 4);
  if (scored.length === 0) return null;
  return Math.round((scored.reduce((a, r) => a + r.overall, 0) / scored.length) * 10) / 10;
}

export function band(score: number): { label: string; tone: ChipTone } {
  if (score >= 4.5) return { label: 'Excellent', tone: 'teal' };
  if (score >= 4) return { label: 'Strong', tone: 'teal' };
  if (score >= 3) return { label: 'Fair', tone: 'amber' };
  if (score > 0) return { label: 'Needs attention', tone: 'red' };
  return { label: 'Not rated', tone: 'ghost' };
}

export function lowestCategory(avgs: CategoryAverages): { key: Category; label: string; score: number } | null {
  const rated = CATEGORIES.filter(c => avgs[c.key] > 0);
  if (rated.length === 0) return null;
  const low = rated.reduce((a, c) => (avgs[c.key] < avgs[a.key] ? c : a), rated[0]);
  return { key: low.key, label: low.label, score: avgs[low.key] };
}
