/**
 * Me › My Unit · Documents for this unit: an owner sees what the board shared
 * and what they added, downloads each through a short-lived link, deletes
 * their own, and is told when an upload didn't go through.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const links = vi.hoisted(() => ({ asked: [] as [string, string | undefined][] }));
vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', tier: 'self_managed', features: {}, id: 't1', subdomain: 'sunny' }),
}));
vi.mock('@/lib/adminSupabase', () => ({ adminSupabase: null }));
vi.mock('@/lib/services/unitManager', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/services/unitManager')>()),
  getDocumentSignedUrl: vi.fn(async (path: string, name?: string) => { links.asked.push([path, name]); return 'https://files.example/signed'; }),
}));

import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import MeModule from '@/ux2/me/MeModule';
import type { UnitDocument } from '@/types/financial';

const doc = (over: Partial<UnitDocument>): UnitDocument => ({ id: 'd', unitNumber: '301', uploadedBy: 'board-1', uploadedByName: 'Board', filename: 'file.pdf', storagePath: 't1/301/1-file.pdf', docType: 'other', visibleToOwner: true, createdAt: '2026-10-01T00:00:00Z', ...over });

function renderUnit() {
  return render(<MemoryRouter initialEntries={['/my-unit']}><Routes><Route path="/my-unit" element={<MeModule tab="unit" />} /></Routes></MemoryRouter>);
}

describe('Documents for this unit', () => {
  beforeEach(() => {
    localStorage.clear();
    links.asked = [];
    useAuthStore.setState({ currentRole: 'RESIDENT' });
  });

  it('lists shared and own documents, downloads them, deletes your own, and reports a failed upload', async () => {
    const viewer = useAuthStore.getState().currentUser!.id;
    const remove = vi.fn(async () => true);
    const upload = vi.fn(async () => false);
    useFinancialStore.setState({
      tenantId: 't1',
      unitDocuments: [
        doc({ id: 'shared', filename: 'Elevator notice.pdf', storagePath: 't1/301/1-Elevator notice.pdf' }),
        doc({ id: 'hidden', filename: 'Board memo.pdf', visibleToOwner: false, storagePath: 't1/301/2-Board memo.pdf' }),
        doc({ id: 'mine', filename: 'HO6 2026.pdf', uploadedBy: viewer, uploadedByName: 'Me', docType: 'insurance', storagePath: 't1/301/3-HO6 2026.pdf' }),
        doc({ id: 'other-unit', unitNumber: '302', filename: 'Lease 302.pdf', storagePath: 't1/302/4-Lease 302.pdf' }),
      ],
      deleteDocument: remove,
      uploadDocument: upload,
    });
    renderUnit();
    const card = document.querySelector('[aria-label="Documents for this unit"]') as HTMLElement;
    expect(within(card).getByText('Elevator notice')).toBeTruthy();
    expect(within(card).getByText('HO6 2026')).toBeTruthy();
    expect(within(card).queryByText('Board memo')).toBeNull();
    expect(within(card).queryByText('Lease 302')).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: 'Download Elevator notice.pdf' }));
    await waitFor(() => expect(links.asked).toEqual([['t1/301/1-Elevator notice.pdf', 'Elevator notice.pdf']]));

    // Only what you added can be deleted.
    expect(within(card).queryByRole('button', { name: 'Delete Elevator notice.pdf' })).toBeNull();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(card).getByRole('button', { name: 'Delete HO6 2026.pdf' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('mine', 't1/301/3-HO6 2026.pdf'));

    fireEvent.change(within(card).getByLabelText('Upload a unit document'), { target: { files: [new File(['x'], 'Pet registration.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(within(card).getByText(/Pet registration\.pdf couldn't be uploaded/)).toBeTruthy());
    expect(upload).toHaveBeenCalledWith('301', expect.any(File), 'other', true, viewer, expect.any(String));
  });
});

describe('Move history', () => {
  beforeEach(() => { localStorage.clear(); useAuthStore.setState({ currentRole: 'RESIDENT' }); });

  it('keeps the form and says so when a move could not be saved, and closes it once it is', async () => {
    const add = vi.fn().mockResolvedValueOnce(null).mockImplementation(async (e: object) => ({ ...e, id: 'mv1', createdAt: '2026-11-08T00:00:00Z' }));
    useFinancialStore.setState({ tenantId: 't1', moveEvents: [], addMoveEvent: add });
    renderUnit();
    const card = document.querySelector('[aria-label="Move history"]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Report a move' }));
    fireEvent.change(within(card).getByLabelText('Move date'), { target: { value: '2026-12-15' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Report' }));
    expect((await within(card).findByRole('alert')).textContent).toMatch(/couldn't be saved/);
    expect((within(card).getByLabelText('Move date') as HTMLInputElement).value).toBe('2026-12-15');
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ unitNumber: '301', moveType: 'out', scheduledDate: '2026-12-15', depositStatus: 'pending', insuranceConfirmed: false }));
    fireEvent.click(within(card).getByRole('button', { name: 'Report' }));
    await waitFor(() => expect(within(card).queryByRole('form', { name: 'Report a move' })).toBeNull());
  });
});
