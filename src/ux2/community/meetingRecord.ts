/**
 * A meeting as one record, start to finish: the agenda as items, each with its
 * minutes, its attachments and (when it needs one) its vote; who came, unit by
 * unit; and the meeting's progress through its four steps (agenda → notice →
 * the meeting → summary). Everything here is pure so the screens and the tests
 * share one set of rules.
 *
 * Where the parts live: `items` and `session` are on the meeting (every member
 * reads them, so nothing board-only goes there); board-only attachments and
 * attendance by unit are in the meeting's private record; owner ballots are
 * their own rows, cast through a checked function.
 */
import type { Meeting } from '@/store/useMeetingsStore';
import type { Unit } from '@/types/financial';

export type ItemKind = 'procedure' | 'update' | 'discussion' | 'decision' | 'election';
export type Audience = 'all' | 'board';
export type VoteChoice = 'for' | 'against' | 'abstain';
export type RollCallChoice = VoteChoice | 'recused' | 'absent';
export type BallotMethod = 'online' | 'paper' | 'proxy' | 'remote' | 'room';
export type AttendanceMode = 'in_person' | 'remote' | 'proxy' | 'mail' | 'ballot';

/** What it takes to pass. Owner rules count units (weighted by share); board rules count members. */
export type Threshold = 'majority_voting' | 'majority_all' | 'two_thirds_voting' | 'two_thirds_all' | 'majority_board' | 'majority_present';

/** A table frozen as it stood on its "as of" date. */
export interface ReportSnapshot {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
  note?: string;
}

export type ReportKind = 'balance_sheet' | 'income_statement' | 'budget_vs_actual' | 'reserve_status' | 'delinquency' | 'dues_by_unit' | 'open_requests' | 'proposed_budget';

export interface AgendaAttachment {
  id: string;
  /** Board-only attachments live apart from the meeting, so they name their item. */
  itemId?: string;
  name: string;
  source: 'report' | 'document' | 'upload';
  report?: ReportKind;
  asOf?: string;
  /** frozen: kept as captured. live: refreshed until the notice goes out, then frozen. */
  mode: 'frozen' | 'live';
  audience: Audience;
  capturedAt: string;
  capturedBy: string;
  snapshot?: ReportSnapshot;
  /** A building document this points at. */
  documentId?: string;
  /** An uploaded file's storage path. */
  path?: string;
  size?: string;
}

export interface VoteResult {
  for: number;
  against: number;
  abstain: number;
  /** Units (or members) that didn't vote. */
  notVoted: number;
  /** Weighted shares, 0–100, for owner votes. */
  forPct?: number; againstPct?: number; abstainPct?: number;
  candidates?: { name: string; count: number; elected: boolean }[];
  /** Owner votes: ballots by how they came in. */
  bySource?: Partial<Record<BallotMethod, { for: number; against: number; abstain: number; units: number }>>;
  passed: boolean;
  closedAt: string;
  closedBy: string;
}

export interface ItemVote {
  who: 'owners' | 'board';
  question: string;
  threshold: Threshold;
  /** Elections: names to pick from, and how many to pick. */
  candidates?: string[];
  pick?: number;
  secret?: boolean;
  status: 'draft' | 'open' | 'closed';
  openedAt?: string;
  /** Board votes: who moved and seconded, and each member's vote. */
  movedBy?: string;
  secondedBy?: string;
  rollCall?: Record<string, RollCallChoice>;
  /** Owner votes: the hand count from the room, entered by the Secretary. */
  roomCount?: { for: number; against: number; abstain: number };
  result?: VoteResult;
}

export interface AgendaItem {
  id: string;
  title: string;
  kind: ItemKind;
  minutes: string;
  startedAt?: string;
  endedAt?: string;
  attachments: AgendaAttachment[];
  vote?: ItemVote;
}

export interface UnitAttendance {
  unit: string;
  owner: string;
  mode: AttendanceMode;
  proxyTo?: string;
  at: string;
}

export type Channel = 'app' | 'email' | 'mail';
export interface ChannelReport { app?: number; email?: number; emailNote?: string; mail?: number; mailNote?: string }

