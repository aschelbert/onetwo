/**
 * Recurring maintenance: how often a task repeats, when it is next due after
 * it is done, and where it stands today. A schedule's `frequency` is free
 * text in older records ("Semi-annual", "Every 6 months"), so it is read
 * leniently; new ones use the labels below.
 */
import type { MaintenanceSchedule } from '@/store/useBuildingStore';

export const FREQUENCIES: { label: string; months: number }[] = [
  { label: 'Monthly', months: 1 },
  { label: 'Quarterly', months: 3 },
  { label: 'Twice a year', months: 6 },
  { label: 'Annual', months: 12 },
  { label: 'Every 2 years', months: 24 },
  { label: 'Every 5 years', months: 60 },
  { label: 'One time', months: 0 },
];

/**
 * The four kinds of maintenance a building tracks, plus inspections:
 * preventive (planned, to extend useful life), routine (day-to-day upkeep),
 * curative (fixing what broke) and deferred (known, put off).
 */
export const MAINTENANCE_KINDS = ['Preventive', 'Routine', 'Inspection', 'Curative'] as const;

/** Months between occurrences; 0 means it does not repeat (or the text could not be read). */
export function frequencyMonths(frequency: string): number {
  const f = (frequency || '').toLowerCase().trim();
  if (!f) return 0;
  const every = f.match(/every\s+(\d+)\s*(month|year|yr|week)/);
  if (every) {
    const n = Number(every[1]);
    return every[2] === 'week' ? Math.max(1, Math.round(n / 4)) : every[2] === 'month' ? n : n * 12;
  }
  if (/one[\s-]?time|once$|as needed/.test(f)) return 0;
  if (/semi[\s-]?annual|twice a year|bi[\s-]?annual|every six|6 months/.test(f)) return 6;
  if (/bienn|every other year|two years/.test(f)) return 24;
  if (/quarter/.test(f)) return 3;
  if (/bi[\s-]?month/.test(f)) return 2;
  if (/month/.test(f)) return 1;
  if (/annual|year/.test(f)) return 12;
  if (/week/.test(f)) return 1;
  return 0;
}

/** `iso` moved by whole months, keeping the day where the month has it (Jan 31 + 1 month = Feb 28). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** When a task done on `doneOn` is due again; '' when it does not repeat. */
export function nextDueAfter(doneOn: string, frequency: string): string {
  const months = frequencyMonths(frequency);
  return months > 0 ? addMonths(doneOn, months) : '';
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

/** Where a schedule stands today, from its dates (the stored status can be stale). */
export function scheduleState(m: Pick<MaintenanceSchedule, 'nextDue' | 'status' | 'frequency'>, today: string, soonDays = 30): MaintenanceSchedule['status'] {
  if (!ISO.test(m.nextDue || '')) return m.status === 'completed' || frequencyMonths(m.frequency) === 0 ? 'completed' : 'on-track';
  if (m.status === 'completed' && frequencyMonths(m.frequency) === 0) return 'completed';
  const d = days(today, m.nextDue);
  return d < 0 ? 'overdue' : d <= soonDays ? 'due-soon' : 'on-track';
}

/** The schedule after the task was done on `doneOn`: last completed set, next due rolled forward. */
export function completed(m: MaintenanceSchedule, doneOn: string): Pick<MaintenanceSchedule, 'lastCompleted' | 'nextDue' | 'status' | 'notes'> {
  const next = nextDueAfter(doneOn, m.frequency);
  return { lastCompleted: doneOn, nextDue: next, status: next ? 'on-track' : 'completed', notes: withoutDeferral(m.notes) };
}

const DEFERRAL = /^Deferred from (\d{4}-\d{2}-\d{2}) on (\d{4}-\d{2}-\d{2}): (.*)$/m;

/** A task put off: when it was first due, when that was decided, and why. Kept in the schedule's notes. */
export function deferralOf(m: Pick<MaintenanceSchedule, 'notes'>): { from: string; on: string; reason: string } | null {
  const hit = (m.notes || '').match(DEFERRAL);
  return hit ? { from: hit[1], on: hit[2], reason: hit[3] } : null;
}

const withoutDeferral = (notes: string) => (notes || '').split('\n').filter(l => !DEFERRAL.test(l)).join('\n').trim();

/** The schedule after putting the task off to `to`; the first due date and the reason stay on the record. */
export function deferred(m: MaintenanceSchedule, to: string, reason: string, today: string): Pick<MaintenanceSchedule, 'nextDue' | 'status' | 'notes'> {
  const first = deferralOf(m)?.from ?? m.nextDue;
  const line = `Deferred from ${first} on ${today}: ${reason.replace(/\s+/g, ' ').trim() || 'no reason given'}`;
  return { nextDue: to, status: 'on-track', notes: [line, withoutDeferral(m.notes)].filter(Boolean).join('\n') };
}
