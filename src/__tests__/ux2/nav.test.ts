import { describe, expect, it } from 'vitest';
import { navigation } from '@/lib/rolePermissions';
import { activeModule, legacyExtras, meMenu, modulesForRole, phoneTabs, UX2_MODULES } from '@/ux2/shell/nav';

describe('ux2 navigation', () => {
  it('orders the modules Home, Building, Community, Funds, Board Room', () => {
    expect(UX2_MODULES.map(m => m.label)).toEqual(['Home', 'Building', 'Community', 'Funds', 'Board Room']);
  });

  it('board members see all five modules', () => {
    const mods = modulesForRole('BOARD_MEMBER', navigation.BOARD_MEMBER);
    expect(mods.map(m => m.id)).toEqual(['home', 'building', 'community', 'funds', 'boardroom']);
  });

  it('residents keep Funds and Community and never get Board Room', () => {
    const mods = modulesForRole('RESIDENT', navigation.RESIDENT);
    expect(mods.map(m => m.id)).toEqual(['home', 'building', 'community', 'funds']);
  });

  it('staff see only what their legacy nav allowed', () => {
    const mods = modulesForRole('STAFF', navigation.STAFF);
    expect(mods.map(m => m.id)).toEqual(['home', 'building']);
  });

  it('every legacy destination stays reachable: absorbed by a module or kept as an extra', () => {
    for (const role of ['BOARD_MEMBER', 'RESIDENT', 'STAFF', 'PROPERTY_MANAGER'] as const) {
      const legacy = navigation[role].filter(i => !i.separator);
      const mods = modulesForRole(role, legacy);
      const absorbed = new Set(mods.flatMap(m => m.legacyIds));
      const extras = new Set(legacyExtras(legacy).map(i => i.id));
      for (const item of legacy) {
        expect(absorbed.has(item.id) || extras.has(item.id) || item.id === 'community').toBe(true);
      }
    }
  });

  it('Association Team and The Archives stay in the avatar menu until their phases land', () => {
    const extras = legacyExtras(navigation.BOARD_MEMBER).map(i => i.id);
    expect(extras).toEqual(['association-team', 'archives']);
  });

  it('old and new paths both light the right module', () => {
    const mods = modulesForRole('BOARD_MEMBER', navigation.BOARD_MEMBER);
    expect(activeModule('/dashboard', mods)).toBe('home');
    expect(activeModule('/home', mods)).toBe('home');
    expect(activeModule('/financial', mods)).toBe('funds');
    expect(activeModule('/funds', mods)).toBe('funds');
    expect(activeModule('/issues', mods)).toBe('boardroom');
    expect(activeModule('/archives', mods)).toBe('building');
    expect(activeModule('/account', mods)).toBeNull();
  });

  it('phone tabs: five for the board, four for residents with Pay instead of Funds', () => {
    const board = phoneTabs('BOARD_MEMBER', modulesForRole('BOARD_MEMBER', navigation.BOARD_MEMBER));
    expect(board.map(t => t.label)).toEqual(['Home', 'Building', 'Community', 'Funds', 'Board Room']);
    const owner = phoneTabs('RESIDENT', modulesForRole('RESIDENT', navigation.RESIDENT));
    expect(owner.map(t => t.label)).toEqual(['Home', 'Building', 'Community', 'Pay']);
    expect(owner.find(t => t.id === 'pay')?.path).toBe('/my-unit');
  });

  it('the avatar menu follows the fixed order and role rules', () => {
    expect(meMenu('BOARD_MEMBER', false).map(i => i.label)).toEqual(['My Account', 'My Unit', 'User Management', 'Subscription', 'Help & Support']);
    expect(meMenu('BOARD_MEMBER', true).map(i => i.label)).not.toContain('Subscription');
    expect(meMenu('RESIDENT', false).map(i => i.label)).toEqual(['My Account', 'My Unit', 'Help & Support']);
  });
});