export interface MeetingSession {
  currentItemId?: string;
  /** The minutes-taker, shown on the run view. */
  secretary?: string;
  quorumPct?: number;
  notice?: { at: string; by: string; channels: ChannelReport; reminder?: string };
  summary?: { at: string; by: string; channels: ChannelReport; decided: string; next: string };
  sealedAt?: string;
}

export interface Ballot {
  meetingId: string;
  itemId: string;
  unit: string;
  choice: VoteChoice | string[];
  method: BallotMethod;
  proxyHolder?: string;
  castAt: string;
}

// ── Items ────────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<ItemKind, string> = { procedure: 'Procedure', update: 'Update', discussion: 'Discussion', decision: 'Decision', election: 'Election' };

export function guessKind(title: string): ItemKind {
  if (/elect/i.test(title)) return 'election';
  if (/call to order|quorum|adjourn|roll call/i.test(title)) return 'procedure';
  if (/report|update|review/i.test(title)) return 'update';
  if (/vote|adopt|approve|award|ratif|amend|elect/i.test(title)) return 'decision';
  return 'discussion';
}

/** The meeting's items: its own, or ones made from a plain agenda list (older meetings). Ids stay stable by position. */
export function itemsOf(m: Pick<Meeting, 'id' | 'agenda'> & { items?: AgendaItem[] }): AgendaItem[] {
  if (m.items && m.items.length) return m.items;
  return (m.agenda ?? []).map((title, i) => ({ id: `${m.id}-a${i + 1}`, title, kind: guessKind(title), minutes: '', attachments: [] }));
}

export function newItemId(): string {
  return `it_${Math.random().toString(36).slice(2, 10)}`;
}

export const THRESHOLD_LABEL: Record<Threshold, string> = {
  majority_voting: 'Majority of units voting',
  majority_all: 'Majority of all units',
  two_thirds_voting: 'Two-thirds of units voting',
  two_thirds_all: 'Two-thirds of all units',
  majority_board: 'Majority of the board',
  majority_present: 'Majority of members present',
};

export function defaultVote(who: 'owners' | 'board', item: Pick<AgendaItem, 'title' | 'kind'>): ItemVote {
  const election = item.kind === 'election';
  return {
    who,
    question: election ? item.title : `${item.title.replace(/[?.]$/, '')}?`,
    threshold: who === 'owners' ? 'majority_voting' : 'majority_board',
    ...(election ? { candidates: [], pick: 1, secret: true } : {}),
    status: 'draft',
  };
}

// ── Counting ─────────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Each unit's weight: its share when every unit has one, otherwise equal. */
export function weights(units: Pick<Unit, 'number' | 'votingPct'>[]): Map<string, number> {
  const all = units.length > 0 && units.every(u => u.votingPct > 0);
  return new Map(units.map(u => [u.number, all ? u.votingPct : 1]));
}

/** Units needed for quorum. */
export function quorumUnits(unitCount: number, pct = 51): number {
  return Math.max(1, Math.ceil((unitCount * pct) / 100));
}

