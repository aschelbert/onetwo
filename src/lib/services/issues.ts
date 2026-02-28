import { supabase, logDbError } from '@/lib/supabase';
import type { Issue } from '@/types/issues';

interface IssueRow {
  id: string;
  local_id: string;
  type: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  reported_by: string;
  reporter_name: string;
  reporter_email: string;
  unit_number: string | null;
  submitted_date: string;
  view_count: number;
}

function rowToIssue(row: IssueRow, upvotes: Issue['upvotes'], comments: Issue['comments'], reviewNotes: Issue['reviewNotes']): Issue {
  return {
    id: row.id,
    type: row.type as Issue['type'],
    category: row.category,
    priority: row.priority as Issue['priority'],
    status: row.status as Issue['status'],
    title: row.title,
    description: row.description,
    reportedBy: row.reported_by,
    reporterName: row.reporter_name,
    reporterEmail: row.reporter_email,
    unitNumber: row.unit_number || undefined,
    submittedDate: row.submitted_date,
    upvotes,
    viewCount: row.view_count,
    comments,
    reviewNotes,
  };
}

export async function fetchIssues(tenantId: string): Promise<Issue[] | null> {
  if (!supabase) return null;

  const [issuesRes, upvotesRes, commentsRes, notesRes] = await Promise.all([
    supabase.from('issues').select('*').eq('tenant_id', tenantId).order('submitted_date', { ascending: false }),
    supabase.from('issue_upvotes').select('*').eq('tenant_id', tenantId),
    supabase.from('issue_comments').select('*').eq('tenant_id', tenantId).order('date', { ascending: true }),
    supabase.from('issue_review_notes').select('*').eq('tenant_id', tenantId).order('date', { ascending: true }),
  ]);

  if (issuesRes.error) { logDbError('fetchIssues error:', issuesRes.error); return null; }

  const upvotesByIssue = new Map<string, Issue['upvotes']>();
  (upvotesRes.data || []).forEach(u => {
    const list = upvotesByIssue.get(u.issue_id) || [];
    list.push({ userId: u.user_id, userName: u.user_name, unitNumber: u.unit_number });
    upvotesByIssue.set(u.issue_id, list);
  });

  const commentsByIssue = new Map<string, Issue['comments']>();
  (commentsRes.data || []).forEach(c => {
    const list = commentsByIssue.get(c.issue_id) || [];
    list.push({ id: c.local_id, author: c.author, text: c.text, date: c.date });
    commentsByIssue.set(c.issue_id, list);
  });

  const notesByIssue = new Map<string, Issue['reviewNotes']>();
  (notesRes.data || []).forEach(n => {
    const list = notesByIssue.get(n.issue_id) || [];
    list.push({ id: n.local_id, author: n.author, text: n.text, date: n.date });
    notesByIssue.set(n.issue_id, list);
  });

  return (issuesRes.data || []).map(row =>
    rowToIssue(row, upvotesByIssue.get(row.id) || [], commentsByIssue.get(row.id) || [], notesByIssue.get(row.id) || [])
  );
}

export async function createIssue(tenantId: string, issue: Omit<Issue, 'id' | 'upvotes' | 'viewCount' | 'comments' | 'reviewNotes'>, localId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('issues')
    .insert({
      tenant_id: tenantId,
      local_id: localId,
      type: issue.type,
      category: issue.category,
      priority: issue.priority,
      status: issue.status,
      title: issue.title,
      description: issue.description,
      reported_by: issue.reportedBy,
      reporter_name: issue.reporterName,
      reporter_email: issue.reporterEmail,
      unit_number: issue.unitNumber || null,
      submitted_date: issue.submittedDate,
    })
    .select('id')
    .single();
  if (error) { logDbError('createIssue error:', error); return null; }
  return data.id;
}

export async function updateIssueStatus(id: string, status: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('issues').update({ status }).eq('id', id);
  if (error) { logDbError('updateIssueStatus error:', error); return false; }
  return true;
}

export async function addIssueComment(tenantId: string, issueId: string, localId: string, author: string, text: string, date: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('issue_comments').insert({
    tenant_id: tenantId, issue_id: issueId, local_id: localId, author, text, date,
  });
  if (error) { logDbError('addIssueComment error:', error); return false; }
  return true;
}

export async function addIssueUpvote(tenantId: string, issueId: string, userId: string, userName: string, unitNumber: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('issue_upvotes').insert({
    tenant_id: tenantId, issue_id: issueId, user_id: userId, user_name: userName, unit_number: unitNumber,
  });
  if (error) { logDbError('addIssueUpvote error:', error); return false; }
  return true;
}

export async function removeIssueUpvote(issueId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('issue_upvotes').delete().eq('issue_id', issueId).eq('user_id', userId);
  if (error) { logDbError('removeIssueUpvote error:', error); return false; }
  return true;
}
