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

  it('Directory lets the board add, edit and remove the property manager and legal counsel', async () => {
    const { useBuildingStore } = await import('@/store/useBuildingStore');
    useBuildingStore.setState({ management: { company: '', contact: '', title: '', email: '', phone: '', emergency: '', address: '', hours: '', afterHours: '' }, legalCounsel: [] });
    renderAt('/building?tab=directory');
    const card = document.querySelector('[aria-label="Management and counsel"]') as HTMLElement;
    expect(within(card).getByText('Self-managed · no property manager')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Add a property manager' }));
    const pm = within(card).getByRole('form', { name: 'Add a property manager' });
    fireEvent.change(within(pm).getByLabelText('Company'), { target: { value: 'Harbor PM' } });
    fireEvent.change(within(pm).getByLabelText('Contact'), { target: { value: 'Jo Park' } });
    fireEvent.change(within(pm).getByLabelText('Emergency phone'), { target: { value: '555-0199' } });
    fireEvent.click(within(pm).getByRole('button', { name: 'Save' }));
    expect(useBuildingStore.getState().management).toMatchObject({ company: 'Harbor PM', contact: 'Jo Park', emergency: '555-0199' });
    expect(within(card).getByText('Harbor PM · property manager')).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'Add legal counsel' }));
    const lc = within(card).getByRole('form', { name: 'Add legal counsel' });
    fireEvent.change(within(lc).getByLabelText('Firm'), { target: { value: 'Lee Law' } });
    fireEvent.change(within(lc).getByLabelText('Attorney'), { target: { value: 'Sam Lee' } });
    fireEvent.click(within(lc).getByRole('button', { name: 'Add' }));
    expect(useBuildingStore.getState().legalCounsel).toEqual([expect.objectContaining({ firm: 'Lee Law', attorney: 'Sam Lee' })]);
    expect(within(card).getByText('Lee Law · counsel')).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'More for Lee Law' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(useBuildingStore.getState().legalCounsel).toEqual([]);
    fireEvent.click(within(card).getByRole('button', { name: 'More for the property manager' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /back to self-managed/ }));
    expect(useBuildingStore.getState().management.company).toBe('');
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

  it('Documents shows one row per document, collapses copies, and lists required documents that are missing', async () => {
    const { useBuildingStore } = await import('@/store/useBuildingStore');
    const prev = useBuildingStore.getState().legalDocuments;
    const file = (name: string) => ({ name, size: '2 MB', uploadedAt: '2026-11-01', type: 'application/pdf' });
    useBuildingStore.setState({ legalDocuments: [
      { id: 'a', name: 'Bylaws · 1302 R St NW_Bylaws', version: '2019', size: '2 MB', status: 'current', attachments: [file('1302 R St NW_Bylaws.pdf')] },
      { id: 'b', name: 'Bylaws · 1302 R St NW_Bylaws', version: '2026', size: '2 MB', status: 'current', attachments: [] },
      { id: 'c', name: 'Bylaws (amended 2019)', version: '2019', size: '2 MB', status: 'current', attachments: [] },
      { id: 'd', name: 'Other document · Public Offering Statement', version: '2026', size: '1 MB', status: 'current', attachments: [file('Public Offering Statement.pdf')] },
    ] });
    try {
      renderAt('/building?tab=documents');
      const lib = document.querySelector('[aria-label="Document library"]') as HTMLElement;
      const rows = within(lib).getAllByRole('row').filter(r => r.querySelectorAll('td').length > 1).map(r => r.textContent ?? '');
      const bylaws = rows.filter(r => r.startsWith('Bylaws'));
      expect(bylaws).toHaveLength(1);
      expect(bylaws[0]).toContain('2 other copies');
      expect(bylaws[0]).not.toContain('Missing');
      expect(rows.some(r => r.startsWith('Public offering statement'))).toBe(true);
      for (const need of ['Declaration (CC&Rs)', 'Rules and regulations', 'Plats and plans', 'Collections policy', 'Reserve study']) {
        const row = rows.find(r => r.startsWith(need));
        expect(row, need).toBeTruthy();
        expect(row).toContain('Missing');
      }
      expect(rows.some(r => r.startsWith('Pets policy'))).toBe(false);
      const row = (name: string) => within(lib).getAllByRole('row').find(r => r.textContent?.startsWith(name))!;
      fireEvent.click(within(row('Declaration')).getByRole('button', { name: 'Add file' }));
      const addForm = within(lib).getByRole('form', { name: 'Add a file to Declaration (CC&Rs)' });
      expect((within(addForm).getByRole('checkbox', { name: 'Declaration (CC&Rs)' }) as HTMLInputElement).checked).toBe(true);
      fireEvent.click(within(addForm).getByRole('button', { name: 'Cancel' }));

      // A new bylaws file that also holds the rules: it replaces the current bylaws, which the person archives.
      fireEvent.click(within(row('Bylaws')).getByRole('button', { name: 'New version' }));
      const form = within(lib).getByRole('form', { name: 'Add a file to Bylaws' });
      fireEvent.change(form.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'Bylaws 2026 with rules.pdf', { type: 'application/pdf' })] } });
      fireEvent.click(within(form).getByRole('checkbox', { name: 'Rules and regulations' }));
      const prompt = within(form).getByRole('group', { name: 'What it replaces' });
      expect(prompt.textContent).toContain('1302 R St NW_Bylaws.pdf');
      expect((within(form).getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(within(prompt).getByRole('radio', { name: /Archive/ }));
      fireEvent.click(within(form).getByRole('button', { name: 'Upload' }));
      const docs = useBuildingStore.getState().legalDocuments;
      const bylawsDoc = docs.find(d => d.id === 'a')!;
      expect(bylawsDoc.attachments.map(f => [f.name, !!f.archived])).toEqual([['1302 R St NW_Bylaws.pdf', true], ['Bylaws 2026 with rules.pdf', false]]);
      expect(docs.find(d => d.name === 'Rules and regulations')?.attachments.map(f => f.name)).toEqual(['Bylaws 2026 with rules.pdf']);
      expect(row('Rules and regulations').textContent).not.toContain('Missing');
      fireEvent.click(within(row('Bylaws')).getByRole('button', { name: 'Earlier · 1' }));
      expect(within(lib).getByRole('list', { name: 'Earlier versions of Bylaws · 1302 R St NW_Bylaws' }).textContent).toContain('1302 R St NW_Bylaws.pdf');
    } finally {
      useBuildingStore.setState({ legalDocuments: prev });
    }
  });
});
