/**
 * The meeting cycle, wired. Two runbooks share this file:
 *
 *  Annual meeting: the next one is due 13 months after the last (DC Code
 *    § 29-1108), and the case opens 90 days before that, with the annual
 *    meeting playbook (date, nominations, notice, proxies, election,
 *    minutes). The app ticks the steps it can see: the meeting set, the
 *    notice sent, the meeting held. A planning case the board already has,
 *    from the Home obligation or the wizard, counts instead.
 *
 *  Board meeting cycle: the bylaws say how often the board meets (Building
 *    › Details, every 61 days by default). A board meeting on the calendar
 *    gets its case 30 days out, with the meeting playbook (agenda and
 *    notice, quorum, the meeting, minutes, approval); when none is scheduled
 *    and the cadence is about to lapse, a case opens to schedule one. One
 *    open case at a time. The app ticks the agenda-and-notice, meeting-held
 *    and minutes steps as they land.
 *
 * Both use the case wizard's own situations, so the steps are the wizard's.
 * The database opens the same cases every morning (migration 058); the app
 * ticks the steps when it loads them.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { addDays } from '@/lib/billingCycle';
import type { CaseTrackerCase } from '@/types/issues';
import type { Meeting } from '@/store/useMeetingsStore';
import { ISO_DATE, noticeSentFor, todayIso } from '../runbook/adapters';

export const ANNUAL_MEETING_ID = 'annual-meeting';
export const BOARD_MEETING_ID = 'board-meeting';
export const ANNUAL_MEETING_SIT = 'annual-meeting-planning';
export const BOARD_MEETING_SIT = 'board-meetings';
/** The annual meeting must follow the last one within this many months. */
export const ANNUAL_MEETING_MONTHS = 13;
/** Days before the annual meeting deadline that its case opens. */
export const ANNUAL_LEAD_DAYS = 90;
/** Days before a board meeting, or before the cadence lapses, that its case opens. */
export const BOARD_LEAD_DAYS = 30;
/** How often the board meets when the bylaws have not been entered: every two months. */
export const DEFAULT_BOARD_CADENCE_DAYS = 61;

export const annualSourceId = (deadline: string) => `${ANNUAL_MEETING_ID}:${deadline}`;
export const boardSourceId = (key: string) => `${BOARD_MEETING_ID}:${key}`;

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const live = (m: Meeting) => m.status !== 'CANCELLED' && ISO_DATE.test(m.date);

