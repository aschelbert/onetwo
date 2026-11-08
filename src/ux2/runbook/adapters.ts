/**
 * Store adapters — map the production stores into the neutral `CardInput`
 * the runbook engine consumes. Nothing here writes; every card's action is a
 * deep link into the production page that owns the data, so completing a
 * card uses the same code path it always did.
 *
 * `buildCardInput` is pure and takes a snapshot so it can be tested without
 * zustand; `useCardInput` collects the snapshot from the stores.
 */
import { useMemo } from 'react';
import type { Role } from '@/types/auth';
import type { Issue, CaseTrackerCase } from '@/types/issues';
import type { Unit, UnitInvoice } from '@/types/financial';
import type { Meeting } from '@/store/useMeetingsStore';
import type { Election } from '@/store/useElectionStore';
import type { RegulatoryFiling, OwnerCommunication } from '@/store/useComplianceStore';
import type { InsurancePolicy, BoardMember } from '@/store/useBuildingStore';
import type { SpendingApproval } from '@/lib/services/spending';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { addDays, daysBetween, type CardInput, type CaseStep, type CardContext } from './model';
import { caseProgress, obligationCase } from './obligationCases';

/** Owner requests get this many days for a first reply (the design's SLA chip). */
export const REQUEST_SLA_DAYS = 14;
/** Meeting notices are due this many days before the meeting (DC Condo Act minimum is 10). */
export const NOTICE_LEAD_DAYS = 10;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Officer title when the viewer sits on the board (President, Treasurer…). */
  officerTitle?: string;
  linkedUnits: string[];
}

/** The slice of each store the adapters read. */
export interface StoreSnapshot {
  today: string;
  viewer: Viewer;
  obligations: ComplianceItem[];
  completions: Record<string, boolean>;
  filings: RegulatoryFiling[];
  communications: OwnerCommunication[];
  cases: CaseTrackerCase[];
  issues: Issue[];
  meetings: Meeting[];
  elections: Election[];
  approvals: SpendingApproval[];
  insurance: InsurancePolicy[];
  board: BoardMember[];
  units: Unit[];
  unitInvoices: UnitInvoice[];
  hoaDueDay: number;
  budgetVariance: { name: string; budgeted: number; actual: number }[];
  aging: { days30: Unit[]; days60: Unit[]; days90plus: Unit[] };
}

const APP_ROLES: Role[] = ['BOARD_MEMBER', 'RESIDENT', 'PROPERTY_MANAGER', 'STAFF', 'PLATFORM_ADMIN', 'PM_COMPANY'];

function asRole(label: string | undefined): Role | undefined {
  if (!label) return undefined;
  if ((APP_ROLES as string[]).includes(label)) return label as Role;
  const key = label.toLowerCase();
  if (key.includes('manager')) return 'PROPERTY_MANAGER';
  return 'BOARD_MEMBER';
}

function isCollectionsCase(c: CaseTrackerCase): boolean {
  return /collect|delinquen|dues|assessment/i.test(`${c.sitId} ${c.title}`);
}

