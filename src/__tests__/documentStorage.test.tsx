/**
 * Files behind Building › Documents are stored once (building-documents
 * bucket) and downloaded through a signed link. A stored file is deleted only
 * when no document uses it any more, so moving a file between documents, or
 * filing it under several, never loses it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const storage = vi.hoisted(() => ({
  uploads: [] as string[],
  removed: [] as string[][],
  downloads: [] as [string, string][],
  fail: false,
}));
vi.mock('@/lib/services/documentFiles', () => ({
  canStoreFiles: () => true,
  uploadDocumentFile: vi.fn(async (fileId: string, file: File) => { if (storage.fail) return null; const p = `t1/${fileId}/${file.name}`; storage.uploads.push(p); return p; }),
  downloadDocumentFile: vi.fn(async (path: string, name: string) => { storage.downloads.push([path, name]); return true; }),
  removeDocumentFiles: vi.fn(async (paths: string[]) => { storage.removed.push(paths); }),
}));

import { useBuildingStore } from '@/store/useBuildingStore';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { currentFile, deleteFile, pastFiles, placeFile, setFilePath, setFilePlaces, unplaceFile } from '@/features/building/documentCatalogue';
import { addFiles } from '@/features/setup/readDocument';
import DocumentsTab from '@/ux2/building/tabs/DocumentsTab';
import type { BuildingSnapshot } from '@/ux2/building/metrics';

const docs = () => useBuildingStore.getState().legalDocuments;
const named = (n: string) => docs().find(d => d.name === n)!;
const pdf = (name: string, fileId: string, path?: string) => ({ name, size: '2 MB', type: 'application/pdf', fileId, ...(path ? { path } : {}) });

beforeEach(() => {
  useBuildingStore.setState({ legalDocuments: [] });
  storage.uploads = []; storage.removed = []; storage.downloads = []; storage.fail = false;
});

describe('stored files', () => {
  it('a file on several documents is deleted from storage only when the last one lets go', () => {
    placeFile(['Bylaws', 'Rules and regulations'], pdf('Bylaws.pdf', 'f1', 't1/f1/Bylaws.pdf'));
    expect(docs().map(d => currentFile(d).path)).toEqual(['t1/f1/Bylaws.pdf', 't1/f1/Bylaws.pdf']);
    deleteFile(named('Rules and regulations').id, currentFile(named('Rules and regulations')));
    expect(storage.removed).toEqual([]);
    unplaceFile({ fileId: 'f1', name: 'Bylaws.pdf' });
    expect(storage.removed).toEqual([['t1/f1/Bylaws.pdf']]);
  });

  it('moving a file to other documents keeps the stored file, and a replaced file deleted on upload is removed', () => {
    placeFile(['Other document · scan'], pdf('scan.pdf', 'f2', 't1/f2/scan.pdf'));
    setFilePlaces(['Rules and regulations', 'Pets policy'], pdf('scan.pdf', 'f2'));
    expect(docs().map(d => [d.name, currentFile(d).path])).toEqual([['Rules and regulations', 't1/f2/scan.pdf'], ['Pets policy', 't1/f2/scan.pdf']]);
    expect(storage.removed).toEqual([]);
    placeFile(['Pets policy'], pdf('pets-2026.pdf', 'f3', 't1/f3/pets-2026.pdf'), { replaced: 'delete' });
    expect(storage.removed).toEqual([]); // still on the rules
    placeFile(['Rules and regulations'], pdf('rules-2026.pdf', 'f4', 't1/f4/rules-2026.pdf'), { replaced: 'delete' });
    expect(storage.removed).toEqual([['t1/f2/scan.pdf']]);
  });

  it('an upload that finishes after its file was taken out is deleted again', () => {
    placeFile(['Bylaws'], pdf('Bylaws.pdf', 'f5'));
    setFilePath('f5', 't1/f5/Bylaws.pdf');
    expect(currentFile(named('Bylaws')).path).toBe('t1/f5/Bylaws.pdf');
    setFilePath('gone', 't1/gone/x.pdf');
    expect(storage.removed).toEqual([['t1/gone/x.pdf']]);
  });

  it('setup stores each file it files, past versions included', async () => {
    useSetupStore.getState().reset();
    await addFiles([new File(['x'], 'Budget 2024.pdf', { type: 'application/pdf' })], { docType: 'budget', covers: ['Budgets'] });
    await waitFor(() => expect(pastFiles(named('Budgets'))[0]?.path).toMatch(/^t1\/sd-.+\/Budget 2024\.pdf$/));
    expect(storage.uploads).toHaveLength(1);
  });
});

const snap = () => ({ legalDocuments: useBuildingStore.getState().legalDocuments, insurance: [] }) as unknown as BuildingSnapshot;
function renderTab(isBoard = true) {
  return render(<MemoryRouter><DocumentsTab snap={snap()} isBoard={isBoard} onSection={() => {}} onGo={() => {}} /></MemoryRouter>);
}

describe('Documents tab downloads', () => {
  it('uploads the file before filing it, then downloads it from the row and from earlier versions', async () => {
    placeFile(['Bylaws'], pdf('Bylaws-2019.pdf', 'old', 't1/old/Bylaws-2019.pdf'));
    const view = renderTab();
    const lib = document.querySelector('[aria-label="Document library"]') as HTMLElement;
    const row = () => within(lib).getAllByRole('row').find(r => r.textContent?.startsWith('Bylaws'))!;
    fireEvent.click(within(row()).getByRole('button', { name: 'Download Bylaws-2019.pdf' }));
    await waitFor(() => expect(storage.downloads).toEqual([['t1/old/Bylaws-2019.pdf', 'Bylaws-2019.pdf']]));

    fireEvent.click(within(row()).getByRole('button', { name: 'New version' }));
    const form = within(lib).getByRole('form', { name: 'Add a file to Bylaws' });
    fireEvent.change(form.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'Bylaws-2026.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(within(form).getByRole('radio', { name: /Archive/ }));
    storage.fail = true;
    fireEvent.click(within(form).getByRole('button', { name: 'Upload' }));
    expect((await within(form).findByRole('alert')).textContent).toMatch(/couldn't be uploaded/);
    expect(currentFile(named('Bylaws')).name).toBe('Bylaws-2019.pdf');
    storage.fail = false;
    fireEvent.click(within(form).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(currentFile(named('Bylaws')).path).toMatch(/^t1\/f-.+\/Bylaws-2026\.pdf$/));
    expect(pastFiles(named('Bylaws')).map(f => f.path)).toEqual(['t1/old/Bylaws-2019.pdf']);

    view.rerender(<MemoryRouter><DocumentsTab snap={snap()} isBoard onSection={() => {}} onGo={() => {}} /></MemoryRouter>);
    fireEvent.click(within(row()).getByRole('button', { name: 'Earlier · 1' }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Earlier versions of Bylaws' })).getByRole('button', { name: 'Download Bylaws-2019.pdf' }));
    await waitFor(() => expect(storage.downloads).toHaveLength(2));
  });

  it('owners can download but not add files', () => {
    placeFile(['Bylaws'], pdf('Bylaws.pdf', 'f9', 't1/f9/Bylaws.pdf'));
    renderTab(false);
    const lib = document.querySelector('[aria-label="Document library"]') as HTMLElement;
    const row = within(lib).getAllByRole('row').find(r => r.textContent?.startsWith('Bylaws'))!;
    expect(within(row).getByRole('button', { name: 'Download Bylaws.pdf' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'New version' })).toBeNull();
  });
});
