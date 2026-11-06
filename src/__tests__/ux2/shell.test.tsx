import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { _resetUx2ForTests, setUx2Flags } from '@/ux2/flags';

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
vi.mock('@/components/layout/AppShell', () => ({ default: () => <div data-testid="legacy-shell">legacy</div> }));
vi.mock('@/components/shared/SyncIndicator', () => ({ default: () => null }));

import ShellSwitch from '@/ux2/shell/ShellSwitch';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ShellSwitch />}>
          <Route path="/dashboard" element={<div>dash</div>} />
          <Route path="/home" element={<div>dash</div>} />
          <Route path="/funds" element={<div>funds page</div>} />
          <Route path="/financial" element={<div>funds page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ShellSwitch', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetUx2ForTests();
  });

  it('renders the production shell when the flag is off', () => {
    renderAt('/dashboard');
    expect(screen.getByTestId('legacy-shell')).toBeTruthy();
  });

  it('renders the redesign shell with the five modules when ux2.shell is on', () => {
    setUx2Flags('shell');
    renderAt('/dashboard');
    const nav = screen.getAllByRole('navigation', { name: 'Primary' })[0];
    const labels = Array.from(nav.querySelectorAll('button')).map(b => b.textContent);
    expect(labels).toEqual(['Home', 'Building', 'Community', 'Funds', 'Board Room']);
    expect(screen.getByText('dash')).toBeTruthy();
  });

  it('a ?ux2= query turns the shell on for this browser', () => {
    renderAt('/financial?ux2=shell');
    expect(screen.queryByTestId('legacy-shell')).toBeNull();
    expect(screen.getByText('funds page')).toBeTruthy();
  });

  it('the avatar menu lists the fixed items and keeps legacy extras reachable', () => {
    setUx2Flags('shell');
    renderAt('/home');
    fireEvent.click(screen.getByRole('button', { name: 'Me' }));
    const items = screen.getAllByRole('menuitem').map(m => m.textContent);
    expect(items.slice(0, 5)).toEqual(['My Account', 'My Unit', 'User Management', 'Subscription', 'Help & Support']);
    expect(items.join(' ')).toContain('Association Team');
    expect(items.join(' ')).toContain('The Archives');
    expect(items[items.length - 1]).toContain('Sign out');
  });
});
