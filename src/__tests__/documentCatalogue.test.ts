/**
 * Building › Documents keeps one document per kind, with versions: a new
 * current file archives (or deletes) the one it replaces, a past version is
 * history and replaces nothing, and one file can be filed under several
 * documents at once.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { currentFile, entryFor, fileDocument, groupOf, pastFiles, placeFile, replacedBy, replacedFiles, restoreFile, sameDocument, unplaceFile } from '@/features/building/documentCatalogue';
import { fileSetupDocument, placeSetupDocument, retypeSetupDocument, setupDocName, suggestedCovers, unfileSetupDocument } from '@/features/setup/applySetup';
import { buildItems, type ReadResult, type SetupDoc } from '@/features/setup/setupModel';
import { useBuildingStore } from '@/store/useBuildingStore';

const setupDoc = (name: string, over: Partial<SetupDoc> = {}): SetupDoc => ({ id: `sd-${name}`, name, size: 2_000_000, mediaType: 'application/pdf', status: 'reading', addedAt: '2026-11-01T00:00:00Z', ...over });
const docs = () => useBuildingStore.getState().legalDocuments;
const doc = (name: string) => docs().find(d => sameDocument(d.name, name))!;
const pdf = (name: string, fileId?: string) => ({ name, size: '2 MB', type: 'application/pdf', ...(fileId ? { fileId } : {}) });
const read = (over: Partial<ReadResult>): ReadResult => ({ docType: 'bylaws', title: '', pageCount: 40, summary: '', facts: [], units: [], board: [], insurance: [], vendors: [], budget: [], reserves: [], ...over });
const src = { quote: 'q', confidence: 'high' as const };

describe('document catalogue', () => {
  beforeEach(() => useBuildingStore.setState({ legalDocuments: [] }));

  it('matches documents by name, whatever the file is called', () => {
    expect(entryFor('1302 R St NW_Bylaws')?.key).toBe('bylaws');
    expect(entryFor('Bylaws (amended 2019)')?.key).toBe('bylaws');
    expect(entryFor('Other document · Public Offering Statement')?.key).toBe('pos');
    expect(entryFor('Plans and plats')?.key).toBe('plats');
    expect(entryFor('Application for Condo Registration')?.key).toBe('registration');
    expect(entryFor('Budget 2024')?.key).toBe('budget');
    expect(entryFor('2023 Audited Financial Statements')?.key).toBe('financials');
    expect(entryFor('Annual meeting minutes 2025')?.key).toBe('minutes');
    expect(entryFor('Insurance declarations page')?.key).toBe('insurance');
    expect(groupOf('Contract · Acme Elevator agreement')).toBe('contracts');
    expect(sameDocument('Bylaws · 1302 R St NW_Bylaws', 'Bylaws')).toBe(true);
    expect(sameDocument('Bylaws', 'Declaration')).toBe(false);
    expect(sameDocument('Parking map', 'parking  map')).toBe(true);
  });

  it('a new current file archives the one it replaces, or deletes it when asked; the same file is added once', () => {
    fileDocument('Bylaws', { version: '2019', attachment: pdf('Bylaws.pdf') });
    fileDocument('Bylaws (amended 2019)', { version: '2019', attachment: pdf('Bylaws.pdf') });
    expect(docs()).toHaveLength(1);
    expect(replacedBy(['Bylaws'], pdf('Bylaws-2024.pdf')).map(r => r.files.map(f => f.name))).toEqual([['Bylaws.pdf']]);
    placeFile(['Bylaws'], pdf('Bylaws-2024.pdf'));
    expect(currentFile(doc('Bylaws')).name).toBe('Bylaws-2024.pdf');
    expect(pastFiles(doc('Bylaws')).map(f => f.name)).toEqual(['Bylaws.pdf']);
    placeFile(['Bylaws'], pdf('Bylaws-2026.pdf'), { replaced: 'delete' });
    expect(doc('Bylaws').attachments.map(f => f.name)).toEqual(['Bylaws.pdf', 'Bylaws-2026.pdf']);
    expect(currentFile(doc('Bylaws')).name).toBe('Bylaws-2026.pdf');
  });

  it('a past version is history: it replaces nothing, and an earlier version can be made current again', () => {
    placeFile(['Budgets'], pdf('Budget 2026.pdf'));
    placeFile(['Budgets'], { ...pdf('Budget 2024.pdf'), period: '2024' }, { past: true });
    expect(currentFile(doc('Budgets')).name).toBe('Budget 2026.pdf');
    expect(pastFiles(doc('Budgets')).map(f => [f.name, f.period])).toEqual([['Budget 2024.pdf', '2024']]);
    restoreFile(doc('Budgets').id, pastFiles(doc('Budgets'))[0]);
    expect(currentFile(doc('Budgets')).name).toBe('Budget 2024.pdf');
    expect(pastFiles(doc('Budgets')).map(f => f.name)).toEqual(['Budget 2026.pdf']);
  });

  it('one file is filed under several documents, and taking it out restores what it replaced', () => {
    placeFile(['Rules and regulations'], pdf('Rules 2015.pdf'));
    placeFile(['Bylaws', 'Rules and regulations', 'Pets policy'], pdf('Bylaws.pdf', 'f1'));
    expect(docs().map(d => d.name)).toEqual(['Rules and regulations', 'Bylaws', 'Pets policy']);
    expect(docs().map(d => currentFile(d).fileId)).toEqual(['f1', 'f1', 'f1']);
    expect(replacedFiles('f1').map(r => r.file.name)).toEqual(['Rules 2015.pdf']);
    unplaceFile({ fileId: 'f1', name: 'Bylaws.pdf' });
    expect(docs().map(d => d.name)).toEqual(['Rules and regulations']);
    expect(currentFile(doc('Rules and regulations')).name).toBe('Rules 2015.pdf');
  });
});

describe('setup filing', () => {
  beforeEach(() => useBuildingStore.setState({ legalDocuments: [] }));

  it('files under the catalogue name, once, however often the file is added', () => {
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

  it('one bylaws file covers the rules and pets policy too, suggested from its text and confirmed by the person', () => {
    const d = setupDoc('Bylaws.pdf', { docType: 'bylaws', status: 'read', result: read({
      facts: [{ key: 'pet_rule', value: 'two pets', number: 2, page: 31, ...src }, { key: 'late_fee', value: '$25', number: 25, page: 14, ...src }],
      clauses: [{ topic: 'rules', role: null, ref: '12.1', heading: 'Noise', text: 'Quiet hours', page: 30, ...src }],
    }) });
    const filedAs = fileSetupDocument({ ...d, docType: 'bylaws' })!;
    expect(suggestedCovers({ ...d, filedAs }).map(s => s.name)).toEqual(['Rules and regulations', 'Pets policy', 'Collections policy']);
    const placed = placeSetupDocument({ ...d, filedAs }, ['Bylaws', 'Rules and regulations', 'Pets policy']);
    expect(placed.covers).toEqual(['Bylaws', 'Rules and regulations', 'Pets policy']);
    expect(docs().map(x => [x.name, x.attachments.length])).toEqual([['Bylaws', 1], ['Rules and regulations', 1], ['Pets policy', 1]]);
    expect(suggestedCovers({ ...d, ...placed })).toEqual([{ name: 'Collections policy', why: 'late fee and grace period · p.14' }]);
  });

  it('a past version is filed as history and left out of what setup reads in', () => {
    placeFile(['Budgets'], pdf('Budget 2026.pdf'));
    const d = setupDoc('Budget 2024.xlsx', { docType: 'budget', status: 'read', result: read({ docType: 'budget', budget: [{ category: 'Insurance', annualAmount: 9000, page: null, ...src }] }) });
    expect(buildItems([d]).length).toBe(1);
    placeSetupDocument(d, ['Budgets'], true);
    expect(currentFile(doc('Budgets')).name).toBe('Budget 2026.pdf');
    expect(pastFiles(doc('Budgets')).map(f => [f.name, f.period])).toEqual([['Budget 2024.xlsx', '2024']]);
    expect(buildItems([{ ...d, historical: true }])).toEqual([]);
  });

  it('retyping moves the file to the document it now is, and removing takes it back out', () => {
    fileSetupDocument({ ...setupDoc('Rules.pdf'), docType: 'rules' });
    const d = setupDoc('scan-0042.pdf', { docType: 'other' });
    const filedAs = fileSetupDocument({ ...d, docType: 'other' })!;
    expect(docs().map(x => x.name)).toEqual(['Rules and regulations', 'Other document · scan-0042']);
    const now = retypeSetupDocument({ ...d, filedAs }, 'rules');
    expect(now.covers).toEqual(['Rules and regulations']);
    expect(docs().map(x => x.name)).toEqual(['Rules and regulations']);
    expect(currentFile(docs()[0]).name).toBe('scan-0042.pdf');
    expect(pastFiles(docs()[0]).map(a => a.name)).toEqual(['Rules.pdf']);
    unfileSetupDocument({ ...d, ...now });
    expect(docs()[0].attachments.map(a => [a.name, !!a.archived])).toEqual([['Rules.pdf', false]]);
  });
});
