import { supabase, logDbError } from '@/lib/supabase';
import type { Election, BallotItem, UnitBallot, TimelineEvent, VoterComment } from '@/store/useElectionStore';

function rowToElection(
  row: Record<string, unknown>,
  ballotItems: BallotItem[],
  ballots: UnitBallot[],
  timeline: TimelineEvent[],
  comments: VoterComment[],
): Election {
  return {
    id: row.id as string,
    title: row.title as string,
    type: row.type as Election['type'],
    status: row.status as Election['status'],
    description: row.description as string,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
    openedAt: row.opened_at as string | null,
    closedAt: row.closed_at as string | null,
    certifiedAt: row.certified_at as string | null,
    certifiedBy: row.certified_by as string | null,
    scheduledCloseDate: row.scheduled_close_date as string | null,
    noticeDate: row.notice_date as string | null,
    quorumRequired: Number(row.quorum_required),
    ballotItems,
    ballots,
    legalRef: row.legal_ref as string,
    notes: row.notes as string,
    complianceChecks: (row.compliance_checks || []) as Election['complianceChecks'],
    timeline,
    comments,
    resolution: row.resolution as Election['resolution'],
    linkedCaseId: row.linked_case_id as string | null,
    linkedMeetingId: row.linked_meeting_id as string | null,
  };
}

export async function fetchElections(tenantId: string): Promise<Election[] | null> {
  if (!supabase) return null;

  const [electionsRes, itemsRes, ballotsRes, timelineRes, commentsRes] = await Promise.all([
    supabase.from('elections').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabase.from('election_ballot_items').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
    supabase.from('election_ballots').select('*').eq('tenant_id', tenantId),
    supabase.from('election_timeline_events').select('*').eq('tenant_id', tenantId).order('date', { ascending: true }),
    supabase.from('election_comments').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true }),
  ]);

  if (electionsRes.error) { logDbError('fetchElections error:', electionsRes.error); return null; }

  const itemsByElection = new Map<string, BallotItem[]>();
  (itemsRes.data || []).forEach(row => {
    const list = itemsByElection.get(row.election_id) || [];
    list.push({
      id: row.local_id,
      title: row.title,
      description: row.description,
      rationale: row.rationale,
      type: row.type,
      candidates: row.candidates || [],
      maxSelections: row.max_selections || undefined,
      requiredThreshold: Number(row.required_threshold),
      legalRef: row.legal_ref,
      attachments: row.attachments || [],
      financialImpact: row.financial_impact || undefined,
    });
    itemsByElection.set(row.election_id, list);
  });

  const ballotsByElection = new Map<string, UnitBallot[]>();
  (ballotsRes.data || []).forEach(row => {
    const list = ballotsByElection.get(row.election_id) || [];
    list.push({
      id: row.local_id,
      unitNumber: row.unit_number,
      owner: row.owner,
      votingPct: Number(row.voting_pct),
      method: row.method,
      recordedBy: row.recorded_by,
      recordedAt: row.recorded_at,
      isProxy: row.is_proxy,
      proxyVoterName: row.proxy_voter_name || undefined,
      proxyAuthorizedBy: row.proxy_authorized_by || undefined,
      votes: row.votes || {},
      comment: row.comment || undefined,
    });
    ballotsByElection.set(row.election_id, list);
  });

  const timelineByElection = new Map<string, TimelineEvent[]>();
  (timelineRes.data || []).forEach(row => {
    const list = timelineByElection.get(row.election_id) || [];
    list.push({ id: row.local_id, type: row.type as TimelineEvent['type'], description: row.description, date: row.date, actor: row.actor });
    timelineByElection.set(row.election_id, list);
  });

  const commentsByElection = new Map<string, VoterComment[]>();
  (commentsRes.data || []).forEach(row => {
    const list = commentsByElection.get(row.election_id) || [];
    list.push({ id: row.local_id, unitNumber: row.unit_number, owner: row.owner, text: row.text, createdAt: row.created_at });
    commentsByElection.set(row.election_id, list);
  });

  return (electionsRes.data || []).map(row =>
    rowToElection(
      row,
      itemsByElection.get(row.id as string) || [],
      ballotsByElection.get(row.id as string) || [],
      timelineByElection.get(row.id as string) || [],
      commentsByElection.get(row.id as string) || [],
    )
  );
}

export async function createElection(tenantId: string, e: Election): Promise<string | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('elections')
    .insert({
      tenant_id: tenantId,
      title: e.title,
      type: e.type,
      status: e.status,
      description: e.description,
      created_by: e.createdBy,
      opened_at: e.openedAt,
      closed_at: e.closedAt,
      certified_at: e.certifiedAt,
      certified_by: e.certifiedBy,
      scheduled_close_date: e.scheduledCloseDate,
      notice_date: e.noticeDate,
      quorum_required: e.quorumRequired,
      legal_ref: e.legalRef,
      notes: e.notes,
      compliance_checks: e.complianceChecks,
      resolution: e.resolution,
      linked_case_id: e.linkedCaseId,
      linked_meeting_id: e.linkedMeetingId,
    })
    .select('id')
    .single();

  if (error) { logDbError('createElection error:', error); return null; }

  // Insert ballot items
  if (e.ballotItems.length > 0) {
    const itemRows = e.ballotItems.map((bi, i) => ({
      tenant_id: tenantId,
      election_id: data.id,
      local_id: bi.id,
      title: bi.title,
      description: bi.description,
      rationale: bi.rationale,
      type: bi.type,
      candidates: bi.candidates || [],
      max_selections: bi.maxSelections || null,
      required_threshold: bi.requiredThreshold,
      legal_ref: bi.legalRef,
      attachments: bi.attachments,
      financial_impact: bi.financialImpact || null,
      sort_order: i,
    }));
    await supabase.from('election_ballot_items').insert(itemRows);
  }

  // Insert timeline events
  if (e.timeline.length > 0) {
    const tlRows = e.timeline.map(ev => ({
      tenant_id: tenantId,
      election_id: data.id,
      local_id: ev.id,
      type: ev.type,
      description: ev.description,
      date: ev.date,
      actor: ev.actor,
    }));
    await supabase.from('election_timeline_events').insert(tlRows);
  }

  return data.id;
}

