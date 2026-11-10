/**
 * The work order runbook, wired: a work order raised on its own under
 * Funds › Expenses (not from a case, which drives its own) gets one case
 * to see it through: approve, the work and its sign-off, the invoice, the
 * payment. The work order's status is the record, so the app ticks the
 * approval, the invoice and the payment as the ledger does them, and the
 * work order keeps the case's id. Paid work orders need nothing.
 *
 * The database opens the same case every morning (run_work_order,
 * migration 057); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import type { WorkOrder } from '@/data/financial';
import { todayIso } from '../runbook/adapters';

export const WORK_ORDER_ID = 'work-order';
export const WORK_ORDER_SIT = 'runbook-work-order';
export const workOrderSourceId = (id: string) => `${WORK_ORDER_ID}:${id}`;

export const STEP = { approve: 0, work: 1, invoice: 2, pay: 3 } as const;

export const workOrderCase = (cases: CaseTrackerCase[], id: string) => cases.find(c => c.source === 'runbook' && c.sourceId === workOrderSourceId(id));

/** A work order with no parent case driving it (one raised from a case step carries that case's id). */
export const standalone = (w: WorkOrder, cases: CaseTrackerCase[]) => !w.caseId || !cases.some(c => c.id === w.caseId && c.sitId !== WORK_ORDER_SIT);

export function workOrderSteps(w: WorkOrder): { s: string; detail?: string; ck?: string[] }[] {
  return [
    { s: `Approve the work order: ${w.title}, ${w.vendor || 'vendor to be named'}, ${fmt(w.amount)}`, detail: 'Funds › Expenses › Work orders. Over the bylaws limit it needs a spending request first. This step ticks itself when the work order is approved.' },
    { s: 'The vendor does the work; sign it off and note any deficiencies', ck: ['Completion checked on site', 'Photos or the vendor\'s report attached', 'Deficiencies listed for the vendor in writing'] },
    { s: 'Enter the invoice', detail: 'Funds › Expenses › Work orders › Invoice received posts it to accounts payable. This step ticks itself when the invoice is entered.' },
    { s: 'Pay it', detail: 'Funds › Expenses › Pay. This step ticks itself when the work order is paid.' },
  ];
}

/** Tick what the work order's status shows. */
export function syncWorkOrderCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${WORK_ORDER_ID}:`)) return;
  const w = useFinancialStore.getState().workOrders.find(x => x.id === c.sourceId!.slice(WORK_ORDER_ID.length + 1));
  if (!w) return;
  const complete = useIssuesStore.getState().completeStep;
  const rank = { draft: 0, approved: 1, invoiced: 2, paid: 3 }[w.status] ?? 0;
  if (!c.steps[STEP.approve].done && rank >= 1) complete(c.id, STEP.approve);
  if (!c.steps[STEP.invoice].done && rank >= 2) complete(c.id, STEP.invoice);
  if (!c.steps[STEP.pay].done && rank >= 3) complete(c.id, STEP.pay);
}

export interface WorkOrderRun { opened: string[] }

export function runWorkOrders(today: string = todayIso()): WorkOrderRun {
  const fin = useFinancialStore.getState();
  const out: WorkOrderRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${WORK_ORDER_ID}:`)) syncWorkOrderCase(c);
  if (fin.runbooksOff.includes(WORK_ORDER_ID)) return out;
  const managed = !!useBuildingStore.getState().management.company;
  for (const w of fin.workOrders) {
    if (w.status === 'paid') continue;
    if (!standalone(w, useIssuesStore.getState().cases)) continue;
    if (workOrderCase(useIssuesStore.getState().cases, w.id)) continue;
    const id = useIssuesStore.getState().createCase({
      catId: 'maintenance',
      sitId: WORK_ORDER_SIT,
      approach: 'pre',
      title: `Work order · ${w.title}`,
      unit: '',
      owner: w.vendor || '',
      priority: 'medium',
      notes: `Opened by the Work order runbook on ${today}: ${w.title}${w.vendor ? ` with ${w.vendor}` : ''}, ${fmt(w.amount)}, raised ${w.createdDate}${w.description ? `. ${w.description}` : ''}. The work order under Funds › Expenses is the record; each step here ticks as it moves.`,
      assignedRole: managed ? 'Property Manager' : 'Treasurer',
      source: 'runbook',
      sourceId: workOrderSourceId(w.id),
      customSteps: workOrderSteps(w),
    });
    out.opened.push(id);
    fin.setWorkOrderCase(w.id, id);
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncWorkOrderCase(created);
  }
  return out;
}
