import { beforeEach, describe, expect, it } from 'vitest';
import {
  UX2_STORAGE_KEY,
  _resetUx2ForTests,
  applyUrlOverride,
  clearUx2Flags,
  getUx2Flags,
  isUx2,
  parseFlags,
  setUx2Flags,
} from '@/ux2/flags';

describe('ux2 flags', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetUx2ForTests();
  });

  it('defaults to off', () => {
    expect(getUx2Flags().size).toBe(0);
    expect(isUx2('shell')).toBe(false);
    expect(isUx2('funds')).toBe(false);
  });

  it('parses lists, all and none, ignoring unknown names', () => {
    expect(Array.from(parseFlags('shell, funds'))).toEqual(['shell', 'funds']);
    expect(parseFlags('all').size).toBe(7);
    expect(parseFlags('all,none').size).toBe(0);
    expect(parseFlags('bogus').size).toBe(0);
    expect(parseFlags(null).size).toBe(0);
  });

  it('reads the stored value', () => {
    localStorage.setItem(UX2_STORAGE_KEY, 'funds');
    _resetUx2ForTests();
    expect(isUx2('funds')).toBe(true);
    expect(isUx2('building')).toBe(false);
  });

  it('any module flag implies the shell', () => {
    setUx2Flags('funds');
    expect(isUx2('shell')).toBe(true);
    expect(getUx2Flags().has('shell')).toBe(false);
  });

  it('a ?ux2= query persists to storage and ?ux2=none clears', () => {
    expect(applyUrlOverride('?ux2=shell,building')).toBe(true);
    expect(localStorage.getItem(UX2_STORAGE_KEY)).toBe('shell,building');
    expect(isUx2('building')).toBe(true);
    expect(applyUrlOverride('?other=1')).toBe(false);
    expect(applyUrlOverride('?ux2=none')).toBe(true);
    expect(isUx2('shell')).toBe(false);
  });

  it('clearUx2Flags removes the override', () => {
    setUx2Flags('all');
    expect(isUx2('me')).toBe(true);
    clearUx2Flags();
    expect(localStorage.getItem(UX2_STORAGE_KEY)).toBeNull();
    expect(isUx2('me')).toBe(false);
  });
});
