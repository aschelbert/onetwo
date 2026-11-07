import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useComplianceStore } from '@/store/useComplianceStore';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', features: {}, id: 't1' }),
}));
// The production pages are heavy; the module tests only need to know which one is mounted and with which tab.
vi.mock('@/features/building/BuildingPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-building" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/boardroom/BoardRoomPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-boardroom" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/archives/ArchivesPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-archives" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/building/tabs/TheUnitsTab', () => ({ default: ({ variant }: { variant?: string }) => <div data-testid="legacy-units">{variant}</div> }));
vi.mock('@/features/building/tabs/VendorsTab', () => ({ default: () => <div data-testid="legacy-vendors" /> }));

import { BuildingRedirect, BuildingRoute } from '@/ux2/shell/routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/building" element={<BuildingRoute />} />
        <Route path="/archives" element={<BuildingRedirect defaultTab="archives" />} />
        <Route path="/association-team" element={<BuildingRedirect defaultTab="property-log" />} />
        <Route path="/community" element={<div data-testid="community">community</div>} />
        <Route path="/boardroom" element={<div data-testid="boardroom">boardroom</div>} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Building', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the Overview with the building line, score and the three tiles', () => {
    renderAt('/building');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sunny Acres');
    expect(screen.getByText(/Building score \d+/)).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Building sections' });
    expect(within(nav).getAllByRole('button').map(b => b.textContent?.replace(/\d+( lapsed)?$/, '').trim())).toEqual(['Overview', 'Documents', 'Obligations', 'Contracts', 'Directory', 'Archive']);
    expect(screen.queryByTestId('legacy-building')).toBeNull();
    expect(document.querySelector('[aria-label="Details"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Insurance"]')).toBeTruthy();
    const assets = document.querySelector('[aria-label="Assets and maintenance"]') as HTMLElement;
    expect(within(assets).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Asset', 'Condition', 'Replace', 'Vendor', 'Next', 'Status']);
    expect(document.querySelector('[aria-label="Mailing address and contact"]')).toBeTruthy();
  });

  it('absorbed legacy routes redirect into the module section', () => {
    renderAt('/archives');
    expect(document.querySelector('[aria-label="Document library"]')).toBeTruthy();
    expect(screen.queryByTestId('legacy-archives')).toBeNull();
    renderAt('/association-team?tab=task-tracking');
    expect(screen.getByTestId('boardroom')).toBeTruthy();
  });

  it('the Association Team sections that moved on redirect to Community and the Board Room', () => {
    renderAt('/association-team');
    expect(screen.getByTestId('community')).toBeTruthy();
    renderAt('/building?tab=pm-scorecard');
    expect(screen.getAllByTestId('community').length).toBe(2);
    renderAt('/building?tab=communications');
    expect(screen.getByTestId('boardroom')).toBeTruthy();
  });

  it('legacy Building tab ids deep link into the right section', () => {
    renderAt('/building?tab=legal');
    const lib = document.querySelector('[aria-label="Document library"]') as HTMLElement;
    expect(within(lib).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Document', 'Version / date', 'Who can see', 'Last updated', 'Download']);
    renderAt('/building?tab=runbook');
    expect(document.querySelectorAll('[aria-label="Obligations list"]').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('legacy-boardroom')).toBeNull();
  });

  it('Obligations lists every requirement, filters, and marks one done through the compliance store', () => {
    renderAt('/building?tab=obligations');
    const list = document.querySelector('[aria-label="Obligations list"]')!;
    const row = list.querySelector('tr[data-obligation]') as HTMLElement;
    const id = row.getAttribute('data-obligation')!;
    const before = !!useComplianceStore.getState().completions[id];
    const button = within(row).queryByRole('button', { name: before ? 'Reopen' : 'Mark done' });
    if (button) {
      fireEvent.click(button);
      expect(!!useComplianceStore.getState().completions[id]).toBe(!before);
      useComplianceStore.getState().setCompletion(id, before);
    }
    fireEvent.click(screen.getByRole('button', { name: /^Filings · \d+/ }));
    expect(list.querySelectorAll('tr[data-obligation]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Duties and roles' }));
    expect(document.querySelector('[aria-label="Who carries what"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Treasurer duties"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Every unit owner"]')).toBeTruthy();
    expect(screen.queryByTestId('legacy-boardroom')).toBeNull();
  });

  it('Contracts shows a row per vendor with the bids switch and paperwork, without the legacy vendor tools', () => {
    renderAt('/building?tab=contracts');
    expect(document.querySelectorAll('tr[data-vendor]').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('legacy-vendors')).toBeNull();
    expect(screen.getByRole('switch', { name: /Vendor bids/ })).toBeTruthy();
    expect(document.querySelector('[aria-label="Paperwork on file"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a vendor' }));
    expect(screen.getByRole('form', { name: 'Add a vendor' })).toBeTruthy();
  });

  it('Directory lists units and owners, the board, management, staff and emergency contacts', () => {
    renderAt('/building?tab=directory');
    expect(screen.queryByTestId('legacy-units')).toBeNull();
    expect(screen.queryByTestId('legacy-building')).toBeNull();
    const units = document.querySelector('[aria-label="Units and owners"]') as HTMLElement;
    expect(within(units).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Unit', 'Owner', 'Email', 'Phone', 'Roles', 'Autopay', 'Move-in']);
    expect(document.querySelector('[aria-label="Board"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Management and counsel"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Emergency contacts"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Intercom' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Property log' })).toBeNull();
  });

  it('Archive lists closed cases, requests and letters for the board, and owners do not get it', async () => {
    const { useAuthStore } = await import('@/store/useAuthStore');
    renderAt('/building?tab=archive');
    expect(document.querySelector('[aria-label="Archive"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Closed recently"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="How long it stays"]')).toBeTruthy();
    const prev = useAuthStore.getState().currentRole;
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      renderAt('/building?tab=archive');
      const navs = screen.getAllByRole('navigation', { name: 'Building sections' });
      expect(within(navs[navs.length - 1]).queryByRole('button', { name: /Archive/ })).toBeNull();
    } finally {
      useAuthStore.setState({ currentRole: prev });
    }
  });
});
