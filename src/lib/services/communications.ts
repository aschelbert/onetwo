import { supabase } from '@/lib/supabase';
import type { OwnerCommunication } from '@/store/useComplianceStore';

export async function fetchCommunications(tenantId: string): Promise<OwnerCommunication[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('communications')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { console.error('fetchCommunications error:', error); return null; }
  return (data || []).map(row => ({
    id: row.id,
    type: row.type,
    subject: row.subject,
    date: row.date,
    method: row.method,
    recipients: row.recipients,
    respondedBy: row.responded_by,
    status: row.status,
    notes: row.notes,
  }));
}

export async function createCommunication(tenantId: string, c: Omit<OwnerCommunication, 'id'>): Promise<OwnerCommunication | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('communications')
    .insert({
      tenant_id: tenantId,
      type: c.type,
      subject: c.subject,
      date: c.date,
      method: c.method,
      recipients: c.recipients,
      responded_by: c.respondedBy,
      status: c.status,
      notes: c.notes,
    })
    .select()
    .single();
  if (error) { console.error('createCommunication error:', error); return null; }
  return {
    id: data.id,
    type: data.type,
    subject: data.subject,
    date: data.date,
    method: data.method,
    recipients: data.recipients,
    respondedBy: data.responded_by,
    status: data.status,
    notes: data.notes,
  };
}

export async function deleteCommunication(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('communications').delete().eq('id', id);
  if (error) { console.error('deleteCommunication error:', error); return false; }
  return true;
}