/** Owner vote: count the ballots (plus the room's hand count) and say whether it passes. */
export function tallyOwnerVote(vote: ItemVote, ballots: Ballot[], units: Pick<Unit, 'number' | 'votingPct'>[], closedBy: string, closedAt: string): VoteResult {
  const w = weights(units);
  const totalW = [...w.values()].reduce((a, b) => a + b, 0) || 1;
  const avgW = totalW / Math.max(1, units.length);
  const bySource: VoteResult['bySource'] = {};
  let f = 0, a = 0, ab = 0, fW = 0, aW = 0, abW = 0;
  const cand = new Map((vote.candidates ?? []).map(n => [n, 0]));
  for (const b of ballots) {
    const s = (bySource[b.method] ??= { for: 0, against: 0, abstain: 0, units: 0 });
    s.units += 1;
    const wt = w.get(b.unit) ?? avgW;
    if (Array.isArray(b.choice)) { for (const n of b.choice) if (cand.has(n)) cand.set(n, (cand.get(n) ?? 0) + 1); continue; }
    if (b.choice === 'for') { f++; fW += wt; s.for++; } else if (b.choice === 'against') { a++; aW += wt; s.against++; } else { ab++; abW += wt; s.abstain++; }
  }
  const room = vote.roomCount;
  if (room && room.for + room.against + room.abstain > 0) {
    bySource.room = { for: room.for, against: room.against, abstain: room.abstain, units: room.for + room.against + room.abstain };
    f += room.for; a += room.against; ab += room.abstain;
    fW += room.for * avgW; aW += room.against * avgW; abW += room.abstain * avgW;
  }
  const votedUnits = ballots.length + (room ? room.for + room.against + room.abstain : 0);
  const notVoted = Math.max(0, units.length - votedUnits);
  let passed: boolean;
  if (vote.candidates?.length) {
    passed = votedUnits > 0;
  } else {
    const cast = fW + aW;
    passed = vote.threshold === 'majority_all' ? fW > totalW / 2
      : vote.threshold === 'two_thirds_all' ? fW >= (totalW * 2) / 3
      : vote.threshold === 'two_thirds_voting' ? cast > 0 && fW >= (cast * 2) / 3
      : cast > 0 && fW > cast / 2;
  }
  const ranked = [...cand.entries()].sort((x, y) => y[1] - x[1]);
  const pick = vote.pick ?? 1;
  return {
    for: f, against: a, abstain: ab, notVoted,
    forPct: round1((fW / totalW) * 100), againstPct: round1((aW / totalW) * 100), abstainPct: round1((abW / totalW) * 100),
    ...(vote.candidates?.length ? { candidates: electedOf(ranked, pick) } : {}),
    bySource, passed, closedAt, closedBy,
  };
}

/** The top `pick` names win; a tie at the last seat elects nobody at that count (the chair settles it). */
function electedOf(ranked: [string, number][], pick: number): { name: string; count: number; elected: boolean }[] {
  const cut = ranked[pick - 1]?.[1] ?? 0;
  const tiedOver = ranked.slice(pick).some(([, c]) => c === cut);
  return ranked.map(([name, count], i) => ({ name, count, elected: i < pick && count > 0 && !(tiedOver && count === cut) }));
}

/** Board vote: the roll call against the rule. */
export function tallyBoardVote(vote: ItemVote, boardNames: string[], closedBy: string, closedAt: string): VoteResult {
  const rc = vote.rollCall ?? {};
  const count = (c: RollCallChoice) => boardNames.filter(n => rc[n] === c).length;
  const f = count('for'), a = count('against'), ab = count('abstain');
  const present = boardNames.filter(n => rc[n] && rc[n] !== 'absent' && rc[n] !== 'recused').length;
  const needed = vote.threshold === 'majority_present' ? Math.floor(present / 2) + 1 : Math.floor(boardNames.length / 2) + 1;
  return { for: f, against: a, abstain: ab, notVoted: boardNames.length - f - a - ab, passed: f >= needed && f > a, closedAt, closedBy };
}

/** Board vote: how many "for" it needs right now. */
export function boardVotesNeeded(vote: ItemVote, boardNames: string[]): number {
  const rc = vote.rollCall ?? {};
  const present = boardNames.filter(n => rc[n] && rc[n] !== 'absent' && rc[n] !== 'recused').length;
  return vote.threshold === 'majority_present' ? Math.floor(Math.max(1, present) / 2) + 1 : Math.floor(boardNames.length / 2) + 1;
}

export function resultLine(v: ItemVote): string {
  const r = v.result;
  if (!r) return '';
  if (r.candidates?.length) return r.candidates.map(c => `${c.name} ${c.count}${c.elected ? ' (elected)' : ''}`).join(', ');
  const base = `${r.for} for, ${r.against} against${r.abstain ? `, ${r.abstain} abstaining` : ''}`;
  return `${r.passed ? 'Passed' : 'Failed'}: ${base}${v.who === 'owners' && r.notVoted ? `; ${r.notVoted} didn't vote` : ''}`;
}

// ── Steps ────────────────────────────────────────────────────────────────────

export type MeetingStep = 1 | 2 | 3 | 4;
export const STEP_LABEL: Record<MeetingStep, string> = { 1: 'Agenda, votes and reports', 2: 'Notice and ballots', 3: 'The meeting: minutes, votes and attendance', 4: 'Summary to owners' };

export interface MeetingTimes { noticeSentAt?: string | null; startedAt?: string | null; endedAt?: string | null; minutesApprovedAt?: string | null }

