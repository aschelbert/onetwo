import { supabase, logDbError } from '@/lib/supabase';
import type { ActionRecord } from '@/lib/actions/types';

function rowToRecord(r: Record<string, unknown>): ActionRecord {
  return {
    id: r.id as string, kind: r.kind as string, title: (r.title as string) || '', unit: (r.unit_number as string) || '',
    openedOn: (r.opened_on as string) || '', dueOn: (r.due_on as string) || '', closedOn: (r.closed_on as string) || '',
    data: (r.data || {}) as Record<string, unknown>,
  };
}

const toRow = (r: ActionRecord) => ({ kind: r.kind, title: r.title, unit_number: r.unit, opened_on: r.openedOn || null, due_on: r.dueOn || null, closed_on: r.closedOn || null, data: r.data });

export async function fetchRecords(tenantId: string): Promise<ActionRecord[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('action_records').select('*').eq('tenant_id', tenantId).order('opened_on', { ascending: false });
  if (error) { logDbError('fetchActionRecords error:', error); return null; }
  return (data || []).map(rowToRecord);
}

/** The record keeps the id the app gave it, so its action can name it at once. */
export async function createRecord(tenantId: string, r: ActionRecord): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('action_records').insert({ ...toRow(r), id: r.id, tenant_id: tenantId });
  if (error) { logDbError('createActionRecord error:', error); return false; }
  return true;
}

export async function updateRecord(r: ActionRecord): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('action_records').update(toRow(r)).eq('id', r.id);
  if (error) { logDbError('updateActionRecord error:', error); return false; }
  return true;
}

export async function deleteRecord(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('action_records').delete().eq('id', id);
  if (error) { logDbError('deleteActionRecord error:', error); return false; }
  return true;
}
