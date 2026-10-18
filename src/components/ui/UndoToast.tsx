import React, { useEffect, useState, useCallback, useRef } from 'react';

interface ToastState {
  label: string;
  undo: () => void;
  commit: () => void;
  ms: number;
}

type Listener = (state: ToastState | null) => void;

// Simple external store so the hook can trigger the toast from anywhere
const listeners = new Set<Listener>();
let currentState: ToastState | null = null;

export const undoToastStore = {
  show(state: ToastState) {
    // If a previous toast is active, commit it immediately before replacing
    if (currentState) {
      currentState.commit();
    }
    currentState = state;
    listeners.forEach((l) => l(state));
  },
  dismiss() {
    currentState = null;
    listeners.forEach((l) => l(null));
  },
  getState() {
    return currentState;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export default function UndoToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const committedRef = useRef(false);

  useEffect(() => {
    return undoToastStore.subscribe(setToast);
  }, []);

  // Start/reset the timer when a new toast appears
  useEffect(() => {
    if (!toast) return;
    committedRef.current = false;

    timerRef.current = setTimeout(() => {
      if (!committedRef.current) {
        committedRef.current = true;
        toast.commit();
      }
      undoToastStore.dismiss();
    }, toast.ms);

    return () => {
      clearTimeout(timerRef.current);
    };
  }, [toast]);

  // Commit on unmount if still active
  useEffect(() => {
    return () => {
      const state = undoToastStore.getState();
      if (state && !committedRef.current) {
        committedRef.current = true;
        state.commit();
        undoToastStore.dismiss();
      }
    };
  }, []);

  const handleUndo = useCallback(() => {
    if (toast && !committedRef.current) {
      committedRef.current = true;
      clearTimeout(timerRef.current);
      toast.undo();
      undoToastStore.dismiss();
    }
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      role="status"
      aria-live="polite"
      data-testid="undo-toast"
    >
      <div className="flex items-center gap-3 bg-navy text-white px-4 py-3 rounded-xl shadow-lg">
        <span className="text-sm">{toast.label}</span>
        <button
          onClick={handleUndo}
          className="text-brand-cyan text-sm font-medium hover:underline"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
