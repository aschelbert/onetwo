/**
 * Queue — builds "Your week" from everything that can need a board member
 * this week.
 *
 * Pure function: no React, no components, no stores.
 */

import type { BoardRoleKey } from '@/types/auth';
import type { BuildingSettings } from '@/lib/buildingSettings';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { RegulatoryFiling } from '@/store/useComplianceStore';
import type { SeasonState } from '@/lib/seasons';
import type { Step } from '@/types/steps';

// ── Public Types ────────────────────────────────────────────────────────────

export type QueueSource = 'runbook' | 'filing' | 'case_step' | 'vote' | 'meeting' | 'request' | 'offer' | 'approval';

export interface QueueItem {
  id: string;
  source: QueueSource;
  sourceId: string;
  title: string;
  why: string;
  roleKey: BoardRoleKey;
  roleState: 'mine' | 'backstop' | 'other';
  containerLine: string;
  dueDate: string | null;
  dueTone: 'overdue' | 'soon' | 'normal';
  priority: number;
  primaryAction: { label: string; drawer: string; params: Record<string, string> };
  secondaryActions: Array<{ label: string; drawer: string; params: Record<string, string> }>;
  legalRef?: string;
}

export interface QueueInputs {
  me: { roleKey: BoardRoleKey; name: string; isOwner: boolean };
  seasons: SeasonState[];
  items: ComplianceItem[];
  completions: Record<string, boolean>;
  filings: RegulatoryFiling[];
  cases: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    nextStep?: {
      title: string;
      index: number;
      total: number;
      dueDate: string | null;
      ownerRole?: BoardRoleKey;
    };
  }>;
  /**
   * Optional: unified Step[] for cases. When provided, these are used
   * instead of the ad hoc cases[].nextStep shape for generating
   * case_step queue items. Falls back to the legacy shape if omitted.
   */
  caseSteps?: Step[];
  requests: Array<{
    id: string;
    title: string;
    status: string;
    submittedAt: string;
    unit?: string;
  }>;
  votes: Array<{
    id: string;
    title: string;
    status: string;
    myVote?: string | null;
    deadline?: string;
  }>;
  approvals: Array<{
    id: string;
    title: string;
    amount: number;
    status: string;
    votes: Array<{ name: string }>;
  }>;
  meetings: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
  }>;
  delinquency: Array<{
    unit: string;
    balance: number;
    daysPastDue: number;
  }>;
  settings: BuildingSettings;
  presidentSeated?: boolean;
  today?: Date;
  horizonDays?: number;
}

