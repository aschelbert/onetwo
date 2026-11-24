import { supabase, logDbError } from '@/lib/supabase';
import type { CapitalProject } from '@/lib/capitalProject';

/** The whole project is kept in `data`; title and dates are columns too, for lists and reports. */
const toRow = (p: CapitalProject) => ({ id: p.id, title: p.title, opened_on: p.openedOn || null, closed_on: p.closedOn || null, data: p });

export async function fetchProjects(tenantId: string): Promise<CapitalProject[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('capital_projects').select('id, data').eq('tenant_id', tenantId).order('opened_on', { ascending: false });
  if (error) { logDbError('fetchProjects error:', error); return null; }
  return (data || []).map(r => ({ ...(r.data as CapitalProject), id: r.id as string }));
}

/** The project keeps the id the app gave it, so its action can name it at once. */
export async function createProject(tenantId: string, p: CapitalProject): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('capital_projects').insert({ ...toRow(p), tenant_id: tenantId });
  if (error) { logDbError('createProject error:', error); return false; }
  return true;
}

export async function updateProject(p: CapitalProject): Promise<boolean> {
  if (!supabase) return false;
  const { id: _id, ...row } = toRow(p);
  const { error } = await supabase.from('capital_projects').update(row).eq('id', p.id);
  if (error) { logDbError('updateProject error:', error); return false; }
  return true;
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('capital_projects').delete().eq('id', id);
  if (error) { logDbError('deleteProject error:', error); return false; }
  return true;
}
