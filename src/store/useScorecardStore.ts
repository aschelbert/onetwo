import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as scorecardSvc from '@/lib/services/scorecard';
import type { ScorecardEntry, ScorecardReview } from '@/lib/services/scorecard';

export type { ScorecardEntry, ScorecardReview } from '@/lib/services/scorecard';

interface ScorecardState {
  entries: ScorecardEntry[];
  reviews: ScorecardReview[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addEntry: (entry: Omit<ScorecardEntry, 'id'>, tenantId?: string) => void;
  deleteEntry: (id: string) => void;
  addReview: (review: Omit<ScorecardReview, 'id'>, tenantId?: string) => void;
  deleteReview: (id: string) => void;
}

export const useScorecardStore = create<ScorecardState>()(persist((set) => ({
  entries: [
    { id: 'se1', period: '2026-Q1', category: 'responsiveness', score: 4, notes: 'Generally responsive. One delayed response on Unit 301 pipe issue.', scoredBy: 'Robert Mitchell' },
    { id: 'se2', period: '2026-Q1', category: 'financial', score: 5, notes: 'Monthly reports delivered on time. Budget tracking accurate.', scoredBy: 'David Chen' },
    { id: 'se3', period: '2026-Q1', category: 'maintenance', score: 3, notes: 'Elevator maintenance vendor coordination needs improvement.', scoredBy: 'Jennifer Adams' },
    { id: 'se4', period: '2026-Q1', category: 'communication', score: 4, notes: 'Good communication with residents. Board updates regular.', scoredBy: 'Maria Rodriguez' },
    { id: 'se5', period: '2026-Q1', category: 'compliance', score: 4, notes: 'Filings on track. Proactive on regulatory changes.', scoredBy: 'Robert Mitchell' },
  ],
  reviews: [],

  loadFromDb: async (tenantId: string) => {
    const [entries, reviews] = await Promise.all([
      scorecardSvc.fetchEntries(tenantId),
      scorecardSvc.fetchReviews(tenantId),
    ]);
    const updates: Partial<ScorecardState> = {};
    if (entries) updates.entries = entries;
    if (reviews) updates.reviews = reviews;
    if (Object.keys(updates).length > 0) set(updates);
  },

  addEntry: (entry, tenantId?) => {
    const id = 'se' + Date.now();
    set(s => ({ entries: [{ id, ...entry }, ...s.entries] }));
    if (isBackendEnabled && tenantId) {
      scorecardSvc.createEntry(tenantId, entry).then(dbRow => {
        if (dbRow) set(s => ({ entries: s.entries.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  deleteEntry: (id) => {
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }));
    if (isBackendEnabled) scorecardSvc.deleteEntry(id);
  },

  addReview: (review, tenantId?) => {
    const id = 'sr' + Date.now();
    set(s => ({ reviews: [{ id, ...review }, ...s.reviews] }));
    if (isBackendEnabled && tenantId) {
      scorecardSvc.createReview(tenantId, review).then(dbRow => {
        if (dbRow) set(s => ({ reviews: s.reviews.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  deleteReview: (id) => {
    set(s => ({ reviews: s.reviews.filter(r => r.id !== id) }));
    if (isBackendEnabled) scorecardSvc.deleteReview(id);
  },
}), {
  name: 'onetwo-scorecard',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
