import { supabase } from '@/lib/supabase';

export interface PropertyLogEntry {
  id: string;
  type: 'walkthrough' | 'inspection' | 'incident' | 'maintenance_check';
  title: string;
  date: string;
  conductedBy: string;
  location: string;
  status: 'open' | 'resolved' | 'monitoring';
  findings: Array<{ area: string; condition: string; notes: string; severity: string }>;
  actionItems: Array<{ description: string; assignedTo: string; dueDate: string; status: string }>;
  notes: string;
}

function rowToLog(r: Record<string, unknown>): PropertyLogEntry {
  return {
    id: r.id as string,
    type: r.type as PropertyLogEntry['type'],
    title: r.title as string,
    date: r.date as string,
    conductedBy: r.conducted_by as string,
    location: r.location as string,
    status: r.status as PropertyLogEntry['status'],
    findings: (r.findings || []) as PropertyLogEntry['findings'],
    actionItems: (r.action_items || []) as PropertyLogEntry['actionItems'],
    notes: r.notes as string,
  };
}

function logToRow(l: Partial<PropertyLogEntry>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (l.type !== undefined) row.type = l.type;
  if (l.title !== undefined) row.title = l.title;
  if (l.date !== undefined) row.date = l.date;
  if (l.conductedBy !== undefined) row.conducted_by = l.conductedBy;
  if (l.location !== undefined) row.location = l.location;
  if (l.status !== undefined) row.status = l.status;
  if (l.findings !== undefined) row.findings = l.findings;
  if (l.actionItems !== undefined) row.action_items = l.actionItems;
  if (l.notes !== undefined) row.notes = l.notes;
  return row;
}

export async function fetchLogs(tenantId: string): Promise<PropertyLogEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('property_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { console.error('fetchLogs error:', error); return null; }
  return (data || []).map(rowToLog);
}

export async function createLog(tenantId: string, log: Omit<PropertyLogEntry, 'id'>): Promise<PropertyLogEntry | null> {
  if (!supabase) return null;
  const row = logToRow(log);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('property_logs')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createLog error:', error); return null; }
  return rowToLog(data);
}

export async function updateLog(id: string, updates: Partial<PropertyLogEntry>): Promise<boolean> {
  if (!supabase) return false;
  const row = logToRow(updates);
  const { error } = await supabase.from('property_logs').update(row).eq('id', id);
  if (error) { console.error('updateLog error:', error); return false; }
  return true;
}

export async function deleteLog(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('property_logs').delete().eq('id', id);
  if (error) { console.error('deleteLog error:', error); return false; }
  return true;
}
