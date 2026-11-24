import { supabase, logDbError } from '@/lib/supabase';
import type { BuildingRecord } from '@/lib/buildingRecords';

function rowToRecord(r: Record<string, unknown>): BuildingRecord {
  return {
    id: r.id as string,
    kind: r.kind as string,
    name: (r.name as string) || '',
    number: (r.number as string) || '',
    doneOn: (r.done_on as string) || '',
    expiresOn: (r.expires_on as string) || '',
    posted: !!r.posted,
    notes: (r.notes as string) || '',
    file: (r.file as BuildingRecord['file']) || undefined,
  };
}

function recordToRow(r: Partial<BuildingRecord>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (r.kind !== undefined) row.kind = r.kind;
  if (r.name !== undefined) row.name = r.name;
  if (r.number !== undefined) row.number = r.number;
  if (r.doneOn !== undefined) row.done_on = r.doneOn || null;
  if (r.expiresOn !== undefined) row.expires_on = r.expiresOn || null;
  if (r.posted !== undefined) row.posted = r.posted;
  if (r.notes !== undefined) row.notes = r.notes;
  if (r.file !== undefined) row.file = r.file ?? null;
  return row;
}

export async function fetchRecords(tenantId: string): Promise<BuildingRecord[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('building_records').select('*').eq('tenant_id', tenantId);
  if (error) { logDbError('fetchRecords error:', error); return null; }
  return (data || []).map(rowToRecord);
}

export async function createRecord(tenantId: string, r: Omit<BuildingRecord, 'id'>): Promise<BuildingRecord | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('building_records').insert({ ...recordToRow(r), tenant_id: tenantId }).select().single();
  if (error || !data) { logDbError('createRecord error:', error); return null; }
  return rowToRecord(data);
}

export async function updateRecord(id: string, r: Partial<BuildingRecord>): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('building_records').update(recordToRow(r)).eq('id', id);
  if (error) { logDbError('updateRecord error:', error); return false; }
  return true;
}

export async function deleteRecord(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('building_records').delete().eq('id', id);
  if (error) { logDbError('deleteRecord error:', error); return false; }
  return true;
}
