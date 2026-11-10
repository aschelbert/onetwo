/**
 * The inspection runbooks, wired. Two share this file, each watching the
 * maintenance calendar (Building › Overview › Maintenance schedule) for its
 * own systems:
 *
 *  Elevator inspection: entries about the elevator.
 *  Boiler and fire systems: the boiler, fire alarm, sprinklers, standpipes,
 *    extinguishers, emergency lighting.
 *
 * An entry due inside 60 days, or already overdue, gets one case per due
 * date with the inspection playbook (the case wizard's own situation). The
 * app ticks the steps it can see: the calendar identified it, a vendor is on
 * the entry, and once the entry is completed, the scheduling and the visit.
 * A case the board opened from the Home obligation for that system counts.
 *
 * The database opens the same cases every morning (migration 059); the app
 * fills in the playbook steps and ticks them when it loads the case.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore, type MaintenanceSchedule } from '@/store/useBuildingStore';
import { addDays } from '@/lib/billingCycle';
import type { CaseTrackerCase } from '@/types/issues';
import { ISO_DATE, todayIso } from '../runbook/adapters';

export const ELEVATOR_ID = 'elevator-inspection';
export const BOILER_FIRE_ID = 'boiler-fire';
export const INSPECTION_SIT = 'inspection-scheduling';
/** Days before an inspection is due that its case opens. */
export const INSPECTION_LEAD_DAYS = 60;

export const ELEVATOR_RE = /elevator|lift/i;
export const BOILER_FIRE_RE = /boiler|fire|sprinkler|standpipe|extinguisher|smoke|emergency light/i;

const inspectionSourceId = (runbookId: string, scheduleId: string, nextDue: string) => `${runbookId}:${scheduleId}:${nextDue}`;

/** The calendar entries a runbook watches. */
export function watchedEntries(runbookId: string, schedules: MaintenanceSchedule[]): MaintenanceSchedule[] {
  const re = runbookId === ELEVATOR_ID ? ELEVATOR_RE : BOILER_FIRE_RE;
  return schedules.filter(m => re.test(`${m.task} ${m.category}`));
}

export const inspectionDue = (m: MaintenanceSchedule, today: string) => ISO_DATE.test(m.nextDue) && m.status !== 'completed' && m.nextDue <= addDays(today, INSPECTION_LEAD_DAYS);

/** The Home obligation each runbook stands behind: m2 is the elevator, m1 the fire systems. */
const OBLIGATION: Record<string, string> = { [ELEVATOR_ID]: 'm2', [BOILER_FIRE_ID]: 'm1' };

/** A case already on this entry's inspection: the runbook's own for this due date, an open one for the entry, or the obligation's open case. */
export function inspectionCase(cases: CaseTrackerCase[], runbookId: string, m: Pick<MaintenanceSchedule, 'id' | 'nextDue'>): CaseTrackerCase | undefined {
  return cases.find(c => (c.source === 'runbook' && (c.sourceId === inspectionSourceId(runbookId, m.id, m.nextDue) || (c.status !== 'closed' && !!c.sourceId?.startsWith(`${runbookId}:${m.id}:`))))
    || (c.status !== 'closed' && c.source === 'obligation' && c.sourceId === OBLIGATION[runbookId]));
}

const tick = (c: CaseTrackerCase, re: RegExp) => { const i = (c.steps ?? []).findIndex(s => re.test(s.s)); if (i >= 0 && !c.steps![i].done) useIssuesStore.getState().completeStep(c.id, i); };

/** Tick what the app can see: the calendar identified it, a vendor is on the entry, the visit happened. */
export function syncInspectionCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId) return;
  const [runbookId, scheduleId, due] = c.sourceId.split(':');
  if (runbookId !== ELEVATOR_ID && runbookId !== BOILER_FIRE_ID) return;
  const m = useBuildingStore.getState().maintenanceSchedules.find(x => x.id === scheduleId);
  if (!m) return;
  tick(c, /^identify all required inspections/i);
  if (m.vendor.trim()) tick(c, /^engage qualified/i);
  const done = m.status === 'completed' || (ISO_DATE.test(m.lastCompleted) && m.lastCompleted >= due) || (ISO_DATE.test(m.nextDue) && m.nextDue > due);
  if (done) { tick(c, /^schedule inspection date/i); tick(c, /^attend inspection/i); }
}

export interface InspectionsRun { opened: string[] }

function runOne(runbookId: string, today: string): InspectionsRun {
  const fin = useFinancialStore.getState();
  const out: InspectionsRun = { opened: [] };
  const label = runbookId === ELEVATOR_ID ? 'Elevator inspection' : 'Boiler and fire systems';
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${runbookId}:`)) syncInspectionCase(c);
  if (fin.runbooksOff.includes(runbookId)) return out;
  for (const m of watchedEntries(runbookId, useBuildingStore.getState().maintenanceSchedules)) {
    if (!inspectionDue(m, today)) continue;
    if (inspectionCase(useIssuesStore.getState().cases, runbookId, m)) continue;
    const late = m.nextDue < today;
    const id = useIssuesStore.getState().createCase({
      catId: 'maintenance',
      sitId: INSPECTION_SIT,
      approach: 'pre',
      title: `${m.task} · due ${m.nextDue}`,
      unit: '',
      owner: 'Vice President',
      priority: late ? 'urgent' : 'high',
      notes: `Opened by the ${label} runbook on ${today}: ${m.task} (${m.category}${m.frequency ? `, ${m.frequency}` : ''}) is ${late ? 'overdue, it was' : ''} due ${m.nextDue}${m.vendor ? `, with ${m.vendor}` : ''}${ISO_DATE.test(m.lastCompleted) ? `; last done ${m.lastCompleted}` : ''}.${m.notes ? ` ${m.notes}` : ''} Mark the calendar entry done under Building › Overview when the certificate is in hand.`,
      assignedRole: 'Vice President',
      dueDate: m.nextDue,
      source: 'runbook',
      sourceId: inspectionSourceId(runbookId, m.id, m.nextDue),
    });
    out.opened.push(id);
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncInspectionCase(created);
  }
  return out;
}

export const runElevatorInspection = (today: string = todayIso()) => runOne(ELEVATOR_ID, today);
export const runBoilerFire = (today: string = todayIso()) => runOne(BOILER_FIRE_ID, today);
