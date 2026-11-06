import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { searchHelp } from '@/ux2/me/help';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', tier: 'self_managed', features: {}, id: 't1', subdomain: 'sunny' }),
}));
vi.mock('@/features/account/AccountSettingsPage', () => ({ default: ({ embedded }: { embedded?: boolean }) => <div data-testid="legacy-account" data-embedded={embedded ? '1' : '0'} /> }));
vi.mock('@/features/unit-manager/MyUnitPage', () => ({ default: ({ embedded }: { embedded?: boolean }) => <div data-testid="legacy-unit" data-embedded={embedded ? '1' : '0'} /> }));
vi.mock('@/features/user-management/UserManagementPage', () => ({ default: ({ embedded }: { embedded?: boolean }) => <div data-testid="legacy-users" data-embedded={embedded ? '1' : '0'} /> }));
vi.mock('@/features/subscription/SubscriptionPage', () => ({ default: ({ embedded }: { embedded?: boolean }) => <div data-testid="legacy-subscription" data-embedded={embedded ? '1' : '0'} /> }));
vi.mock('@/features/support/SupportPage', () => ({ default: () => <div data-testid="legacy-support" /> }));
vi.mock('@/features/support/HowItWorksPage', () => ({
  default: () => <div data-testid="legacy-guides" />,
  GUIDES: [{ id: 'g1', title: 'Fiscal Lens', summary: 'Ledger, budget and reserves', route: '/financial', howTos: [{ title: 'Record a payment', steps: ['Open the unit', 'Record payment'] }] }],
}));

import MeModule from '@/ux2/me/MeModule';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account" element={<MeModule tab="account" />} />
        <Route path="/my-unit" element={<MeModule tab="unit" />} />
        <Route path="/admin/users" element={<MeModule tab="users" />} />
        <Route path="/subscription" element={<MeModule tab="subscription" />} />
        <Route path="/support" element={<MeModule tab="help" />} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Me', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('My Account shows the stewardship radar, the receipts, the dimensions and the embedded profile', () => {
    renderAt('/account');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My Account');
    const nav = screen.getByRole('navigation', { name: 'Me sections' });
    const labels = within(nav).getAllByRole('button').map(b => (b.textContent ?? '').replace(/(Admin|Self-Managed|Plus Facilities|\d+[A-Z]?)$/, '').trim());
    expect(labels).toEqual(['My Account', 'My Unit', 'User Management', 'Subscription', 'Help & Support']);
    expect(document.querySelector('[data-widget="stewardship-radar"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="By dimension"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Board leaderboard"]')).toBeTruthy();
    expect(screen.getByTestId('legacy-account').getAttribute('data-embedded')).toBe('1');
  });

  it('My Unit shows the balance, the resale packet, receipts and the embedded unit tabs', () => {
    renderAt('/my-unit');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^My Unit/);
    expect(document.querySelector('[aria-label="Resale ready"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Statements and receipts"]')).toBeTruthy();
    expect(screen.getByTestId('legacy-unit').getAttribute('data-embedded')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(screen.getByTestId('elsewhere')).toBeTruthy();
  });

  it('User Management and Subscription mount the production pages for a board member only', () => {
    renderAt('/admin/users');
    expect(screen.getByTestId('legacy-users').getAttribute('data-embedded')).toBe('1');
    expect(screen.getByText('People with access')).toBeTruthy();
    renderAt('/subscription');
    expect(screen.getByTestId('legacy-subscription').getAttribute('data-embedded')).toBe('1');
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      renderAt('/subscription');
      // A resident gets no Subscription tab; every mounted tree re-renders with the new role.
      expect(screen.queryByTestId('legacy-subscription')).toBeNull();
      const navs = screen.getAllByRole('navigation', { name: 'Me sections' });
      const last = navs[navs.length - 1];
      expect(within(last).queryByRole('button', { name: /User Management/ })).toBeNull();
    } finally {
      useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    }
  });

  it('Help searches guides, runbooks, obligations and fees and mounts support and the guides', () => {
    renderAt('/support');
    expect(screen.getByTestId('legacy-support')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search help'), { target: { value: 'insurance' } });
    expect(screen.getAllByText('runbook').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /^Guides/ }));
    expect(screen.getByTestId('legacy-guides')).toBeTruthy();
  });
});

describe('help search', () => {
  const src = {
    guides: [{ id: 'g1', title: 'Fiscal Lens', summary: 'Ledger, budget and reserves', route: '/financial', howTos: [{ title: 'Record a check payment', steps: ['Open the unit', 'Record payment'] }] }],
    obligations: [{ id: 'o1', task: 'Renew D&O insurance', due: '2026-12-04', role: 'Treasurer', legalRef: 'DC Code § 42-1903.10' }],
    fees: [{ id: 'f1', name: 'Late fee', amount: 25, amountType: 'flat', frequency: 'per-occurrence', description: 'After 15 days' }],
    routes: { obligations: '/building?tab=obligations', runbooks: '/boardroom?tab=runbooks', fees: '/funds?tab=settings&section=fees' },
  };
  it('ranks title matches first and links each hit to its page', () => {
    const hits = searchHelp('late fee', src);
    expect(hits[0]).toMatchObject({ kind: 'fee', title: 'Late fee', path: '/funds?tab=settings&section=fees' });
    const ins = searchHelp('insurance', src);
    expect(ins.map(h => h.kind)).toContain('obligation');
    expect(ins.map(h => h.kind)).toContain('runbook');
    expect(searchHelp('check payment', src)[0]).toMatchObject({ kind: 'guide', title: 'Record a check payment', path: '/financial' });
    expect(searchHelp('', src)).toEqual([]);
    expect(searchHelp('zzzz', src)).toEqual([]);
  });
});
