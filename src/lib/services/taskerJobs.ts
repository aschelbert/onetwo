import { supabase, logDbError } from '@/lib/supabase';
import type { TaskerJob } from '@/store/useTaskerStore';

/**
 * Tasker jobs in tasker_jobs (migration 068). The whole job is kept in `data`;
 * status, the action, the checklist item, the Tasker and the work order are
 * columns too. Board, manager and account owner only (RLS): an owner's load
 * returns none.
 */
export async function fetchTaskerJobs(tenantId: string): Promise<TaskerJob[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('tasker_jobs').select('id, data').eq('tenant_id', tenantId).order('created_at', { ascending: true });
  if (error) { logDbError('fetchTaskerJobs error:', error); return null; }
  return (data ?? []).map(r => ({ ...(r.data as TaskerJob), id: r.id as string }));
}

export async function saveTaskerJob(tenantId: string, j: TaskerJob): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('tasker_jobs').upsert({
    tenant_id: tenantId,
    id: j.id,
    case_id: j.caseId,
    step_idx: j.stepIdx,
    check_id: j.checkId,
    status: j.status,
    tasker_id: j.taskerId,
    work_order_local_id: j.woId,
    data: j,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,id' });
  if (error) { logDbError('saveTaskerJob error:', error); return false; }
  return true;
}
