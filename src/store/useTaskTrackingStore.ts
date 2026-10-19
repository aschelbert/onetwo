/**
 * @deprecated This store is deprecated as of Handoff 14.
 * All board_tasks have been migrated to cases via migrateToCases.
 * The board_tasks table is marked for removal after a 30-day grace period.
 * This store remains only for backward compatibility during the transition.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as taskSvc from '@/lib/services/taskTracking';
import type { TaskItem, TaskStatus, LinkedItem } from '@/lib/services/taskTracking';
import { generateLocalId } from '@/lib/generateId';
import { useIssuesStore } from '@/store/useIssuesStore';

export type { TaskItem, TaskStatus, TaskPriority, TaskCategory, LinkedItem } from '@/lib/services/taskTracking';

/* ── Seed data ─────────────────────────────────────────────── */

const now = new Date().toISOString();

const seedTasks: TaskItem[] = [
  {
    id: 'task1',
    title: 'Schedule annual fire alarm inspection',
    description: 'Contact DC Fire & EMS to schedule the annual fire alarm system inspection. Certificate expires in April.',
    status: 'todo',
    priority: 'high',
    category: 'compliance',
    assignedTo: 'user3',
    assignedToName: 'Robert Mitchell',
    createdBy: 'user1',
    createdByName: 'John Smith',
    dueDate: '2026-04-01',
    completedAt: null,
    linkedItems: [],
    notes: '',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'task2',
    title: 'Get bids for lobby furniture replacement',
    description: 'Lobby couches are worn. Obtain at least 3 vendor bids for replacement furniture that matches building aesthetic.',
    status: 'in_progress',
    priority: 'medium',
    category: 'maintenance',
    assignedTo: 'user4',
    assignedToName: 'Jennifer Adams',
    createdBy: 'user3',
    createdByName: 'Robert Mitchell',
    dueDate: '2026-03-28',
    completedAt: null,
    linkedItems: [{ id: 'case-1', type: 'case', title: 'Lobby Renovation — Phase 1' }],
    notes: 'Two bids received so far. Waiting on third from Modern Office Co.',
    createdAt: '2026-02-20T09:00:00Z',
    updatedAt: '2026-03-10T14:00:00Z',
  },
  {
    id: 'task3',
    title: 'Follow up on parking garage water stain',
    description: 'Water stain on ceiling near spot 42 in B1. Plumber was called — follow up on diagnosis.',
    status: 'blocked',
    priority: 'medium',
    category: 'maintenance',
    assignedTo: 'user5',
    assignedToName: 'David Chen',
    createdBy: 'user1',
    createdByName: 'John Smith',
    dueDate: '2026-03-15',
    completedAt: null,
    linkedItems: [{ id: 'pl1', type: 'property_log', title: 'February Monthly Walkthrough' }],
    notes: 'Waiting on plumber availability. Rescheduled twice.',
    createdAt: '2026-02-16T11:00:00Z',
    updatedAt: '2026-03-05T16:00:00Z',
  },
  {
    id: 'task4',
    title: 'Send Q1 financial summary to owners',
    description: 'Prepare and distribute Q1 2026 financial summary to all unit owners via email and portal announcement.',
    status: 'todo',
    priority: 'low',
    category: 'financial',
    assignedTo: 'user1',
    assignedToName: 'John Smith',
    createdBy: 'user3',
    createdByName: 'Robert Mitchell',
    dueDate: '2026-04-15',
    completedAt: null,
    linkedItems: [],
    notes: '',
    createdAt: '2026-03-10T08:00:00Z',
    updatedAt: '2026-03-10T08:00:00Z',
  },
  {
    id: 'task5',
    title: 'Update emergency contact list',
    description: 'Collect updated emergency contacts from all unit owners and update the building management binder.',
    status: 'done',
    priority: 'low',
    category: 'administrative',
    assignedTo: 'user5',
    assignedToName: 'David Chen',
    createdBy: 'user4',
    createdByName: 'Jennifer Adams',
    dueDate: '2026-02-28',
    completedAt: '2026-02-25T10:00:00Z',
    linkedItems: [],
    notes: 'All contacts updated and filed.',
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-25T10:00:00Z',
  },
  // Older completed task — should appear in logs (completed > 30 days ago)
  {
    id: 'task6',
    title: 'Renew building insurance policy',
    description: 'Annual renewal of master insurance policy with Allied Insurance Group.',
    status: 'done',
    priority: 'high',
    category: 'compliance',
    assignedTo: 'user1',
    assignedToName: 'John Smith',
    createdBy: 'user3',
    createdByName: 'Robert Mitchell',
    dueDate: '2026-01-31',
    completedAt: '2026-01-28T15:00:00Z',
    linkedItems: [{ id: 'ISS-1', type: 'request', title: 'Parking Garage Leak Report — SUBMITTED' }],
    notes: 'Policy renewed at 3.2% premium increase. Board approved.',
    createdAt: '2026-01-05T09:00:00Z',
    updatedAt: '2026-01-28T15:00:00Z',
  },
  {
    id: 'task7',
    title: 'Fix hallway light fixture — Floor 3',
    description: 'Flickering fluorescent light in 3rd floor hallway near unit 302. Replace ballast or full fixture.',
    status: 'done',
    priority: 'medium',
    category: 'maintenance',
    assignedTo: 'user5',
    assignedToName: 'David Chen',
    createdBy: 'user1',
    createdByName: 'John Smith',
    dueDate: '2026-02-10',
    completedAt: '2026-02-08T12:00:00Z',
    linkedItems: [],
    notes: 'Replaced full fixture with LED panel. $85 cost.',
    createdAt: '2026-02-03T14:00:00Z',
    updatedAt: '2026-02-08T12:00:00Z',
  },
];

