import { supabase } from '@/lib/supabase';

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string;
  assignedRole: string;
  dueDate: string;
  category: 'governance' | 'maintenance' | 'financial' | 'legal' | 'compliance' | 'general';
  source: string;
  sourceId: string;
  notes: string;
  completedAt: string;
}

function rowToTask(r: Record<string, unknown>): BoardTask {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    status: r.status as BoardTask['status'],
    priority: r.priority as BoardTask['priority'],
    assignedTo: r.assigned_to as string,
    assignedRole: r.assigned_role as string,
    dueDate: r.due_date as string,
    category: r.category as BoardTask['category'],
    source: r.source as string,
    sourceId: r.source_id as string,
    notes: r.notes as string,
    completedAt: r.completed_at as string,
  };
}

function taskToRow(t: Partial<BoardTask>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.title !== undefined) row.title = t.title;
  if (t.description !== undefined) row.description = t.description;
  if (t.status !== undefined) row.status = t.status;
  if (t.priority !== undefined) row.priority = t.priority;
  if (t.assignedTo !== undefined) row.assigned_to = t.assignedTo;
  if (t.assignedRole !== undefined) row.assigned_role = t.assignedRole;
  if (t.dueDate !== undefined) row.due_date = t.dueDate;
  if (t.category !== undefined) row.category = t.category;
  if (t.source !== undefined) row.source = t.source;
  if (t.sourceId !== undefined) row.source_id = t.sourceId;
  if (t.notes !== undefined) row.notes = t.notes;
  if (t.completedAt !== undefined) row.completed_at = t.completedAt;
  return row;
}

export async function fetchBoardTasks(tenantId: string): Promise<BoardTask[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('board_tasks')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('due_date', { ascending: true });
  if (error) { console.error('fetchBoardTasks error:', error); return null; }
  return (data || []).map(rowToTask);
}

export async function createBoardTask(tenantId: string, task: Omit<BoardTask, 'id'>): Promise<{ id: string } | null> {
  if (!supabase) return null;
  const row = taskToRow(task);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('board_tasks')
    .insert(row)
    .select('id')
    .single();
  if (error) { console.error('createBoardTask error:', error); return null; }
  return data;
}

export async function updateBoardTask(id: string, updates: Partial<BoardTask>): Promise<boolean> {
  if (!supabase) return false;
  const row = taskToRow(updates);
  const { error } = await supabase.from('board_tasks').update(row).eq('id', id);
  if (error) { console.error('updateBoardTask error:', error); return false; }
  return true;
}

export async function deleteBoardTask(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('board_tasks').delete().eq('id', id);
  if (error) { console.error('deleteBoardTask error:', error); return false; }
  return true;
}
