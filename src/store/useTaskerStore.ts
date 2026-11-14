/**
 * Tasker jobs booked from actions. One job belongs to one checklist item of
 * one action; the action, its work order and its decision trail are the
 * record, and `features/tasker/lifecycle.ts` keeps them in step with the job.
 * This store only holds the job itself.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  addJob: (job: TaskerJob) => void;
  updateJob: (id: string, patch: Partial<TaskerJob>, event?: Omit<TaskerEvent, 'at'>) => void;
  reset: () => void;
}

export const nowStamp = () => new Date().toISOString();

export const useTaskerStore = create<TaskerState>()(persist((set) => ({
  jobs: [],
  addJob: (job) => set(s => ({ jobs: [...s.jobs, job] })),
  updateJob: (id, patch, event) => set(s => ({
    jobs: s.jobs.map(j => j.id === id ? { ...j, ...patch, events: event ? [...j.events, { ...event, at: nowStamp() }] : j.events } : j),
  })),
  reset: () => set({ jobs: [] }),
}), { name: 'onetwo-tasker-jobs', version: 1 }));

/** The live job for a checklist item: the latest one that was not cancelled, else the latest. */
export function jobFor(jobs: TaskerJob[], caseId: string, checkId: string): TaskerJob | undefined {
  const mine = jobs.filter(j => j.caseId === caseId && j.checkId === checkId);
  return [...mine].reverse().find(j => j.status !== 'cancelled') ?? mine[mine.length - 1];
}
