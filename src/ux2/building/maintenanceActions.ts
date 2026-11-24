/**
 * What happens when a scheduled maintenance task is done or put off: the
 * schedule rolls forward, and the visit goes into the property log so there
 * is a record of who did what, when, and what they found.
 */
import { useBuildingStore, type MaintenanceSchedule } from '@/store/useBuildingStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { completed, deferred, frequencyMonths } from '@/lib/maintenance';

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
  /** What was found or done. */
  result: string;
  /** Anything that still needs doing as a result. */
  followUp?: string;
}

export function markDone(scheduleId: string, visit: VisitResult): void {
  const b = useBuildingStore.getState();
  const m = b.maintenanceSchedules.find(x => x.id === scheduleId);
  if (!m) return;
  b.updateMaintenanceSchedule(scheduleId, completed(m, visit.doneOn));
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
