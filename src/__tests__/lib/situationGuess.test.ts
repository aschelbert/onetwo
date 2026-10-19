import { describe, it, expect } from 'vitest';
import { situationGuess } from '@/features/issues/situationGuess';

describe('situationGuess', () => {
  it('ranks "elevator bids came in" with Major Capital Projects first', () => {
    const results = situationGuess('elevator bids came in');
    const top = results[0];
    expect(top.sitTitle).toBe('Major Capital Projects');
  });

  it('ranks "unauthorized balcony construction" with Covenant Violations first', () => {
    const results = situationGuess('unauthorized balcony construction');
    const top = results[0];
    expect(top.sitTitle).toBe('Covenant Violations');
  });

  it('ranks "roof leak plumbing HVAC" with Common Area Repairs first', () => {
    const results = situationGuess('roof leak plumbing HVAC');
    const top = results[0];
    expect(top.sitTitle).toBe('Common Area Repairs');
  });

  it('returns all situations for empty input', () => {
    const results = situationGuess('');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.score === 0)).toBe(true);
  });

  it('returns all situations for whitespace-only input', () => {
    const results = situationGuess('   ');
    expect(results.every(r => r.score === 0)).toBe(true);
  });

  it('scores higher matches first', () => {
    const results = situationGuess('annual budgeting assessment reserve');
    // The top result should have the highest score
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });
});