export interface QueueResult {
  items: QueueItem[];
  total: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_HORIZON_DAYS = 14;
const CRITICAL_HORIZON_DAYS = 45;
const MEETING_HORIZON_DAYS = 14;
const DELINQUENCY_THRESHOLD_DAYS = 60;
const MAX_QUEUE_ITEMS = 20;

// Priority weights (lower = higher priority)
const PRIORITY_OVERDUE = 0;
const PRIORITY_CRITICAL_SOON = 10;
const PRIORITY_DUE_SOON = 20;
const PRIORITY_NORMAL = 30;

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isFixedDate(due: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(due);
}

function roleState(
  itemRole: BoardRoleKey | undefined,
  backstopRole: BoardRoleKey | 'owner' | undefined,
  myRole: BoardRoleKey,
  isOwner?: boolean,
): 'mine' | 'backstop' | 'other' {
  if (itemRole === myRole) return 'mine';
  if (backstopRole === 'owner' && isOwner) return 'backstop';
  if (backstopRole === myRole) return 'backstop';
  return 'other';
}

function dueTone(dueDate: string | null, todayStr: string): 'overdue' | 'soon' | 'normal' {
  if (!dueDate) return 'normal';
  if (dueDate < todayStr) return 'overdue';
  const days = daysBetween(todayStr, dueDate);
  if (days <= 7) return 'soon';
  return 'normal';
}

function priorityCasePriority(p: string): number {
  switch (p.toLowerCase()) {
    case 'urgent': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    default: return 4;
  }
}

// ── Build Queue ─────────────────────────────────────────────────────────────

export function buildQueue(i: QueueInputs): QueueResult {
  const today = i.today ?? new Date();
  const todayStr = toDateStr(today);
  const horizonDays = i.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const horizonDate = new Date(today);
  horizonDate.setDate(horizonDate.getDate() + horizonDays);
  const horizonStr = toDateStr(horizonDate);

  const criticalHorizonDate = new Date(today);
  criticalHorizonDate.setDate(criticalHorizonDate.getDate() + CRITICAL_HORIZON_DAYS);
  const criticalHorizonStr = toDateStr(criticalHorizonDate);

  const meetingHorizonDate = new Date(today);
  meetingHorizonDate.setDate(meetingHorizonDate.getDate() + MEETING_HORIZON_DAYS);
  const meetingHorizonStr = toDateStr(meetingHorizonDate);

  const backstop: BoardRoleKey | 'owner' = (i.presidentSeated ?? true) ? 'president' : 'owner';

  const queue: QueueItem[] = [];

  // ── 1. Runbook items ──
  for (const item of i.items) {
    if (i.completions[item.id]) continue;
    if (!isFixedDate(item.due)) continue;

    const isOverdue = item.due < todayStr;
    const isDueSoon = item.due <= horizonStr;
    const isCriticalSoon = item.critical && item.due <= criticalHorizonStr;

    if (!isOverdue && !isDueSoon && !isCriticalSoon) continue;

    const rs = roleState(item.primaryRole, item.backstopRole, i.me.roleKey);
    const tone = dueTone(item.due, todayStr);
    const priority = isOverdue ? PRIORITY_OVERDUE
      : (item.critical && isDueSoon) ? PRIORITY_CRITICAL_SOON
      : isDueSoon ? PRIORITY_DUE_SOON
      : PRIORITY_NORMAL;

    queue.push({
      id: `runbook-${item.id}`,
      source: 'runbook',
      sourceId: item.id,
      title: item.task,
      why: isOverdue ? `Overdue since ${item.due}` : `Due ${item.due}`,
      roleKey: item.primaryRole ?? 'member_at_large',
      roleState: rs,
      containerLine: findSeasonLabel(i.seasons, item.id),
      dueDate: item.due,
      dueTone: tone,
      priority,
      primaryAction: {
        label: 'Open runbook item',
        drawer: 'runbook',
        params: { itemId: item.id },
      },
      secondaryActions: [],
      legalRef: item.legalRef,
    });
  }

  // ── 2. Filings ──
  for (const f of i.filings) {
    if (f.status === 'filed') continue;

    const isOverdue = f.dueDate < todayStr;
    const isDueSoon = f.dueDate <= horizonStr;

    if (!isOverdue && !isDueSoon) continue;

    const filingRole = f.responsible ? roleFromString(f.responsible) : 'president';
    const rs = roleState(filingRole, backstop, i.me.roleKey, i.me.isOwner);
    const tone = dueTone(f.dueDate, todayStr);
    const priority = isOverdue ? PRIORITY_OVERDUE : PRIORITY_DUE_SOON;

    queue.push({
      id: `filing-${f.id}`,
      source: 'filing',
      sourceId: f.id,
      title: f.name,
      why: isOverdue ? `Overdue since ${f.dueDate}` : `Due ${f.dueDate}`,
      roleKey: filingRole,
      roleState: rs,
      containerLine: 'Regulatory filings',
      dueDate: f.dueDate,
      dueTone: tone,
      priority,
      primaryAction: {
        label: 'Open filing',
        drawer: 'runbook',
        params: { filingId: f.id },
      },
      secondaryActions: [],
      legalRef: f.legalRef,
    });
  }

  // ── 3. Case steps ──
  // When unified caseSteps are provided, use them; otherwise fall back to legacy
  if (i.caseSteps && i.caseSteps.length > 0) {
    // Group by containerId and pick the first open step per case
    const seen = new Set<string>();
    for (const step of i.caseSteps) {
      if (step.status === 'done' || step.status === 'skipped') continue;
      if (seen.has(step.containerId)) continue;
      seen.add(step.containerId);

      const caseInfo = i.cases.find(c => c.id === step.containerId);
      if (caseInfo && (caseInfo.status === 'closed' || caseInfo.status === 'resolved')) continue;

      const stepRole = step.ownerRole ?? 'president';
      const rs = roleState(stepRole, backstop, i.me.roleKey, i.me.isOwner);
      const tone = step.dueDate ? dueTone(step.dueDate, todayStr) : 'normal';
      const isOverdue = step.dueDate ? step.dueDate < todayStr : false;
      const casePriority = caseInfo ? priorityCasePriority(caseInfo.priority) : 4;
      const priority = isOverdue ? PRIORITY_OVERDUE
        : casePriority <= 1 ? PRIORITY_CRITICAL_SOON
        : PRIORITY_DUE_SOON;

      queue.push({
        id: `case-${step.containerId}`,
        source: 'case_step',
        sourceId: step.containerId,
        title: step.title,
        why: `Step ${step.index + 1}/${step.total} of "${caseInfo?.title ?? step.containerId}"`,
        roleKey: stepRole,
        roleState: rs,
        containerLine: caseInfo?.title ?? step.containerId,
        dueDate: step.dueDate,
        dueTone: tone,
        priority,
        primaryAction: {
          label: 'Open step',
          drawer: step.drawer.id,
          params: step.drawer.params,
        },
        secondaryActions: [],
      });
    }
  } else {
    for (const c of i.cases) {
      if (!c.nextStep) continue;
      if (c.status === 'closed' || c.status === 'resolved') continue;

      const stepRole = c.nextStep.ownerRole ?? 'president';
      const rs = roleState(stepRole, backstop, i.me.roleKey, i.me.isOwner);
      const tone = c.nextStep.dueDate ? dueTone(c.nextStep.dueDate, todayStr) : 'normal';
      const isOverdue = c.nextStep.dueDate ? c.nextStep.dueDate < todayStr : false;
      const priority = isOverdue ? PRIORITY_OVERDUE
        : priorityCasePriority(c.priority) <= 1 ? PRIORITY_CRITICAL_SOON
        : PRIORITY_DUE_SOON;

      queue.push({
        id: `case-${c.id}`,
        source: 'case_step',
        sourceId: c.id,
        title: c.nextStep.title,
        why: `Step ${c.nextStep.index + 1}/${c.nextStep.total} of "${c.title}"`,
        roleKey: stepRole,
        roleState: rs,
        containerLine: c.title,
        dueDate: c.nextStep.dueDate,
        dueTone: tone,
        priority,
        primaryAction: {
          label: 'Open step',
          drawer: 'case_step',
          params: { caseId: c.id, stepIndex: String(c.nextStep.index) },
        },
        secondaryActions: [],
      });
    }
  }

  // ── 4. Votes ──
  for (const v of i.votes) {
    if (v.status === 'closed' || v.status === 'completed') continue;
    if (v.myVote != null) continue; // Already voted

    const tone = v.deadline ? dueTone(v.deadline, todayStr) : 'normal';
    const isOverdue = v.deadline ? v.deadline < todayStr : false;
    const priority = isOverdue ? PRIORITY_OVERDUE : PRIORITY_DUE_SOON;

    queue.push({
      id: `vote-${v.id}`,
      source: 'vote',
      sourceId: v.id,
      title: v.title,
      why: 'Your vote is needed',
      roleKey: i.me.roleKey,
      roleState: 'mine',
      containerLine: 'Board votes',
      dueDate: v.deadline ?? null,
      dueTone: tone,
      priority,
      primaryAction: {
        label: 'Cast vote',
        drawer: 'vote',
        params: { voteId: v.id },
      },
      secondaryActions: [],
    });
  }

  // ── 5. Approvals (where I have not voted) ──
  for (const a of i.approvals) {
    if (a.status === 'approved' || a.status === 'rejected') continue;
    const alreadyVoted = a.votes.some(v => v.name === i.me.name);
    if (alreadyVoted) continue;

    queue.push({
      id: `approval-${a.id}`,
      source: 'approval',
      sourceId: a.id,
      title: a.title,
      why: `$${a.amount.toLocaleString()} needs your approval`,
      roleKey: i.me.roleKey,
      roleState: 'mine',
      containerLine: 'Approvals',
      dueDate: null,
      dueTone: 'normal',
      priority: PRIORITY_DUE_SOON,
      primaryAction: {
        label: 'Review & approve',
        drawer: 'approval',
        params: { approvalId: a.id },
      },
      secondaryActions: [],
    });
  }

  // ── 6. Meetings within 14 days ──
  for (const m of i.meetings) {
    if (m.status === 'COMPLETED' || m.status === 'CANCELLED') continue;
    if (m.date > meetingHorizonStr) continue;

    const tone = dueTone(m.date, todayStr);
    const priority = m.date < todayStr ? PRIORITY_OVERDUE : PRIORITY_DUE_SOON;

    queue.push({
      id: `meeting-${m.id}`,
      source: 'meeting',
      sourceId: m.id,
      title: m.title,
      why: m.date === todayStr ? 'Today' : `Scheduled ${m.date}`,
      roleKey: i.me.roleKey,
      roleState: 'mine',
      containerLine: 'Meetings',
      dueDate: m.date,
      dueTone: tone,
      priority,
      primaryAction: {
        label: 'Open meeting',
        drawer: 'meeting',
        params: { meetingId: m.id },
      },
      secondaryActions: [],
    });
  }

  // ── 7. New requests (status SUBMITTED) ──
  for (const r of i.requests) {
    if (r.status.toUpperCase() !== 'SUBMITTED') continue;

    queue.push({
      id: `request-${r.id}`,
      source: 'request',
      sourceId: r.id,
      title: r.title,
      why: r.unit ? `From unit ${r.unit}` : 'New request',
      roleKey: 'vice_president',
      roleState: roleState('vice_president', backstop, i.me.roleKey, i.me.isOwner),
      containerLine: 'Owner requests',
      dueDate: null,
      dueTone: 'normal',
      priority: PRIORITY_NORMAL,
      primaryAction: {
        label: 'Review request',
        drawer: 'request',
        params: { requestId: r.id },
      },
      secondaryActions: [],
    });
  }

  // ── 8. Offers ──

  // 8a. Unit 60+ days past due with no open collections case
  for (const d of i.delinquency) {
    if (d.daysPastDue < DELINQUENCY_THRESHOLD_DAYS) continue;

    // Check no open collections case for this unit
    let hasOpenCase = false;
    for (const c of i.cases) {
      if (c.status === 'closed' || c.status === 'resolved') continue;
      if (
        c.title.toLowerCase().includes('collection') ||
        c.title.toLowerCase().includes('delinquen')
      ) {
        if (c.title.includes(d.unit)) {
          hasOpenCase = true;
          break;
        }
      }
    }
    if (hasOpenCase) continue;

    queue.push({
      id: `offer-collections-${d.unit}`,
      source: 'offer',
      sourceId: d.unit,
      title: `Start collections for Unit ${d.unit}?`,
      why: `$${d.balance.toLocaleString()} overdue ${d.daysPastDue} days`,
      roleKey: 'treasurer',
      roleState: roleState('treasurer', backstop, i.me.roleKey, i.me.isOwner),
      containerLine: 'Collections',
      dueDate: null,
      dueTone: 'overdue',
      priority: PRIORITY_CRITICAL_SOON,
      primaryAction: {
        label: 'Start collections',
        drawer: 'collections_offer',
        params: { unit: d.unit, balance: String(d.balance) },
      },
      secondaryActions: [],
    });
  }

  // 8b. Approval above spending limit with no linked vote
  for (const a of i.approvals) {
    if (a.status === 'approved' || a.status === 'rejected') continue;
    if (a.amount <= i.settings.spendingLimit) continue;

    // Check if there's a linked vote for this approval
    const hasLinkedVote = i.votes.some(v =>
      v.title.toLowerCase().includes(a.title.toLowerCase()) ||
      a.title.toLowerCase().includes(v.title.toLowerCase())
    );
    if (hasLinkedVote) continue;

    queue.push({
      id: `offer-vote-${a.id}`,
      source: 'offer',
      sourceId: a.id,
      title: `"${a.title}" needs a board vote`,
      why: `$${a.amount.toLocaleString()} exceeds spending limit of $${i.settings.spendingLimit.toLocaleString()}`,
      roleKey: 'president',
      roleState: roleState('president', undefined, i.me.roleKey),
      containerLine: 'Board votes needed',
      dueDate: null,
      dueTone: 'soon',
      priority: PRIORITY_CRITICAL_SOON,
      primaryAction: {
        label: 'Create vote',
        drawer: 'vote',
        params: { approvalId: a.id, amount: String(a.amount) },
      },
      secondaryActions: [
        {
          label: 'Review approval',
          drawer: 'approval',
          params: { approvalId: a.id },
        },
      ],
    });
  }

  // ── Sort ──
  queue.sort((a, b) => {
    // 1. Overdue first
    const aOverdue = a.dueTone === 'overdue' ? 0 : 1;
    const bOverdue = b.dueTone === 'overdue' ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    // 2. My role beats backstop beats other
    const roleOrder = { mine: 0, backstop: 1, other: 2 };
    const aRole = roleOrder[a.roleState];
    const bRole = roleOrder[b.roleState];
    if (aRole !== bRole) return aRole - bRole;

    // 3. Earlier due date first (nulls at end)
    if (a.dueDate && b.dueDate) {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    } else if (a.dueDate && !b.dueDate) {
      return -1;
    } else if (!a.dueDate && b.dueDate) {
      return 1;
    }

    // 4. Lower priority number = higher priority
    return a.priority - b.priority;
  });

  const total = queue.length;
  const items = queue.slice(0, MAX_QUEUE_ITEMS);

  return { items, total };
}

// ── Internal Helpers ────────────────────────────────────────────────────────

function findSeasonLabel(seasons: SeasonState[], itemId: string): string {
  for (const s of seasons) {
    for (const m of s.milestones) {
      if (m.itemIds.includes(itemId)) {
        return `${s.label} - ${m.title}`;
      }
    }
  }
  return 'Compliance';
}

function roleFromString(role: string): BoardRoleKey {
  const lower = role.toLowerCase();
  if (lower.includes('vice') && lower.includes('pres')) return 'vice_president';
  if (lower.includes('pres')) return 'president';
  if (lower.includes('treas')) return 'treasurer';
  if (lower.includes('sec')) return 'secretary';
  return 'member_at_large';
}
