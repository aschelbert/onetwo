import { supabase } from '@/lib/supabase';
import type { Announcement } from '@/store/useComplianceStore';

export async function fetchAnnouncements(tenantId: string): Promise<Announcement[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('posted_date', { ascending: false });
  if (error) { console.error('fetchAnnouncements error:', error); return null; }
  return (data || []).map(row => ({
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    postedBy: row.posted_by,
    postedDate: row.posted_date,
    pinned: row.pinned,
  }));
}

export async function createAnnouncement(tenantId: string, a: Omit<Announcement, 'id'>): Promise<Announcement | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      tenant_id: tenantId,
      title: a.title,
      body: a.body,
      category: a.category,
      posted_by: a.postedBy,
      posted_date: a.postedDate,
      pinned: a.pinned,
    })
    .select()
    .single();
  if (error) { console.error('createAnnouncement error:', error); return null; }
  return {
    id: data.id,
    title: data.title,
    body: data.body,
    category: data.category,
    postedBy: data.posted_by,
    postedDate: data.posted_date,
    pinned: data.pinned,
  };
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) { console.error('deleteAnnouncement error:', error); return false; }
  return true;
}

export async function updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.body !== undefined) row.body = updates.body;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.postedBy !== undefined) row.posted_by = updates.postedBy;
  if (updates.postedDate !== undefined) row.posted_date = updates.postedDate;
  if (updates.pinned !== undefined) row.pinned = updates.pinned;
  const { error } = await supabase.from('announcements').update(row).eq('id', id);
  if (error) { console.error('updateAnnouncement error:', error); return false; }
  return true;
}
