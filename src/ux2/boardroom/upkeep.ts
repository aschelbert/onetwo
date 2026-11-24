/**
 * What opens an inspection without anyone asking, and what an inspection
 * writes back when it is filed:
 *
 *  - A scheduled inspection comes within 30 days, or is overdue.
 *  - A unit's move-out day arrives: the common areas are walked.
 *  - A reserve study is coming: every asset gets a condition rating first.
 *
 * A storm or freeze check is started by a person (the app has no weather
 * feed). Elevator, boiler and fire-system entries keep their own runbooks,
 * which open on the same calendar, so they are left to those.
 */
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import type { InspectionData, InspectionPoint } from '@/lib/actions/inspection';
import { NEEDS_THIRD_PARTY, conditionFrom, inspectionOpens, moveOutDue } from '@/lib/upkeep';
import { todayIso } from '../runbook/adapters';
import { kindOf } from '../building/maintenanceActions';
import { BOILER_FIRE_RE, ELEVATOR_RE } from './inspections';
import { SYNC, TRIGGERS, recordCase, startAction, startInspection } from './recordActions';
import { nextStudy, openReserveCase } from './reserveStudy';

export const INSPECTION_RUNBOOK = 'inspection';
const inspections = () => useActionRecordsStore.getState().records.filter(r => r.kind === 'inspection').map(r => ({ r, d: r.data as unknown as InspectionData }));
const patchData = (id: string, changes: Partial<InspectionData>) => useActionRecordsStore.getState().patchData(id, changes as Record<string, unknown>);
const caseOf = (recordId: string) => { const r = useActionRecordsStore.getState().records.find(x => x.id === recordId); return r ? recordCase(useIssuesStore.getState().cases, r)?.id ?? null : null; };

/** The scheduled inspections this trigger looks after: named as inspections, and not the elevator, boiler or fire entries. */
export const watchedInspections = () => useBuildingStore.getState().maintenanceSchedules.filter(m => kindOf(m) === 'Inspection' && !ELEVATOR_RE.test(`${m.task} ${m.category}`) && !BOILER_FIRE_RE.test(`${m.task} ${m.category}`));

/** Start the inspection for a scheduled entry, for the date it is due; names a certified outsider where the task needs one. */
export function startScheduledInspection(scheduleId: string, today: string = todayIso()): { recordId: string; caseId: string | null } {
  const m = useBuildingStore.getState().maintenanceSchedules.find(x => x.id === scheduleId);
  if (!m) return { recordId: '', caseId: null };
  const open = inspections().find(x => x.d.scheduleId === scheduleId && !x.r.closedOn);
  if (open) return { recordId: open.r.id, caseId: caseOf(open.r.id) };
  const out = startInspection(m.task, { scheduleId, by: m.vendor }, today);
  if (out.recordId) patchData(out.recordId, { dueFor: m.nextDue, thirdParty: NEEDS_THIRD_PARTY.test(`${m.task} ${m.category}`) });
  return out;
}

/** A storm or a freeze is forecast: walk the short list before it arrives. */
export function startStormCheck(what: string, today: string = todayIso()) {
  return startInspection(`Before the ${what.trim() || 'storm'}`, { template: 'storm' }, today);
}

/** Rate every asset before a reserve study, so the study starts from what is there. One per study. */
export function startConditionSurvey(studyKey: string, today: string = todayIso()): { recordId: string; caseId: string | null } {
  const had = inspections().find(x => x.d.template === 'condition' && x.d.studyKey === studyKey);
  if (had) return { recordId: had.r.id, caseId: caseOf(had.r.id) };
  const assets = useBuildingStore.getState().assets;
  if (!assets.length) return { recordId: '', caseId: null };
  const points: InspectionPoint[] = assets.map(a => ({ id: `asset:${a.id}`, label: a.name, result: '', note: '', photos: [], handling: '', handlingNote: '', watchedBefore: a.condition ? `Rated ${a.condition.toLowerCase()} last time` : undefined }));
  return startAction('inspection', 'Condition of every asset, before the reserve study', { template: 'condition', studyKey, points }, {}, today);
}

TRIGGERS.push((today: string) => {
  if (useFinancialStore.getState().runbooksOff.includes(INSPECTION_RUNBOOK)) return;
  const all = inspections();
  // A scheduled inspection inside 30 days, or overdue, with no action for that due date.
  for (const m of watchedInspections()) {
    if (!inspectionOpens(m, today)) continue;
    if (all.some(x => x.d.scheduleId === m.id && (!x.r.closedOn || x.d.dueFor === m.nextDue))) continue;
    startScheduledInspection(m.id, today);
  }
  // A move-out whose day has come.
  for (const e of useFinancialStore.getState().moveEvents) {
    if (!moveOutDue(e, today) || all.some(x => x.d.moveId === e.id)) continue;
    const out = startInspection(`Unit ${e.unitNumber} move-out`, { template: 'moveout' }, today);
    if (out.recordId) { patchData(out.recordId, { moveId: e.id, bookedFor: e.scheduledDate }); useActionRecordsStore.getState().patch(out.recordId, { unit: e.unitNumber }); }
  }
  // A reserve study on its way: the condition survey comes first.
  const study = nextStudy(today);
  if (openReserveCase(useIssuesStore.getState().cases, study.key)?.status === 'open') startConditionSurvey(study.key, today);
});

/** A filed inspection writes back: a condition survey rates each asset, and a move-out walk marks the move as inspected. */
SYNC.inspection = (r) => {
  const d = r.data as unknown as InspectionData;
  if (!d.filedOn || d.conditionsWritten) return;
  if (d.template === 'condition') {
    const b = useBuildingStore.getState();
    for (const p of d.points) {
      const condition = conditionFrom(p.result), id = p.id.startsWith('asset:') ? p.id.slice(6) : '';
      if (!condition || !b.assets.some(a => a.id === id)) continue;
      b.updateAsset(id, { condition });
      b.addConditionAssessment(id, { date: d.bookedFor || d.filedOn, condition, assessedBy: d.by, notes: p.note || 'Condition survey before the reserve study' });
    }
    patchData(r.id, { conditionsWritten: true });
  } else if (d.moveId) {
    void useFinancialStore.getState().updateMoveEvent(d.moveId, { inspectionStatus: d.points.some(p => p.result === 'work') ? 'failed' : 'passed' });
    patchData(r.id, { conditionsWritten: true });
  }
};
