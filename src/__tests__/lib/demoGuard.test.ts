import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isDemoSession } from '@/lib/demoGuard';

// getActiveTenantId is already mocked globally (returns null) via setup.ts

describe('isDemoSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false when no auth data in localStorage', () => {
    expect(isDemoSession()).toBe(false);
  });

  it('returns true for default demo user (user1)', () => {
    localStorage.setItem('onetwo-auth', JSON.stringify({
      state: { currentUser: { id: 'user1' } },
    }));
    expect(isDemoSession()).toBe(true);
  });

  it('returns true for generated demo user ids (user-*)', () => {
    localStorage.setItem('onetwo-auth', JSON.stringify({
      state: { currentUser: { id: 'user-1729000000000' } },
    }));
    expect(isDemoSession()).toBe(true);
  });

  it('returns false for a real Supabase user id (uuid)', () => {
    localStorage.setItem('onetwo-auth', JSON.stringify({
      state: { currentUser: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } },
    }));
    expect(isDemoSession()).toBe(false);
  });

  it('returns false when activeTenantId is set', async () => {
    // Re-mock supabase to return a real tenant id
    const mod = await import('@/lib/supabase');
    const spy = vi.spyOn(mod, 'getActiveTenantId').mockReturnValue('tenant-123');

    localStorage.setItem('onetwo-auth', JSON.stringify({
      state: { currentUser: { id: 'user1' } },
    }));
    expect(isDemoSession()).toBe(false);

    spy.mockRestore();
  });

  it('handles malformed JSON gracefully', () => {
    localStorage.setItem('onetwo-auth', '{bad json');
    expect(isDemoSession()).toBe(false);
  });
});
