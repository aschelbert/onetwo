/**
 * The resident request runbook, wired: an owner request arriving on the
 * Inbox (Community › Requests) gets its case the moment it lands, with the
 * 14-day reply clock as its due date, instead of waiting for someone to
 * press Assign. The case keeps the Inbox's own link (source 'issue', the
 * request's id), so the Inbox row, the owner's view and the reply clock all
 * see it. The app ticks the steps it can see: the acknowledgement once the
 * request is in progress or answered, the close once it is resolved.
 *
 * The database opens the same case every morning (run_resident_request,
 * migration 060); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import type { CaseTrackerCase, Issue } from '@/types/issues';
import { addDays } from '@/lib/billingCycle';
import { ISO_DATE, REQUEST_SLA_DAYS, todayIso } from '../runbook/adapters';

export const RESIDENT_REQUEST_ID = 'resident-request';
export const RESIDENT_REQUEST_SIT = 'runbook-resident-request';
/** Days to acknowledge a request (the bylaws' courtesy), inside the 14-day reply clock. */
export const ACK_DAYS = 2;

export const STEP = { ack: 0, assign: 1, act: 2, reply: 3 } as const;

export const requestOpen = (i: Issue) => i.status === 'SUBMITTED' || i.status === 'IN_PROGRESS';
export const replyDueFor = (i: Issue) => { const d = i.submittedDate.slice(0, 10); return ISO_DATE.test(d) ? addDays(d, REQUEST_SLA_DAYS) : d; };

/** The case for a request, whoever opened it: the Inbox's Assign or this runbook. */
export const requestCase = (cases: CaseTrackerCase[], issueId: string) => cases.find(c => c.source === 'issue' && c.sourceId === issueId);

export function requestSteps(i: Issue): { s: string; detail?: string; ck?: string[] }[] {
  const who = i.reporterName || 'the owner';
  const submitted = i.submittedDate.slice(0, 10);
  return [
    { s: `Acknowledge ${who}'s request within ${ACK_DAYS} days`, detail: `A reply on the request under Community › Requests, or moving it to In progress, counts. Due ${ISO_DATE.test(submitted) ? addDays(submitted, ACK_DAYS) : 'at once'}. This step ticks itself when the request is in progress or answered.` },
    { s: 'Decide who handles it and what it needs', ck: ['Assigned to a board member or the manager', 'Vendor, spending or a rule question identified'] },
    { s: 'Do the work, or decide why not', ck: ['Work order, letter or decision recorded on this case'] },
    { s: `Reply to ${who} by ${replyDueFor(i)} and resolve the request`, detail: 'The 14-day clock runs on the Inbox. This step ticks itself when the request is resolved or closed.' },
  ];
}

/** Tick the steps the app can see: acknowledged, resolved. */
export function syncRequestCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'issue' || c.sitId !== RESIDENT_REQUEST_SIT || !c.sourceId) return;
  const i = useIssuesStore.getState().issues.find(x => x.id === c.sourceId);
  if (!i) return;
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.ack].done && (i.status !== 'SUBMITTED' || i.comments.length > 0)) complete(c.id, STEP.ack);
  if (!c.steps[STEP.reply].done && (i.status === 'RESOLVED' || i.status === 'CLOSED')) complete(c.id, STEP.reply);
}

export interface RequestRun { opened: string[] }

export function runResidentRequest(today: string = todayIso()): RequestRun {
  const fin = useFinancialStore.getState();
  const out: RequestRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.sitId === RESIDENT_REQUEST_SIT) syncRequestCase(c);
  if (fin.runbooksOff.includes(RESIDENT_REQUEST_ID)) return out;
  for (const i of useIssuesStore.getState().issues) {
    if (!requestOpen(i)) continue;
    if (requestCase(useIssuesStore.getState().cases, i.id)) continue;
    const id = useIssuesStore.getState().createCase({
      catId: 'governance',
      sitId: RESIDENT_REQUEST_SIT,
      approach: 'pre',
      title: i.title,
      unit: i.unitNumber ?? '',
      owner: i.reporterName,
      priority: i.priority === 'URGENT' ? 'urgent' : i.priority === 'HIGH' ? 'high' : 'medium',
      notes: `Opened by the Resident request runbook on ${today}: ${i.reporterName || 'an owner'}${i.unitNumber ? ` (Unit ${i.unitNumber})` : ''} asked on ${i.submittedDate.slice(0, 10)}${i.category ? `, ${i.category}` : ''}. The reply is due ${replyDueFor(i)}.${i.description ? `\n\n${i.description}` : ''}`,
      dueDate: replyDueFor(i),
      source: 'issue',
      sourceId: i.id,
      customSteps: requestSteps(i),
    });
    out.opened.push(id);
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncRequestCase(created);
  }
  return out;
}
