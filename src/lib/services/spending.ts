import { supabase } from '@/lib/supabase';

export interface SpendingApproval {
  id: string;
  title: string;
  description: string;
  amount: number;
  category: 'maintenance' | 'capital' | 'operations' | 'legal' | 'other';
  requestedBy: string;
  status: 'pending' | 'approved' | 'denied' | 'more_info';
  priority: 'normal' | 'urgent';
  vendorName: string;
  workOrderId: string;
  votes: Array<{ member: string; vote: string; date: string }>;
  threshold: number;
  notes: string;
  decidedAt: string;
}

function rowToApproval(r: Record<string, unknown>): SpendingApproval {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    amount: r.amount as number,
    category: r.category as SpendingApproval['category'],
    requestedBy: r.requested_by as string,
    status: r.status as SpendingApproval['status'],
    priority: r.priority as SpendingApproval['priority'],
    vendorName: r.vendor_name as string,
    workOrderId: r.work_order_id as string,
    votes: (r.votes || []) as SpendingApproval['votes'],
    threshold: r.threshold as number,
    notes: r.notes as string,
    decidedAt: r.decided_at as string,
  };
}

function approvalToRow(a: Partial<SpendingApproval>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (a.title !== undefined) row.title = a.title;
  if (a.description !== undefined) row.description = a.description;
  if (a.amount !== undefined) row.amount = a.amount;
  if (a.category !== undefined) row.category = a.category;
  if (a.requestedBy !== undefined) row.requested_by = a.requestedBy;
  if (a.status !== undefined) row.status = a.status;
  if (a.priority !== undefined) row.priority = a.priority;
  if (a.vendorName !== undefined) row.vendor_name = a.vendorName;
  if (a.workOrderId !== undefined) row.work_order_id = a.workOrderId;
  if (a.votes !== undefined) row.votes = a.votes;
  if (a.threshold !== undefined) row.threshold = a.threshold;
  if (a.notes !== undefined) row.notes = a.notes;
  if (a.decidedAt !== undefined) row.decided_at = a.decidedAt;
  return row;
}

export async function fetchApprovals(tenantId: string): Promise<SpendingApproval[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('spending_approvals')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchApprovals error:', error); return null; }
  return (data || []).map(rowToApproval);
}

export async function createApproval(tenantId: string, approval: Omit<SpendingApproval, 'id'>): Promise<SpendingApproval | null> {
  if (!supabase) return null;
  const row = approvalToRow(approval);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('spending_approvals')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createApproval error:', error); return null; }
  return rowToApproval(data);
}

export async function updateApproval(id: string, updates: Partial<SpendingApproval>): Promise<boolean> {
  if (!supabase) return false;
  const row = approvalToRow(updates);
  const { error } = await supabase.from('spending_approvals').update(row).eq('id', id);
  if (error) { console.error('updateApproval error:', error); return false; }
  return true;
}

export async function deleteApproval(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('spending_approvals').delete().eq('id', id);
  if (error) { console.error('deleteApproval error:', error); return false; }
  return true;
}
