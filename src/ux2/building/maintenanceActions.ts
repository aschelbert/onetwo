/**
 * What happens when a scheduled maintenance task is done or put off: the
 * schedule rolls forward, and the visit goes into the property log so there
 * is a record of who did what, when, and what they found.
 */
import { useBuildingStore, type MaintenanceSchedule } from '@/store/useBuildingStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { completed, deferralOf, deferred, frequencyMonths } from '@/lib/maintenance';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { costOf, upkeepFrom, type UpkeepDoc, type Visit } from '@/lib/upkeep';

export type MaintenanceKind = 'Inspection' | 'Routine' | 'Preventive';

/** Inspections and tests are named as such; anything monthly or more often is routine upkeep; the rest is preventive. */
export function kindOf(m: Pick<MaintenanceSchedule, 'task' | 'frequency'>): MaintenanceKind {
  if (/inspect|test|certif|survey|audit/i.test(m.task)) return 'Inspection';
  const months = frequencyMonths(m.frequency);
  return months === 1 ? 'Routine' : 'Preventive';
}

export interface VisitResult {
  doneOn: string;
  by: string;
  /** What the visit cost, when known. */
  cost?: number;
  /** What was found or done. */
  result: string;
  /** Anything that still needs doing as a result. */
  followUp?: string;
}

export const UPKEEP_KIND = 'upkeep';
export const upkeepDoc = (): UpkeepDoc => upkeepFrom(useActionRecordsStore.getState().doc(UPKEEP_KIND)?.data);

/**
 * A scheduled task was done: the visit is kept (what was due, when it was
 * done, by whom, what it cost) and the schedule rolls to its next date.
 * Marking a task done and filing an inspection both come through here.
 */
export function recordVisit(scheduleId: string, visit: { doneOn: string; by: string; cost?: number; inspection?: boolean }): void {
  const b = useBuildingStore.getState();
  const m = b.maintenanceSchedules.find(x => x.id === scheduleId);
  if (!m) return;
  const v: Visit = { scheduleId, task: m.task, system: m.category || 'General', due: deferralOf(m)?.from ?? m.nextDue ?? '', doneOn: visit.doneOn, by: visit.by || m.vendor || 'Building staff', cost: visit.cost ?? costOf(m.estimatedCost), ...(visit.inspection ? { inspection: true } : {}) };
  useActionRecordsStore.getState().setDoc(UPKEEP_KIND, 'Upkeep visits', { visits: [...upkeepDoc().visits, v] }, visit.doneOn);
  b.updateMaintenanceSchedule(scheduleId, completed(m, visit.doneOn));
}

export function markDone(scheduleId: string, visit: VisitResult): void {
  const b = useBuildingStore.getState();
  const m = b.maintenanceSchedules.find(x => x.id === scheduleId);
  if (!m) return;
  recordVisit(scheduleId, visit);
  const asset = b.assets.find(a => a.maintenanceScheduleIds.includes(scheduleId));
  const followUp = visit.followUp?.trim();
  usePropertyLogStore.getState().addLog({
    type: kindOf(m) === 'Inspection' ? 'inspection' : 'maintenance_check',
    title: m.task,
    date: visit.doneOn,
    conductedBy: visit.by || m.vendor || 'Building staff',
    location: asset?.name || m.category || '',
    status: followUp ? 'open' : 'resolved',
    findings: visit.result.trim() ? [{ area: asset?.name || m.category || m.task, condition: followUp ? 'fair' : 'good', notes: visit.result.trim(), severity: followUp ? 'medium' : 'none' }] : [],
    actionItems: followUp ? [{ description: followUp, assignedTo: m.vendor || '', dueDate: '', status: 'open' }] : [],
    notes: `Scheduled ${m.frequency || 'task'}${m.vendor ? ` · ${m.vendor}` : ''}. Recorded from Building › Overview.`,
  });
}

export function putOff(scheduleId: string, to: string, reason: string, today: string): void {
  const b = useBuildingStore.getState();
  const m = b.maintenanceSchedules.find(x => x.id === scheduleId);
  if (m) b.updateMaintenanceSchedule(scheduleId, deferred(m, to, reason, today));
}
