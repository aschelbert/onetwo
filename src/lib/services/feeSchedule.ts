import { supabase, logDbError } from '@/lib/supabase';
import type { FeeScheduleItem } from '@/store/useFeeScheduleStore';

// ── Fee schedule (composite PK: tenant_id + id, so the app's ids are the rows' ids) ──

export function rowToFee(r: Record<string, unknown>): FeeScheduleItem {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as FeeScheduleItem['category'],
    amount: Number(r.amount),
    amountType: r.amount_type as FeeScheduleItem['amountType'],
    frequency: r.frequency as FeeScheduleItem['frequency'],
    description: (r.description as string) || '',
    authority: (r.authority as string) || '',
    glAccount: (r.gl_account as string) || '',
    enabled: r.enabled as boolean,
    isDefault: r.is_default as boolean,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export function feeToRow(tenantId: string, f: FeeScheduleItem): Record<string, unknown> {
  return {
    tenant_id: tenantId, id: f.id, name: f.name, category: f.category, amount: f.amount, amount_type: f.amountType,
    frequency: f.frequency, description: f.description || '', authority: f.authority || '', gl_account: f.glAccount || '',
    enabled: f.enabled, is_default: f.isDefault, sort_order: f.sortOrder ?? 0,
  };
}

export async function fetchFees(tenantId: string): Promise<FeeScheduleItem[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('fee_schedule').select('*').eq('tenant_id', tenantId).order('sort_order').order('name');
  if (error) { logDbError('fetchFees error:', error); return null; }
  return (data || []).map(rowToFee);
}

export async function upsertFees(tenantId: string, fees: FeeScheduleItem[]): Promise<boolean> {
  if (!supabase || fees.length === 0) return false;
  const { error } = await supabase.from('fee_schedule').upsert(fees.map(f => feeToRow(tenantId, f)), { onConflict: 'tenant_id,id' });
  if (error) { logDbError('upsertFees error:', error); return false; }
  return true;
}

export async function upsertFee(tenantId: string, fee: FeeScheduleItem): Promise<boolean> {
  return upsertFees(tenantId, [fee]);
}

export async function deleteFee(tenantId: string, id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('fee_schedule').delete().eq('tenant_id', tenantId).eq('id', id);
  if (error) { logDbError('deleteFee error:', error); return false; }
  return true;
}
