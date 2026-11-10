/**
 * The owner disclosure statement runbook, wired: on January 1, one case to
 * send owners the annual disclosure by March 31 (DC Code § 42-1904.04 and
 * the bylaws): last year against budget, the reserve balance, the insurance
 * summary, pending litigation, the board and officers. The app ticks the
 * steps it can see: the figures ready once last year's books are closed,
 * the statement sent once a notice about it goes out. A case the board
 * opened from the Home obligation (r3) counts instead.
 *
 * The database runs the same job every morning (run_owner_disclosure,
 * migration 055); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const OWNER_DISCLOSURE_ID = 'owner-disclosure';
export const OWNER_DISCLOSURE_SIT = 'runbook-owner-disclosure';
export const disclosureSourceId = (year: number) => `${OWNER_DISCLOSURE_ID}:${year}`;
export const disclosureDue = (year: number) => `${year}-03-31`;

export const STEP = { compile: 0, approve: 1, send: 2 } as const;

export function disclosureSteps(year: number): { s: string; detail?: string; ck?: string[] }[] {
  return [
    { s: `Compile the ${year} disclosure: ${year - 1} actuals against budget, the reserve balance, the insurance summary, pending litigation, the board and officers`, detail: `Funds › Statements has the year-end packet and the reserve position; Building › Overview the policies and the board. This step ticks itself once the ${year - 1} books are closed.` },
    { s: 'Board approves the statement', ck: ['Reviewed at a meeting or by email vote, recorded in the minutes', 'Any planned special assessment or litigation stated plainly'] },
    { s: `Send it to every owner by ${disclosureDue(year)} and keep proof of delivery`, detail: 'Post it as a financial notice under Community and mail it where the bylaws require. This step ticks itself when a notice about the disclosure goes out after this case opened.' },
  ];
}

/** A case already on this year's disclosure: the runbook's own, or the Home obligation's open case. */
export function disclosureCase(cases: CaseTrackerCase[], year: number): CaseTrackerCase | undefined {
  return cases.find(c => (c.source === 'runbook' && c.sourceId === disclosureSourceId(year)) || (c.status !== 'closed' && c.source === 'obligation' && c.sourceId === 'r3'));
}

const sentAfter = (c: CaseTrackerCase) => {
  const since = c.created.slice(0, 10);
  const comp = useComplianceStore.getState();
  return comp.announcements.some(a => /disclosure/i.test(a.title) && a.postedDate.slice(0, 10) >= since)
    || comp.communications.some(x => /disclosure/i.test(x.subject) && x.status === 'sent' && x.date.slice(0, 10) >= since);
};

/** Tick the steps the app can see: the books closed, the statement sent. */
export function syncDisclosureCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${OWNER_DISCLOSURE_ID}:`)) return;
  const year = Number(c.sourceId.slice(OWNER_DISCLOSURE_ID.length + 1));
  const fin = useFinancialStore.getState();
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.compile].done && fin.closedThrough && fin.closedThrough >= `${year - 1}-12-31`) complete(c.id, STEP.compile);
  if (!c.steps[STEP.send].done && sentAfter(c)) complete(c.id, STEP.send);
}

export interface DisclosureRun { year: number; caseId: string | null; opened: boolean }

export function runOwnerDisclosure(today: string = todayIso()): DisclosureRun {
  const fin = useFinancialStore.getState();
  const year = Number(today.slice(0, 4));
  const existing = disclosureCase(useIssuesStore.getState().cases, year);
  if (existing) { syncDisclosureCase(existing); return { year, caseId: existing.id, opened: false }; }
  if (fin.runbooksOff.includes(OWNER_DISCLOSURE_ID)) return { year, caseId: null, opened: false };
  // January 1 through the end of June; later than that, this year's statement is history.
  if (today > `${year}-06-30`) return { year, caseId: null, opened: false };
  const id = useIssuesStore.getState().createCase({
    catId: 'governance',
    sitId: OWNER_DISCLOSURE_SIT,
    approach: 'pre',
    title: `Owner disclosure statement · ${year}`,
    unit: '',
    owner: 'Secretary',
    priority: 'medium',
    notes: `Opened by the Owner disclosure statement runbook on ${today}: owners get the annual disclosure by ${disclosureDue(year)}: ${year - 1} actuals against budget, the reserve balance, the insurance summary, pending litigation, the board and officers.`,
    assignedRole: 'Secretary',
    dueDate: disclosureDue(year),
    source: 'runbook',
    sourceId: disclosureSourceId(year),
    customSteps: disclosureSteps(year),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncDisclosureCase(created);
  return { year, caseId: id, opened: true };
}
