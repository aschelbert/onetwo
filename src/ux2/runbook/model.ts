/**
 * Runbook cards — the model behind Home.
 *
 * A card is one thing a person can do or needs to know, dated, with the one
 * action that completes it. Cards are generated from existing data (obligations,
 * case steps, votes, meetings, requests, money, insurance, setup) by
 * `generateCards`, which also ranks them the way the production Dashboard
 * ranked its "Your Action Items": overdue filings first, then urgent cases,
 * then meetings inside 14 days, then your runbook items.
 *
 * The input is a neutral shape (`CardInput`) so each store maps into it with a
 * small adapter and the engine itself stays pure and testable.
 */
import type { Role } from '@/types/auth';

export type Dimension = 'Timeliness' | 'Compliance' | 'Oversight' | 'Reach' | 'Impact';

export type CardKind =
  | 'filing'
  | 'obligation'
  | 'case-step'
  | 'vote'
  | 'meeting'
  | 'request'
  | 'delinquency'
  | 'budget'
  | 'insurance'
  | 'maintenance'
  | 'setup'
  | 'payment';

export type CardStatus = 'overdue' | 'due' | 'upcoming' | 'waiting' | 'done';

export interface CardAction {
  label: string;
  /** Route the action opens. */
  path: string;
}

export interface RunbookCard {
  /** Stable id: `${kind}:${refId}` so state (dismissed, done) can be keyed. */
  id: string;
  kind: CardKind;
  refId: string;
  title: string;
  /** One line on why it matters or what has happened so far. */
  why?: string;
  /** ISO date (YYYY-MM-DD) the card is due; undefined for undated items. */
  due?: string;
  /** Days from today to `due`; negative when overdue. */
  daysLeft?: number;
  status: CardStatus;
  /** Who the card is for; undefined = everyone in the role filter. */
  roles: Role[];
  /** The person it is assigned to, when known (user id). */
  assigneeId?: string;
  /** Which stewardship dimension completing it scores. */
  dimension?: Dimension;
  /** Points available, for the "+N" chip. */
  points?: number;
  action: CardAction;
  /** Secondary actions (open the case, snooze). */
  more?: CardAction[];
  /** Step-chain position for case steps: "step 3 of 5". */
  step?: { index: number; total: number };
  priority: number;
}

export interface Obligation {
  id: string;
  task: string;
  role: string;
  due: string;
  critical?: boolean;
  /** 'filing' when it is a regulatory filing with mark-filed and proof. */
  kind?: 'filing' | 'obligation';
  completed?: boolean;
  howToCount?: number;
  /** The open case working through it, with how far along it is (checklist items, else steps). */
  openCase?: { id: string; done: number; total: number };
}

export interface CaseStep {
  caseId: string;
  caseTitle: string;
  stepIndex: number;
  stepTotal: number;
  stepTitle: string;
  due?: string;
  assigneeId?: string;
  assigneeRole?: Role;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'open' | 'on_hold' | 'closed';
  /** True when the step waits on someone other than the viewer (vendor, owner). */
  waitingOnOthers?: boolean;
}

export interface VoteItem {
  id: string;
  title: string;
  scope: 'board' | 'owner';
  closes?: string;
  status: 'open' | 'closed';
  /** Whether the viewer has already voted. */
  voted: boolean;
  caseId?: string;
}

export interface MeetingItem {
  id: string;
  title: string;
  date: string;
  noticeSent: boolean;
  noticeDue?: string;
  minutesStatus?: 'none' | 'draft' | 'approved';
  rsvped?: boolean;
}

export interface RequestItem {
  id: string;
  title: string;
  submittedAt: string;
  slaDays: number;
  status: 'new' | 'in_progress' | 'resolved' | 'converted';
  /** True when the viewer is the requester (owner view). */
  mine?: boolean;
}

export interface DelinquencyItem {
  unitId: string;
  unitLabel: string;
  daysPastDue: number;
  amount: number;
  caseId?: string;
}

export interface BudgetAlertItem {
  category: string;
  budgeted: number;
  actual: number;
}