/** Which step the meeting is on. */
export function stepOf(m: MeetingTimes & { status: string; session?: MeetingSession }): MeetingStep {
  if (m.endedAt || m.status === 'COMPLETED') return 4;
  if (m.startedAt || m.status === 'IN_PROGRESS') return 3;
  if (m.noticeSentAt || m.session?.notice) return 2;
  return 1;
}

export interface Readiness { label: string; ok: boolean }
/** What should be true before the notice goes out. */
export function readiness(m: Pick<Meeting, 'date' | 'time' | 'location' | 'virtualLink'>, items: AgendaItem[]): Readiness[] {
  const votes = items.filter(i => i.vote);
  return [
    { label: 'Date, time and room or remote link', ok: !!m.date && !!m.time && !!(m.location || m.virtualLink) },
    { label: 'At least one agenda item', ok: items.length > 0 },
    { label: votes.length ? `Every vote has its question and rule (${votes.length})` : 'No votes on this agenda', ok: votes.every(i => !!i.vote?.question.trim() && (!i.vote.candidates || i.vote.candidates.length > 0)) },
    { label: 'Election nominees named', ok: votes.filter(i => i.vote?.candidates).every(i => (i.vote?.candidates?.length ?? 0) >= (i.vote?.pick ?? 1)) },
  ];
}

// ── Notice and summary text ──────────────────────────────────────────────────

/** "Thursday, December 10, 2026" */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
/** "19:00" → "7:00 PM" */
export function clock(hhmm: string): string {
  const [h, mi] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(mi || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function noticeText(m: Pick<Meeting, 'title' | 'date' | 'time' | 'location' | 'virtualLink'>, items: AgendaItem[], quorum: number, building: string): string {
  const when = `${longDate(m.date)}${m.time ? ` at ${clock(m.time)}` : ''}`;
  const where = [m.location, m.virtualLink ? `or remotely: ${m.virtualLink}` : ''].filter(Boolean).join(' ');
  const agenda = items.map((it, i) => `${i + 1}. ${it.title}${it.vote ? (it.vote.who === 'owners' ? ' (owner vote)' : ' (board vote)') : ''}`).join('\n');
  const ownerVotes = items.filter(i => i.vote?.who === 'owners');
  return [
    `${building}'s ${m.title} is on ${when}${where ? `, ${where}` : ''}. Every owner is welcome.`,
    ownerVotes.length ? `You vote on ${ownerVotes.length} item${ownerVotes.length === 1 ? '' : 's'}; vote ahead in the app or at the meeting, or give a proxy. A quorum is ${quorum} units, and a ballot sent ahead counts toward it.` : '',
    agenda ? `Agenda:\n${agenda}` : '',
  ].filter(Boolean).join('\n\n');
}

/** "What was decided", written from the recorded votes. */
export function decidedText(items: AgendaItem[], present: number, unitCount: number): string {
  const lines = items.filter(i => i.vote?.result).map(i => {
    const v = i.vote!, r = v.result!;
    if (r.candidates?.length) {
      const elected = r.candidates.filter(c => c.elected).map(c => c.name);
      return `${i.title}: ${elected.length ? `${elected.join(' and ')} elected` : 'no one elected'}.`;
    }
    return `${i.title}: ${r.passed ? 'passed' : 'failed'}, ${r.for} for, ${r.against} against${r.abstain ? `, ${r.abstain} abstaining` : ''}.`;
  });
  if (unitCount) lines.push(`${present} of ${unitCount} units took part.`);
  return lines.join('\n');
}

/** The minutes as one text: each item's own minutes and its recorded vote. */
export function composeMinutes(items: AgendaItem[], header: string): string {
  const body = items.map((it, i) => {
    const vote = it.vote?.result ? `\nVote: ${resultLine(it.vote)}.` : '';
    return `${i + 1}. ${it.title}\n${it.minutes.trim() || '—'}${vote}`;
  }).join('\n\n');
  return `${header}\n\n${body}`.trim();
}

// ── Attendance and channels ──────────────────────────────────────────────────

export const MODE_LABEL: Record<AttendanceMode, string> = { in_person: 'In person', remote: 'Remote', proxy: 'By proxy', mail: 'Mailed ballot', ballot: 'Voted ahead' };
export const METHOD_LABEL: Record<BallotMethod, string> = { online: 'Online, ahead', paper: 'Paper by mail', proxy: 'Proxies', remote: 'Remote, on their phones', room: 'In the room, by hand' };

export function attendanceCounts(att: UnitAttendance[]): Record<AttendanceMode, number> & { present: number } {
  const c = { in_person: 0, remote: 0, proxy: 0, mail: 0, ballot: 0, present: att.length };
  for (const a of att) c[a.mode] += 1;
  return c;
}

/** Who each channel reaches: everyone in the app, units with an email, and by mail the units without one (plus any that asked for paper). */
export function channelReach(units: Pick<Unit, 'number' | 'email'>[], paperUnits: string[] = []): { app: number; email: number; mail: number; mailUnits: string[] } {
  const mailUnits = units.filter(u => !u.email || paperUnits.includes(u.number)).map(u => u.number);
  return { app: units.length, email: units.filter(u => !!u.email).length, mail: mailUnits.length, mailUnits };
}

/**
 * Who's present for quorum: everyone checked in, plus units whose ballot came
 * in another way (a proxy, a mailed ballot, or online ahead of the meeting).
 */
export function presentUnits(checkedIn: UnitAttendance[], ballots: Ballot[], units: Pick<Unit, 'number' | 'owner'>[]): UnitAttendance[] {
  const out = new Map(checkedIn.map(a => [a.unit, a]));
  const owner = (n: string) => units.find(u => u.number === n)?.owner ?? '';
  for (const b of [...ballots].sort((x, y) => x.castAt.localeCompare(y.castAt))) {
    if (out.has(b.unit)) continue;
    const mode: AttendanceMode = b.method === 'proxy' ? 'proxy' : b.method === 'paper' ? 'mail' : b.method === 'online' ? 'ballot' : b.method === 'remote' ? 'remote' : 'in_person';
    out.set(b.unit, { unit: b.unit, owner: owner(b.unit), mode, proxyTo: b.proxyHolder, at: b.castAt });
  }
  return [...out.values()].sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));
}

