import { supabase, logDbError } from '@/lib/supabase';
import type { Meeting, AgendaItem } from '@/store/useMeetingsStore';

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
    agendaItems: [],
    noticeSentAt: (row.notice_sent_at as string) || null,
    reminderScheduledFor: (row.reminder_scheduled_for as string) || null,
    packetReady: (row.packet_ready as boolean) || false,
    conflictCheckStatus: (row.conflict_check_status || []) as unknown[],
    calledToOrderAt: (row.called_to_order_at as string) || null,
    adjournedAt: (row.adjourned_at as string) || null,
    quorumMet: row.quorum_met as boolean | undefined,
    minutesGeneratedAt: (row.minutes_generated_at as string) || null,
    minutesApprovedAt: (row.minutes_approved_at as string) || null,
    minutesDoc: (row.minutes_doc as Meeting['minutesDoc']) || null,
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
  if (m.noticeSentAt !== undefined) row.notice_sent_at = m.noticeSentAt;
  if (m.reminderScheduledFor !== undefined) row.reminder_scheduled_for = m.reminderScheduledFor;
  if (m.packetReady !== undefined) row.packet_ready = m.packetReady;
  if (m.conflictCheckStatus !== undefined) row.conflict_check_status = m.conflictCheckStatus;
  if (m.calledToOrderAt !== undefined) row.called_to_order_at = m.calledToOrderAt;
  if (m.adjournedAt !== undefined) row.adjourned_at = m.adjournedAt;
  if (m.quorumMet !== undefined) row.quorum_met = m.quorumMet;
  if (m.minutesGeneratedAt !== undefined) row.minutes_generated_at = m.minutesGeneratedAt;
  if (m.minutesApprovedAt !== undefined) row.minutes_approved_at = m.minutesApprovedAt;
  if (m.minutesDoc !== undefined) row.minutes_doc = m.minutesDoc;
  return row;
}

function agendaItemToRow(meetingId: string, tenantId: string, item: AgendaItem): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: item.id,
    tenant_id: tenantId,
    meeting_id: meetingId,
    position: item.position,
    title: item.title,
    source_type: item.sourceType,
    source_id: item.sourceId,
    requires_vote: item.requiresVote,
    locked: item.locked,
  };
  if (item.motionText !== undefined) row.motion_text = item.motionText;
  if (item.movedBy !== undefined) row.moved_by = item.movedBy;
  if (item.secondedBy !== undefined) row.seconded_by = item.secondedBy;
  if (item.tally !== undefined) row.tally = item.tally;
  if (item.outcome !== undefined) row.outcome = item.outcome;
  if (item.notes !== undefined) row.notes = item.notes;
  if (item.conflictsDeclared !== undefined) row.conflicts_declared = item.conflictsDeclared;
  if (item.completedAt !== undefined) row.completed_at = item.completedAt;
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

  const meetings = (data || []).map(rowToMeeting);

  // Fetch agenda items for all meetings
  const meetingIds = meetings.map(m => m.id);
  if (meetingIds.length > 0) {
    const { data: aiData, error: aiError } = await supabase
      .from('meeting_agenda_items')
      .select('*')
      .in('meeting_id', meetingIds)
      .order('position', { ascending: true });

    if (!aiError && aiData) {
      const byMeeting = new Map<string, AgendaItem[]>();
      for (const row of aiData) {
        const meetingId = row.meeting_id as string;
        const items = byMeeting.get(meetingId) || [];
        items.push({
          id: row.id as string,
          position: row.position as number,
          title: row.title as string,
          sourceType: row.source_type as AgendaItem['sourceType'],
          sourceId: (row.source_id as string) || null,
          requiresVote: row.requires_vote as boolean,
          locked: row.locked as boolean,
          motionText: (row.motion_text as string) || undefined,
          movedBy: (row.moved_by as string) || undefined,
          secondedBy: (row.seconded_by as string) || undefined,
          tally: (row.tally as AgendaItem['tally']) || undefined,
          outcome: (row.outcome as AgendaItem['outcome']) || undefined,
          notes: (row.notes as string) || undefined,
          conflictsDeclared: (row.conflicts_declared as string[]) || undefined,
          completedAt: (row.completed_at as string) || undefined,
        });
        byMeeting.set(meetingId, items);
      }
      for (const meeting of meetings) {
        meeting.agendaItems = byMeeting.get(meeting.id) || [];
      }
    }
  }

  return meetings;
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

export async function createMeetingWithAgenda(
  tenantId: string,
  m: Meeting,
  agendaItems: AgendaItem[],
): Promise<Meeting | null> {
  if (!supabase) return null;
  const row = meetingToRow(m);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('meetings')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createMeetingWithAgenda meeting error:', error); return null; }

  const dbMeeting = rowToMeeting(data);

  // Insert agenda items
  if (agendaItems.length > 0) {
    const rows = agendaItems.map(item => agendaItemToRow(dbMeeting.id, tenantId, item));
    const { error: aiError } = await supabase.from('meeting_agenda_items').insert(rows);
    if (aiError) logDbError('createMeetingWithAgenda items error:', aiError);
  }

  dbMeeting.agendaItems = agendaItems;
  return dbMeeting;
}

export async function upsertAgendaItems(meetingId: string, items: AgendaItem[]): Promise<boolean> {
  if (!supabase) return false;

  // Delete existing then re-insert (simple approach for reordering)
  const { error: delError } = await supabase
    .from('meeting_agenda_items')
    .delete()
    .eq('meeting_id', meetingId);
  if (delError) { logDbError('upsertAgendaItems delete error:', delError); return false; }

  if (items.length > 0) {
    // We need the tenant_id; fetch it from the meeting
    const { data: mtgData } = await supabase
      .from('meetings')
      .select('tenant_id')
      .eq('id', meetingId)
      .single();
    const tenantId = (mtgData?.tenant_id as string) || '';

    const rows = items.map(item => agendaItemToRow(meetingId, tenantId, item));
    const { error: insError } = await supabase.from('meeting_agenda_items').insert(rows);
    if (insError) { logDbError('upsertAgendaItems insert error:', insError); return false; }
  }

  return true;
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