export interface InsuranceItem {
  id: string;
  name: string;
  expires: string;
}

export interface SetupStep {
  id: string;
  title: string;
  done: boolean;
  path: string;
}

export interface PaymentDue {
  unitLabel: string;
  amount: number;
  due: string;
  autopay: boolean;
}

export interface CardInput {
  obligations?: Obligation[];
  caseSteps?: CaseStep[];
  votes?: VoteItem[];
  meetings?: MeetingItem[];
  requests?: RequestItem[];
  delinquencies?: DelinquencyItem[];
  budgetAlerts?: BudgetAlertItem[];
  insurance?: InsuranceItem[];
  setup?: SetupStep[];
  payment?: PaymentDue | null;
}

export interface CardContext {
  /** Today as YYYY-MM-DD. */
  today: string;
  role: Role;
  userId?: string;
  /** Ids of cards the viewer dismissed or completed locally. */
  hidden?: Set<string>;
}

export interface CardSet {
  /** Ranked cards that need the viewer now. */
  forYou: RunbookCard[];
  /** Cards that need someone else (the viewer can nudge). */
  waitingOnOthers: RunbookCard[];
  /** Dated items inside the next 90 days, not due yet. */
  upcoming: RunbookCard[];
}

const DAY = 86_400_000;

export function daysBetween(today: string, date: string): number {
  const a = Date.parse(today + 'T00:00:00Z');
  const b = Date.parse(date + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY);
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(date + 'T00:00:00Z') + days * DAY;
  return new Date(t).toISOString().slice(0, 10);
}

function statusFor(daysLeft: number | undefined, dueSoonWithin = 14): CardStatus {
  if (daysLeft === undefined || Number.isNaN(daysLeft)) return 'due';
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= dueSoonWithin) return 'due';
  return 'upcoming';
}

/** Role label in obligations ("Treasurer") → app role that holds it. */
const OFFICER_ROLES: Record<string, Role[]> = {
  president: ['BOARD_MEMBER'],
  treasurer: ['BOARD_MEMBER'],
  secretary: ['BOARD_MEMBER'],
  'vice president': ['BOARD_MEMBER'],
  board: ['BOARD_MEMBER'],
  manager: ['PROPERTY_MANAGER'],
  'property manager': ['PROPERTY_MANAGER'],
  staff: ['STAFF'],
};

export function rolesForObligation(roleLabel: string): Role[] {
  const key = roleLabel.trim().toLowerCase();
  return OFFICER_ROLES[key] ?? ['BOARD_MEMBER', 'PROPERTY_MANAGER'];
}

const BOARD_SIDE: Role[] = ['BOARD_MEMBER', 'PROPERTY_MANAGER', 'PLATFORM_ADMIN'];

/**
 * Priority bands (lower = higher on the page), mirroring the Dashboard:
 *  10 overdue critical filing · 20 overdue filing/obligation · 30 urgent case step for me
 *  40 vote needed from me · 50 meeting notice or meeting inside 14 days
 *  60 request reply due inside SLA · 70 insurance expiring inside 60 days
 *  80 case step for me (normal) · 90 delinquency past 60 days · 100 budget alert
 *  110 payment due (owner) · 120 setup steps · 200 upcoming (dated, not due)
 */
