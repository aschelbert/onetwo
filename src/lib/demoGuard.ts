// src/lib/demoGuard.ts
// Detects whether the current browser session is a demo (seed-data) session.
// Reads directly from localStorage to avoid circular imports with Zustand stores.

import { getActiveTenantId } from '@/lib/supabase';

export function isDemoSession(): boolean {
  // If a real tenant has been resolved, this is not a demo session
  if (getActiveTenantId()) return false;

  try {
    const raw = localStorage.getItem('onetwo-auth');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const userId: string | undefined = parsed?.state?.currentUser?.id;
    if (!userId) return false;
    return userId === 'user1' || userId.startsWith('user-');
  } catch {
    return false;
  }
}
