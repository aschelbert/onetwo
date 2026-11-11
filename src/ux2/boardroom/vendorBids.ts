/**
 * The vendor bids runbook, wired: when a case reaches a step that asks for
 * quotes (the wizard marks it `requiresBids`, with a minimum), one bids
 * case opens beside it: one scope for every bidder, the bids collected,
 * licenses and insurance verified, the pick recorded, the choice carried
 * back. The parent step's bid collection is the record, so the app ticks
 * the collection, the verification, the pick and the hand-back as the
 * board fills it in on the parent case.
 *
 * Bid collections live only in the app (the database keeps a case's steps,
 * not its bids), so this runbook runs when a board member opens the app
 * and has no morning twin.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import type { CaseStep, CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const VENDOR_BIDS_ID = 'vendor-bids';
export const VENDOR_BIDS_SIT = 'runbook-vendor-bids';
export const bidsSourceId = (caseId: string, stepIdx: number) => `${VENDOR_BIDS_ID}:${caseId}:${stepIdx}`;

export const STEP = { scope: 0, collect: 1, verify: 2, pick: 3, back: 4 } as const;

/** The parent case's current step, when it asks for quotes. */
export function bidStepOf(c: CaseTrackerCase): { idx: number; step: CaseStep } | undefined {
  if (c.status === 'closed' || !c.steps || c.sitId === VENDOR_BIDS_SIT) return undefined;
  const idx = c.steps.findIndex(s => !s.done);
  const step = idx >= 0 ? c.steps[idx] : undefined;
  return step?.requiresBids ? { idx, step } : undefined;
}

export const bidsCase = (cases: CaseTrackerCase[], parentId: string, stepIdx: number) => cases.find(c => c.source === 'runbook' && c.sourceId === bidsSourceId(parentId, stepIdx));

export function bidsSteps(parent: CaseTrackerCase, step: CaseStep): { s: string; detail?: string; ck?: string[] }[] {
  const min = step.minimumBids || step.bidCollection?.minimumBids || 3;
  return [
    { s: `Write one scope of work for every bidder: ${parent.title}`, ck: ['Same scope, timeline and warranty asked of each', 'Fixed price or not-to-exceed stated', 'Site visit offered'] },
    { s: `Collect at least ${min} bids on the parent action`, detail: `The parent action's step "${step.s}" holds the bids (Add bid). This step ticks itself at ${min}.` },
    { s: 'Verify the license and insurance on every bid', detail: 'General liability naming the association, workers compensation, the license current. Each bid carries two checks; this step ticks itself when every bid has both.' },
    { s: 'Pick the bid and record why', detail: 'Qualifications, references, price and timeline, not the lowest price alone. This step ticks itself when a bid is selected on the parent action.' },
    { s: 'Carry the choice back to the parent action and move it on', detail: 'This step ticks itself when the parent step is done.' },
  ];
}

/** Tick what the parent case's bid collection shows. */
export function syncBidsCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${VENDOR_BIDS_ID}:`)) return;
  const [, parentId, idxText] = c.sourceId.split(':');
  const parent = useIssuesStore.getState().cases.find(x => x.id === parentId);
  const step = parent?.steps?.[Number(idxText)];
  if (!step) return;
  const complete = useIssuesStore.getState().completeStep;
  const bc = step.bidCollection;
  const min = step.minimumBids || bc?.minimumBids || 3;
  if (!c.steps[STEP.collect].done && (bc?.bids.length ?? 0) >= min) complete(c.id, STEP.collect);
  if (!c.steps[STEP.verify].done && (bc?.bids.length ?? 0) >= min && bc!.bids.every(b => b.insuranceVerified && b.licenseVerified)) complete(c.id, STEP.verify);
  if (!c.steps[STEP.pick].done && bc?.selectedBidId) complete(c.id, STEP.pick);
  if (!c.steps[STEP.back].done && step.done) complete(c.id, STEP.back);
}

export interface BidsRun { opened: string[] }

export function runVendorBids(today: string = todayIso()): BidsRun {
  const fin = useFinancialStore.getState();
  const out: BidsRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${VENDOR_BIDS_ID}:`)) syncBidsCase(c);
  if (fin.runbooksOff.includes(VENDOR_BIDS_ID)) return out;
  for (const parent of useIssuesStore.getState().cases) {
    const hit = bidStepOf(parent);
    if (!hit) continue;
    if (bidsCase(useIssuesStore.getState().cases, parent.id, hit.idx)) continue;
    const id = useIssuesStore.getState().createCase({
      catId: 'maintenance',
      sitId: VENDOR_BIDS_SIT,
      approach: 'pre',
      title: `Bids · ${parent.title}`,
      unit: parent.unit,
      owner: parent.owner,
      priority: parent.priority,
      notes: `Opened by the Vendor bids runbook on ${today}: the action "${parent.title}" reached "${hit.step.s}", which asks for ${hit.step.minimumBids || hit.step.bidCollection?.minimumBids || 3} bids. Add the bids on that action; this one tracks the scope, the verification and the pick.`,
      assignedTo: parent.assignedTo,
      assignedRole: parent.assignedRole,
      dueDate: parent.dueDate,
      source: 'runbook',
      sourceId: bidsSourceId(parent.id, hit.idx),
      customSteps: bidsSteps(parent, hit.step),
    });
    out.opened.push(id);
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncBidsCase(created);
  }
  return out;
}
