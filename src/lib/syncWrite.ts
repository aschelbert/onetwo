import * as Sentry from '@sentry/react';
import { useSyncStatusStore } from '@/store/useSyncStatusStore';

/**
 * Wraps a Supabase write promise with error handling and optional rollback.
 * Every store mutation that syncs to the backend should use this.
 */
export async function syncWrite<T>(
  promise: Promise<T>,
  opts: { label: string; rollback?: () => void }
): Promise<T | null> {
  const sync = useSyncStatusStore.getState();
  sync.incrementPending();
  try {
    const result = await promise;
    sync.decrementPending();
    sync.markSynced();
    return result;
  } catch (err) {
    sync.decrementPending();
    const msg = err instanceof Error ? err.message : String(err);
    sync.markError(msg);
    console.error(`[syncWrite] ${opts.label} failed:`, err);
    Sentry.captureException(err, { tags: { syncWrite: opts.label } });
    opts.rollback?.();
    return null;
  }
}
