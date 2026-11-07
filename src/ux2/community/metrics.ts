/**
 * Community metrics — the numbers on the Community tiles: notices, meetings,
 * votes, requests and the stewardship leaderboard. Pure functions over a
 * snapshot; the production components underneath keep owning every mutation.
 */
import type { Issue } from '@/types/issues';
import type { Meeting } from '@/store/useMeetingsStore';
import type { Election } from '@/store/useElectionStore';
import type { Announcement, OwnerCommunication } from '@/store/useComplianceStore';
import type { Unit } from '@/types/financial';
import { daysBetween, addDays } from '../runbook/model';
import { ISO_DATE, NOTICE_LEAD_DAYS, REQUEST_SLA_DAYS, noticeSentFor } from '../runbook/adapters';

export interface CommunitySnapshot {
  today: string;
  viewer: { id: string; name: string; email: string; linkedUnits: string[]; isBoard: boolean };
  announcements: Announcement[];
  communications: OwnerCommunication[];
  meetings: Meeting[];
  elections: Election[];
  issues: Issue[];
  units: Unit[];
}

// ── Notices ──────────────────────────────────────────────────────────────────

export function noticesSummary(s: CommunitySnapshot) {
  const sorted = [...s.announcements].sort((a, b) => b.postedDate.localeCompare(a.postedDate));
  const pinned = sorted.filter(a => a.pinned);
  const byCategory = sorted.reduce<Record<string, number>>((acc, a) => { acc[a.category] = (acc[a.category] ?? 0) + 1; return acc; }, {});
  const recent = sorted.filter(a => ISO_DATE.test(a.postedDate.slice(0, 10)) && daysBetween(s.today, a.postedDate.slice(0, 10)) >= -30);
  /** Urgent notices: safety or maintenance posted in the last 7 days. */
  const alerts = sorted.filter(a => (a.category === 'safety' || a.category === 'maintenance') && ISO_DATE.test(a.postedDate.slice(0, 10)) && daysBetween(s.today, a.postedDate.slice(0, 10)) >= -7);
  return { all: sorted, pinned, byCategory, recent, alerts, total: sorted.length };
}

// ── Meetings ─────────────────────────────────────────────────────────────────

export type MinutesState = 'none' | 'draft' | 'approved';

export interface MeetingRow {
  meeting: Meeting;
  daysLeft: number;
  state: 'upcoming' | 'past' | 'cancelled';
  noticeSent: boolean;
  noticeDue: string;
  noticeOverdue: boolean;
  /** Scheduled, but its date has passed without being completed or cancelled. */
  datePassed: boolean;
  agendaCount: number;
  rsvpUnits: number;
  rsvpBoard: number;
  minutes: MinutesState;
  mine: boolean;
}

export function meetingRows(s: CommunitySnapshot): MeetingRow[] {
  return s.meetings
    .filter(m => ISO_DATE.test(m.date))
    .map(m => {
      const d = daysBetween(s.today, m.date);
      // Production calls a SCHEDULED or RESCHEDULED meeting upcoming whatever its date; keep that so both views agree.
      const state: MeetingRow['state'] = m.status === 'CANCELLED' ? 'cancelled' : m.status === 'SCHEDULED' || m.status === 'RESCHEDULED' ? 'upcoming' : 'past';
      const noticeSent = noticeSentFor(m, s.communications);
      const noticeDue = addDays(m.date, -NOTICE_LEAD_DAYS);
      return {
        meeting: m,
        daysLeft: d,
        state,
        noticeSent,
        noticeDue,
        noticeOverdue: state === 'upcoming' && !noticeSent && daysBetween(s.today, noticeDue) < 0,
        datePassed: state === 'upcoming' && d < 0,
        agendaCount: m.agenda.length,
        rsvpUnits: m.attendees.owners.length,
        rsvpBoard: m.attendees.board.length,
        minutes: (m.minutes ? (m.minutesApprovals.length > 0 ? 'approved' : 'draft') : 'none') as MinutesState,
        mine: m.attendees.owners.includes(s.viewer.name) || m.attendees.board.includes(s.viewer.name),
      };
    })
    .sort((a, b) => a.meeting.date.localeCompare(b.meeting.date));
}

