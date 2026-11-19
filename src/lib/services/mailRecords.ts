import { supabase, logDbError } from '@/lib/supabase';
import type { MailRecord } from '@/types/mail';

/**
 * The building's letter history in mail_records. Rows are added by the
 * send-mail function as a letter goes out; the app reads them and may update
 * tracking. Board, manager and account owner only (RLS): an owner's load
 * returns none. The whole record is kept in `data`; the status and the USPS
 * tracking number are columns too.
 */
export async function fetchMailRecords(tenantId: string): Promise<MailRecord[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('mail_records').select('id, data').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(500);
  if (error) { logDbError('fetchMailRecords error:', error); return null; }
  return (data ?? []).map(r => ({ ...(r.data as MailRecord), id: r.id as string }));
}

/** Save tracking a board member recorded. False when the row could not be updated. */
export async function updateMailRecord(tenantId: string, r: MailRecord): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.from('mail_records')
    .update({ status: r.status, tracking_number: r.trackingNumber || null, data: r })
    .eq('tenant_id', tenantId).eq('id', r.id).select('id');
  if (error) { logDbError('updateMailRecord error:', error); return false; }
  return !!data?.length;
}
