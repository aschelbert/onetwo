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

  it('adds the SDK script and queues init with the pixel id', () => {
    loadOpenAIPixel();
    expect(sdkScripts()).toHaveLength(1);
    expect(queued()).toEqual([['init', { pixelId: 'EeUAjrxrWJtnf5M7tToTws' }]]);
  });

  it('queues consent=false before init when Global Privacy Control is on', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    loadOpenAIPixel();
    expect(queued()).toEqual([
      ['consent', false],
      ['init', { pixelId: 'EeUAjrxrWJtnf5M7tToTws' }],
    ]);
  });

  it('loads only once when called repeatedly', () => {
    loadOpenAIPixel();
    loadOpenAIPixel();
    expect(sdkScripts()).toHaveLength(1);
    expect(queued()).toHaveLength(1);
  });

  it('queues measure calls made before the SDK arrives', () => {
    loadOpenAIPixel();
    window.oaiq?.('measure', 'page_viewed', { type: 'contents' }, { event_id: 'signup_x' });
    expect(queued()[1]).toEqual(['measure', 'page_viewed', { type: 'contents' }, { event_id: 'signup_x' }]);
  });
});
