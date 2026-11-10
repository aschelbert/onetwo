/**
 * The spending request runbook, wired: a request waiting for the board
 * under Funds › Expenses › Approvals (not one raised from a case, which
 * drives its own) gets one case: the budget line and the bylaws limit
 * checked, the vote, the minutes, the money released. The request is the
 * record, so the app ticks the check at once, the vote as it is decided
 * and the release once a work order is attached or the request is denied.
 * The request keeps the case's id.
 *
 * The database runs the same job every morning (run_spending_request,
 * migration 057); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useSpendingStore, type SpendingApproval } from '@/store/useSpendingStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const SPENDING_REQUEST_ID = 'spending-request';
export const SPENDING_REQUEST_SIT = 'runbook-spending-request';
export const spendingSourceId = (id: string) => `${SPENDING_REQUEST_ID}:${id}`;

export const STEP = { check: 0, vote: 1, minutes: 2, release: 3 } as const;

export const spendingCase = (cases: CaseTrackerCase[], id: string) => cases.find(c => c.source === 'runbook' && c.sourceId === spendingSourceId(id));
export const spendingPending = (a: SpendingApproval) => a.status === 'pending' || a.status === 'more_info';
/** A request with no parent case driving it. */
export const standaloneRequest = (a: SpendingApproval, cases: CaseTrackerCase[]) => !a.caseId || !cases.some(c => c.id === a.caseId && c.sitId !== SPENDING_REQUEST_SIT);

const FUND: Record<string, string> = { operating: 'the operating budget', reserves: 'the reserve fund', special_assessment: 'a special assessment', insurance: 'the insurance claim', loan: 'a loan', '': 'a funding source still to be named' };

export function spendingSteps(a: SpendingApproval): { s: string; detail?: string; ck?: string[] }[] {
  const over = a.threshold > 0 && a.amount > a.threshold;
  return [
    { s: `Check ${fmt(a.amount)} against ${FUND[a.fundingSource] ?? FUND['']}${a.threshold > 0 ? ` and the ${fmt(a.threshold)} bylaws limit` : ''}`, detail: `${over ? 'Over the limit: the board must vote, and owners hear of it.' : 'Within the limit the board can approve without an owner vote.'} This step ticks itself: the request names its funding source and the limit.` },
    { s: 'Board votes: approve or deny', detail: 'Funds › Expenses › Approvals carries the vote. This step ticks itself when the request is approved or denied.' },
    { s: `Record the decision in the minutes${over ? ' and tell owners' : ''}`, ck: ['Motion, vote and funding source in the minutes', ...(over ? ['Owners told in the next notice'] : [])] },
    { s: 'Release the money: a work order or the payment', detail: 'This step ticks itself when a work order is attached to an approved request, or the request is denied.' },
  ];
}

/** Tick what the request shows. */
export function syncSpendingCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${SPENDING_REQUEST_ID}:`)) return;
  const a = useSpendingStore.getState().approvals.find(x => x.id === c.sourceId!.slice(SPENDING_REQUEST_ID.length + 1));
  if (!a) return;
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.check].done) complete(c.id, STEP.check);
  if (!c.steps[STEP.vote].done && (a.status === 'approved' || a.status === 'denied')) complete(c.id, STEP.vote);
  if (!c.steps[STEP.release].done && (a.status === 'denied' || (a.status === 'approved' && !!a.workOrderId))) complete(c.id, STEP.release);
}

export interface SpendingRun { opened: string[] }

export function runSpendingRequests(today: string = todayIso()): SpendingRun {
  const fin = useFinancialStore.getState();
  const out: SpendingRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${SPENDING_REQUEST_ID}:`)) syncSpendingCase(c);
  if (fin.runbooksOff.includes(SPENDING_REQUEST_ID)) return out;
  for (const a of useSpendingStore.getState().approvals) {
    if (!spendingPending(a)) continue;
    if (!standaloneRequest(a, useIssuesStore.getState().cases)) continue;
    if (spendingCase(useIssuesStore.getState().cases, a.id)) continue;
    const over = a.threshold > 0 && a.amount > a.threshold;
    const id = useIssuesStore.getState().createCase({
      catId: 'strategic',
      sitId: SPENDING_REQUEST_SIT,
      approach: 'pre',
      title: `Spending request · ${a.title} · ${fmt(a.amount)}`,
      unit: '',
      owner: a.requestedBy || '',
      priority: a.priority === 'urgent' ? 'urgent' : over ? 'high' : 'medium',
      notes: `Opened by the Spending request runbook on ${today}: ${a.requestedBy || 'the board'} asked for ${fmt(a.amount)} for ${a.title}${a.vendorName ? ` (${a.vendorName})` : ''}, from ${FUND[a.fundingSource] ?? FUND['']}${a.threshold > 0 ? `; the bylaws limit is ${fmt(a.threshold)}${over ? ', so this is over it' : ''}` : ''}.${a.description ? `\n\n${a.description}` : ''}`,
      assignedRole: 'Treasurer',
      source: 'runbook',
      sourceId: spendingSourceId(a.id),
      customSteps: spendingSteps(a),
    });
    out.opened.push(id);
    useSpendingStore.getState().updateApproval(a.id, { caseId: id });
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncSpendingCase(created);
  }
  return out;
}
