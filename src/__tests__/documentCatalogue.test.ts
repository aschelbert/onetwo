/**
 * Building › Documents keeps one document per kind: the bylaws filed twice in
 * setup (or again after Start over) are one Bylaws with its files as versions.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { entryFor, fileDocument, sameDocument } from '@/features/building/documentCatalogue';
import { fileSetupDocument, retypeSetupDocument, setupDocName, unfileSetupDocument } from '@/features/setup/applySetup';
import type { SetupDoc } from '@/features/setup/setupModel';
import { useBuildingStore } from '@/store/useBuildingStore';

const setupDoc = (name: string): SetupDoc => ({ id: `sd-${name}`, name, size: 2_000_000, mediaType: 'application/pdf', status: 'reading', addedAt: '2026-11-01T00:00:00Z' });
const docs = () => useBuildingStore.getState().legalDocuments;

describe('document catalogue', () => {
  beforeEach(() => useBuildingStore.setState({ legalDocuments: [] }));

  it('matches documents by name, whatever the file is called', () => {
    expect(entryFor('1302 R St NW_Bylaws')?.key).toBe('bylaws');
    expect(entryFor('Bylaws (amended 2019)')?.key).toBe('bylaws');
    expect(entryFor('Other document · Public Offering Statement')?.key).toBe('pos');
    expect(entryFor('Plans and plats')?.key).toBe('plats');
    expect(entryFor('Application for Condo Registration')?.key).toBe('registration');
    expect(entryFor('Insurance declarations page')).toBeUndefined();
    expect(sameDocument('Bylaws · 1302 R St NW_Bylaws', 'Bylaws')).toBe(true);
    expect(sameDocument('Bylaws', 'Declaration')).toBe(false);
    expect(sameDocument('Parking map', 'parking  map')).toBe(true);
  });

  it('adds a copy of a document it already has as a new version, and the same file only once', () => {
    fileDocument('Bylaws', { version: '2019', attachment: { name: 'Bylaws.pdf', size: '2 MB', type: 'application/pdf' } });
    fileDocument('Bylaws (amended 2019)', { version: '2019', attachment: { name: 'Bylaws.pdf', size: '2 MB', type: 'application/pdf' } });
    fileDocument('Bylaws', { version: '2024', attachment: { name: 'Bylaws-2024.pdf', size: '2 MB', type: 'application/pdf' } });
    expect(docs()).toHaveLength(1);
    expect(docs()[0].attachments.map(a => a.name)).toEqual(['Bylaws.pdf', 'Bylaws-2024.pdf']);
  });

  it('setup files under the catalogue name, once, however often the file is added', () => {
    const a = fileSetupDocument({ ...setupDoc('1302 R St NW_Bylaws.pdf'), docType: 'bylaws' });
    const b = fileSetupDocument({ ...setupDoc('1302 R St NW_Bylaws.pdf'), docType: 'bylaws' });
    expect(a).toBe(b);
    expect(docs().map(d => d.name)).toEqual(['Bylaws']);
    expect(docs()[0].attachments).toHaveLength(1);
    expect(setupDocName(setupDoc('Public Offering Statement.pdf'), 'other')).toBe('Public offering statement');
    expect(setupDocName(setupDoc('Plans and plats.pdf'), 'other')).toBe('Plats and plans');
    expect(setupDocName(setupDoc('scan-0042.pdf'), 'declaration')).toBe('Declaration (CC&Rs)');
    expect(setupDocName(setupDoc('Board roster.pdf'), 'owner_list')).toBe('Owner list · Board roster');
  });

  it('retyping moves the file to the document it now is, and removing takes it back out', () => {
    fileSetupDocument({ ...setupDoc('Rules.pdf'), docType: 'rules' });
    const d = setupDoc('scan-0042.pdf');
    const filedAs = fileSetupDocument({ ...d, docType: 'other' })!;
    expect(docs().map(x => x.name)).toEqual(['Rules and regulations', 'Other document · scan-0042']);
    const now = retypeSetupDocument({ ...d, filedAs }, 'rules')!;
    expect(docs().map(x => x.name)).toEqual(['Rules and regulations']);
    expect(docs()[0].attachments.map(a => a.name)).toEqual(['Rules.pdf', 'scan-0042.pdf']);
    unfileSetupDocument({ ...d, filedAs: now });
    expect(docs()[0].attachments.map(a => a.name)).toEqual(['Rules.pdf']);
  });
});
