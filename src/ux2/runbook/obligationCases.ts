/**
 * An obligation or filing on Home's "Up next" is worked through as a case:
 * the steps, the checklist with its assists (where each item is done in the
 * app), the case dock that brings you back, and the decision trail.
 *
 *  - An obligation that is a runbook the case wizard knows (the annual
 *    meeting, the budget, a filing, the reserve study...) opens that
 *    situation's steps.
 *  - Any other obligation opens a case built from its own how-to steps, as
 *    a checklist, then a step to record that it's done.
 *  - One open case per obligation: Start opens it, after that the card says
 *    Continue and how far along it is.
 *  - Closing the case as Resolved marks the obligation done (a filing:
 *    filed, with the case as proof). Closing it any other way leaves the
 *    obligation open.
 */
import { CATS, useIssuesStore } from '@/store/useIssuesStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { RegulatoryFiling } from '@/store/useComplianceStore';
import type { CaseTrackerCase } from '@/types/issues';

export type ObligationKind = 'obligation' | 'filing';

/** Obligations whose work is a runbook the case wizard already has. */
export const OBLIGATION_SITUATIONS: Record<string, string> = {
  g4: 'annual-meeting-planning',
  g5: 'elections',
  g6: 'board-meetings',
  f1: 'annual-budgeting',
  f2: 'reserve-management',
  f3: 'financial-review',
  f5: 'compliance-filing',
  m1: 'inspection-scheduling',
  m2: 'inspection-scheduling',
};
/** Filings run the filings runbook. */
const FILING_SITUATION = 'compliance-filing';

/** The case category for an obligation's own steps, by its id's area (g governance, f financial...). */
const AREA_CATEGORY: Record<string, string> = { g: 'governance', f: 'financial', i: 'legal', m: 'maintenance', r: 'admin', o: 'governance', e: 'governance', l: 'legal' };

export function categoryOf(sitId: string): string | undefined {
  return CATS.find(c => c.sits.some(s => s.id === sitId))?.id;
}

/** The open case working on this obligation or filing, if there is one. */
export function obligationCase(cases: CaseTrackerCase[], kind: ObligationKind, id: string): CaseTrackerCase | undefined {
  return cases.find(c => c.status !== 'closed' && c.source === kind && c.sourceId === id);
}

/** How far along a case is: checklist items when it has them (they're the work), otherwise steps. */
export function caseProgress(c: CaseTrackerCase): { done: number; total: number } {
  const steps = c.steps ?? [];
  const checks = steps.flatMap(s => s.checks ?? []);
  if (checks.length) return { done: checks.filter(k => k.checked).length, total: checks.length };
  return { done: steps.filter(s => s.done).length, total: steps.length };
}

/** The last step of an obligation's own case: what shows it was done. */
function recordStep(item: ComplianceItem): { s: string; ck: string[] } {
  switch (item.satisfyingAction) {
    case 'document': return { s: 'Put it on file', ck: ['Upload the reviewed or adopted document to Building › Documents', 'Note the date and who reviewed it'] };
    case 'meeting': return { s: 'Hold the meeting and record it', ck: ['Schedule the meeting and send notice', 'Approve the minutes that record it'] };
    case 'filing': return { s: 'File it and keep the proof', ck: ['Submit the filing', 'Attach the confirmation as proof'] };
    default: return { s: 'Record that it is done', ck: ['Record the review in the next board minutes', 'Attach proof that it is done'] };
  }
}

export interface StartInput {
  kind: ObligationKind;
  id: string;
  /** The obligation (for its how-to steps); filings have none. */
  item?: ComplianceItem;
  filing?: RegulatoryFiling;
}

/**
 * Open (or resume) the case for an obligation or filing. Returns the case id,
 * or null when there's nothing to work on.
 */
export function startObligationCase({ kind, id, item, filing }: StartInput): string | null {
  const store = useIssuesStore.getState();
  const existing = obligationCase(store.cases, kind, id);
  if (existing) return existing.id;

  const title = item?.task ?? filing?.name;
  if (!title) return null;
  const due = item?.due ?? filing?.dueDate;
  const dueDate = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined;
  const role = item?.role ?? filing?.responsible ?? '';
  const notes = [item?.whyItMatters, item?.legalRef ? `Legal reference: ${item.legalRef}` : '', filing?.notes].filter(Boolean).join('\n\n');
  const common = { title, unit: '', owner: role || 'Board', priority: (item?.critical ?? true) ? 'high' as const : 'medium' as const, notes, assignedRole: role || undefined, dueDate, source: kind, sourceId: id };

  const sitId = kind === 'filing' ? FILING_SITUATION : OBLIGATION_SITUATIONS[id];
  const catId = sitId ? categoryOf(sitId) : undefined;
  // 'pre' is each runbook's main path (the case wizard's default); 'self' and 'legal' hold the exceptions.
  if (sitId && catId) return store.createCase({ ...common, catId, sitId, approach: 'pre' });

  // The obligation's own steps: its how-to list as a checklist (each item gets its assists), then the record of it.
  const howTo = item?.howTo?.length ? item.howTo : ['Work out what is needed', 'Do it'];
  const record = item ? recordStep(item) : { s: 'Record that it is done', ck: ['Attach proof that it is done'] };
  return store.createCase({
    ...common,
    catId: AREA_CATEGORY[id[0]] ?? 'governance',
    // Not a wizard situation, so the steps below are kept as they are.
    sitId: `obligation-${id}`,
    approach: 'pre',
    customSteps: [
      { s: `Work through: ${title}`, detail: item?.tip, ck: howTo },
      { s: record.s, ck: record.ck },
    ],
  });
}

const RESOLVED = /^resolved$/i;

/** When a case for an obligation closes as resolved, mark the obligation done (a filing: filed). */
export function completeFromCase(c: CaseTrackerCase): void {
  if (c.source !== 'obligation' && c.source !== 'filing') return;
  if (!c.sourceId || (c.closeReason && !RESOLVED.test(c.closeReason))) return;
  const comp = useComplianceStore.getState();
  if (c.source === 'filing') {
    const f = comp.filings.find(x => x.id === c.sourceId);
    if (f && f.status !== 'filed') comp.markFilingComplete(f.id, c.completedAt ?? new Date().toISOString().slice(0, 10), `Case ${c.id.slice(0, 8)}`);
  } else if (!comp.completions[c.sourceId]) {
    comp.setCompletion(c.sourceId, true);
  }
}

let unsubscribe: (() => void) | null = null;

/** Watch cases: one closing as resolved completes its obligation. Safe to call more than once. */
export function watchObligationCases(): () => void {
  if (unsubscribe) return unsubscribe;
  const off = useIssuesStore.subscribe((state, prev) => {
    if (state.cases === prev.cases) return;
    const before = new Map(prev.cases.map(c => [c.id, c.status]));
    // Only a case that was open and is now closed: cases loading from the database closed long ago don't count.
    for (const c of state.cases) if (c.status === 'closed' && before.has(c.id) && before.get(c.id) !== 'closed') completeFromCase(c);
  });
  unsubscribe = () => { off(); unsubscribe = null; };
  return unsubscribe;
}
