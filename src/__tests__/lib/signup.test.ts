import { describe, it, expect } from 'vitest';
import { recommendPlan, dueToday, afterTrialText, trialEndDate } from '@/lib/signup';

describe('recommendPlan', () => {
  it('returns self_managed when no amenities selected', () => {
    expect(recommendPlan([])).toBe('self_managed');
  });

  it('returns self_managed for gym-only', () => {
    expect(recommendPlan(['gym'])).toBe('self_managed');
  });

  it('returns facilities when elevator selected', () => {
    expect(recommendPlan(['elevator'])).toBe('facilities');
  });

  it('returns facilities when pool selected', () => {
    expect(recommendPlan(['pool'])).toBe('facilities');
  });

  it('returns facilities when sport_court selected', () => {
    expect(recommendPlan(['sport_court'])).toBe('facilities');
  });

  it('returns facilities for mixed amenities including elevator', () => {
    expect(recommendPlan(['gym', 'elevator', 'roof_deck'])).toBe('facilities');
  });
});

describe('dueToday', () => {
  it('returns 0 when no setup', () => {
    expect(dueToday('self_managed', 'monthly', false)).toBe(0);
  });

  it('returns setup price for self_managed', () => {
    expect(dueToday('self_managed', 'monthly', true)).toBe(299);
  });

  it('returns setup price for facilities', () => {
    expect(dueToday('facilities', 'annual', true)).toBe(599);
  });
});

describe('afterTrialText', () => {
  it('shows monthly price after trial', () => {
    const text = afterTrialText('self_managed', 'monthly', false, false, 21);
    expect(text).toBe('After your 21-day trial: $179/mo');
  });

  it('shows annual price after trial', () => {
    const text = afterTrialText('self_managed', 'annual', false, false, 21);
    expect(text).toBe('After your 21-day trial: $1790/yr');
  });

  it('includes on call in total', () => {
    const text = afterTrialText('self_managed', 'monthly', true, false, 21);
    expect(text).toBe('After your 21-day trial: $428/mo');
  });

  it('includes PM seat in total', () => {
    const text = afterTrialText('self_managed', 'monthly', false, true, 21);
    expect(text).toBe('After your 21-day trial: $258/mo');
  });

  it('includes all add-ons in total for facilities', () => {
    const text = afterTrialText('facilities', 'monthly', true, true, 21);
    expect(text).toBe('After your 21-day trial: $857/mo');
  });
});

describe('trialEndDate', () => {
  it('returns a date N days from now', () => {
    const end = trialEndDate(21);
    const now = new Date();
    const diff = Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff).toBe(21);
  });

  it('works with custom trial days', () => {
    const end = trialEndDate(7);
    const now = new Date();
    const diff = Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff).toBe(7);
  });
});
