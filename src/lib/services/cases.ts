import { supabase } from '@/lib/supabase';
import type { CaseTrackerCase, CaseStep, CaseComm } from '@/types/issues';

export async function fetchCases(tenantId: string): Promise<CaseTrackerCase[] | null> {
  if (!supabase) return null;

  const [casesRes, stepsRes, commsRes] = await Promise.all([
    supabase.from('cases').select('*').eq('tenant_id', tenantId).order('created_date', { ascending: false }),
    supabase.from('case_steps').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
    supabase.from('case_communications').select('*').eq('tenant_id', tenantId).order('date', { ascending: true }),
  ]);

  if (casesRes.error) { console.error('fetchCases error:', casesRes.error); return null; }

  const stepsByCase = new Map<string, CaseStep[]>();
  (stepsRes.data || []).forEach(row => {
    const list = stepsByCase.get(row.case_id) || [];
    list.push({
      id: row.local_id,
      s: row.step_text,
      t: row.timing || undefined,
      d: row.doc_ref,
      detail: row.detail,
      w: row.warning || undefined,
      done: row.done,
      doneDate: row.done_date,
      userNotes: row.user_notes,
    });
    stepsByCase.set(row.case_id, list);
  });

  const commsByCase = new Map<string, CaseComm[]>();
  (commsRes.data || []).forEach(row => {
    const list = commsByCase.get(row.case_id) || [];
    list.push({
      id: row.local_id,
      type: row.type,
      subject: row.subject,
      date: row.date,
      method: row.method,
      recipient: row.recipient,
      sentBy: row.sent_by,
      notes: row.notes,
      status: row.status,
    });
    commsByCase.set(row.case_id, list);
  });

  return (casesRes.data || []).map(row => ({
    id: row.id,
    catId: row.cat_id,
    sitId: row.sit_id,
    title: row.title,
    unit: row.unit,
    owner: row.owner,
    approach: row.approach as CaseTrackerCase['approach'],
    status: row.status as CaseTrackerCase['status'],
    priority: row.priority as CaseTrackerCase['priority'],
    created: row.created_date,
    notes: row.notes,
    steps: stepsByCase.get(row.id) || null,
    linkedWOs: (row.linked_wos || []) as string[],
    attachments: [], // attachments stay in localStorage for now (file storage TBD)
    boardVotes: row.board_votes as CaseTrackerCase['boardVotes'],
    additionalApproaches: [], // derived from situation templates, stays client-side
    comms: commsByCase.get(row.id) || [],
  }));
}

export async function createCase(tenantId: string, c: CaseTrackerCase): Promise<string | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('cases')
    .insert({
      tenant_id: tenantId,
      local_id: c.id,
      cat_id: c.catId,
      sit_id: c.sitId,
      title: c.title,
      unit: c.unit,
      owner: c.owner,
      approach: c.approach,
      status: c.status,
      priority: c.priority,
      created_date: c.created,
      notes: c.notes,
      board_votes: c.boardVotes,
      linked_wos: c.linkedWOs,
    })
    .select('id')
    .single();

  if (error) { console.error('createCase error:', error); return null; }

  // Insert steps
  if (c.steps && c.steps.length > 0) {
    const stepRows = c.steps.map((s, i) => ({
      tenant_id: tenantId,
      case_id: data.id,
      local_id: s.id,
      step_text: s.s,
      timing: s.t || null,
      doc_ref: s.d || null,
      detail: s.detail || null,
      warning: s.w || null,
      done: s.done,
      done_date: s.doneDate || null,
      user_notes: s.userNotes,
      sort_order: i,
    }));
    await supabase.from('case_steps').insert(stepRows);
  }

  // Insert comms
  if (c.comms && c.comms.length > 0) {
    const commRows = c.comms.map(cm => ({
      tenant_id: tenantId,
      case_id: data.id,
      local_id: cm.id,
      type: cm.type,
      subject: cm.subject,
      date: cm.date,
      method: cm.method,
      recipient: cm.recipient,
      sent_by: cm.sentBy,
      notes: cm.notes,
      status: cm.status,
    }));
    await supabase.from('case_communications').insert(commRows);
  }

  return data.id;
}

export async function updateCase(id: string, updates: Partial<CaseTrackerCase>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.notes !== undefined) row.notes = updates.notes;
  if (updates.boardVotes !== undefined) row.board_votes = updates.boardVotes;
  if (updates.linkedWOs !== undefined) row.linked_wos = updates.linkedWOs;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (Object.keys(row).length === 0) return true;
  const { error } = await supabase.from('cases').update(row).eq('id', id);
  if (error) { console.error('updateCase error:', error); return false; }
  return true;
}

export async function deleteCase(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) { console.error('deleteCase error:', error); return false; }
  return true;
}

export async function updateCaseStep(caseId: string, localId: string, done: boolean, doneDate: string | null): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('case_steps')
    .update({ done, done_date: doneDate })
    .eq('case_id', caseId)
    .eq('local_id', localId);
  if (error) { console.error('updateCaseStep error:', error); return false; }
  return true;
}

export async function updateCaseStepNote(caseId: string, localId: string, userNotes: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('case_steps')
    .update({ user_notes: userNotes })
    .eq('case_id', caseId)
    .eq('local_id', localId);
  if (error) { console.error('updateCaseStepNote error:', error); return false; }
  return true;
}

export async function addCaseComm(tenantId: string, caseId: string, comm: Omit<CaseComm, 'id'>, localId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('case_communications').insert({
    tenant_id: tenantId,
    case_id: caseId,
    local_id: localId,
    type: comm.type,
    subject: comm.subject,
    date: comm.date,
    method: comm.method,
    recipient: comm.recipient,
    sent_by: comm.sentBy,
    notes: comm.notes,
    status: comm.status,
  });
  if (error) { console.error('addCaseComm error:', error); return false; }
  return true;
}
