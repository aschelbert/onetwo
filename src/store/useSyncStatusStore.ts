import { create } from 'zustand';

interface SyncStatusState {
  /** Number of writes currently in-flight. */
  pendingWrites: number;
  /** Timestamp of last successful sync. */
  lastSyncedAt: number | null;
  /** Last error message, if any. */
  lastError: string | null;

  incrementPending: () => void;
  decrementPending: () => void;
  markSynced: () => void;
  markError: (msg: string) => void;
  clearError: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>()((set) => ({
  pendingWrites: 0,
  lastSyncedAt: null,
  lastError: null,

  incrementPending: () => set((s) => ({ pendingWrites: s.pendingWrites + 1, lastError: null })),
  decrementPending: () => set((s) => ({ pendingWrites: Math.max(0, s.pendingWrites - 1) })),
  markSynced: () => set({ lastSyncedAt: Date.now() }),
  markError: (msg) => set({ lastError: msg }),
  clearError: () => set({ lastError: null }),
}));
