import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as boardOpsSvc from '@/lib/services/boardOps';
import type { BoardTask } from '@/lib/services/boardOps';

// Re-export the type
export type { BoardTask } from '@/lib/services/boardOps';

interface BoardOpsState {
  tasks: BoardTask[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addTask: (task: Omit<BoardTask, 'id'>, tenantId?: string) => void;
  updateTask: (id: string, updates: Partial<BoardTask>) => void;
  deleteTask: (id: string) => void;
}

export const useBoardOpsStore = create<BoardOpsState>()(persist((set) => ({
  tasks: [
    { id: 'bt1', title: 'Review elevator modernization bids', description: 'Compare 3 vendor proposals for elevator upgrade project', status: 'in_progress', priority: 'high', assignedTo: 'Jennifer Adams', assignedRole: 'Vice President', dueDate: '2026-03-10', category: 'maintenance', source: 'Board Meeting Jan 2026', sourceId: '', notes: 'Budget approved up to $85,000', completedAt: '' },
    { id: 'bt2', title: 'File DC Biennial Report', description: 'File with DCRA. $80 filing fee.', status: 'open', priority: 'medium', assignedTo: 'Robert Mitchell', assignedRole: 'President', dueDate: '2026-04-01', category: 'compliance', source: 'Runbook item', sourceId: 'rf1', notes: '', completedAt: '' },
    { id: 'bt3', title: 'Schedule annual fire safety inspection', description: 'Coordinate with DC Fire and EMS for annual inspection', status: 'open', priority: 'medium', assignedTo: 'Jennifer Adams', assignedRole: 'Vice President', dueDate: '2026-06-30', category: 'compliance', source: 'Runbook item', sourceId: 'rf4', notes: '', completedAt: '' },
    { id: 'bt4', title: 'Update collection policy document', description: 'Review and update collection policy. Current version is outdated.', status: 'open', priority: 'low', assignedTo: 'David Chen', assignedRole: 'Treasurer', dueDate: '2026-05-01', category: 'governance', source: '', sourceId: '', notes: 'Legal counsel review needed before finalizing', completedAt: '' },
  ],

  loadFromDb: async (tenantId: string) => {
    const tasks = await boardOpsSvc.fetchBoardTasks(tenantId);
    if (tasks) set({ tasks });
  },

  addTask: (task, tenantId?) => {
    const id = 'bt' + Date.now();
    set(s => ({ tasks: [{ id, ...task }, ...s.tasks] }));
    if (isBackendEnabled && tenantId) {
      boardOpsSvc.createBoardTask(tenantId, task).then(dbRow => {
        if (dbRow) set(s => ({ tasks: s.tasks.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateTask: (id, updates) => {
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates } : t) }));
    if (isBackendEnabled) boardOpsSvc.updateBoardTask(id, updates);
  },

  deleteTask: (id) => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }));
    if (isBackendEnabled) boardOpsSvc.deleteBoardTask(id);
  },
}), {
  name: 'onetwo-board-ops',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