export function generateCards(input: CardInput, ctx: CardContext): CardSet {
  const cards: RunbookCard[] = [];
  const isBoardSide = BOARD_SIDE.includes(ctx.role);

  for (const o of input.obligations ?? []) {
    if (o.completed) continue;
    const d = daysBetween(ctx.today, o.due);
    const status = statusFor(d, 30);
    const filing = o.kind === 'filing';
    const base = status === 'overdue' ? (o.critical ? 10 : 20) : status === 'due' ? (o.critical ? 55 : 75) : 200;
    cards.push({
      id: `${filing ? 'filing' : 'obligation'}:${o.id}`,
      kind: filing ? 'filing' : 'obligation',
      refId: o.id,
      title: o.task,
      why: `${status === 'overdue' ? `${Math.abs(d)} days late` : `Due ${o.due}`} · ${o.role}${o.openCase ? ' · in progress' : ''}`,
      due: o.due,
      daysLeft: d,
      status,
      roles: rolesForObligation(o.role),
      dimension: 'Compliance',
      points: o.critical ? 3 : 2,
      // Start opens a case that walks through the steps; once open, the card picks up where it was left.
      action: o.openCase
        ? { label: `Continue · ${o.openCase.done} of ${o.openCase.total}`, path: `/issues?view=case:${encodeURIComponent(o.openCase.id)}` }
        : { label: filing ? 'Start the filing' : 'Start', path: `/obligations/start?kind=${filing ? 'filing' : 'obligation'}&id=${encodeURIComponent(o.id)}` },
      priority: base + (d ?? 0) / 1000,
    });
  }

  for (const s of input.caseSteps ?? []) {
    if (s.status && s.status !== 'open') continue;
    const d = s.due ? daysBetween(ctx.today, s.due) : undefined;
    const mine = !s.assigneeId || s.assigneeId === ctx.userId || (!!s.assigneeRole && s.assigneeRole === ctx.role);
    const urgent = s.priority === 'urgent' || s.priority === 'high';
    const status: CardStatus = s.waitingOnOthers ? 'waiting' : statusFor(d);
    const base = s.waitingOnOthers ? 150 : status === 'overdue' ? 25 : urgent ? 30 : 80;
    cards.push({
      id: `case-step:${s.caseId}:${s.stepIndex}`,
      kind: 'case-step',
      refId: s.caseId,
      title: `${s.caseTitle} · ${s.stepTitle}`,
      why: s.waitingOnOthers ? 'Waiting on someone else' : `Step ${s.stepIndex} of ${s.stepTotal}`,
      due: s.due,
      daysLeft: d,
      status,
      roles: s.assigneeRole ? [s.assigneeRole] : BOARD_SIDE,
      assigneeId: s.assigneeId,
      dimension: 'Oversight',
      points: 2,
      step: { index: s.stepIndex, total: s.stepTotal },
      action: { label: 'Open the step', path: `/issues?view=case:${encodeURIComponent(s.caseId)}` },
      priority: mine ? base : base + 100,
    });
  }

  for (const v of input.votes ?? []) {
    if (v.status !== 'open' || v.voted) continue;
    const d = v.closes ? daysBetween(ctx.today, v.closes) : undefined;
    const roles: Role[] = v.scope === 'board' ? ['BOARD_MEMBER'] : ['RESIDENT', 'BOARD_MEMBER'];
    cards.push({
      id: `vote:${v.id}`,
      kind: 'vote',
      refId: v.id,
      title: v.title,
      why: v.closes ? `Your vote is needed · closes ${v.closes}` : 'Your vote is needed',
      due: v.closes,
      daysLeft: d,
      status: statusFor(d),
      roles,
      dimension: 'Impact',
      points: 6,
      action: { label: 'Vote', path: v.caseId ? `/issues?view=case:${encodeURIComponent(v.caseId)}` : `/community?tab=votes&vote=${encodeURIComponent(v.id)}` },
      priority: 40 + (d ?? 0) / 1000,
    });
  }

  for (const m of input.meetings ?? []) {
    const d = daysBetween(ctx.today, m.date);
    if (d < 0) continue;
    if (isBoardSide && !m.noticeSent) {
      const nd = m.noticeDue ? daysBetween(ctx.today, m.noticeDue) : undefined;
      cards.push({
        id: `meeting-notice:${m.id}`,
        kind: 'meeting',
        refId: m.id,
        title: `Send the notice · ${m.title}`,
        why: m.noticeDue ? `Notice due ${m.noticeDue} · meeting ${m.date}` : `Meeting ${m.date}`,
        due: m.noticeDue ?? m.date,
        daysLeft: nd ?? d,
        status: statusFor(nd ?? d),
        roles: ['BOARD_MEMBER', 'PROPERTY_MANAGER'],
        dimension: 'Compliance',
        points: 3,
        action: { label: 'Send notice', path: `/community?tab=meetings&meeting=${encodeURIComponent(m.id)}` },
        priority: (nd ?? d) < 0 ? 15 : 50,
      });
    }
    if (d <= 14 && !m.rsvped) {
      cards.push({
        id: `meeting:${m.id}`,
        kind: 'meeting',
        refId: m.id,
        title: m.title,
        why: `${m.date} · RSVP so quorum is known`,
        due: m.date,
        daysLeft: d,
        status: 'due',
        roles: ['BOARD_MEMBER', 'RESIDENT', 'PROPERTY_MANAGER'],
        dimension: 'Impact',
        points: 4,
        action: { label: 'RSVP', path: `/community?tab=meetings&meeting=${encodeURIComponent(m.id)}` },
        priority: 50 + d / 1000,
      });
    } else if (d > 14 && d <= 90) {
      cards.push({
        id: `meeting:${m.id}`,
        kind: 'meeting',
        refId: m.id,
        title: m.title,
        why: m.date,
        due: m.date,
        daysLeft: d,
        status: 'upcoming',
        roles: ['BOARD_MEMBER', 'RESIDENT', 'PROPERTY_MANAGER'],
        action: { label: 'Open', path: `/community?tab=meetings&meeting=${encodeURIComponent(m.id)}` },
        priority: 200 + d / 1000,
      });
    }
  }

  for (const r of input.requests ?? []) {
    if (r.status === 'resolved' || r.status === 'converted') continue;
    const dueBy = addDays(r.submittedAt, r.slaDays);
    const d = daysBetween(ctx.today, dueBy);
    if (r.mine) {
      cards.push({
        id: `request:${r.id}`,
        kind: 'request',
        refId: r.id,
        title: r.title,
        why: r.status === 'in_progress' ? 'The board is on it' : `Reply due by ${dueBy}`,
        due: dueBy,
        daysLeft: d,
        status: 'waiting',
        roles: ['RESIDENT'],
        action: { label: 'Open', path: `/community?tab=requests&request=${encodeURIComponent(r.id)}` },
        priority: 150,
      });
      continue;
    }
    cards.push({
      id: `request:${r.id}`,
      kind: 'request',
      refId: r.id,
      title: `Reply · ${r.title}`,
      why: d < 0 ? `${Math.abs(d)} days past the ${r.slaDays}-day window` : `Reply by ${dueBy}`,
      due: dueBy,
      daysLeft: d,
      status: statusFor(d),
      roles: ['BOARD_MEMBER', 'PROPERTY_MANAGER'],
      dimension: 'Timeliness',
      points: 2,
      action: { label: 'Reply', path: `/issues?request=${encodeURIComponent(r.id)}` },
      priority: (d < 0 ? 22 : 60) + d / 1000,
    });
  }

  for (const i of input.insurance ?? []) {
    const d = daysBetween(ctx.today, i.expires);
    if (d > 60) {
      if (d <= 90) cards.push({ id: `insurance:${i.id}`, kind: 'insurance', refId: i.id, title: `${i.name} renews`, why: `Expires ${i.expires}`, due: i.expires, daysLeft: d, status: 'upcoming', roles: ['BOARD_MEMBER', 'PROPERTY_MANAGER'], action: { label: 'Open', path: '/building?tab=insurance' }, priority: 200 + d / 1000 });
      continue;
    }
    cards.push({
      id: `insurance:${i.id}`,
      kind: 'insurance',
      refId: i.id,
      title: `${i.name} ${d < 0 ? 'has lapsed' : 'expires soon'}`,
      why: d < 0 ? `Lapsed ${Math.abs(d)} days ago` : `${d} days left · get quotes now`,
      due: i.expires,
      daysLeft: d,
      status: d < 0 ? 'overdue' : 'due',
      roles: ['BOARD_MEMBER', 'PROPERTY_MANAGER'],
      dimension: 'Compliance',
      points: 3,
      action: { label: 'Start renewal', path: '/building?tab=insurance' },
      priority: d < 0 ? 12 : 70 + d / 1000,
    });
  }

  for (const dq of input.delinquencies ?? []) {
    if (dq.daysPastDue < 30) continue;
    cards.push({
      id: `delinquency:${dq.unitId}`,
      kind: 'delinquency',
      refId: dq.unitId,
      title: `${dq.unitLabel} · ${dq.daysPastDue} days past due`,
      why: `$${dq.amount.toLocaleString()} outstanding · ${dq.caseId ? 'collections action open' : 'start collections'}`,
      status: dq.daysPastDue >= 90 ? 'overdue' : 'due',
      roles: ['BOARD_MEMBER', 'PROPERTY_MANAGER'],
      dimension: 'Oversight',
      points: 1,
      action: dq.caseId
        ? { label: 'Open the action', path: `/issues?view=case:${encodeURIComponent(dq.caseId)}` }
        : { label: 'Start collections', path: `/funds?tab=units&unit=${encodeURIComponent(dq.unitId)}` },
      priority: dq.daysPastDue >= 90 ? 35 : 90 - dq.daysPastDue / 1000,
    });
  }

  for (const b of input.budgetAlerts ?? []) {
    if (b.budgeted <= 0 || b.actual <= b.budgeted) continue;
    const over = b.actual - b.budgeted;
    cards.push({
      id: `budget:${b.category}`,
      kind: 'budget',
      refId: b.category,
      title: `${b.category} is over budget by $${over.toLocaleString()}`,
      why: `$${b.actual.toLocaleString()} spent of $${b.budgeted.toLocaleString()}`,
      status: 'due',
      roles: ['BOARD_MEMBER', 'PROPERTY_MANAGER'],
      dimension: 'Oversight',
      points: 1,
      action: { label: 'Cover it', path: '/funds?tab=budget' },
      priority: 100,
    });
  }

  if (input.payment && !input.payment.autopay) {
    const p = input.payment;
    const d = daysBetween(ctx.today, p.due);
    cards.push({
      id: `payment:${p.unitLabel}:${p.due}`,
      kind: 'payment',
      refId: p.unitLabel,
      title: `Pay $${p.amount.toLocaleString()} for ${p.unitLabel}`,
      why: d < 0 ? `${Math.abs(d)} days late` : `Due ${p.due} · pay by card or bank`,
      due: p.due,
      daysLeft: d,
      status: statusFor(d),
      roles: ['RESIDENT'],
      dimension: 'Timeliness',
      points: 3,
      action: { label: 'Pay', path: '/my-unit/pay' },
      priority: d < 0 ? 11 : 110 + d / 1000,
    });
  }

  for (const s of input.setup ?? []) {
    if (s.done) continue;
    cards.push({
      id: `setup:${s.id}`,
      kind: 'setup',
      refId: s.id,
      title: s.title,
      why: 'New building setup',
      status: 'due',
      roles: ['BOARD_MEMBER', 'PROPERTY_MANAGER'],
      action: { label: 'Do this step', path: s.path },
      priority: 120,
    });
  }

  const visible = cards.filter(c => c.roles.includes(ctx.role) || ctx.role === 'PLATFORM_ADMIN').filter(c => !ctx.hidden?.has(c.id));
  visible.sort((a, b) => a.priority - b.priority || (a.due ?? '').localeCompare(b.due ?? ''));

  return {
    forYou: visible.filter(c => c.status === 'overdue' || c.status === 'due'),
    waitingOnOthers: visible.filter(c => c.status === 'waiting'),
    upcoming: visible.filter(c => c.status === 'upcoming'),
  };
}

/** Counts for the attention chips at the top of Home. */
export function attentionCounts(set: CardSet) {
  const all = [...set.forYou, ...set.waitingOnOthers];
  const by = (kind: CardKind) => all.filter(c => c.kind === kind).length;
  return {
    overdueFilings: set.forYou.filter(c => (c.kind === 'filing' || c.kind === 'obligation') && c.status === 'overdue').length,
    urgentCases: set.forYou.filter(c => c.kind === 'case-step' && c.priority < 40).length,
    newRequests: by('request'),
    insuranceExpiring: by('insurance'),
    votes: by('vote'),
  };
}
