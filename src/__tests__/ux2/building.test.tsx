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
vi.mock('@/features/property-log/PropertyLogPage', () => ({ default: () => <div data-testid="legacy-log" /> }));
vi.mock('@/features/association-team/tabs/TaskTrackingTab', () => ({ default: () => <div data-testid="legacy-tasks" /> }));
vi.mock('@/features/building/tabs/PMScorecardTab', () => ({ default: () => <div data-testid="legacy-scorecard" /> }));
vi.mock('@/features/association-team/tabs/CommunicationsTab', () => ({ default: () => <div data-testid="legacy-intercom" /> }));

import BuildingModule from '@/ux2/building/BuildingModule';
import { BuildingRedirect } from '@/ux2/shell/routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/building" element={<BuildingModule />} />
        <Route path="/archives" element={<BuildingRedirect defaultTab="archives" />} />
        <Route path="/association-team" element={<BuildingRedirect defaultTab="property-log" />} />
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
    expect(within(nav).getAllByRole('button').map(b => b.textContent?.replace(/\d+( lapsed)?$/, '').trim())).toEqual(['Overview', 'Documents', 'Obligations', 'Contracts', 'Directory']);
    expect(screen.getByTestId('legacy-building')).toMatchObject({ textContent: 'details' });
    expect(screen.getByTestId('legacy-building').getAttribute('data-embedded')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /^Insurance/ }));
    expect(screen.getByTestId('legacy-building').textContent).toBe('insurance');
  });

  it('absorbed legacy routes redirect into the module section', () => {
    renderAt('/archives');
    expect(screen.getByTestId('legacy-archives').textContent).toBe('archives');
    renderAt('/association-team?tab=task-tracking');
    expect(screen.getByTestId('legacy-tasks')).toBeTruthy();
  });

  it('legacy Building tab ids deep link into the right section', () => {
    renderAt('/building?tab=legal');
    expect(screen.getByTestId('legacy-building').textContent).toBe('legal');
    renderAt('/building?tab=runbook');
    expect(screen.getByTestId('legacy-boardroom').textContent).toBe('runbook');
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
    expect(screen.getByTestId('legacy-boardroom').textContent).toBe('duties');
  });

  it('Contracts shows a row per vendor and the vendor tools for the board', () => {
    renderAt('/building?tab=contracts');
    expect(document.querySelectorAll('tr[data-vendor]').length).toBeGreaterThan(0);
    expect(screen.getByTestId('legacy-vendors')).toBeTruthy();
  });

  it('Directory opens on units and reaches the log, tasks, scorecard and intercom', () => {
    renderAt('/building?tab=directory');
    expect(screen.getByTestId('legacy-units').textContent).toBe('building');
    fireEvent.click(screen.getByRole('button', { name: /Board, management/ }));
    expect(document.querySelector('[aria-label="Board"]')).toBeTruthy();
    expect(screen.getByTestId('legacy-building').textContent).toBe('contacts');
    fireEvent.click(screen.getByRole('button', { name: 'Intercom' }));
    expect(screen.getByTestId('legacy-intercom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Property log' }));
    expect(screen.getByTestId('legacy-log')).toBeTruthy();
  });
});
