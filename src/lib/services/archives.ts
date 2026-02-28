import { supabase } from '@/lib/supabase';
import type { ArchiveSnapshot } from '@/store/useArchiveStore';

function rowToArchive(r: Record<string, unknown>): ArchiveSnapshot {
  const snapshot = (r.snapshot || {}) as Record<string, unknown>;
  return {
    id: r.id as string,
    label: r.label as string,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    createdAt: r.created_at as string,
    createdBy: r.created_by as string,
    compliance: snapshot.compliance as ArchiveSnapshot['compliance'],
    regulatoryRefresh: snapshot.regulatoryRefresh as ArchiveSnapshot['regulatoryRefresh'],
    filings: snapshot.filings as ArchiveSnapshot['filings'],
    meetings: snapshot.meetings as ArchiveSnapshot['meetings'],
    communications: snapshot.communications as ArchiveSnapshot['communications'],
    financial: snapshot.financial as ArchiveSnapshot['financial'],
    insurance: snapshot.insurance as ArchiveSnapshot['insurance'],
    legalDocuments: snapshot.legalDocuments as ArchiveSnapshot['legalDocuments'],
    board: snapshot.board as ArchiveSnapshot['board'],
  };
}

export async function fetchArchives(tenantId: string): Promise<ArchiveSnapshot[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('archives')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('period_end', { ascending: false });
  if (error) { console.error('fetchArchives error:', error); return null; }
  return (data || []).map(rowToArchive);
}

export async function createArchive(tenantId: string, a: ArchiveSnapshot): Promise<ArchiveSnapshot | null> {
  if (!supabase) return null;
  const { compliance, regulatoryRefresh, filings, meetings, communications, financial, insurance, legalDocuments, board } = a;
  const snapshot = { compliance, regulatoryRefresh, filings, meetings, communications, financial, insurance, legalDocuments, board };
  const { data, error } = await supabase
    .from('archives')
    .insert({
      tenant_id: tenantId,
      label: a.label,
      period_start: a.periodStart,
      period_end: a.periodEnd,
      created_by: a.createdBy,
      snapshot,
    })
    .select()
    .single();
  if (error) { console.error('createArchive error:', error); return null; }
  return rowToArchive(data);
}

export async function deleteArchive(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('archives').delete().eq('id', id);
  if (error) { console.error('deleteArchive error:', error); return false; }
  return true;
}
