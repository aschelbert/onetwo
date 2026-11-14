/**
 * Tasker jobs booked from actions. One job belongs to one checklist item of
 * one action; the action, its work order and its decision trail are the
 * record, and `features/tasker/lifecycle.ts` keeps them in step with the job.
 * This store only holds the job itself.
 *
 * With the backend on, every job is saved to tasker_jobs as it changes, so the
 * whole board sees the same jobs; in demo mode they live in this browser.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as svc from '@/lib/services/taskerJobs';
import type { TaskCategoryId, TimeSlotId } from '@/features/tasker/taskRabbit';

export type TaskerJobStatus =
  | 'requested'        // sent to the Tasker, waiting for them to accept
  | 'no-reply'         // they did not accept in time
  | 'scheduled'        // accepted; access details released
  | 'on-the-way'
  | 'working'          // checked in, clock running
  | 'scope-request'    // the Tasker asked for more time or parts
  | 'done'             // the Tasker marked it done; the board reviews
  | 'problem'          // the board reported a problem; payment held
  | 'paid'             // confirmed and paid; the work order is paid
  | 'tasker-cancelled'
  | 'cancelled';       // the board cancelled

export interface TaskerEvent { at: string; who: string; text: string }

export interface TaskerJob {
  id: string;
  caseId: string;
  stepIdx: number;
  checkId: string;
  category: TaskCategoryId;
  title: string;
  details: string;
  date: string;
  slot: TimeSlotId;
  access: string;
  taskerId: string;
  taskerName: string;
  rate: number;
  estimateHours: number;
  /** Labour estimate in dollars; grows when the board approves more time or parts. */
  estimate: number;
  parts: number;
  /** Tell the owner on their request when it is scheduled. */
  notifyOwner: boolean;
  status: TaskerJobStatus;
  woId: string | null;
  eta?: string;
  scope?: { extraHours: number; parts: number; note: string };
  final?: { hoursWorked: number; billedHours: number; amount: number; note: string; photos: number };
  problem?: string;
  /** A return visit to fix a reported problem is free. */
  returnVisit?: boolean;
  rating?: number;
  bookedBy: string;
  createdAt: string;
  events: TaskerEvent[];
}

interface TaskerState {
  jobs: TaskerJob[];
  loaded: boolean;
  /** The building's jobs from tasker_jobs (board, manager and account owner only). */
  load: (tenantId?: string) => Promise<void>;
  addJob: (job: TaskerJob) => void;
  updateJob: (id: string, patch: Partial<TaskerJob>, event?: Omit<TaskerEvent, 'at'>) => void;
  reset: () => void;
}

export const nowStamp = () => new Date().toISOString();

// One save at a time per job, each sending the job as it is then, so a slow
// save can never land after a later one and put back an older status.
const queues: Record<string, Promise<unknown>> = {};
function save(id: string) {
  if (!isBackendEnabled) return;
  const tid = getActiveTenantId();
  if (!tid) return;
  queues[id] = (queues[id] ?? Promise.resolve()).then(() => {
    const j = useTaskerStore.getState().jobs.find(x => x.id === id);
    return j ? svc.saveTaskerJob(tid, j) : false;
  });
}

export const useTaskerStore = create<TaskerState>()(persist((set) => ({
  jobs: [],
  loaded: false,
  load: async (tenantId) => {
    const tid = tenantId ?? getActiveTenantId();
    if (!isBackendEnabled || !tid) { set({ loaded: true }); return; }
    const rows = await svc.fetchTaskerJobs(tid);
    // The database is the record: its jobs replace what this browser had. A failed load keeps what is here.
    if (rows) set({ jobs: rows, loaded: true });
  },
  addJob: (job) => { set(s => ({ jobs: [...s.jobs, job] })); save(job.id); },
  updateJob: (id, patch, event) => {
    set(s => ({
      jobs: s.jobs.map(j => j.id === id ? { ...j, ...patch, events: event ? [...j.events, { ...event, at: nowStamp() }] : j.events } : j),
    }));
    save(id);
  },
  reset: () => set({ jobs: [], loaded: false }),
}), { name: 'onetwo-tasker-jobs', version: 1, partialize: s => ({ jobs: s.jobs }) }));

/** The live job for a checklist item: the latest one that was not cancelled, else the latest. */
export function jobFor(jobs: TaskerJob[], caseId: string, checkId: string): TaskerJob | undefined {
  const mine = jobs.filter(j => j.caseId === caseId && j.checkId === checkId);
  return [...mine].reverse().find(j => j.status !== 'cancelled') ?? mine[mine.length - 1];
}
