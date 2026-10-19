import { describe, it, expect } from 'vitest';
import { isOwner, canSetup, canGovern, nextOwner } from '@/lib/ownership';

describe('isOwner', () => {
  it('returns false for null', () => {
    expect(isOwner(null)).toBe(false);
  });

  it('returns false for non-owner', () => {
    expect(isOwner({ role: 'board_member', roleKey: 'president', isAccountOwner: false })).toBe(false);
  });

  it('returns true for owner', () => {
    expect(isOwner({ role: 'board_member', roleKey: 'president', isAccountOwner: true })).toBe(true);
  });
});

describe('canSetup', () => {
  it('returns false for null', () => {
    expect(canSetup(null)).toBe(false);
  });

  it('returns true for owner (even if resident)', () => {
    expect(canSetup({ role: 'resident', roleKey: null, isAccountOwner: true })).toBe(true);
  });

  it('returns true for board member', () => {
    expect(canSetup({ role: 'board_member', roleKey: 'treasurer', isAccountOwner: false })).toBe(true);
  });

  it('returns false for resident non-owner', () => {
    expect(canSetup({ role: 'resident', roleKey: null, isAccountOwner: false })).toBe(false);
  });
});

describe('canGovern', () => {
  it('returns false for resident owner', () => {
    expect(canGovern({ role: 'resident', roleKey: null, isAccountOwner: true })).toBe(false);
  });

  it('returns true for board member', () => {
    expect(canGovern({ role: 'board_member', roleKey: 'secretary', isAccountOwner: false })).toBe(true);
  });
});

describe('nextOwner', () => {
  const members = [
    { userId: 'a', role: 'board_member', roleKey: 'treasurer' as const, joinedAt: '2024-02-01', isAccountOwner: false },
    { userId: 'b', role: 'board_member', roleKey: 'president' as const, joinedAt: '2024-03-01', isAccountOwner: false },
    { userId: 'c', role: 'board_member', roleKey: 'secretary' as const, joinedAt: '2024-01-01', isAccountOwner: false },
    { userId: 'd', role: 'resident', roleKey: null, joinedAt: '2024-01-01', isAccountOwner: false },
  ];

  it('picks president first', () => {
    expect(nextOwner(members)).toBe('b');
  });

  it('picks treasurer if no president', () => {
    const noPresident = members.filter(m => m.roleKey !== 'president');
    expect(nextOwner(noPresident)).toBe('a');
  });

  it('picks earliest board member if no president or treasurer', () => {
    const noOfficers = members.filter(m => m.roleKey !== 'president' && m.roleKey !== 'treasurer');
    expect(nextOwner(noOfficers)).toBe('c');
  });

  it('returns null if no board members', () => {
    const residentsOnly = members.filter(m => m.role === 'resident');
    expect(nextOwner(residentsOnly)).toBeNull();
  });

  it('excludes current owner', () => {
    const withOwner = members.map(m => m.userId === 'b' ? { ...m, isAccountOwner: true } : m);
    expect(nextOwner(withOwner)).toBe('a'); // treasurer, since president is current owner
  });
});
