import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as letterSvc from '@/lib/services/letterEngine';
import type { LetterTemplate, GeneratedLetter } from '@/lib/services/letterEngine';
import { generateLocalId } from '@/lib/generateId';
import { builtinLetterTemplates, builtinTemplatesInMemory } from '@/data/letterTemplates';

export type { LetterTemplate, GeneratedLetter } from '@/lib/services/letterEngine';

interface LetterState {
  templates: LetterTemplate[];
  letters: GeneratedLetter[];
  loadFromDb: (tenantId: string) => Promise<void>;
  /** Back to the built-ins and no letters, for a building that has not loaded yet. */
  reset: () => void;
  addTemplate: (t: Omit<LetterTemplate, 'id'>, tenantId?: string) => void;
  updateTemplate: (id: string, updates: Partial<LetterTemplate>) => void;
  deleteTemplate: (id: string) => void;
  addLetter: (l: Omit<GeneratedLetter, 'id'>, tenantId?: string) => void;
  updateLetter: (id: string, updates: Partial<GeneratedLetter>) => void;
  deleteLetter: (id: string) => void;
}

export const useLetterStore = create<LetterState>()(persist((set) => ({
  templates: builtinTemplatesInMemory(),
  letters: [],

  loadFromDb: async (tenantId: string) => {
    const [templates, letters] = await Promise.all([
      letterSvc.fetchTemplates(tenantId),
      letterSvc.fetchLetters(tenantId),
    ]);
    const updates: Partial<LetterState> = {};
    if (templates) {
      if (templates.length === 0) {
        // A building with no templates yet gets the built-ins as its own rows, so every edit and deletion
        // sticks and a template the board adds later does not hide them. Until the rows come back, the
        // built-ins show from memory.
        const rows = await letterSvc.createTemplates(tenantId, builtinLetterTemplates);
        updates.templates = rows && rows.length > 0 ? rows : builtinTemplatesInMemory();
      } else {
        updates.templates = templates;
      }
    }
    if (letters) updates.letters = letters; // none is a real answer: a new building has no letters
    if (Object.keys(updates).length > 0) set(updates);
  },

  reset: () => set({ templates: builtinTemplatesInMemory(), letters: [] }),

  addTemplate: (t, tenantId?) => {
    const id = generateLocalId('lt');
    set(s => ({ templates: [{ id, ...t }, ...s.templates] }));
    const tid = tenantId || getActiveTenantId();
    if (isBackendEnabled && tid) {
      letterSvc.createTemplate(tid, t).then(dbRow => {
        if (dbRow) set(s => ({ templates: s.templates.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      }).catch(err => {
        console.error('[syncWrite] createTemplate failed:', err);
        set(s => ({ templates: s.templates.filter(x => x.id !== id) }));
      });
    }
  },

  updateTemplate: (id, updates) => {
    set(s => ({ templates: s.templates.map(t => t.id === id ? { ...t, ...updates } : t) }));
    if (isBackendEnabled) letterSvc.updateTemplate(id, updates);
  },

  deleteTemplate: (id) => {
    set(s => ({ templates: s.templates.filter(t => t.id !== id) }));
    if (isBackendEnabled) letterSvc.deleteTemplate(id);
  },

  addLetter: (l, tenantId?) => {
    const id = generateLocalId('gl');
    set(s => ({ letters: [{ id, ...l }, ...s.letters] }));
    const tid = tenantId || getActiveTenantId();
    if (isBackendEnabled && tid) {
      letterSvc.createLetter(tid, l).then(dbRow => {
        if (dbRow) set(s => ({ letters: s.letters.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      }).catch(err => {
        console.error('[syncWrite] createLetter failed:', err);
        set(s => ({ letters: s.letters.filter(x => x.id !== id) }));
      });
    }
  },

  updateLetter: (id, updates) => {
    set(s => ({ letters: s.letters.map(l => l.id === id ? { ...l, ...updates } : l) }));
    if (isBackendEnabled) letterSvc.updateLetter(id, updates);
  },

  deleteLetter: (id) => {
    set(s => ({ letters: s.letters.filter(l => l.id !== id) }));
    if (isBackendEnabled) letterSvc.deleteLetter(id);
  },
}), {
  name: 'onetwo-letters',
  version: 3,
  migrate: () => ({}),
  // What a browser keeps between visits matters only without a backend (demo mode): a real building's
  // templates and letters are reset and reloaded from the database on every switch (resetStoresForRealTenant).
  merge: (persisted: any, current: any) => {
    if (!persisted) return current;
    // The built-ins come fresh from code; templates the browser added on its own are kept.
    const builtinIds = new Set(current.templates.map((t: any) => t.id));
    const userTemplates = (persisted.templates || []).filter((t: any) => !builtinIds.has(t.id));
    return {
      ...current,
      ...persisted,
      templates: [...current.templates, ...userTemplates],
    };
  },
}));
