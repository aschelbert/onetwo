import { supabase, logDbError } from '@/lib/supabase';

/* ── Types ─────────────────────────────────────────────────── */

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskCategory = 'maintenance' | 'administrative' | 'compliance' | 'communication' | 'financial' | 'other';

export interface LinkedItem {
  id: string;
  type: 'meeting' | 'case' | 'document' | 'property_log';
  title: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  assignedTo: string | null;      // user id
  assignedToName: string | null;  // display name
  createdBy: string;
  createdByName: string;
  dueDate: string | null;
  completedAt: string | null;
  linkedItems: LinkedItem[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Row mappers ───────────────────────────────────────────── */

function rowToTask(r: Record<string, unknown>): TaskItem {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description || '') as string,
    status: r.status as TaskStatus,
    priority: r.priority as TaskPriority,
    category: r.category as TaskCategory,
    assignedTo: (r.assigned_to || null) as string | null,
    assignedToName: (r.assigned_to_name || null) as string | null,
    createdBy: r.created_by as string,
    createdByName: (r.created_by_name || '') as string,
    dueDate: (r.due_date || null) as string | null,
    completedAt: (r.completed_at || null) as string | null,
    linkedItems: (r.linked_items || []) as LinkedItem[],
    notes: (r.notes || '') as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function taskToRow(t: Partial<TaskItem>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.title !== undefined) row.title = t.title;
  if (t.description !== undefined) row.description = t.description;
  if (t.status !== undefined) row.status = t.status;
  if (t.priority !== undefined) row.priority = t.priority;
  if (t.category !== undefined) row.category = t.category;
  if (t.assignedTo !== undefined) row.assigned_to = t.assignedTo;
  if (t.assignedToName !== undefined) row.assigned_to_name = t.assignedToName;
  if (t.createdBy !== undefined) row.created_by = t.createdBy;
  if (t.createdByName !== undefined) row.created_by_name = t.createdByName;
  if (t.dueDate !== undefined) row.due_date = t.dueDate;
  if (t.completedAt !== undefined) row.completed_at = t.completedAt;
  if (t.linkedItems !== undefined) row.linked_items = t.linkedItems;
  if (t.notes !== undefined) row.notes = t.notes;
  return row;
}

/* ── CRUD ──────────────────────────────────────────────────── */

export async function fetchTasks(tenantId: string): Promise<TaskItem[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('task_tracking')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) { logDbError('fetchTasks error:', error); return null; }
  return (data || []).map(rowToTask);
}

export async function createTask(tenantId: string, task: Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskItem | null> {
  if (!supabase) return null;
  const row = taskToRow(task);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('task_tracking')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createTask error:', error); return null; }
  return rowToTask(data);
}

export async function updateTask(id: string, updates: Partial<TaskItem>): Promise<boolean> {
  if (!supabase) return false;
  const row = taskToRow(updates);
  const { error } = await supabase.from('task_tracking').update(row).eq('id', id);
  if (error) { logDbError('updateTask error:', error); return false; }
  return true;
}

export async function deleteTask(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('task_tracking').delete().eq('id', id);
  if (error) { logDbError('deleteTask error:', error); return false; }
  return true;
}
