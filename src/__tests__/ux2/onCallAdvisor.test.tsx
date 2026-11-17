import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { OnCallAdvisor } from '@/ux2/building/useOnCallAdvisor';

const state: { advisor: OnCallAdvisor | null } = { advisor: null };

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', features: {}, id: 't1' }),
}));
vi.mock('@/ux2/building/useOnCallAdvisor', () => ({ useOnCallAdvisor: () => state.advisor }));
vi.mock('@/features/building/BuildingPage', () => ({ default: () => <div /> }));
vi.mock('@/features/boardroom/BoardRoomPage', () => ({ default: () => <div /> }));
vi.mock('@/features/archives/ArchivesPage', () => ({ default: () => <div /> }));
vi.mock('@/features/building/tabs/TheUnitsTab', () => ({ default: () => <div /> }));
vi.mock('@/features/building/tabs/VendorsTab', () => ({ default: () => <div /> }));

import { BuildingRoute } from '@/ux2/shell/routes';

const renderDirectory = () => render(
  <MemoryRouter initialEntries={['/building?tab=directory']}>
    <Routes><Route path="/building" element={<BuildingRoute />} /></Routes>
  </MemoryRouter>,
);

describe('Directory › On Call Advisor', () => {
  beforeEach(() => { localStorage.clear(); state.advisor = null; });

  it('is not shown for a building without the On Call add-on', () => {
    renderDirectory();
    expect(screen.queryByLabelText('On Call Advisor')).toBeNull();
  });

  it('shows the assigned advisor as a contact in a purple container', () => {
    state.advisor = { status: 'assigned', name: 'Alyssa Stone', email: 'alyssa@example.com', assignedAt: '2026-11-17T00:00:00Z' };
    renderDirectory();
    const card = screen.getByLabelText('On Call Advisor');
    expect(card.className).toContain('bg-ux2-plum');
    expect(within(card).getByText('Alyssa Stone')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'alyssa@example.com' }).getAttribute('href')).toBe('mailto:alyssa@example.com');
  });

  it('says an advisor is being assigned while the request is open', () => {
    state.advisor = { status: 'requested', name: null, email: null, assignedAt: null };
    renderDirectory();
    const card = screen.getByLabelText('On Call Advisor');
    expect(within(card).getByText('Being assigned')).toBeTruthy();
    expect(within(card).queryByRole('link')).toBeNull();
  });
});
