import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadOpenAIPixel } from '@/lib/openaiPixel';

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
