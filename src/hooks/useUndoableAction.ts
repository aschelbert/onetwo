import { useCallback } from 'react';
import { undoToastStore } from '@/components/ui/UndoToast';

interface UndoableActionOptions {
  label: string;
  undo: () => void;
  commit: () => void;
  ms?: number;
}

export function useUndoableAction() {
  const run = useCallback((options: UndoableActionOptions) => {
    undoToastStore.show({
      label: options.label,
      undo: options.undo,
      commit: options.commit,
      ms: options.ms ?? 10000,
    });
  }, []);

  return { run };
}

export type { UndoableActionOptions };