/** The whole record as plain text: for downloading and for the archive. */
export function recordText(input: {
  building: string; meeting: Pick<Meeting, 'title' | 'date' | 'time' | 'location'> & MeetingTimes & { session?: MeetingSession; minutesApprovals?: Meeting['minutesApprovals'] };
  items: AgendaItem[]; attendance: UnitAttendance[]; unitCount: number; boardPresent: string[]; includeUnits: boolean;
}): string {
  const { meeting: m, items, attendance } = input;
  const c = attendanceCounts(attendance);
  const lines = [
    `${input.building} · ${m.title}`,
    `${m.date}${m.time ? ` ${m.time}` : ''}${m.location ? ` · ${m.location}` : ''}`,
    m.startedAt ? `Called to order ${m.startedAt.slice(11, 16)}${m.endedAt ? ` · adjourned ${m.endedAt.slice(11, 16)}` : ''}` : '',
    `Present: ${c.present} of ${input.unitCount} units (${(Object.keys(MODE_LABEL) as AttendanceMode[]).filter(k => c[k]).map(k => `${c[k]} ${MODE_LABEL[k].toLowerCase()}`).join(', ') || 'none'})`,
    input.boardPresent.length ? `Board present: ${input.boardPresent.join(', ')}` : '',
    m.session?.notice ? `Notice sent ${m.session.notice.at.slice(0, 10)}` : '',
    m.minutesApprovals?.length ? `Minutes approved by ${m.minutesApprovals.map(a => a.name).join(', ')}` : 'Minutes not yet approved',
    '',
    composeMinutes(items, 'Minutes'),
  ];
  if (input.includeUnits && attendance.length) {
    lines.push('', 'Attendance by unit', ...attendance.map(a => `Unit ${a.unit} · ${a.owner || '—'} · ${MODE_LABEL[a.mode]}${a.proxyTo ? ` to ${a.proxyTo}` : ''}`));
  }
  return lines.filter(l => l !== '').join('\n').replace(/\nMinutes/, '\n\nMinutes');
}
