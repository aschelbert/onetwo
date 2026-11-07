/**
 * Stewardship score — five dimensions, scored monthly, a receipt per event.
 *
 *  Timeliness 35 · Compliance 35 · Oversight 10 · Reach 10 · Impact 10
 *
 * Each dimension is a ratio of credit earned to credit available in the
 * scoring window, scaled to its weight. Events carry the credit rule so the
 * receipt ("Dues paid on the due date · full credit") can be shown.
 */
export type Dimension = 'Timeliness' | 'Compliance' | 'Oversight' | 'Reach' | 'Impact';

export const DIMENSIONS: Dimension[] = ['Timeliness', 'Compliance', 'Oversight', 'Reach', 'Impact'];

export const WEIGHTS: Record<Dimension, number> = {
  Timeliness: 35,
  Compliance: 35,
  Oversight: 10,
  Reach: 10,
  Impact: 10,
};

export type Band = 'Excellent' | 'Good' | 'Fair' | 'Needs attention';

export function bandFor(score: number): Band {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  return 'Needs attention';
}

/** One scored event: what happened, how much of the available credit it earned. */
export interface ScoreEvent {
  id: string;
  dimension: Dimension;
  /** YYYY-MM-DD the event was scored. */
  date: string;
  label: string;
  /** Credit earned, 0..available. */
  earned: number;
  available: number;
  /** Why that credit: "on time", "7 days late", "did not vote". */
  reason?: string;
}

export interface DimensionScore {
  dimension: Dimension;
  weight: number;
  earned: number;
  available: number;
  /** Points out of the dimension's weight. */
  points: number;
  /** 0..100 within the dimension. */
  pct: number;
}

export interface Scorecard {
  total: number;
  band: Band;
  dimensions: DimensionScore[];
}

/**
 * Credit rules shared by the adapters:
 *  on or before the due date → full; 1 to 7 days late → half;
 *  8 to 30 days late → quarter; later → none.
 */
export function timelinessCredit(daysLate: number): number {
  if (daysLate <= 0) return 1;
  if (daysLate <= 7) return 0.5;
  if (daysLate <= 30) return 0.25;
  return 0;
}

export function scoreDimension(dimension: Dimension, events: ScoreEvent[]): DimensionScore {
  const mine = events.filter(e => e.dimension === dimension);
  const earned = mine.reduce((s, e) => s + Math.min(e.earned, e.available), 0);
  const available = mine.reduce((s, e) => s + e.available, 0);
  const weight = WEIGHTS[dimension];
  // No events in a dimension counts as full credit: nothing was asked of the person.
  const ratio = available > 0 ? earned / available : 1;
  return { dimension, weight, earned, available, points: Math.round(ratio * weight * 10) / 10, pct: Math.round(ratio * 100) };
}

export function computeScorecard(events: ScoreEvent[]): Scorecard {
  const dimensions = DIMENSIONS.map(d => scoreDimension(d, events));
  const total = Math.round(dimensions.reduce((s, d) => s + d.points, 0));
  return { total, band: bandFor(total), dimensions };
}

export function average(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Pentagon geometry for the radar widget. Returns points for a value set
 * (0..100 per dimension, in DIMENSIONS order) on a 300×276 canvas, with the
 * Timeliness axis at the top and the rest clockwise.
 */
export function radarPoints(values: number[], cx = 150, cy = 150, r = 108): string {
  return values
    .map((v, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / values.length;
      const rr = (Math.max(0, Math.min(100, v)) / 100) * r;
      return `${(cx + rr * Math.cos(angle)).toFixed(1)},${(cy + rr * Math.sin(angle)).toFixed(1)}`;
    })
    .join(' ');
}

export function radarAxisEnd(index: number, count = 5, cx = 150, cy = 150, r = 108): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}
