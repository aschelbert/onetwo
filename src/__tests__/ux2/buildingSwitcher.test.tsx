import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const switchBuilding = vi.fn(async () => {});
const building = (id: string, name: string, title: string) => ({
  tenant_id: id, role: 'board_member', board_title: title, unit: null, created_at: null,
  tenant: { name, subdomain: id, address: null },
});
let buildings = [building('harbor', 'Harbor View', 'President'), building('sunny', 'Sunny Acres', 'Treasurer')];

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ id: 'harbor', name: 'Harbor View', isDemo: false, status: 'active', features: {}, buildings, switchBuilding }),
}));
vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    currentUser: { name: 'Dana Reyes', email: 'dana@example.com' },
    currentRole: 'BOARD_MEMBER', switchRole: () => {}, isAdminPreview: false, signOut: () => {},
  }),
}));
vi.mock('@/store/usePlatformAdminStore', () => ({
  usePlatformAdminStore: (sel: (s: { permissions: unknown[] }) => unknown) => sel({ permissions: [] }),
}));
vi.mock('@/components/shared/SyncIndicator', () => ({ default: () => null }));

import Ux2TopNav from '@/ux2/shell/Ux2TopNav';

const renderNav = () => render(<MemoryRouter initialEntries={['/home']}><Ux2TopNav /></MemoryRouter>);

describe('building switcher', () => {
  beforeEach(() => {
    cleanup();
    switchBuilding.mockClear();
    buildings = [building('harbor', 'Harbor View', 'President'), building('sunny', 'Sunny Acres', 'Treasurer')];
  });

  it('lists the account’s buildings and marks the current one', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: /Switch building/ }));
    const menu = screen.getByRole('menu', { name: 'Your buildings' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map(i => i.textContent)).toEqual(['Harbor ViewPresident', 'Sunny AcresTreasurer']);
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[1].getAttribute('aria-checked')).toBe('false');
    expect(within(menu).getByRole('menuitem', { name: /Set up another building/ }).getAttribute('href')).toBe('/login?create=1&add=1');
  });

  it('switches when another building is picked, and not when the current one is', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: /Switch building/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Harbor View/ }));
    expect(switchBuilding).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Switch building/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sunny Acres/ }));
    expect(switchBuilding).toHaveBeenCalledWith('sunny');
  });

  it('shows no switcher to an account with one building', () => {
    buildings = [building('harbor', 'Harbor View', 'President')];
    renderNav();
    expect(screen.queryByRole('button', { name: /Switch building/ })).toBeNull();
    expect(screen.getByText('Harbor View · Board Member')).toBeTruthy();
  });
});