/* ── Store ─────────────────────────────────────────────────── */

interface TaskTrackingState {
  tasks: TaskItem[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addTask: (task: Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>, tenantId?: string) => void;
  updateTask: (id: string, updates: Partial<TaskItem>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, newStatus: TaskStatus) => void;
  addLinkedItem: (taskId: string, item: LinkedItem) => void;
  removeLinkedItem: (taskId: string, linkedItemId: string) => void;
  /**
   * migrateToCases — Converts open tasks into cases via the issues store.
   * Returns the number of tasks migrated.
   */
  migrateToCases: () => number;
}

export const useTaskTrackingStore = create<TaskTrackingState>()(persist((set) => ({
  tasks: seedTasks,

  loadFromDb: async (tenantId: string) => {
    const tasks = await taskSvc.fetchTasks(tenantId);
    if (tasks) set({ tasks });
  },

  addTask: (task, tenantId?) => {
    const id = generateLocalId('task');
    const now = new Date().toISOString();
    const newTask: TaskItem = { id, ...task, createdAt: now, updatedAt: now };
    set(s => ({ tasks: [newTask, ...s.tasks] }));
    const tid = tenantId || getActiveTenantId();
    if (isBackendEnabled && tid) {
      taskSvc.createTask(tid, task).then(dbRow => {
        if (dbRow) set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, id: dbRow.id } : t) }));
      }).catch(err => {
        console.error('[syncWrite] createTask failed:', err);
        set(s => ({ tasks: s.tasks.filter(x => x.id !== id) }));
      });
    }
  },

  updateTask: (id, updates) => {
    const now = new Date().toISOString();
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates, updatedAt: now } : t) }));
    if (isBackendEnabled) taskSvc.updateTask(id, updates);
  },

  deleteTask: (id) => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }));
    if (isBackendEnabled) taskSvc.deleteTask(id);
  },

  moveTask: (id, newStatus) => {
    const now = new Date().toISOString();
    set(s => ({
      tasks: s.tasks.map(t => {
        if (t.id !== id) return t;
        return {
          ...t,
          status: newStatus,
          completedAt: newStatus === 'done' ? now : (newStatus !== 'done' ? null : t.completedAt),
          updatedAt: now,
        };
      }),
    }));
    if (isBackendEnabled) {
      const completedAt = newStatus === 'done' ? now : null;
      taskSvc.updateTask(id, { status: newStatus, completedAt });
    }
  },

  addLinkedItem: (taskId, item) => {
    const now = new Date().toISOString();
    set(s => ({
      tasks: s.tasks.map(t => {
        if (t.id !== taskId) return t;
        if (t.linkedItems.some(li => li.id === item.id)) return t;
        return { ...t, linkedItems: [...t.linkedItems, item], updatedAt: now };
      }),
    }));
    if (isBackendEnabled) {
      const task = useTaskTrackingStore.getState().tasks.find(t => t.id === taskId);
      if (task) taskSvc.updateTask(taskId, { linkedItems: task.linkedItems });
    }
  },

  removeLinkedItem: (taskId, linkedItemId) => {
    const now = new Date().toISOString();
    set(s => ({
      tasks: s.tasks.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, linkedItems: t.linkedItems.filter(li => li.id !== linkedItemId), updatedAt: now };
      }),
    }));
    if (isBackendEnabled) {
      const task = useTaskTrackingStore.getState().tasks.find(t => t.id === taskId);
      if (task) taskSvc.updateTask(taskId, { linkedItems: task.linkedItems });
    }
  },

  migrateToCases: () => {
    const issuesStore = useIssuesStore.getState();
    const state = useTaskTrackingStore.getState();

    // Only migrate open tasks (todo, in_progress, blocked)
    const openTasks = state.tasks.filter(
      t => t.status === 'todo' || t.status === 'in_progress' || t.status === 'blocked',
    );

    // Category-to-CATS mapping for best-effort situation assignment
    const CAT_MAP: Record<string, { catId: string; sitId: string }> = {
      maintenance: { catId: 'maintenance', sitId: 'common-area-repairs' },
      compliance: { catId: 'governance', sitId: 'board-meetings' },
      financial: { catId: 'financial', sitId: 'annual-budgeting' },
      governance: { catId: 'governance', sitId: 'board-meetings' },
      communication: { catId: 'governance', sitId: 'board-meetings' },
    };

    let migrated = 0;
    for (const task of openTasks) {
      const mapping = CAT_MAP[task.category] || { catId: 'governance', sitId: 'board-meetings' };
      const priority = task.priority === 'high' || task.priority === 'urgent' ? task.priority : 'medium';
      issuesStore.openCaseFromDrawer({
        catId: mapping.catId,
        sitId: mapping.sitId,
        approach: 'pre' as const,
        title: task.title,
        reporter: task.createdByName || 'Board',
        assignedTo: task.assignedToName || undefined,
        priority: priority as 'low' | 'medium' | 'high' | 'urgent',
        source: 'task_migration',
        sourceId: task.id,
      });
      migrated++;
    }

    // Mark migrated tasks as done
    const now = new Date().toISOString();
    set(s => ({
      tasks: s.tasks.map(t => {
        if (openTasks.some(ot => ot.id === t.id)) {
          return { ...t, status: 'done' as TaskStatus, completedAt: now, updatedAt: now, notes: `${t.notes ? t.notes + '\n' : ''}Migrated to Cases.` };
        }
        return t;
      }),
    }));

    return migrated;
  },
}), {
  name: 'onetwo-task-tracking',
  version: 3,
  migrate: () => ({}),
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
