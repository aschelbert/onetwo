import { supabase, logDbError } from '@/lib/supabase';
import type { Meeting } from '@/store/useMeetingsStore';
import type { AgendaAttachment, Ballot, UnitAttendance } from '@/ux2/community/meetingRecord';

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
    items: (row.items || []) as Meeting['items'],
    session: (row.session || {}) as Meeting['session'],
    noticeSentAt: (row.notice_sent_at as string | null) ?? null,
    startedAt: (row.called_to_order_at as string | null) ?? null,
    endedAt: (row.adjourned_at as string | null) ?? null,
    minutesApprovedAt: (row.minutes_approved_at as string | null) ?? null,
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
  if (m.items !== undefined) row.items = m.items;
  if (m.session !== undefined) row.session = m.session;
  if (m.noticeSentAt !== undefined) row.notice_sent_at = m.noticeSentAt;
  if (m.startedAt !== undefined) row.called_to_order_at = m.startedAt;
  if (m.endedAt !== undefined) row.adjourned_at = m.endedAt;
  if (m.minutesApprovedAt !== undefined) row.minutes_approved_at = m.minutesApprovedAt;
  return row;
}

export async function fetchMeetings(tenantId: string): Promise<Meeting[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { logDbError('fetchMeetings error:', error); return null; }
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
  if (error) { logDbError('createMeeting error:', error); return null; }
  return rowToMeeting(data);
}

export async function updateMeeting(id: string, updates: Partial<Meeting>): Promise<boolean> {
  if (!supabase) return false;
  const row = meetingToRow(updates);
  const { error } = await supabase.from('meetings').update(row).eq('id', id);
  if (error) { logDbError('updateMeeting error:', error); return false; }
  return true;
}

export async function deleteMeeting(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) { logDbError('deleteMeeting error:', error); return false; }
  return true;
}

// ── The board-only side of a meeting ─────────────────────────────────────────

export interface MeetingPrivate { attachments: AgendaAttachment[]; attendance: UnitAttendance[] }

export async function fetchMeetingPrivate(meetingId: string): Promise<MeetingPrivate | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('meeting_private').select('attachments, attendance').eq('meeting_id', meetingId).maybeSingle();
  if (error) { logDbError('fetchMeetingPrivate error:', error); return null; }
  return { attachments: (data?.attachments ?? []) as AgendaAttachment[], attendance: (data?.attendance ?? []) as UnitAttendance[] };
}

export async function saveMeetingPrivate(tenantId: string, meetingId: string, rec: MeetingPrivate): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('meeting_private').upsert({ meeting_id: meetingId, tenant_id: tenantId, attachments: rec.attachments, attendance: rec.attendance, updated_at: new Date().toISOString() }, { onConflict: 'meeting_id' });
  if (error) { logDbError('saveMeetingPrivate error:', error); return false; }
  return true;
}

// ── Owner ballots ────────────────────────────────────────────────────────────

function rowToBallot(r: Record<string, unknown>): Ballot {
  return { meetingId: r.meeting_id as string, itemId: r.item_id as string, unit: r.unit_number as string, choice: r.choice as Ballot['choice'], method: r.method as Ballot['method'], proxyHolder: (r.proxy_holder as string | null) ?? undefined, castAt: r.cast_at as string };
}

/** The ballots this user may see: every unit's for the board, their own unit's for an owner. */
export async function fetchMeetingBallots(meetingId: string): Promise<Ballot[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('meeting_ballots').select('*').eq('meeting_id', meetingId);
  if (error) { logDbError('fetchMeetingBallots error:', error); return null; }
  return (data || []).map(rowToBallot);
}

/** Cast or change a unit's ballot; the server checks the unit, the notice and that the vote is open. */
export async function castMeetingBallot(b: Omit<Ballot, 'castAt'>): Promise<{ ballot?: Ballot; error?: string }> {
  if (!supabase) return { error: 'offline' };
  const { data, error } = await supabase.rpc('cast_meeting_ballot', { p_meeting: b.meetingId, p_item: b.itemId, p_unit: b.unit, p_choice: b.choice, p_method: b.method, p_proxy_holder: b.proxyHolder ?? null });
  if (error) return { error: error.message };
  return { ballot: rowToBallot(data as Record<string, unknown>) };
}

export async function deleteMeetingBallot(meetingId: string, itemId: string, unit: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('meeting_ballots').delete().eq('meeting_id', meetingId).eq('item_id', itemId).eq('unit_number', unit);
  if (error) { logDbError('deleteMeetingBallot error:', error); return false; }
  return true;
}

/** How many units have voted on each item: counts only, for any member. */
export async function fetchBallotCounts(meetingId: string): Promise<Record<string, number> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('meeting_ballot_counts', { p_meeting: meetingId });
  if (error) { logDbError('fetchBallotCounts error:', error); return null; }
  return Object.fromEntries(((data || []) as { item_id: string; units: number }[]).map(r => [r.item_id, r.units]));
}
