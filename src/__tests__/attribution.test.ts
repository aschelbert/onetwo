import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { captureAttribution, readAttribution } from '@/lib/attribution';
import { loadRedditPixel, trackBuildingCreated } from '@/lib/adConversions';

const setUrl = (path: string) => window.history.replaceState(null, '', path);
const clearCookie = () => { document.cookie = 'ot_attr=; Max-Age=0; Path=/'; };

describe('attribution', () => {
  beforeEach(() => { clearCookie(); setUrl('/'); });
  afterEach(() => { clearCookie(); setUrl('/'); });

  it('is empty before anything is captured', () => {
    expect(readAttribution()).toEqual({});
  });

  it('saves the UTM tags and the landing URL', () => {
    setUrl('/?utm_source=Google&utm_campaign=start-building&utm_medium=cpc');
    captureAttribution();
    expect(readAttribution()).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'start-building',
      first_landing_url: window.location.href,
    });
  });

  it('keeps the first touch when a later visit carries other tags', () => {
    setUrl('/?utm_source=reddit&utm_campaign=start-building');
    captureAttribution();
    const first = readAttribution();
    setUrl('/login?create=1&utm_source=nextdoor&utm_campaign=other');
    captureAttribution();
    expect(readAttribution()).toEqual(first);
  });

  it('fills in the ad when an untagged first visit is followed by an ad click', () => {
    captureAttribution();
    const landing = readAttribution().first_landing_url;
    setUrl('/?utm_source=nextdoor&utm_campaign=start-building');
    captureAttribution();
    expect(readAttribution()).toEqual({
      utm_source: 'nextdoor', utm_campaign: 'start-building', first_landing_url: landing,
    });
  });

  it('infers the source from an ad click ID when the UTM tag is missing', () => {
    setUrl('/?gclid=abc123');
    captureAttribution();
    expect(readAttribution().utm_source).toBe('google');
  });

  it('caps overlong values', () => {
    setUrl(`/?utm_source=google&utm_campaign=${'x'.repeat(300)}`);
    captureAttribution();
    expect(readAttribution().utm_campaign).toHaveLength(100);
  });
});

describe('ad conversions', () => {
  const SDK = 'https://www.redditstatic.com/ads/pixel.js';
  const scripts = () => document.querySelectorAll(`script[src="${SDK}"]`);
  const setGpc = (value: boolean | undefined) =>
    Object.defineProperty(navigator, 'globalPrivacyControl', { value, configurable: true });
  const reset = () => {
    delete window.rdt;
    delete window.dataLayer;
    scripts().forEach((s) => s.remove());
    setGpc(undefined);
  };
  beforeEach(reset);
  afterEach(reset);

  const rdtCalls = () =>
    (window.rdt as unknown as { callQueue: ArrayLike<unknown>[] }).callQueue.map((a) => Array.from(a));

  it('leaves the Reddit pixel off without a pixel ID', () => {
    loadRedditPixel('');
    expect(window.rdt).toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });

  it('loads the Reddit pixel once and records a page visit', () => {
    loadRedditPixel('a2_test');
    loadRedditPixel('a2_test');
    expect(scripts()).toHaveLength(1);
    expect(rdtCalls()).toEqual([['init', 'a2_test'], ['track', 'PageVisit']]);
  });

  it('reports a created building to Google and Reddit', () => {
    loadRedditPixel('a2_test');
    trackBuildingCreated({ eventId: 'signup_x', plan: 'self_managed', interval: 'monthly' });
    expect(window.dataLayer).toEqual([
      { event: 'building_created', transaction_id: 'signup_x', plan: 'self_managed', billing_interval: 'monthly' },
    ]);
    expect(rdtCalls()[2]).toEqual(['track', 'SignUp', { conversionId: 'signup_x' }]);
  });

  it('measures nothing for a visitor sending Global Privacy Control', () => {
    setGpc(true);
    loadRedditPixel('a2_test');
    trackBuildingCreated({ eventId: 'signup_x', plan: 'self_managed', interval: 'monthly' });
    expect(window.rdt).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
  });
});
