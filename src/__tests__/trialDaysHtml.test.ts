import { describe, expect, it } from 'vitest';
import { applyTrialDays } from '@/lib/trialDaysHtml';
import indexHtml from '../../index.html?raw';
import llmsTxt from '../../public/llms.txt?raw';
import guidesIndex from '../../public/guides/index.html?raw';
import guideReserve from '../../public/guides/dc-condo-reserve-study.html?raw';
import guideCost from '../../public/guides/dc-condo-management-cost.html?raw';
import guideLeaving from '../../public/guides/leaving-your-property-manager-dc.html?raw';

describe('applyTrialDays', () => {
  it('rewrites marked spans and the plain-text phrase', () => {
    const html = '<a>Start your free <span data-trial-days>21</span> day trial</a><meta content="x. 21 day free trial.">';
    expect(applyTrialDays(html, 30)).toBe('<a>Start your free <span data-trial-days>30</span> day trial</a><meta content="x. 30 day free trial.">');
  });

  it('leaves other numbers alone', () => {
    const html = 'Notice goes out 21 days before the meeting. $179 a month.';
    expect(applyTrialDays(html, 30)).toBe(html);
  });

  it('keeps the fallback when there is no trial or the value is not a whole number', () => {
    const html = '<span data-trial-days>21</span>';
    expect(applyTrialDays(html, 0)).toBe(html);
    expect(applyTrialDays(html, 14.5)).toBe(html);
  });
});

describe('marketing pages', () => {
  // Every statement of the trial length must be one the build and the browser can update.
  const pages: [string, string][] = [
    ['index.html', indexHtml],
    ['llms.txt', llmsTxt],
    ['guides/index.html', guidesIndex],
    ['guides/dc-condo-reserve-study.html', guideReserve],
    ['guides/dc-condo-management-cost.html', guideCost],
    ['guides/leaving-your-property-manager-dc.html', guideLeaving],
  ];

  it.each(pages)('%s states the trial length only in updatable places', (_name, text) => {
    const updated = applyTrialDays(text, 987);
    const stripped = updated.replace(/<span data-trial-days>987<\/span>/g, '').replace(/987 day free trial/g, '');
    expect(stripped).not.toMatch(/\b\d+[ -]days?\b[^.<]{0,20}\btrial\b|\bfree (for )?\d+[ -]days?\b/i);
    expect(updated).toContain('987');
  });

  it.each(pages.filter(([name]) => name.endsWith('.html')))('%s loads the live trial length', (_name, text) => {
    expect(text).toContain('<script src="/site-config.js"></script>');
    expect(text).toContain('<script src="/trial-days.js"></script>');
  });
});
