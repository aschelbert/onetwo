import { supabase } from '@/lib/supabase';
import type { RegulatoryFiling, FilingAttachment } from '@/store/useComplianceStore';

// ── Regulatory Filings ──

function rowToFiling(r: Record<string, unknown>): RegulatoryFiling {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as string,
    dueDate: r.due_date as string,
    status: r.status as 'pending' | 'filed',
    filedDate: (r.filed_date as string) || null,
    confirmationNum: r.confirmation_num as string,
    notes: r.notes as string,
    responsible: r.responsible as string,
    recurrence: r.recurrence as string,
    legalRef: r.legal_ref as string,
    attachments: (r.attachments || []) as FilingAttachment[],
  };
}

export async function fetchFilings(tenantId: string): Promise<RegulatoryFiling[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('regulatory_filings')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('due_date');
  if (error) { console.error('fetchFilings error:', error); return null; }
  return (data || []).map(rowToFiling);
}

export async function createFiling(tenantId: string, f: RegulatoryFiling): Promise<RegulatoryFiling | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('regulatory_filings')
    .insert({
      tenant_id: tenantId, name: f.name, category: f.category, due_date: f.dueDate,
      status: f.status, filed_date: f.filedDate, confirmation_num: f.confirmationNum,
      notes: f.notes, responsible: f.responsible, recurrence: f.recurrence,
      legal_ref: f.legalRef, attachments: f.attachments,
    })
    .select()
    .single();
  if (error) { console.error('createFiling error:', error); return null; }
  return rowToFiling(data);
}

export async function updateFiling(id: string, updates: Partial<RegulatoryFiling>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.dueDate !== undefined) row.due_date = updates.dueDate;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.filedDate !== undefined) row.filed_date = updates.filedDate;
  if (updates.confirmationNum !== undefined) row.confirmation_num = updates.confirmationNum;
  if (updates.notes !== undefined) row.notes = updates.notes;
  if (updates.responsible !== undefined) row.responsible = updates.responsible;
  if (updates.recurrence !== undefined) row.recurrence = updates.recurrence;
  if (updates.legalRef !== undefined) row.legal_ref = updates.legalRef;
  if (updates.attachments !== undefined) row.attachments = updates.attachments;
  const { error } = await supabase.from('regulatory_filings').update(row).eq('id', id);
  if (error) { console.error('updateFiling error:', error); return false; }
  return true;
}

export async function deleteFiling(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('regulatory_filings').delete().eq('id', id);
  if (error) { console.error('deleteFiling error:', error); return false; }
  return true;
}

// ── Compliance Completions (composite PK: tenant_id + item_id) ──

export async function fetchCompletions(tenantId: string): Promise<Record<string, boolean> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('compliance_completions')
    .select('item_id, completed')
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchCompletions error:', error); return null; }
  const result: Record<string, boolean> = {};
  (data || []).forEach(r => { result[r.item_id] = r.completed; });
  return result;
}

export async function upsertCompletion(tenantId: string, itemId: string, completed: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('compliance_completions').upsert({
    tenant_id: tenantId, item_id: itemId, completed,
  }, { onConflict: 'tenant_id,item_id' });
  if (error) { console.error('upsertCompletion error:', error); return false; }
  return true;
}

// ── Compliance Item Attachments ──

export async function fetchItemAttachments(tenantId: string): Promise<Record<string, FilingAttachment[]> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('compliance_item_attachments')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchItemAttachments error:', error); return null; }
  const result: Record<string, FilingAttachment[]> = {};
  (data || []).forEach(r => {
    const itemId = r.item_id as string;
    if (!result[itemId]) result[itemId] = [];
    result[itemId].push({ name: r.name, size: r.size, uploadedAt: r.uploaded_at });
  });
  return result;
}

export async function createItemAttachment(tenantId: string, itemId: string, att: FilingAttachment): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('compliance_item_attachments').insert({
    tenant_id: tenantId, item_id: itemId, name: att.name, size: att.size, uploaded_at: att.uploadedAt,
  });
  if (error) { console.error('createItemAttachment error:', error); return false; }
  return true;
}

export async function deleteItemAttachment(tenantId: string, itemId: string, attName: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('compliance_item_attachments')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('item_id', itemId)
    .eq('name', attName);
  if (error) { console.error('deleteItemAttachment error:', error); return false; }
  return true;
}
