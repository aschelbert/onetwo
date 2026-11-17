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

  it('keeps the fallback when the value is not a whole number of days', () => {
    const html = '<span data-trial-days>21</span>';
    expect(applyTrialDays(html, 14.5)).toBe(html);
    expect(applyTrialDays(html, -1)).toBe(html);
  });

  it('with the trial off, swaps in the no-trial wording and drops the offer', () => {
    const html = [
      '<a class="btn" data-cta="hero" data-no-trial="Start today!">Start your free <span data-trial-days>21</span> day trial</a>',
      '<p>$179 a month<span data-no-trial=""> after the trial</span>, everything included.</p>',
      '<meta name="description" content="Proves it to the owners. 21 day free trial.">',
      '"text": "Two months free. Every plan starts with a 21 day free trial. Postage at cost."',
      'Plans start at $179 a month after a 21 day free trial.',
    ].join('\n');
    expect(applyTrialDays(html, 0)).toBe([
      '<a class="btn" data-cta="hero" data-no-trial="Start today!">Start today!</a>',
      '<p>$179 a month<span data-no-trial=""></span>, everything included.</p>',
      '<meta name="description" content="Proves it to the owners.">',
      '"text": "Two months free. Postage at cost."',
      'Plans start at $179 a month.',
    ].join('\n'));
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

  // With the trial off, nothing a visitor or a crawler reads may still offer one.
  it.each(pages)('%s offers no trial once the trial is turned off', (_name, text) => {
    const off = applyTrialDays(text, 0);
    const readable = off
      .replace(/<script(?! type="application\/ld\+json")[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\sdata-[\w-]+="[^"]*"/g, '')
      .replace(/<[^>]+>/g, m => (/\scontent="/.test(m) ? m : ' '));
    expect(readable).not.toMatch(/trial/i);
    // No sentence may be left cut off where the offer was removed.
    expect(readable).not.toMatch(/\b(after|with) a\s*[."<\n]|\bfor\s+days\b/i);
    if (text.includes('data-no-trial="Start today!"')) expect(off).toContain('>Start today!</a>');
  });
});