export function meetingsSummary(rows: MeetingRow[]) {
  const upcoming = rows.filter(r => r.state === 'upcoming');
  const past = [...rows.filter(r => r.state === 'past')].reverse();
  return {
    next: upcoming[0] ?? null,
    upcoming,
    past,
    minutesToApprove: past.filter(r => r.minutes === 'draft'),
    minutesMissing: past.filter(r => r.minutes === 'none' && r.daysLeft >= -90),
    noticesOverdue: upcoming.filter(r => r.noticeOverdue),
  };
}

// ── Votes ────────────────────────────────────────────────────────────────────

export interface VoteRow {
  election: Election;
  state: 'nominations' | 'open' | 'closed' | 'certified';
  closes: string | null;
  daysLeft?: number;
  votedUnits: number;
  eligibleUnits: number;
  quorumUnits: number;
  quorumMet: boolean;
  /** Whether one of the viewer's units has a ballot on file. */
  voted: boolean;
  proxies: number;
}

export function voteRows(s: CommunitySnapshot): VoteRow[] {
  const eligible = s.units.filter(u => u.status !== 'TRANSFER_PENDING').length || s.units.length;
  return s.elections.map(e => {
    const state: VoteRow['state'] = e.status === 'draft' ? 'nominations' : e.status;
    const closes = e.scheduledCloseDate && ISO_DATE.test(e.scheduledCloseDate) ? e.scheduledCloseDate : null;
    const votedUnits = new Set(e.ballots.map(b => b.unitNumber)).size;
    const quorumUnits = Math.ceil((e.quorumRequired / 100) * eligible);
    return {
      election: e,
      state,
      closes,
      daysLeft: closes ? daysBetween(s.today, closes) : undefined,
      votedUnits,
      eligibleUnits: eligible,
      quorumUnits,
      quorumMet: votedUnits >= quorumUnits && quorumUnits > 0,
      voted: e.ballots.some(b => s.viewer.linkedUnits.includes(b.unitNumber)),
      proxies: e.ballots.filter(b => b.isProxy).length,
    };
  }).sort((a, b) => rank(a.state) - rank(b.state) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

function rank(state: VoteRow['state']): number {
  return { open: 0, nominations: 1, closed: 2, certified: 3 }[state];
}

export function votesSummary(rows: VoteRow[]) {
  const open = rows.filter(r => r.state === 'open');
  return {
    open,
    needsMyVote: open.filter(r => !r.voted),
    nominations: rows.filter(r => r.state === 'nominations'),
    toCertify: rows.filter(r => r.state === 'closed'),
    certified: rows.filter(r => r.state === 'certified'),
  };
}

export interface DecisionRow {
  id: string;
  title: string;
  date: string;
  source: 'case' | 'spending' | 'meeting';
  caseId?: string;
  meetingId?: string;
  yes: number;
  no: number;
  abstain: number;
  passed: boolean | null;
  open: boolean;
}

/** Board decisions for every owner to see: case board votes, meeting motions and spending decisions. */
export function boardDecisions(input: {
  cases: { id: string; title: string; boardVotes: { motion: string; date: string; votes: { vote: string }[] } | null }[];
  meetings: Meeting[];
  approvals: { id: string; title: string; status: string; decidedAt?: string | null; votes?: { vote: string }[]; threshold?: number; caseId?: string }[];
  boardSize: number;
}): DecisionRow[] {
  const out: DecisionRow[] = [];
  const tally = (votes: { vote: string }[]) => ({
    yes: votes.filter(v => /approve|yes|for/i.test(v.vote)).length,
    no: votes.filter(v => /deny|no|against/i.test(v.vote)).length,
    abstain: votes.filter(v => /abstain/i.test(v.vote)).length,
  });
  for (const c of input.cases) {
    if (!c.boardVotes) continue;
    const t = tally(c.boardVotes.votes);
    const open = c.boardVotes.votes.length < Math.max(1, Math.ceil(input.boardSize / 2));
    out.push({ id: `case:${c.id}`, title: c.boardVotes.motion || c.title, date: c.boardVotes.date, source: 'case', caseId: c.id, ...t, passed: open ? null : t.yes > t.no, open });
  }
  for (const m of input.meetings) {
    for (const v of m.votes) {
      if (v.type !== 'board') continue;
      out.push({ id: `meeting:${m.id}:${v.id}`, title: v.motion, date: v.date || m.date, source: 'meeting', meetingId: m.id, yes: v.tally.approve, no: v.tally.deny, abstain: v.tally.abstain, passed: v.status === 'passed', open: false });
    }
  }
  for (const a of input.approvals) {
    const t = tally(a.votes ?? []);
    const open = a.status === 'pending';
    out.push({ id: `spending:${a.id}`, title: a.title, date: (a.decidedAt ?? '').slice(0, 10), source: 'spending', caseId: a.caseId || undefined, ...t, passed: open ? null : a.status === 'approved', open });
  }
  return out.sort((a, b) => Number(b.open) - Number(a.open) || b.date.localeCompare(a.date));
}

// ── Requests ─────────────────────────────────────────────────────────────────

export interface RequestRow {
  issue: Issue;
  mine: boolean;
  step: 1 | 2 | 3;
  stepLabel: 'Received' | 'Assigned' | 'Resolved';
  replyDue: string;
  replyOverdue: boolean;
  upvotes: number;
  upvoted: boolean;
  public: boolean;
}

export function requestRows(s: CommunitySnapshot): RequestRow[] {
  return s.issues.map(i => {
    const submitted = i.submittedDate.slice(0, 10);
    const replyDue = ISO_DATE.test(submitted) ? addDays(submitted, REQUEST_SLA_DAYS) : submitted;
    const step: RequestRow['step'] = i.status === 'SUBMITTED' ? 1 : i.status === 'IN_PROGRESS' ? 2 : 3;
    const openStatus = i.status === 'SUBMITTED' || i.status === 'IN_PROGRESS';
    return {
      issue: i,
      mine: i.reportedBy === s.viewer.id || (!!i.reporterEmail && i.reporterEmail === s.viewer.email) || (!!i.unitNumber && s.viewer.linkedUnits.includes(i.unitNumber)),
      step,
      stepLabel: (step === 1 ? 'Received' : step === 2 ? 'Assigned' : 'Resolved') as RequestRow['stepLabel'],
      replyDue,
      replyOverdue: openStatus && i.status === 'SUBMITTED' && ISO_DATE.test(replyDue) && daysBetween(s.today, replyDue) < 0,
      upvotes: i.upvotes.length,
      upvoted: i.upvotes.some(u => u.userId === s.viewer.id),
      public: i.type === 'BUILDING_PUBLIC',
    };
  }).sort((a, b) => b.issue.submittedDate.localeCompare(a.issue.submittedDate));
}

export function requestsSummary(rows: RequestRow[]) {
  const open = rows.filter(r => r.step < 3);
  return {
    open,
    mine: rows.filter(r => r.mine),
    mineOpen: rows.filter(r => r.mine && r.step < 3),
    building: rows.filter(r => r.public),
    buildingOpen: rows.filter(r => r.public && r.step < 3),
    overdue: open.filter(r => r.replyOverdue),
    resolvedThisYear: rows.filter(r => r.step === 3),
  };
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderRow {
  unit: string;
  /** First name only, or "You". */
  name: string;
  role?: string;
  score: number;
  band: string;
  you: boolean;
}

/**
 * Owners see first names and units only. Owners below 70 appear only to
 * themselves and the board: everyone else sees the row collapsed.
 */
export function leaderboardVisible(rows: LeaderRow[], viewerIsBoard: boolean): LeaderRow[] {
  return rows.filter(r => viewerIsBoard || r.you || r.score >= 70);
}

export function firstName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return full;
  // "M. Chen" style keeps the initial and surname; "Marcus Jones" becomes "Marcus".
  return /^[A-Z]\.$/.test(parts[0]) ? full : parts[0];
}