/** The most recent annual meeting on the calendar, held or scheduled. */
export function lastAnnualMeeting(meetings: Meeting[]): Meeting | undefined {
  return meetings.filter(m => m.type === 'ANNUAL' && live(m)).sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** When the next annual meeting must be held: 13 months after the last, or 120 days out when there has never been one. */
export function annualDeadline(meetings: Meeting[], today: string): string {
  const last = lastAnnualMeeting(meetings);
  return last ? addMonths(last.date, ANNUAL_MEETING_MONTHS) : addDays(today, 120);
}

/** The case key: the deadline, or 'first' for a building with no annual meeting on the calendar yet (so the key holds still day to day). */
export const annualKey = (meetings: Meeting[], today: string) => (lastAnnualMeeting(meetings) ? annualDeadline(meetings, today) : 'first');

/** A case already planning the annual meeting: the runbook's own (one at a time), one from the Home obligation, or one opened by hand on the wizard. */
export function openAnnualCase(cases: CaseTrackerCase[], key: string): CaseTrackerCase | undefined {
  return cases.find(c => (c.source === 'runbook' && (c.sourceId === annualSourceId(key) || (c.status !== 'closed' && !!c.sourceId?.startsWith(`${ANNUAL_MEETING_ID}:`)))) || (c.status !== 'closed' && ((c.source === 'obligation' && c.sourceId === 'g4') || (c.sitId === ANNUAL_MEETING_SIT && c.source !== 'runbook'))));
}

const stepIndex = (c: CaseTrackerCase, re: RegExp) => (c.steps ?? []).findIndex(s => re.test(s.s));
const tick = (c: CaseTrackerCase, re: RegExp) => { const i = stepIndex(c, re); if (i >= 0 && !c.steps![i].done) useIssuesStore.getState().completeStep(c.id, i); };

/** The annual meeting this case is for: the one on the calendar after the previous one and no later than a month past the deadline (any, for a first meeting). */
function meetingForAnnualCase(c: CaseTrackerCase, meetings: Meeting[]): Meeting | undefined {
  const key = c.sourceId?.slice(ANNUAL_MEETING_ID.length + 1) ?? '';
  const annual = meetings.filter(m => m.type === 'ANNUAL' && live(m));
  if (key === 'first') return annual.sort((a, b) => a.date.localeCompare(b.date))[0];
  const floor = addMonths(key, -ANNUAL_MEETING_MONTHS);
  return annual.filter(m => m.date > floor && m.date <= addDays(key, 31)).sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** Tick what the app can see on an annual meeting case: the date set, the notice sent, the meeting held. */
export function syncAnnualCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${ANNUAL_MEETING_ID}:`)) return;
  const m = meetingForAnnualCase(c, useMeetingsStore.getState().meetings);
  if (!m) return;
  tick(c, /^set annual meeting date/i);
  if (noticeSentFor(m, useComplianceStore.getState().communications)) tick(c, /^send formal annual meeting notice/i);
  if (m.status === 'COMPLETED') tick(c, /^conduct annual meeting/i);
}

export interface MeetingRun { caseId: string | null; opened: boolean; key: string }

export function runAnnualMeeting(today: string = todayIso()): MeetingRun {
  const fin = useFinancialStore.getState();
  const meetings = useMeetingsStore.getState().meetings;
  const deadline = annualDeadline(meetings, today);
  const key = annualKey(meetings, today);
  // Every open annual meeting case keeps ticking, whichever deadline it was opened for.
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${ANNUAL_MEETING_ID}:`)) syncAnnualCase(c);
  const existing = openAnnualCase(useIssuesStore.getState().cases, key);
  if (existing) return { caseId: existing.id, opened: false, key };
  if (fin.runbooksOff.includes(ANNUAL_MEETING_ID)) return { caseId: null, opened: false, key };
  const last = lastAnnualMeeting(meetings);
  if (last && today < addDays(deadline, -ANNUAL_LEAD_DAYS)) return { caseId: null, opened: false, key };
  const id = useIssuesStore.getState().createCase({
    catId: 'governance',
    sitId: ANNUAL_MEETING_SIT,
    approach: 'pre',
    title: `Annual meeting · by ${deadline}`,
    unit: '',
    owner: 'President',
    priority: 'high',
    notes: `Opened by the Annual meeting runbook on ${today}: ${last ? `the last annual meeting was ${last.date}, so the next must be held by ${deadline}` : `no annual meeting is on the calendar, so one should be held by ${deadline}`} (DC Code § 29-1108, within 13 months of the last). Notice goes to every owner at least 10 days before.`,
    assignedRole: 'President',
    dueDate: deadline,
    source: 'runbook',
    sourceId: annualSourceId(key),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncAnnualCase(created);
  return { caseId: id, opened: true, key };
}

// ── Board meeting cycle ──────────────────────────────────────────────────────

export const boardCadenceDays = (details: { boardMeetingEveryDays?: number } | undefined | null) => {
  const n = Math.round(Number(details?.boardMeetingEveryDays));
  return Number.isFinite(n) && n >= 7 && n <= 366 ? n : DEFAULT_BOARD_CADENCE_DAYS;
};

/** The runbook's open board meeting case, if any; one at a time. */
export function openBoardCase(cases: CaseTrackerCase[]): CaseTrackerCase | undefined {
  return cases.find(c => c.status !== 'closed' && c.source === 'runbook' && !!c.sourceId?.startsWith(`${BOARD_MEETING_ID}:`));
}

/** What the next board meeting case should be about: a meeting on the calendar inside 30 days, or the cadence about to lapse. */
export function nextBoardTrigger(meetings: Meeting[], today: string, cadenceDays: number): { key: string; meeting?: Meeting; deadline: string } | null {
  const board = meetings.filter(m => (m.type === 'BOARD' || m.type === 'QUARTERLY') && live(m));
  const upcoming = board.filter(m => m.status === 'SCHEDULED' && m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (upcoming) return upcoming.date <= addDays(today, BOARD_LEAD_DAYS) ? { key: upcoming.id, meeting: upcoming, deadline: upcoming.date } : null;
  const last = board.filter(m => m.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const deadline = last ? addDays(last.date, cadenceDays) : today;
  return today >= addDays(deadline, -BOARD_LEAD_DAYS) ? { key: `due:${deadline}`, deadline } : null;
}

/** Tick what the app can see on a board meeting case: agenda and notice out, the meeting held, the minutes written. */
export function syncBoardCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${BOARD_MEETING_ID}:`)) return;
  const key = c.sourceId.slice(BOARD_MEETING_ID.length + 1);
  if (key.startsWith('due:')) return;
  const m = useMeetingsStore.getState().meetings.find(x => x.id === key);
  if (!m) return;
  if (m.agenda.length > 0 && noticeSentFor(m, useComplianceStore.getState().communications)) tick(c, /^prepare agenda and distribute meeting notice/i);
  if (m.status === 'COMPLETED') tick(c, /^conduct meeting/i);
  if (m.minutes.trim().length > 0) tick(c, /^record detailed minutes/i);
}

export function runBoardMeeting(today: string = todayIso()): MeetingRun {
  const fin = useFinancialStore.getState();
  const cadence = boardCadenceDays(useBuildingStore.getState().details);
  const meetings = useMeetingsStore.getState().meetings;
  const existing = openBoardCase(useIssuesStore.getState().cases);
  if (existing) { syncBoardCase(existing); return { caseId: existing.id, opened: false, key: existing.sourceId!.slice(BOARD_MEETING_ID.length + 1) }; }
  const next = nextBoardTrigger(meetings, today, cadence);
  if (!next) return { caseId: null, opened: false, key: '' };
  if (fin.runbooksOff.includes(BOARD_MEETING_ID)) return { caseId: null, opened: false, key: next.key };
  // A hand-opened case on the wizard for this meeting counts too.
  if (useIssuesStore.getState().cases.some(c => c.status !== 'closed' && c.sitId === BOARD_MEETING_SIT && c.source !== 'runbook')) return { caseId: null, opened: false, key: next.key };
  const m = next.meeting;
  const id = useIssuesStore.getState().createCase({
    catId: 'governance',
    sitId: BOARD_MEETING_SIT,
    approach: 'pre',
    title: m ? `Board meeting · ${m.date}${m.title ? ` · ${m.title}` : ''}` : `Board meeting · schedule one by ${next.deadline}`,
    unit: '',
    owner: 'President',
    priority: 'medium',
    notes: m
      ? `Opened by the Board meeting cycle runbook on ${today}: ${m.title || 'a board meeting'} is on the calendar for ${m.date}${m.time ? ` at ${m.time}` : ''}${m.location ? `, ${m.location}` : ''}. Notice goes to the board and owners per the bylaws and DC Code § 29-1109; minutes within 7 days.`
      : `Opened by the Board meeting cycle runbook on ${today}: the bylaws have the board meeting every ${cadence} days and nothing is scheduled; the next meeting is due by ${next.deadline}. Put it on Community › Meetings, then the notice, quorum, minutes and approval follow here.`,
    assignedRole: 'President',
    dueDate: next.deadline,
    source: 'runbook',
    sourceId: boardSourceId(next.key),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncBoardCase(created);
  return { caseId: id, opened: true, key: next.key };
}
