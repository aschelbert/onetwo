import type { ActionKind, ActionRecord, ActionStep } from './types';
import { BID_REQUEST } from './bidRequest';
import { REPAIR } from './repair';
import { INSPECTION } from './inspection';

export type { ActionKind, ActionRecord, ActionStep } from './types';

/** Every record-backed action there is. Adding a kind here gives it a runbook, a plan and a place in the Board Room. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTION_KINDS: ActionKind<any>[] = [BID_REQUEST, REPAIR, INSPECTION];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const actionKind = (kind: string): ActionKind<any> | undefined => ACTION_KINDS.find(k => k.kind === kind);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const actionKindByRunbook = (runbookId: string): ActionKind<any> | undefined => ACTION_KINDS.find(k => k.runbookId === runbookId);

export function stepsOf(r: ActionRecord): ActionStep[] {
  return actionKind(r.kind)?.steps(r as never) ?? [];
}

/** "Step 3 of 5 · Compare like for like", or "Closed 2026-12-10". */
export function stageOf(r: ActionRecord): string {
  const steps = stepsOf(r);
  const cur = steps.find(s => !s.done);
  return r.closedOn ? `Closed ${r.closedOn}` : cur ? `Step ${steps.indexOf(cur) + 1} of ${steps.length} · ${cur.title}` : 'All steps done';
}
