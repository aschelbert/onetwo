import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { searchHelp } from '@/ux2/me/help';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', tier: 'self_managed', features: {}, id: 't1', subdomain: 'sunny' }),
}));
vi.mock('@/lib/adminSupabase', () => ({ adminSupabase: null }));
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

  it('My Account shows the stewardship radar, the dimensions, the leaderboard and the profile', () => {
    renderAt('/account');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My Account');
    const nav = screen.getByRole('navigation', { name: 'Me sections' });
    const labels = within(nav).getAllByRole('button').map(b => (b.textContent ?? '').replace(/(Admin|Self-Managed|Plus Facilities|\d+[A-Z]?)$/, '').trim());
    expect(labels).toEqual(['My Account', 'My Unit', 'User Management', 'Subscription', 'Help & Support']);
    expect(document.querySelector('[data-widget="stewardship-radar"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="By dimension"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Board leaderboard"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Profile"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Notifications"]')).toBeTruthy();
    expect(screen.queryByTestId('legacy-account')).toBeNull();
  });

  it('My Unit shows the balance, the resale packet, the unit card and receipts', () => {
    renderAt('/my-unit');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^My Unit/);
    expect(screen.getAllByText('Resale ready').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Autopay').length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-label="Statements and receipts"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Dues and fees this year"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Owner responsibilities"]')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Pay' })[0]);
    expect(screen.getByTestId('elsewhere')).toBeTruthy();
  });

  it('User Management lists members, sends an invite through the store, and shows the permissions matrix', () => {
    renderAt('/admin/users');
    expect(screen.getByText('People with access')).toBeTruthy();
    expect(document.querySelectorAll('[data-member]').length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-label="Permissions"]')).toBeTruthy();
    const before = useAuthStore.getState().buildingInvites.length;
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new.owner@example.com' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Board member' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    const invites = useAuthStore.getState().buildingInvites;
    expect(invites.length).toBe(before + 1);
    expect(invites[invites.length - 1]).toMatchObject({ email: 'new.owner@example.com', role: 'BOARD_MEMBER', status: 'pending' });
  });

  it('Subscription shows the plan, add-ons, billing, plans, invoices and cancel for a board member only', () => {
    renderAt('/subscription');
    expect(screen.getAllByText('Plan').length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-label="Plans"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Invoices"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Cancel"]')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'On Call' })).toBeTruthy();
    expect(within(document.querySelector('[aria-label="Self-Managed"]') as HTMLElement).getByText('Current')).toBeTruthy();
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      renderAt('/subscription');
      // A resident gets no Subscription tab; every mounted tree re-renders with the new role.
      expect(document.querySelectorAll('[aria-label="Plans"]').length).toBe(0);
      const navs = screen.getAllByRole('navigation', { name: 'Me sections' });
      const last = navs[navs.length - 1];
      expect(within(last).queryByRole('button', { name: /User Management/ })).toBeNull();
    } finally {
      useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    }
  });

  it('Help searches guides, runbooks, obligations and fees, lists the guides and takes a feedback form', () => {
    renderAt('/support');
    expect(document.querySelector('[aria-label="Contact us"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Legal references"]')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search help'), { target: { value: 'insurance' } });
    expect(screen.getAllByText('runbook').length).toBeGreaterThan(0);
    const guides = document.querySelector('[aria-label="Guides"]') as HTMLElement;
    fireEvent.click(within(guides).getByRole('button', { name: /Fiscal Lens/ }));
    expect(screen.getByTestId('elsewhere')).toBeTruthy();
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
