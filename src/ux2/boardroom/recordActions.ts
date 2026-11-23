/**
 * Runs the record-backed actions: every open record of a registered kind gets
 * one Board Room action carrying that kind's steps, each step ticks itself as
 * the record shows it done, and the action closes when the record does.
 *
 * App only, like the register's runbooks: there is no database twin, so an
 * action opens as its record is started.
 *
 * `SYNC` holds what a record learns from elsewhere (a work order paid in
 * Funds, twelve months of utility bills entered) and what happens to other
 * records when it closes.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { ACTION_KINDS, actionKind, actionKindByRunbook, stepsOf, type ActionRecord } from '@/lib/actions';
import type { CaseTrackerCase } from '@/types/issues';
import { pointsFor, watched, type InspectionData } from '@/lib/actions/inspection';
import { todayIso } from '../runbook/adapters';

export const actionSourceId = (r: Pick<ActionRecord, 'kind' | 'id'>) => `${actionKind(r.kind)?.runbookId ?? r.kind}:${r.id}`;
export const recordCase = (cases: CaseTrackerCase[], r: Pick<ActionRecord, 'kind' | 'id'>) => cases.find(c => c.source === 'runbook' && c.sourceId === actionSourceId(r));

/** The record an action belongs to, when it is a record-backed one. */
export function recordIdOf(c: Pick<CaseTrackerCase, 'source' | 'sourceId'> | undefined): string | null {
  if (c?.source !== 'runbook' || !c.sourceId) return null;
  const at = c.sourceId.lastIndexOf(':');
  return at > 0 && actionKindByRunbook(c.sourceId.slice(0, at)) ? c.sourceId.slice(at + 1) : null;
}

type Sync = (r: ActionRecord, today: string) => void;
/** Per kind: bring the record up to date from the rest of the app. Registered by the kinds that need it. */
export const SYNC: Record<string, Sync> = {};

/** A record with a work order learns here that its bill was paid. */
export const syncPaidWorkOrder: Sync = (r, today) => {
  const d = r.data as { workOrderId?: string; paidOn?: string };
  if (!d.workOrderId || d.paidOn) return;
  const wo = useFinancialStore.getState().workOrders.find(w => w.id === d.workOrderId);
  if (wo?.status === 'paid') useActionRecordsStore.getState().patchData(r.id, { paidOn: wo.paidDate || today });
};
SYNC.repair = syncPaidWorkOrder;

/** Start a record-backed action: adds the record, opens its action, and returns the action's case id. */
export function startAction(kind: string, title: string, data: Record<string, unknown> = {}, extra: { unit?: string; dueOn?: string } = {}, today: string = todayIso()): { recordId: string; caseId: string | null } {
  const def = actionKind(kind);
  if (!def) return { recordId: '', caseId: null };
  const recordId = useActionRecordsStore.getState().add({ kind, title, unit: extra.unit ?? '', openedOn: today, dueOn: extra.dueOn ?? '', closedOn: '', data: { ...def.blank(), ...data } });
  runRecordActions(today);
  const r = useActionRecordsStore.getState().records.find(x => x.id === recordId);
  return { recordId, caseId: r ? recordCase(useIssuesStore.getState().cases, r)?.id ?? null : null };
}

/** The checklist an inspection starts from, judged from what the scheduled task is called. */
export function templateFor(task: string): string {
  if (/roof/i.test(task)) return 'roof';
  if (/park|garage|lot/i.test(task)) return 'parking';
  if (/entrance|lobby|entry/i.test(task)) return 'entrance';
  if (/facade|exterior|envelope|masonry/i.test(task)) return 'facade';
  if (/move/i.test(task)) return 'moveout';
  return 'walkthrough';
}

/** Start an inspection, carrying forward the points the last one of its kind marked to watch. */
export function startInspection(title: string, opts: { scheduleId?: string; by?: string; template?: string } = {}, today: string = todayIso()) {
  const template = opts.template ?? templateFor(title);
  const last = useActionRecordsStore.getState().records
    .filter(r => r.kind === 'inspection' && !!r.closedOn && (r.data as unknown as InspectionData).template === template)
    .sort((a, b) => b.closedOn.localeCompare(a.closedOn))[0];
  const watchedLast = new Map(last ? watched(last.data as unknown as InspectionData).map(p => [p.label, p.note || 'no note']) : []);
  const points = pointsFor(template).map(p => (watchedLast.has(p.label) ? { ...p, watchedBefore: watchedLast.get(p.label) } : p));
  // Points added by hand last time and still being watched come along too.
  for (const [label, note] of watchedLast) if (!points.some(p => p.label === label)) points.push({ id: `w${points.length}`, label, result: '', note: '', photos: [], handling: '', handlingNote: '', watchedBefore: note });
  return startAction('inspection', title, { template, scheduleId: opts.scheduleId ?? '', by: opts.by ?? '', points }, {}, today);
}

export interface RecordActionsRun { opened: string[] }

export function runRecordActions(today: string = todayIso()): RecordActionsRun {
  const off = useFinancialStore.getState().runbooksOff;
  const out: RecordActionsRun = { opened: [] };
  const kinds = new Set(ACTION_KINDS.map(k => k.kind));
  for (const r0 of useActionRecordsStore.getState().records) {
    if (!kinds.has(r0.kind)) continue;
    const def = actionKind(r0.kind)!;
    let c = recordCase(useIssuesStore.getState().cases, r0);
    if (!c && !r0.closedOn && !off.includes(def.runbookId)) {
      const id = useIssuesStore.getState().createCase({
        catId: def.catId, sitId: `runbook-${def.runbookId}`, approach: 'pre',
        title: `${def.name} · ${r0.title}`, unit: r0.unit, owner: '', priority: 'medium', assignedRole: def.role,
        notes: `Opened by the ${def.name} runbook on ${today}.`, dueDate: r0.dueOn || undefined,
        source: 'runbook', sourceId: actionSourceId(r0),
        customSteps: def.stepTitles.map(([key, title]) => ({ s: title, detail: `${def.how[key]}.` })),
      });
      out.opened.push(id);
      c = useIssuesStore.getState().cases.find(x => x.id === id);
    }
    if (!c || c.status === 'closed' || !c.steps) continue;
    SYNC[r0.kind]?.(r0, today);
    const r = useActionRecordsStore.getState().records.find(x => x.id === r0.id) ?? r0;
    stepsOf(r).forEach((s, i) => { if (s.done && c!.steps![i] && !c!.steps![i].done) useIssuesStore.getState().completeStep(c!.id, i); });
    if (r.closedOn) useIssuesStore.getState().closeCaseWithReason(c.id, 'Finished', `${def.name} · ${r.title} closed ${r.closedOn}.`);
  }
  return out;
}
