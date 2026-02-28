import { supabase } from '@/lib/supabase';

// ── Types ──

export interface ScorecardEntry {
  id: string;
  period: string;
  category: 'responsiveness' | 'financial' | 'maintenance' | 'communication' | 'compliance';
  score: number;
  notes: string;
  scoredBy: string;
}

export interface ScorecardReview {
  id: string;
  period: string;
  overallRating: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  reviewedBy: string;
}

// ── Row converters: Entries ──

function rowToEntry(r: Record<string, unknown>): ScorecardEntry {
  return {
    id: r.id as string,
    period: r.period as string,
    category: r.category as ScorecardEntry['category'],
    score: r.score as number,
    notes: r.notes as string,
    scoredBy: r.scored_by as string,
  };
}

function entryToRow(e: Partial<ScorecardEntry>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (e.period !== undefined) row.period = e.period;
  if (e.category !== undefined) row.category = e.category;
  if (e.score !== undefined) row.score = e.score;
  if (e.notes !== undefined) row.notes = e.notes;
  if (e.scoredBy !== undefined) row.scored_by = e.scoredBy;
  return row;
}

// ── Row converters: Reviews ──

function rowToReview(r: Record<string, unknown>): ScorecardReview {
  return {
    id: r.id as string,
    period: r.period as string,
    overallRating: r.overall_rating as number,
    summary: r.summary as string,
    strengths: (r.strengths || []) as string[],
    improvements: (r.improvements || []) as string[],
    reviewedBy: r.reviewed_by as string,
  };
}

function reviewToRow(rv: Partial<ScorecardReview>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (rv.period !== undefined) row.period = rv.period;
  if (rv.overallRating !== undefined) row.overall_rating = rv.overallRating;
  if (rv.summary !== undefined) row.summary = rv.summary;
  if (rv.strengths !== undefined) row.strengths = rv.strengths;
  if (rv.improvements !== undefined) row.improvements = rv.improvements;
  if (rv.reviewedBy !== undefined) row.reviewed_by = rv.reviewedBy;
  return row;
}

// ── Entries CRUD ──

export async function fetchEntries(tenantId: string): Promise<ScorecardEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pm_scorecard_entries')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('period', { ascending: false });
  if (error) { console.error('fetchEntries error:', error); return null; }
  return (data || []).map(rowToEntry);
}

export async function createEntry(tenantId: string, entry: Omit<ScorecardEntry, 'id'>): Promise<ScorecardEntry | null> {
  if (!supabase) return null;
  const row = entryToRow(entry);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('pm_scorecard_entries')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createEntry error:', error); return null; }
  return rowToEntry(data);
}

export async function deleteEntry(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pm_scorecard_entries').delete().eq('id', id);
  if (error) { console.error('deleteEntry error:', error); return false; }
  return true;
}

// ── Reviews CRUD ──

export async function fetchReviews(tenantId: string): Promise<ScorecardReview[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pm_scorecard_reviews')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('period', { ascending: false });
  if (error) { console.error('fetchReviews error:', error); return null; }
  return (data || []).map(rowToReview);
}

export async function createReview(tenantId: string, review: Omit<ScorecardReview, 'id'>): Promise<ScorecardReview | null> {
  if (!supabase) return null;
  const row = reviewToRow(review);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('pm_scorecard_reviews')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createReview error:', error); return null; }
  return rowToReview(data);
}

export async function deleteReview(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pm_scorecard_reviews').delete().eq('id', id);
  if (error) { console.error('deleteReview error:', error); return false; }
  return true;
}