export async function updateElection(id: string, updates: Partial<Election>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.type !== undefined) row.type = updates.type;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.openedAt !== undefined) row.opened_at = updates.openedAt;
  if (updates.closedAt !== undefined) row.closed_at = updates.closedAt;
  if (updates.certifiedAt !== undefined) row.certified_at = updates.certifiedAt;
  if (updates.certifiedBy !== undefined) row.certified_by = updates.certifiedBy;
  if (updates.scheduledCloseDate !== undefined) row.scheduled_close_date = updates.scheduledCloseDate;
  if (updates.noticeDate !== undefined) row.notice_date = updates.noticeDate;
  if (updates.quorumRequired !== undefined) row.quorum_required = updates.quorumRequired;
  if (updates.legalRef !== undefined) row.legal_ref = updates.legalRef;
  if (updates.notes !== undefined) row.notes = updates.notes;
  if (updates.complianceChecks !== undefined) row.compliance_checks = updates.complianceChecks;
  if (updates.resolution !== undefined) row.resolution = updates.resolution;
  if (updates.linkedCaseId !== undefined) row.linked_case_id = updates.linkedCaseId;
  if (updates.linkedMeetingId !== undefined) row.linked_meeting_id = updates.linkedMeetingId;
  if (Object.keys(row).length === 0) return true;
  const { error } = await supabase.from('elections').update(row).eq('id', id);
  if (error) { logDbError('updateElection error:', error); return false; }
  return true;
}

export async function deleteElection(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('elections').delete().eq('id', id);
  if (error) { logDbError('deleteElection error:', error); return false; }
  return true;
}

export async function addBallotItem(tenantId: string, electionId: string, item: BallotItem, sortOrder: number): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('election_ballot_items').insert({
    tenant_id: tenantId,
    election_id: electionId,
    local_id: item.id,
    title: item.title,
    description: item.description,
    rationale: item.rationale,
    type: item.type,
    candidates: item.candidates || [],
    max_selections: item.maxSelections || null,
    required_threshold: item.requiredThreshold,
    legal_ref: item.legalRef,
    attachments: item.attachments,
    financial_impact: item.financialImpact || null,
    sort_order: sortOrder,
  });
  if (error) { logDbError('addBallotItem error:', error); return false; }
  return true;
}

export async function removeBallotItem(electionId: string, localId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('election_ballot_items').delete().eq('election_id', electionId).eq('local_id', localId);
  if (error) { logDbError('removeBallotItem error:', error); return false; }
  return true;
}

export async function recordBallot(tenantId: string, electionId: string, ballot: UnitBallot): Promise<boolean> {
  if (!supabase) return false;
  // Upsert by election_id + unit_number
  const { error } = await supabase.from('election_ballots').upsert({
    tenant_id: tenantId,
    election_id: electionId,
    local_id: ballot.id,
    unit_number: ballot.unitNumber,
    owner: ballot.owner,
    voting_pct: ballot.votingPct,
    method: ballot.method,
    recorded_by: ballot.recordedBy,
    recorded_at: ballot.recordedAt,
    is_proxy: ballot.isProxy,
    proxy_voter_name: ballot.proxyVoterName || null,
    proxy_authorized_by: ballot.proxyAuthorizedBy || null,
    votes: ballot.votes,
    comment: ballot.comment || null,
  }, { onConflict: 'election_id,unit_number' });
  if (error) { logDbError('recordBallot error:', error); return false; }
  return true;
}

export async function removeBallot(electionId: string, localId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('election_ballots').delete().eq('election_id', electionId).eq('local_id', localId);
  if (error) { logDbError('removeBallot error:', error); return false; }
  return true;
}

export async function addTimelineEvent(tenantId: string, electionId: string, event: TimelineEvent): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('election_timeline_events').insert({
    tenant_id: tenantId,
    election_id: electionId,
    local_id: event.id,
    type: event.type,
    description: event.description,
    date: event.date,
    actor: event.actor,
  });
  if (error) { logDbError('addTimelineEvent error:', error); return false; }
  return true;
}

export async function addElectionComment(tenantId: string, electionId: string, comment: VoterComment): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('election_comments').insert({
    tenant_id: tenantId,
    election_id: electionId,
    local_id: comment.id,
    unit_number: comment.unitNumber,
    owner: comment.owner,
    text: comment.text,
  });
  if (error) { logDbError('addElectionComment error:', error); return false; }
  return true;
}
