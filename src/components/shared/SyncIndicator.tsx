import { useSyncStatusStore } from '@/store/useSyncStatusStore';

export default function SyncIndicator() {
  const { pendingWrites, lastSyncedAt, lastError } = useSyncStatusStore();

  if (lastError) {
    return (
      <div className="flex items-center gap-1.5" title={`Sync error: ${lastError}`}>
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="hidden sm:inline text-xs text-red-300">Sync error</span>
      </div>
    );
  }

  if (pendingWrites > 0) {
    return (
      <div className="flex items-center gap-1.5" title="Saving...">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="hidden sm:inline text-xs text-yellow-300">Saving...</span>
      </div>
    );
  }

  if (lastSyncedAt) {
    return (
      <div className="flex items-center gap-1.5" title={`Last saved ${new Date(lastSyncedAt).toLocaleTimeString()}`}>
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="hidden sm:inline text-xs text-emerald-300">Saved</span>
      </div>
    );
  }

  return null;
}
