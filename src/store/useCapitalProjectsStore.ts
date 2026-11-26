import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as projectsSvc from '@/lib/services/capitalProjects';
import type { CapitalProject } from '@/lib/capitalProject';

interface CapitalProjectsState {
  projects: CapitalProject[];
  /** Why the last save did not reach the database, when it did not. */
  saveError: string | null;
  loadFromDb: (tenantId: string) => Promise<void>;
  /** Adds a project and returns its id. */
  add: (p: Omit<CapitalProject, 'id'>) => string;
  /** Changes fields on a project; nested groups (funding, permit) are replaced whole, so pass the full group. */
  patch: (id: string, changes: Partial<Omit<CapitalProject, 'id'>>) => void;
  remove: (id: string) => void;
}

/** Capital improvements (Building › Care › Projects; each is worked in its Board Room action). */
export const useCapitalProjectsStore = create<CapitalProjectsState>()(persist((set, get) => ({
  projects: [],
  saveError: null,

  loadFromDb: async (tenantId) => {
    const projects = await projectsSvc.fetchProjects(tenantId);
    if (projects) set({ projects });
  },

  add: (p) => {
    const project: CapitalProject = { ...p, id: crypto.randomUUID() };
    set(s => ({ projects: [project, ...s.projects], saveError: null }));
    const tid = getActiveTenantId();
    if (isBackendEnabled && tid) {
      const failed = () => set(s => ({ projects: s.projects.filter(x => x.id !== project.id), saveError: "That project could not be saved. Try again; if it keeps happening, the building's database may be waiting on an update." }));
      projectsSvc.createProject(tid, project).then(ok => { if (!ok) failed(); }).catch(failed);
    }
    return project.id;
  },

  patch: (id, changes) => {
    set(s => ({ projects: s.projects.map(x => (x.id === id ? { ...x, ...changes } : x)) }));
    const now = get().projects.find(x => x.id === id);
    if (isBackendEnabled && now) void projectsSvc.updateProject(now);
  },

  remove: (id) => {
    set(s => ({ projects: s.projects.filter(x => x.id !== id) }));
    if (isBackendEnabled) void projectsSvc.deleteProject(id);
  },
}), {
  name: 'onetwo-capital-projects',
  version: 1,
  partialize: s => ({ projects: s.projects }),
}));
