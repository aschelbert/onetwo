import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', features: {} }),
}));
vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    currentUser: { name: 'Sarah Park', email: 'sarah@example.com' },
    currentRole: 'BOARD_MEMBER',
    switchRole: () => {},
    isAdminPreview: false,
    signOut: () => {},
  }),
}));
vi.mock('@/store/usePlatformAdminStore', () => ({
  usePlatformAdminStore: (sel: (s: { permissions: unknown[] }) => unknown) => sel({ permissions: [] }),
}));
vi.mock('@/components/OnboardingSetupWidget', () => ({ default: () => null }));
vi.mock('@/components/shared/SyncIndicator', () => ({ default: () => null }));

import Ux2Shell from '@/ux2/shell/Ux2Shell';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Ux2Shell />}>
          <Route path="/dashboard" element={<div>dash</div>} />
          <Route path="/home" element={<div>dash</div>} />
          <Route path="/funds" element={<div>funds page</div>} />
          <Route path="/financial" element={<div>funds page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Ux2Shell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the shell with the five modules', () => {
    renderAt('/dashboard');
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    const labels = Array.from(nav.querySelectorAll('button')).map(b => b.textContent);
    expect(labels).toEqual(['Home', 'Building', 'Community', 'Funds', 'Board Room']);
    expect(screen.getByText('dash')).toBeTruthy();
  });

  it('the avatar menu lists the fixed items and keeps legacy extras reachable', () => {
    renderAt('/home');
    fireEvent.click(screen.getByRole('button', { name: 'Me' }));
    const items = screen.getAllByRole('menuitem').map(m => m.textContent);
    expect(items.slice(0, 5)).toEqual(['My Account', 'My Unit', 'User Management', 'Subscription', 'Help & Support']);
    expect(items.join(' ')).toContain('Association Team');
    expect(items.join(' ')).toContain('The Archives');
    expect(items[items.length - 1]).toContain('Sign out');
  });
});
