import { supabase, logDbError } from '@/lib/supabase';

/**
 * Runbook instances and stewardship scores (migration 031). Both are additive:
 * nothing in production reads them, and the Home page works without them.
 */

export type RunbookInstanceState = 'hidden' | 'snoozed' | 'done';

export interface RunbookInstance {
  id: string;
  cardId: string;
  userId: string;
  state: RunbookInstanceState;
  snoozedUntil: string | null;
  completedAt: string | null;
  meta: Record<string, unknown>;
}

export interface StewardshipScoreRow {
  id: string;
  subjectType: 'user' | 'unit' | 'building';
  subjectId: string;
  period: string; // YYYY-MM
  total: number;
  dimensions: Record<string, number>;
  events: unknown[];
  computedAt: string;
}

function rowToInstance(r: Record<string, unknown>): RunbookInstance {
  return {
    id: r.id as string,
    cardId: r.card_id as string,
    userId: r.user_id as string,
    state: r.state as RunbookInstanceState,
    snoozedUntil: (r.snoozed_until as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    meta: (r.meta as Record<string, unknown>) || {},
  };
}

function instanceToRow(i: Partial<RunbookInstance>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (i.cardId !== undefined) row.card_id = i.cardId;
  if (i.userId !== undefined) row.user_id = i.userId;
  if (i.state !== undefined) row.state = i.state;
  if (i.snoozedUntil !== undefined) row.snoozed_until = i.snoozedUntil;
  if (i.completedAt !== undefined) row.completed_at = i.completedAt;
  if (i.meta !== undefined) row.meta = i.meta;
  return row;
}

export async function fetchRunbookInstances(tenantId: string, userId: string): Promise<RunbookInstance[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('runbook_instances')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (error) { logDbError('fetchRunbookInstances error:', error); return null; }
  return (data || []).map(rowToInstance);
}

export async function upsertRunbookInstance(tenantId: string, instance: Omit<RunbookInstance, 'id'>): Promise<RunbookInstance | null> {
  if (!supabase) return null;
  const row = instanceToRow(instance);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('runbook_instances')
    .upsert(row, { onConflict: 'tenant_id,user_id,card_id' })
    .select()
    .single();
  if (error) { logDbError('upsertRunbookInstance error:', error); return null; }
  return rowToInstance(data);
}

export async function deleteRunbookInstance(tenantId: string, userId: string, cardId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('runbook_instances')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('card_id', cardId);
  if (error) { logDbError('deleteRunbookInstance error:', error); return false; }
  return true;
}

function rowToScore(r: Record<string, unknown>): StewardshipScoreRow {
  return {
    id: r.id as string,
    subjectType: r.subject_type as StewardshipScoreRow['subjectType'],
    subjectId: r.subject_id as string,
    period: r.period as string,
    total: Number(r.total ?? 0),
    dimensions: (r.dimensions as Record<string, number>) || {},
    events: (r.events as unknown[]) || [],
    computedAt: r.computed_at as string,
  };
}

export async function fetchStewardshipScores(tenantId: string, period: string): Promise<StewardshipScoreRow[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('stewardship_scores')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period', period);
  if (error) { logDbError('fetchStewardshipScores error:', error); return null; }
  return (data || []).map(rowToScore);
}

export async function upsertStewardshipScore(tenantId: string, score: Omit<StewardshipScoreRow, 'id' | 'computedAt'>): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('stewardship_scores')
    .upsert({
      tenant_id: tenantId,
      subject_type: score.subjectType,
      subject_id: score.subjectId,
      period: score.period,
      total: score.total,
      dimensions: score.dimensions,
      events: score.events,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,subject_type,subject_id,period' });
  if (error) { logDbError('upsertStewardshipScore error:', error); return false; }
  return true;
}
