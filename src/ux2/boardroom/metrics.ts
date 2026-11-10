/**
 * Board Room metrics — open cases with "where it is" and "next", the inbox
 * clock, the outbox, the archive and the runbook catalogue's status. Pure
 * functions; the production Issues page, Communications tab and wizard
 * keep owning every mutation.
 */
import type { CaseTrackerCase, Issue } from '@/types/issues';
import type { GeneratedLetter, LetterTemplate } from '@/lib/services/letterEngine';
import type { MailRecord } from '@/types/mail';
import { daysBetween, addDays } from '../runbook/model';
import { ISO_DATE, REQUEST_SLA_DAYS } from '../runbook/adapters';
import { RUNBOOKS, type RunbookDef } from './runbooks';
import { MONTH_CLOSE_ID, monthCloseTrigger } from './monthClose';

export interface BoardRoomSnapshot {
  today: string;
  viewer: { id: string; name: string; email: string; linkedUnits: string[]; isBoard: boolean; role: string };
  cases: CaseTrackerCase[];
  issues: Issue[];
  letters: GeneratedLetter[];
  templates: LetterTemplate[];
  mailRecords: MailRecord[];
  categories: { id: string; label: string; sits: { id: string; title: string }[] }[];
  runbooksOff: string[];
  /** Day of the month the month close runbook starts (Funds › Settings › Billing rules); 1 when unset. */
  monthCloseStartDay?: number;
}

// ── Open cases ───────────────────────────────────────────────────────────────

export interface CaseRow {
  c: CaseTrackerCase;
  category: string;
  situation: string;
  /** 1-based index of the first open step, and the total. */
  stepIndex: number;
  stepTotal: number;
  stepTitle: string;
  done: number;
  /** What the step waits on: a vote, a spending decision, bids, a conflict check, or the step itself. */
  next: string;
  driver: string;
  due?: string;
  daysLeft?: number;
  overdue: boolean;
  mine: boolean;
  onHold: boolean;
  fromRequest: boolean;
  priorityRank: number;
}

const PRIORITY: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** The situation a case is in, by name: the wizard's title, or the runbook that started it, or the raw id. */
export function situationLabel(s: Pick<BoardRoomSnapshot, 'categories'>, c: CaseTrackerCase): string {
  const title = s.categories.find(x => x.id === c.catId)?.sits.find(x => x.id === c.sitId)?.title;
  if (title) return title;
  if (c.source === 'runbook' && c.sourceId) { const rb = RUNBOOKS.find(r => c.sourceId!.startsWith(`${r.id}:`)); if (rb) return rb.name; }
  return c.sitId;
}

