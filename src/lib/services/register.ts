import { supabase, logDbError } from '@/lib/supabase';
import type { RegisterEntry } from '@/lib/register';

function rowToEntry(r: Record<string, unknown>): RegisterEntry {
  return {
    id: r.id as string,
    kind: r.kind as RegisterEntry['kind'],
    unit: (r.unit_number as string) || '',
    owner: (r.owner as string) || '',
    title: (r.title as string) || '',
    openedOn: (r.opened_on as string) || '',
    closedOn: (r.closed_on as string) || '',
    data: (r.data || {}) as RegisterEntry['data'],
    notes: (r.notes as string) || '',
  } as RegisterEntry;
}

const entryToRow = (e: Partial<RegisterEntry>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (e.kind !== undefined) row.kind = e.kind;
  if (e.unit !== undefined) row.unit_number = e.unit;
  if (e.owner !== undefined) row.owner = e.owner;
  if (e.title !== undefined) row.title = e.title;
  if (e.openedOn !== undefined) row.opened_on = e.openedOn || null;
  if (e.closedOn !== undefined) row.closed_on = e.closedOn || null;
  if (e.data !== undefined) row.data = e.data;
  if (e.notes !== undefined) row.notes = e.notes;
  return row;
};

export async function fetchEntries(tenantId: string): Promise<RegisterEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('association_register').select('*').eq('tenant_id', tenantId).order('opened_on', { ascending: false });
  if (error) { logDbError('fetchEntries error:', error); return null; }
  return (data || []).map(rowToEntry);
}

/** The entry keeps the id the app gave it, so the action opened for it can name it at once. */
export async function createEntry(tenantId: string, e: RegisterEntry): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('association_register').insert({ ...entryToRow(e), id: e.id, tenant_id: tenantId });
  if (error) { logDbError('createEntry error:', error); return false; }
  return true;
}

export async function updateEntry(id: string, e: Partial<RegisterEntry>): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('association_register').update(entryToRow(e)).eq('id', id);
  if (error) { logDbError('updateEntry error:', error); return false; }
  return true;
}

export async function deleteEntry(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('association_register').delete().eq('id', id);
  if (error) { logDbError('deleteEntry error:', error); return false; }
  return true;
}
