import { describe, it, expect, afterEach, vi } from 'vitest';

// The suite's setup replaces this module; these tests are about the real one.
vi.unmock('@/lib/supabase');
const { TENANT_HEADER, setActiveTenantId, withTenantHeader } =
  await vi.importActual<typeof import('@/lib/supabase')>('@/lib/supabase');

const REST = 'https://x.supabase.co/rest/v1/units?select=*';

describe('withTenantHeader', () => {
  afterEach(() => setActiveTenantId(null));

  it('leaves requests alone until a building is active', () => {
    const init = { headers: { apikey: 'k' } };
    expect(withTenantHeader(REST, init)).toBe(init);
  });

  it('tags database requests with the active building, keeping other headers', () => {
    setActiveTenantId('tenant-a');
    const headers = new Headers(withTenantHeader(REST, { headers: { apikey: 'k' } })?.headers);
    expect(headers.get(TENANT_HEADER)).toBe('tenant-a');
    expect(headers.get('apikey')).toBe('k');
  });

  it('follows a switch to another building', () => {
    setActiveTenantId('tenant-a');
    setActiveTenantId('tenant-b');
    expect(new Headers(withTenantHeader(new URL(REST))?.headers).get(TENANT_HEADER)).toBe('tenant-b');
  });

  it('does not tag edge functions, auth or storage (their CORS would reject it)', () => {
    setActiveTenantId('tenant-a');
    for (const url of [
      'https://x.supabase.co/functions/v1/chargebee-checkout',
      'https://x.supabase.co/auth/v1/token',
      'https://x.supabase.co/storage/v1/object/docs/a.pdf',
    ]) {
      const out = withTenantHeader(url, { headers: { apikey: 'k' } });
      expect(new Headers(out?.headers).has(TENANT_HEADER)).toBe(false);
    }
  });
});