export function caseRows(s: BoardRoomSnapshot): CaseRow[] {
  return s.cases
    .filter(c => c.status !== 'closed')
    .map(c => {
      const steps = c.steps ?? [];
      const idx = steps.findIndex(st => !st.done);
      const step = idx >= 0 ? steps[idx] : undefined;
      const cat = s.categories.find(x => x.id === c.catId);
      const due = c.dueDate && ISO_DATE.test(c.dueDate) ? c.dueDate : undefined;
      const d = due ? daysBetween(s.today, due) : undefined;
      let next = step?.s ?? (steps.length ? 'All steps done · close the case' : 'Add steps');
      if (step?.isSpendingDecision) next = `Spending decision · ${step.s}`;
      else if (step?.requiresBids) next = `Collect bids · ${step.s}`;
      else if (step?.requiresConflictCheck) next = `Conflict check, then ${step.s}`;
      else if (step && /vote/i.test(step.s)) next = `Board vote · ${step.s}`;
      return {
        c,
        category: cat?.label ?? c.catId,
        situation: situationLabel(s, c),
        stepIndex: idx >= 0 ? idx + 1 : steps.length,
        stepTotal: steps.length,
        stepTitle: step?.s ?? '',
        done: steps.filter(st => st.done).length,
        next,
        driver: c.assignedTo || c.assignedRole || c.owner || '—',
        due,
        daysLeft: d,
        overdue: d !== undefined && d < 0,
        mine: !!c.assignedTo && (c.assignedTo === s.viewer.name) || (!!c.assignedRole && c.assignedRole === s.viewer.role),
        onHold: c.status === 'on-hold',
        fromRequest: c.source === 'issue',
        priorityRank: PRIORITY[c.priority] ?? 2,
      };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.priorityRank - b.priorityRank || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

export function casesSummary(rows: CaseRow[]) {
  return {
    open: rows.filter(r => !r.onHold),
    onHold: rows.filter(r => r.onHold),
    mine: rows.filter(r => r.mine),
    overdue: rows.filter(r => r.overdue),
    byCategory: rows.reduce<Record<string, number>>((acc, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc; }, {}),
  };
}

// ── Inbox ────────────────────────────────────────────────────────────────────

export interface InboxRow {
  issue: Issue;
  state: 'new' | 'in_progress' | 'closed';
  replyDue: string;
  daysLeft: number;
  overdue: boolean;
  ackDue: string;
  linkedCase?: CaseTrackerCase;
  assignee: string;
  upvotes: number;
  mine: boolean;
}

export function inboxRows(s: BoardRoomSnapshot): InboxRow[] {
  return s.issues.map(i => {
    const submitted = i.submittedDate.slice(0, 10);
    const replyDue = ISO_DATE.test(submitted) ? addDays(submitted, REQUEST_SLA_DAYS) : submitted;
    const linked = s.cases.find(c => c.source === 'issue' && c.sourceId === i.id);
    const state: InboxRow['state'] = i.status === 'SUBMITTED' ? 'new' : i.status === 'IN_PROGRESS' ? 'in_progress' : 'closed';
    const d = ISO_DATE.test(replyDue) ? daysBetween(s.today, replyDue) : 0;
    return {
      issue: i,
      state,
      replyDue,
      daysLeft: d,
      overdue: state !== 'closed' && d < 0,
      ackDue: ISO_DATE.test(submitted) ? addDays(submitted, 2) : submitted,
      linkedCase: linked,
      assignee: linked?.assignedTo || linked?.assignedRole || 'Unassigned',
      upvotes: i.upvotes.length,
      mine: !!linked && (linked.assignedTo === s.viewer.name || linked.assignedRole === s.viewer.role),
    };
  }).sort((a, b) => Number(a.state === 'closed') - Number(b.state === 'closed') || a.daysLeft - b.daysLeft);
}

export function inboxSummary(rows: InboxRow[]) {
  const open = rows.filter(r => r.state !== 'closed');
  return { open, mine: open.filter(r => r.mine), overdue: open.filter(r => r.overdue), unacknowledged: open.filter(r => r.state === 'new'), closed: rows.filter(r => r.state === 'closed') };
}

// ── Outbox ───────────────────────────────────────────────────────────────────

export function outboxSummary(s: BoardRoomSnapshot) {
  const drafts = s.letters.filter(l => l.status === 'draft');
  const sent = [...s.letters.filter(l => l.status === 'sent')].sort((a, b) => (b.sentDate || '').localeCompare(a.sentDate || ''));
  const ended: string[] = ['delivered', 'returned', 'failed', 'draft'];
  const inTransit = s.mailRecords.filter(m => !ended.includes(m.status));
  const delivered = s.mailRecords.filter(m => m.status === 'delivered');
  const spent = s.mailRecords.filter(m => m.status !== 'draft' && m.status !== 'failed').reduce((t, m) => t + (m.cost?.totalCents ?? 0), 0);
  return { drafts, sent, inTransit, delivered, templates: s.templates, spentCents: spent, sentThisMonth: sent.filter(l => (l.sentDate || '').slice(0, 7) === s.today.slice(0, 7)).length };
}

// ── Archive ──────────────────────────────────────────────────────────────────

export interface ArchiveRow {
  id: string;
  kind: 'case' | 'request' | 'letter';
  title: string;
  detail: string;
  closed: string;
  outcome: string;
  year: string;
  entries: number;
  caseId?: string;
  /** Board-facing type: the case's category label, Inbox for requests, Letters otherwise. */
  type: string;
  /** "board vote 5 of 5" when the case carried one. */
  vote?: string;
}

export function archiveRows(s: BoardRoomSnapshot): ArchiveRow[] {
  const out: ArchiveRow[] = [];
  const label = (catId: string) => s.categories.find(c => c.id === catId)?.label ?? 'Cases';
  const typeOfCase = new Map<string, string>();
  for (const c of s.cases.filter(x => x.status === 'closed')) {
    const closed = (c.completedAt ?? c.created).slice(0, 10);
    const type = label(c.catId);
    typeOfCase.set(c.id, type);
    const yes = c.boardVotes ? c.boardVotes.votes.filter(v => /yes|aye|for|approve/i.test(v.vote)).length : 0;
    out.push({ id: `case:${c.id}`, kind: 'case', type, title: c.title, detail: `${c.id}${c.unit ? ` · Unit ${c.unit}` : ''} · opened ${c.created.slice(0, 10)}`, closed, outcome: c.closeReason || c.closeNotes || 'Closed', year: closed.slice(0, 4), entries: (c.steps?.filter(st => st.done).length ?? 0) + (c.decisionTrail?.length ?? 0) + (c.boardVotes ? 1 : 0), caseId: c.id, vote: c.boardVotes ? `board vote ${yes} of ${c.boardVotes.votes.length}` : undefined });
  }
  for (const i of s.issues.filter(x => x.status === 'RESOLVED' || x.status === 'CLOSED')) {
    const last = i.comments[i.comments.length - 1]?.date ?? i.submittedDate;
    const closed = last.slice(0, 10);
    out.push({ id: `request:${i.id}`, kind: 'request', type: 'Inbox', title: i.title, detail: `${i.id}${i.unitNumber ? ` · Unit ${i.unitNumber}` : ''} · received ${i.submittedDate.slice(0, 10)}${i.comments.length ? ` · replied in ${Math.max(0, daysBetween(i.submittedDate.slice(0, 10), i.comments[0].date.slice(0, 10)))} days` : ''}`, closed, outcome: i.status === 'RESOLVED' ? 'Resolved' : 'Closed', year: closed.slice(0, 4), entries: i.comments.length + 1 });
  }
  for (const l of s.letters.filter(x => x.status === 'sent' || x.status === 'archived')) {
    const closed = (l.sentDate || '').slice(0, 10);
    out.push({ id: `letter:${l.id}`, kind: 'letter', type: (l.caseId && typeOfCase.get(l.caseId)) || 'Letters', title: l.subject || l.templateName, detail: `Letter · ${l.recipient}${l.unitNumber ? ` · Unit ${l.unitNumber}` : ''} · ${l.sentVia || 'sent'}${l.caseId ? ` · part of ${l.caseId}` : ''}`, closed, outcome: l.status === 'sent' ? 'Delivered' : 'Archived', year: closed.slice(0, 4), entries: 1, caseId: l.caseId ?? undefined });
  }
  return out.sort((a, b) => b.closed.localeCompare(a.closed));
}

// ── Runbooks ─────────────────────────────────────────────────────────────────

export interface RunbookStatus {
  def: RunbookDef;
  on: boolean;
  /** What starts it, from the building's settings where the runbook reads one. */
  trigger: string;
  /** Open cases from this runbook's situation. */
  openCases: CaseTrackerCase[];
  lastRan?: { date: string; title: string };
}

/** A case the runbook opened itself carries `source: 'runbook'` and `sourceId: '<runbook id>:<key>'`. */
const startedBy = (c: CaseTrackerCase, def: RunbookDef) => c.source === 'runbook' && !!c.sourceId?.startsWith(`${def.id}:`);

export function runbookStatuses(s: BoardRoomSnapshot): RunbookStatus[] {
  return RUNBOOKS.map(def => {
    // A case the runbook started is its own; a hand-opened case counts by situation, unless another runbook started it.
    const matching = s.cases.filter(c => startedBy(c, def) || (!!def.sitId && c.sitId === def.sitId && c.source !== 'runbook'));
    const openCases = matching.filter(c => c.status !== 'closed');
    const closed = matching.filter(c => c.status === 'closed').sort((a, b) => (b.completedAt ?? b.created).localeCompare(a.completedAt ?? a.created))[0];
    return {
      def,
      on: !s.runbooksOff.includes(def.id),
      trigger: def.id === MONTH_CLOSE_ID ? monthCloseTrigger(s.monthCloseStartDay ?? 1) : def.trigger,
      openCases,
      lastRan: closed ? { date: (closed.completedAt ?? closed.created).slice(0, 10), title: closed.title } : undefined,
    };
  });
}

export function runbooksSummary(list: RunbookStatus[]) {
  return {
    total: list.length,
    on: list.filter(r => r.on).length,
    withOpenCase: list.filter(r => r.openCases.length > 0),
    wired: list.filter(r => r.def.wired).length,
    automatedSteps: list.reduce((t, r) => t + r.def.automated, 0),
    steps: list.reduce((t, r) => t + r.def.steps, 0),
  };
}
