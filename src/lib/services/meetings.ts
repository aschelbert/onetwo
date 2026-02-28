import { supabase } from '@/lib/supabase';
import type { Meeting } from '@/store/useMeetingsStore';

function rowToMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: row.id as string,
    title: row.title as string,
    type: row.type as string,
    status: row.status as string,
    date: row.date as string,
    time: row.time as string,
    location: row.location as string,
    virtualLink: row.virtual_link as string,
    agenda: (row.agenda || []) as string[],
    notes: row.notes as string,
    attendees: (row.attendees || { board: [], owners: [], guests: [] }) as Meeting['attendees'],
    minutes: row.minutes as string,
    votes: (row.votes || []) as Meeting['votes'],
    linkedCaseIds: (row.linked_case_ids || []) as string[],
    linkedVoteIds: (row.linked_vote_ids || []) as string[],
    documents: (row.documents || []) as Meeting['documents'],
    minutesApprovals: (row.minutes_approvals || []) as Meeting['minutesApprovals'],
  };
}

function meetingToRow(m: Partial<Meeting>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (m.title !== undefined) row.title = m.title;
  if (m.type !== undefined) row.type = m.type;
  if (m.status !== undefined) row.status = m.status;
  if (m.date !== undefined) row.date = m.date;
  if (m.time !== undefined) row.time = m.time;
  if (m.location !== undefined) row.location = m.location;
  if (m.virtualLink !== undefined) row.virtual_link = m.virtualLink;
  if (m.agenda !== undefined) row.agenda = m.agenda;
  if (m.notes !== undefined) row.notes = m.notes;
  if (m.attendees !== undefined) row.attendees = m.attendees;
  if (m.minutes !== undefined) row.minutes = m.minutes;
  if (m.votes !== undefined) row.votes = m.votes;
  if (m.linkedCaseIds !== undefined) row.linked_case_ids = m.linkedCaseIds;
  if (m.linkedVoteIds !== undefined) row.linked_vote_ids = m.linkedVoteIds;
  if (m.documents !== undefined) row.documents = m.documents;
  if (m.minutesApprovals !== undefined) row.minutes_approvals = m.minutesApprovals;
  return row;
}

export async function fetchMeetings(tenantId: string): Promise<Meeting[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { console.error('fetchMeetings error:', error); return null; }
  return (data || []).map(rowToMeeting);
}

export async function createMeeting(tenantId: string, m: Omit<Meeting, 'id'>): Promise<Meeting | null> {
  if (!supabase) return null;
  const row = meetingToRow(m);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('meetings')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createMeeting error:', error); return null; }
  return rowToMeeting(data);
}

export async function updateMeeting(id: string, updates: Partial<Meeting>): Promise<boolean> {
  if (!supabase) return false;
  const row = meetingToRow(updates);
  const { error } = await supabase.from('meetings').update(row).eq('id', id);
  if (error) { console.error('updateMeeting error:', error); return false; }
  return true;
}

export async function deleteMeeting(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) { console.error('deleteMeeting error:', error); return false; }
  return true;
}
