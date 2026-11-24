/**
 * Upkeep: what the maintenance schedule looks like across a year, how much of
 * the work was planned against how much was fixing what broke, and one
 * asset's story of upkeep against breakdowns. Pure: schedules, visits and
 * repairs in, rows out.
 */
import { addMonths, deferralOf, frequencyMonths } from './maintenance';

const r0 = (n: number) => Math.round(n);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/** A scheduled task as upkeep reads it. */
export interface Task { id: string; task: string; category: string; frequency: string; nextDue: string; notes: string; status: string }

/** One time a scheduled task was done: kept so the year can be drawn and "on time" judged. */
export interface Visit {
  scheduleId: string;
  task: string;
  system: string;
  /** The date it was due when it was done; '' when that was not known. */
  due: string;
  doneOn: string;
  by: string;
  cost: number;
  /** It was walked as an inspection action. */
  inspection?: boolean;
}

/** A repair as upkeep reads it: fixing something that broke. */
export interface Fix { id: string; what: string; assetId: string; on: string; cost: number; open: boolean }

export interface UpkeepDoc { visits: Visit[] }
export const upkeepFrom = (data: unknown): UpkeepDoc => ({ visits: [], ...((data as Partial<UpkeepDoc>) ?? {}) });

/** "$450", "450/visit", "1,200" all read as a number; anything else is 0. */
export function costOf(text: string | number | undefined | null): number {
  if (typeof text === 'number') return Math.max(0, text);
  const m = /([\d,]+(?:\.\d+)?)/.exec(text ?? '');
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/** Days after its due date that a task still counts as done on time. */
export const ON_TIME_GRACE_DAYS = 14;
export const onTime = (v: Pick<Visit, 'due' | 'doneOn'>) => !ISO.test(v.due) || v.doneOn <= addDays(v.due, ON_TIME_GRACE_DAYS);

/** The dates a task falls due in a year, from its next due date and how often it repeats. */
export function dueDatesIn(t: Pick<Task, 'nextDue' | 'frequency'>, year: number): string[] {
  if (!ISO.test(t.nextDue)) return [];
  const months = frequencyMonths(t.frequency), end = `${year}-12-31`, start = `${year}-01-01`;
  const out: string[] = [];
  for (let d = t.nextDue, n = 0; d <= end && n < 60; d = addMonths(d, months), n++) {
    if (d >= start) out.push(d);
    if (months <= 0) break;
  }
  return out;
}

export type MarkState = 'done' | 'late' | 'overdue' | 'put-off' | 'to-come';
export interface Mark { month: number; label: string; state: MarkState; title: string }
export interface SystemRow { system: string; marks: Mark[]; cost: number; tasks: number }

const short = (task: string) => (/inspect|survey|audit/i.test(task) ? 'Insp' : /test|certif/i.test(task) ? 'Test' : /filter/i.test(task) ? 'Filt' : /clean/i.test(task) ? 'Clean' : /walk/i.test(task) ? 'Walk' : /service|tune|maint/i.test(task) ? 'Svc' : task.trim().slice(0, 4));

/**
 * The year drawn system by system: a mark in the month of each visit made and
 * each date still to come. A system with no marks in twelve months is one
 * nobody is looking at.
 */
export function yearGrid(tasks: Task[], visits: Visit[], year: number, today: string): SystemRow[] {
  const rows = new Map<string, SystemRow>();
  const row = (system: string) => { const k = system.trim() || 'General'; if (!rows.has(k)) rows.set(k, { system: k, marks: [], cost: 0, tasks: 0 }); return rows.get(k)!; };
  for (const t of tasks) row(t.category).tasks += 1;
  for (const v of visits) {
    if (!v.doneOn.startsWith(`${year}-`)) continue;
    const r = row(v.system);
    r.cost += v.cost;
    r.marks.push({ month: Number(v.doneOn.slice(5, 7)) - 1, label: short(v.task), state: onTime(v) ? 'done' : 'late', title: `${v.task} · done ${v.doneOn}${v.by ? ` by ${v.by}` : ''}${onTime(v) ? '' : ` · was due ${v.due}`}` });
  }
  for (const t of tasks) {
    if (t.status === 'completed' && frequencyMonths(t.frequency) === 0) continue;
    const put = deferralOf(t);
    dueDatesIn(t, year).forEach((d, i) => {
      const state: MarkState = d < today ? 'overdue' : i === 0 && put ? 'put-off' : 'to-come';
      row(t.category).marks.push({ month: Number(d.slice(5, 7)) - 1, label: short(t.task), state, title: `${t.task} · ${state === 'overdue' ? 'overdue, was due' : state === 'put-off' ? `put off from ${put!.from} to` : 'due'} ${d}${state === 'put-off' ? ` · ${put!.reason}` : ''}` });
    });
  }
  return [...rows.values()].map(r => ({ ...r, cost: r0(r.cost), marks: r.marks.sort((a, b) => a.month - b.month) })).sort((a, b) => a.system.localeCompare(b.system));
}

/** The year in four figures: planned against fixing, done on time, put off, and overdue. */
export function yearSummary(tasks: Task[], visits: Visit[], fixes: Fix[], year: number, today: string) {
  const mine = visits.filter(v => v.doneOn.startsWith(`${year}-`));
  const planned = r0(mine.reduce((t, v) => t + v.cost, 0));
  const fixing = r0(fixes.filter(f => f.on.startsWith(`${year}-`)).reduce((t, f) => t + f.cost, 0));
  const total = planned + fixing;
  const overdue = tasks.filter(t => ISO.test(t.nextDue) && t.nextDue < today && !(t.status === 'completed' && frequencyMonths(t.frequency) === 0));
  const putOff = tasks.map(t => ({ t, d: deferralOf(t) })).filter(x => x.d && !(x.t.status === 'completed' && frequencyMonths(x.t.frequency) === 0)).sort((a, b) => a.d!.from.localeCompare(b.d!.from));
  return {
    planned, fixing,
    plannedPct: total > 0 ? Math.round((planned / total) * 100) : null,
    done: mine.length, doneOnTime: mine.filter(onTime).length,
    /** Everything the year asked for so far: what was done, plus what is overdue now. */
    asked: mine.length + overdue.length,
    overdue: overdue.length,
    putOff: putOff.length, oldestPutOff: putOff[0] ? { task: putOff[0].t.task, from: putOff[0].d!.from } : null,
    /** Systems with a task but nothing done and nothing coming this year. */
    unwatched: yearGrid(tasks, visits, year, today).filter(r => r.tasks > 0 && r.marks.length === 0).map(r => r.system),
  };
}

export const STORY_YEARS = 3;
/**
 * One asset's story over the last three years: planned visits on its
 * scheduled tasks against repairs to it. When the repairs cost more than
 * twice the upkeep, and there were at least two, that is a case for bringing
 * its replacement forward.
 */
export function assetStory(a: { id: string; scheduleIds: string[] }, visits: Visit[], fixes: Fix[], today: string) {
  const since = `${Number(today.slice(0, 4)) - STORY_YEARS}${today.slice(4)}`;
  const mine = visits.filter(v => a.scheduleIds.includes(v.scheduleId) && v.doneOn >= since);
  const broke = fixes.filter(f => f.assetId === a.id && f.on >= since);
  const planned = r0(mine.reduce((t, v) => t + v.cost, 0)), repairs = r0(broke.reduce((t, f) => t + f.cost, 0));
  return { visits: mine.length, planned, breakdowns: broke.length, repairs, bringForward: broke.length >= 2 && repairs > 0 && repairs > planned * 2 };
}

// ── What opens an inspection on its own ──────────────────────────────────────
/** Days before a scheduled inspection is due that its action opens. */
export const INSPECTION_OPENS_DAYS = 30;
/** Inspections a licensed outsider has to certify, judged from what the task is called. */
export const NEEDS_THIRD_PARTY = /elevator|lift|boiler|fire alarm|sprinkler|standpipe|backflow|extinguisher|facade|pressure vessel/i;

/** Whether a scheduled inspection should have its action open today: due inside the window, or overdue. */
export const inspectionOpens = (t: Pick<Task, 'nextDue' | 'status'>, today: string) => ISO.test(t.nextDue) && t.status !== 'completed' && t.nextDue <= addDays(today, INSPECTION_OPENS_DAYS);

/** Days after a move-out that its walk-through still opens. */
export const MOVE_OUT_LOOKBACK_DAYS = 30;
/** Whether a move is a move-out whose day has come, recently enough to still be worth walking. */
export const moveOutDue = (m: { moveType: string; scheduledDate: string }, today: string) => m.moveType === 'out' && ISO.test(m.scheduledDate) && m.scheduledDate <= today && m.scheduledDate >= addDays(today, -MOVE_OUT_LOOKBACK_DAYS);

/** The condition an asset is given from how its point was marked on a condition survey. */
export const conditionFrom = (result: string): 'Good' | 'Fair' | 'Poor' | null => (result === 'fine' ? 'Good' : result === 'watch' ? 'Fair' : result === 'work' ? 'Poor' : null);
