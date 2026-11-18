import { describe, it, expect } from 'vitest';
import { hasSessionHandoff } from '@/lib/tenantHost';

describe('hasSessionHandoff', () => {
  it('is true only when both tokens are in the URL', () => {
    expect(hasSessionHandoff('?sb_access=a&sb_refresh=b')).toBe(true);
    expect(hasSessionHandoff('?sb_access=a')).toBe(false);
    expect(hasSessionHandoff('?sb_refresh=b')).toBe(false);
    expect(hasSessionHandoff('?create=1')).toBe(false);
    expect(hasSessionHandoff('')).toBe(false);
  });
});
