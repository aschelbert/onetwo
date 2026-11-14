import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadOpenAIPixel, readAdClickRef, setOpenAIPixelUser } from '@/lib/openaiPixel';

const SDK = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
type Queue = ((...a: unknown[]) => void) & { q: ArrayLike<unknown>[] };
const queued = () => (window.oaiq as unknown as Queue).q.map((a) => Array.from(a));
const sdkScripts = () => document.querySelectorAll(`script[src="${SDK}"]`);

describe('loadOpenAIPixel', () => {
  beforeEach(() => {
    delete window.oaiq;
    sdkScripts().forEach((s) => s.remove());
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
  });
  afterEach(() => {
    delete window.oaiq;
    sdkScripts().forEach((s) => s.remove());
  });

  it('does nothing until called', () => {
    expect(window.oaiq).toBeUndefined();
    expect(sdkScripts()).toHaveLength(0);
  });

  it('adds the SDK script, then queues init and one page view', () => {
    loadOpenAIPixel();
    expect(sdkScripts()).toHaveLength(1);
    expect(queued()).toEqual([
      ['init', { pixelId: 'EeUAjrxrWJtnf5M7tToTws' }],
      ['measure', 'page_viewed', { type: 'contents' }],
    ]);
  });

  it('queues consent=false before init when Global Privacy Control is on', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    loadOpenAIPixel();
    expect(queued()).toEqual([
      ['consent', false],
      ['init', { pixelId: 'EeUAjrxrWJtnf5M7tToTws' }],
      ['measure', 'page_viewed', { type: 'contents' }],
    ]);
  });

  it('loads only once when called repeatedly', () => {
    loadOpenAIPixel();
    loadOpenAIPixel();
    expect(sdkScripts()).toHaveLength(1);
    expect(queued()).toHaveLength(2);
  });

  it('queues the signup conversion made before the SDK arrives', () => {
    loadOpenAIPixel();
    window.oaiq?.('measure', 'trial_started', { type: 'plan_enrollment' }, { event_id: 'signup_x' });
    expect(queued()[2]).toEqual(['measure', 'trial_started', { type: 'plan_enrollment' }, { event_id: 'signup_x' }]);
  });
});

describe('readAdClickRef', () => {
  const setUrl = (search: string) => window.history.replaceState(null, '', `/login${search}`);
  const clearCookie = () => { document.cookie = '__oppref=; Max-Age=0; Path=/'; };
  afterEach(() => { setUrl(''); clearCookie(); });

  it('returns null when the visitor did not come from an ad', () => {
    expect(readAdClickRef()).toBeNull();
  });

  it('reads oppref from the landing URL', () => {
    setUrl('?oppref=click_abc-123');
    expect(readAdClickRef()).toBe('click_abc-123');
  });

  it("falls back to the pixel's __oppref cookie", () => {
    document.cookie = `__oppref=${encodeURIComponent('from cookie/1')}; Path=/`;
    expect(readAdClickRef()).toBe('from cookie/1');
  });

  it('ignores implausibly long values', () => {
    setUrl(`?oppref=${'x'.repeat(600)}`);
    expect(readAdClickRef()).toBeNull();
  });
});

describe('setOpenAIPixelUser', () => {
  afterEach(() => { delete window.oaiq; });

  it('does nothing when the pixel is not loaded', async () => {
    await expect(setOpenAIPixelUser({ email: 'a@b.co' })).resolves.toBeUndefined();
    expect(window.oaiq).toBeUndefined();
  });

  it('queues init with hashed email and user ID, never the raw values', async () => {
    const calls: unknown[][] = [];
    window.oaiq = (...args: unknown[]) => { calls.push(args); };
    await setOpenAIPixelUser({ email: '  Test@Example.com ', userId: 'user-123' });
    expect(calls).toEqual([[
      'init',
      {
        pixelId: 'EeUAjrxrWJtnf5M7tToTws',
        user: {
          email_sha256: '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
          external_id_sha256: 'fcdec6df4d44dbc637c7c5b58efface52a7f8a88535423430255be0bb89bedd8',
        },
      },
    ]]);
    expect(JSON.stringify(calls)).not.toContain('Example.com');
    expect(JSON.stringify(calls)).not.toContain('user-123');
  });
});
