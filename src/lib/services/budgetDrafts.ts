import { supabase, logDbError } from '@/lib/supabase';
import type { BudgetDraft } from '@/ux2/boardroom/budgetDraft';

/** Every budget draft the board has, newest fiscal year first. Board and manager only (RLS). */
export async function fetchBudgetDrafts(tenantId: string): Promise<BudgetDraft[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('budget_drafts').select('fy_start, data').eq('tenant_id', tenantId).order('fy_start', { ascending: false });
  if (error) { logDbError('fetchBudgetDrafts error:', error); return null; }
  return (data ?? []).map(r => ({ ...(r.data as BudgetDraft), fyStart: r.fy_start as string }));
}

export async function saveBudgetDraft(tenantId: string, d: BudgetDraft): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('budget_drafts').upsert({ tenant_id: tenantId, fy_start: d.fyStart, data: d, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,fy_start' });
  if (error) { logDbError('saveBudgetDraft error:', error); return false; }
  return true;
}
