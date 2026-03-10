import { describe, it, expect } from 'vitest';
import { fmt, getOrdinalSuffix, getInitials, cn } from '@/lib/formatters';

describe('fmt', () => {
  it('formats 1000 as $1,000', () => {
    expect(fmt(1000)).toBe('$1,000');
  });

  it('formats 0 as $0', () => {
    expect(fmt(0)).toBe('$0');
  });
});

describe('getOrdinalSuffix', () => {
  it('1 → "st"', () => expect(getOrdinalSuffix(1)).toBe('st'));
  it('2 → "nd"', () => expect(getOrdinalSuffix(2)).toBe('nd'));
  it('3 → "rd"', () => expect(getOrdinalSuffix(3)).toBe('rd'));
  it('11 → "th" (special teen)', () => expect(getOrdinalSuffix(11)).toBe('th'));
  it('12 → "th" (special teen)', () => expect(getOrdinalSuffix(12)).toBe('th'));
  it('13 → "th" (special teen)', () => expect(getOrdinalSuffix(13)).toBe('th'));
  it('21 → "st"', () => expect(getOrdinalSuffix(21)).toBe('st'));
  it('22 → "nd"', () => expect(getOrdinalSuffix(22)).toBe('nd'));
});

describe('getInitials', () => {
  it('"John Smith" → "JS"', () => {
    expect(getInitials('John Smith')).toBe('JS');
  });

  it('single name → single initial', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('three names → first two initials', () => {
    expect(getInitials('John Q Smith')).toBe('JQ');
  });
});

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, 'b')).toBe('a b');
  });

  it('filters out null and undefined', () => {
    expect(cn('x', null, undefined, 'y')).toBe('x y');
  });
});
