import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as taskSvc from '@/lib/services/taskTracking';
import type { TaskItem, TaskStatus, LinkedItem } from '@/lib/services/taskTracking';

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
    linkedItems: [{ id: 'doc-ins-1', type: 'document', title: 'Insurance Policy 2026' }],
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
}

export const useTaskTrackingStore = create<TaskTrackingState>()(persist((set) => ({
  tasks: seedTasks,

  loadFromDb: async (tenantId: string) => {
    const tasks = await taskSvc.fetchTasks(tenantId);
    if (tasks) set({ tasks });
  },

  addTask: (task, tenantId?) => {
    const id = 'task' + Date.now();
    const now = new Date().toISOString();
    const newTask: TaskItem = { id, ...task, createdAt: now, updatedAt: now };
    set(s => ({ tasks: [newTask, ...s.tasks] }));
    if (isBackendEnabled && tenantId) {
      taskSvc.createTask(tenantId, task).then(dbRow => {
        if (dbRow) set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, id: dbRow.id } : t) }));
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
}), {
  name: 'onetwo-task-tracking',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