/** The next dues date on or after today for the building's due day. */
export function nextDuesDate(today: string, dueDay: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const day = Math.min(Math.max(dueDay || 1, 1), 28);
  if (d <= day) return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Whether a notice for this meeting has gone out, judged by the communications log. */
export function noticeSentFor(meeting: Meeting, communications: OwnerCommunication[]): boolean {
  const title = meeting.title.toLowerCase();
  const month = meeting.date.slice(0, 7);
  return communications.some(c =>
    c.status === 'sent' &&
    /notice/i.test(c.type) &&
    c.date <= meeting.date &&
    (c.subject.toLowerCase().includes(title) || c.subject.includes(month) || c.notes?.includes(meeting.id)),
  );
}

function openCaseFor(cases: StoreSnapshot['cases'], kind: 'obligation' | 'filing', id: string) {
  const c = obligationCase(cases, kind, id);
  return c ? { id: c.id, ...caseProgress(c) } : undefined;
}

export function buildCardInput(s: StoreSnapshot): CardInput {
  const v = s.viewer;
  const boardSide = v.role === 'BOARD_MEMBER' || v.role === 'PROPERTY_MANAGER' || v.role === 'PLATFORM_ADMIN';

  // Obligations: dated runbook items for the viewer's officer title (or the whole board when the title is unknown), plus regulatory filings.
  const obligations: CardInput['obligations'] = [];
  for (const item of s.obligations) {
    if (!ISO_DATE.test(item.due)) continue;
    if (v.officerTitle && item.role !== v.officerTitle && v.role === 'BOARD_MEMBER') continue;
    obligations.push({
      id: item.id,
      task: item.task,
      role: item.role,
      due: item.due,
      critical: item.critical,
      kind: 'obligation',
      completed: !!s.completions[item.id] || !!item.autoPass,
      howToCount: item.howTo?.length,
      openCase: openCaseFor(s.cases, 'obligation', item.id),
    });
  }
  for (const f of s.filings) {
    if (v.officerTitle && f.responsible && f.responsible !== v.officerTitle && v.role === 'BOARD_MEMBER') continue;
    obligations.push({ id: f.id, task: f.name, role: f.responsible || 'President', due: f.dueDate, critical: true, kind: 'filing', completed: f.status === 'filed', openCase: openCaseFor(s.cases, 'filing', f.id) });
  }

  // Case steps: the first open step of each open or on-hold case.
  const caseSteps: CaseStep[] = [];
  for (const c of s.cases) {
    if (c.status === 'closed') continue;
    const steps = c.steps ?? [];
    const idx = steps.findIndex(st => !st.done);
    if (idx < 0 && steps.length > 0) continue;
    const step = steps[idx];
    caseSteps.push({
      caseId: c.id,
      caseTitle: c.title,
      stepIndex: idx < 0 ? 1 : idx + 1,
      stepTotal: Math.max(steps.length, 1),
      stepTitle: step?.s ?? 'Next step',
      due: c.dueDate && ISO_DATE.test(c.dueDate) ? c.dueDate : undefined,
      assigneeId: c.assignedTo,
      assigneeRole: asRole(c.assignedRole),
      priority: c.priority,
      status: 'open',
      waitingOnOthers: c.status === 'on-hold',
    });
  }

  // Votes: board spending decisions the viewer has not voted on, and open owner votes for the viewer's units.
  const votes: CardInput['votes'] = [];
  for (const a of s.approvals) {
    if (a.status !== 'pending') continue;
    const voted = (a.votes || []).some(x => x.member === v.name);
    votes.push({ id: `sa:${a.id}`, title: `Spending decision · ${a.title}`, scope: 'board', status: 'open', voted, caseId: a.caseId || undefined });
  }
  for (const e of s.elections) {
    if (e.status !== 'open') continue;
    const voted = e.ballots.some(b => v.linkedUnits.includes(b.unitNumber));
    votes.push({ id: e.id, title: e.title, scope: 'owner', closes: e.scheduledCloseDate ?? undefined, status: 'open', voted });
  }

  // Meetings: scheduled ones, with notice status and whether the viewer is on the attendee list.
  const meetings: CardInput['meetings'] = s.meetings
    .filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED')
    .map(m => ({
      id: m.id,
      title: m.title,
      date: m.date,
      noticeSent: noticeSentFor(m, s.communications),
      noticeDue: addDays(m.date, -NOTICE_LEAD_DAYS),
      minutesStatus: m.minutes ? (m.minutesApprovals.length > 0 ? 'approved' : 'draft') : 'none',
      rsvped: m.attendees.board.includes(v.name) || m.attendees.owners.includes(v.name),
    }));

  // Requests: owner issues awaiting a reply (board) or the viewer's own (owner).
  const requests: CardInput['requests'] = s.issues
    .filter(i => i.status === 'SUBMITTED' || i.status === 'IN_PROGRESS')
    .map(i => ({
      id: i.id,
      title: i.title,
      submittedAt: i.submittedDate.slice(0, 10),
      slaDays: REQUEST_SLA_DAYS,
      status: i.status === 'SUBMITTED' ? 'new' : 'in_progress',
      mine: i.reportedBy === v.id || (!!i.reporterEmail && i.reporterEmail === v.email) || (!!i.unitNumber && v.linkedUnits.includes(i.unitNumber)),
    }));

  const insurance: CardInput['insurance'] = s.insurance.filter(p => ISO_DATE.test(p.expires)).map(p => ({ id: p.id, name: p.type, expires: p.expires }));

  // Delinquencies from the aging buckets the Funds page already computes.
  const delinquencies: CardInput['delinquencies'] = [];
  const bucket = (units: Unit[], days: number) => {
    for (const u of units) {
      const open = s.cases.find(c => c.status !== 'closed' && c.unit === u.number && isCollectionsCase(c));
      const fees = u.lateFees.filter(f => !f.waived).reduce((t, f) => t + f.amount, 0);
      delinquencies.push({ unitId: u.number, unitLabel: `Unit ${u.number}`, daysPastDue: days, amount: Math.max(0, u.balance + fees), caseId: open?.id });
    }
  };
  bucket(s.aging.days90plus, 90);
  bucket(s.aging.days60, 60);
  bucket(s.aging.days30, 30);

  const budgetAlerts: CardInput['budgetAlerts'] = s.budgetVariance.map(b => ({ category: b.name, budgeted: b.budgeted, actual: b.actual }));

  // Owner payment: the viewer's first linked unit, next dues or the oldest unpaid invoice.
  let payment: CardInput['payment'] = null;
  if (!boardSide || v.role === 'BOARD_MEMBER') {
    const unit = s.units.find(u => v.linkedUnits.includes(u.number));
    if (unit) {
      const openInvoices = s.unitInvoices
        .filter(i => i.unitNumber === unit.number && (i.status === 'sent' || i.status === 'overdue'))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      if (openInvoices.length > 0) {
        payment = { unitLabel: `Unit ${unit.number}`, amount: openInvoices.reduce((t, i) => t + i.amount - (i.paidAmount || 0), 0), due: openInvoices[0].dueDate, autopay: false };
      } else if (unit.balance > 0) {
        const fees = unit.lateFees.filter(f => !f.waived).reduce((t, f) => t + f.amount, 0);
        payment = { unitLabel: `Unit ${unit.number}`, amount: unit.balance + fees, due: s.today, autopay: false };
      } else if (unit.monthlyFee > 0 && v.role === 'RESIDENT') {
        const due = nextDuesDate(s.today, s.hoaDueDay);
        if (daysBetween(s.today, due) <= 10) payment = { unitLabel: `Unit ${unit.number}`, amount: unit.monthlyFee, due, autopay: false };
      }
    }
  }

  return { obligations, caseSteps, votes, meetings, requests, insurance, delinquencies, budgetAlerts, payment };
}

/** Read the viewer from auth and the board roster. */
export function useViewer(): Viewer {
  const currentUser = useAuthStore(s => s.currentUser);
  const currentRole = useAuthStore(s => s.currentRole);
  const board = useBuildingStore(s => s.board);
  return useMemo(() => ({
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: currentRole,
    officerTitle: board.find(b => b.name === currentUser.name)?.role,
    linkedUnits: currentUser.linkedUnits?.length ? currentUser.linkedUnits : currentUser.unitNumber ? [currentUser.unitNumber] : [],
  }), [currentUser, currentRole, board]);
}

/** Collect the snapshot from the stores. Re-computes only when a store slice changes. */
export function useStoreSnapshot(today: string = todayIso()): StoreSnapshot {
  const viewer = useViewer();
  const building = useBuildingStore();
  const comp = useComplianceStore();
  const issues = useIssuesStore(s => s.issues);
  const cases = useIssuesStore(s => s.cases);
  const meetings = useMeetingsStore(s => s.meetings);
  const elections = useElectionStore(s => s.elections);
  const approvals = useSpendingStore(s => s.approvals);
  const fin = useFinancialStore();

  const obligations = useMemo(() => refreshComplianceRequirements({
    state: building.address.state,
    legalDocuments: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
    insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
    boardCount: building.board.length,
    hasManagement: !!building.management.company,
  }).categories.flatMap(c => c.items), [building.address.state, building.legalDocuments, building.insurance, building.board.length, building.management.company]);

  const budgetVariance = useMemo(() => fin.getBudgetVariance().map(b => ({ name: b.name, budgeted: b.budgeted, actual: b.actual })), [fin.budgetCategories]); // eslint-disable-line react-hooks/exhaustive-deps
  const aging = useMemo(() => fin.getDelinquencyAging(), [fin.units]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => ({
    today,
    viewer,
    obligations,
    completions: comp.completions,
    filings: comp.filings,
    communications: comp.communications,
    cases,
    issues,
    meetings,
    elections,
    approvals,
    insurance: building.insurance,
    board: building.board,
    units: fin.units,
    unitInvoices: fin.unitInvoices,
    hoaDueDay: fin.hoaDueDay,
    budgetVariance,
    aging,
  }), [today, viewer, obligations, comp.completions, comp.filings, comp.communications, cases, issues, meetings, elections, approvals, building.insurance, building.board, fin.units, fin.unitInvoices, fin.hoaDueDay, budgetVariance, aging]);
}

export function useCardInput(snapshot: StoreSnapshot): CardInput {
  return useMemo(() => buildCardInput(snapshot), [snapshot]);
}

export function contextFor(snapshot: StoreSnapshot, hidden?: Set<string>): CardContext {
  return { today: snapshot.today, role: snapshot.viewer.role, userId: snapshot.viewer.name, hidden };
}
