import { useBuildingStore, type LegalDocFile, type LegalDocument } from '@/store/useBuildingStore';

/**
 * The documents a building should have on file, by section. Building ›
 * Documents shows one row per entry: the current copy on file, or "Missing"
 * with Add file when a required one isn't there. Entries that aren't
 * required (a public offering statement, past budgets) show only once a copy
 * exists. Matching is by the document's name, so a file named
 * "1302 R St NW_Bylaws" and one named "Bylaws (amended 2019)" are the same
 * document, and extra copies collapse into one row.
 *
 * Versions: a document's current version is its newest file that isn't
 * archived. Replacing it archives the old file (kept as an earlier version)
 * or deletes it; a past version (last year's budget) is added archived from
 * the start. One file can be filed under several documents (bylaws that hold
 * the rules and the pets policy) and is the same file, by `fileId`, in each.
 */
export type DocGroup = 'governing' | 'policies' | 'insurance' | 'reserve' | 'reports' | 'minutes' | 'contracts';

export const DOC_GROUP_LABEL: Record<DocGroup, string> = { governing: 'Governing documents', policies: 'Policies', insurance: 'Insurance certificates', reserve: 'Reserve study', reports: 'Annual reports', minutes: 'Minutes', contracts: 'Vendor contracts' };

export interface CatalogueEntry {
  key: string;
  label: string;
  group: DocGroup;
  note: string;
  required: boolean;
  match: RegExp;
  audience: 'Everyone' | 'Board';
}

export const DOC_CATALOGUE: CatalogueEntry[] = [
  { key: 'declaration', label: 'Declaration (CC&Rs)', group: 'governing', note: 'declaration and covenants · recorded with the city or county', required: true, match: /\bdeclaration\b(?!s? page)|cc&?rs|covenants|master deed/i, audience: 'Everyone' },
  { key: 'bylaws', label: 'Bylaws', group: 'governing', note: 'how the board is elected and runs', required: true, match: /\bby[- ]?laws\b/i, audience: 'Everyone' },
  { key: 'rules', label: 'Rules and regulations', group: 'governing', note: 'house rules for owners and residents', required: true, match: /\brules\b|regulations/i, audience: 'Everyone' },
  { key: 'plats', label: 'Plats and plans', group: 'governing', note: 'recorded plats and floor plans of the units', required: true, match: /\bplats?\b|floor plans?|plans and plats/i, audience: 'Everyone' },
  { key: 'articles', label: 'Articles of incorporation', group: 'governing', note: 'the association as a legal entity', required: false, match: /articles of (incorporation|organization)|certificate of incorporation/i, audience: 'Everyone' },
  { key: 'pos', label: 'Public offering statement', group: 'governing', note: 'what buyers were given when the condominium was offered', required: false, match: /public offering/i, audience: 'Everyone' },
  { key: 'registration', label: 'Condominium registration', group: 'governing', note: 'registration of the condominium with the regulator', required: false, match: /registration|application for (condo|condominium)/i, audience: 'Board' },
  { key: 'collections', label: 'Collections policy', group: 'policies', note: 'late fees, steps and timing · feeds the collections runbook', required: true, match: /collection/i, audience: 'Everyone' },
  { key: 'reserves-policy', label: 'Reserves policy', group: 'policies', note: 'contribution and target funding', required: false, match: /reserves? (policy|funding policy)/i, audience: 'Everyone' },
  { key: 'pets', label: 'Pets policy', group: 'policies', note: 'pets allowed and how they are registered', required: false, match: /\bpets?\b|animal/i, audience: 'Everyone' },
  { key: 'rentals', label: 'Rentals policy', group: 'policies', note: 'leasing rules and minimum terms', required: false, match: /rental|leasing|lease policy/i, audience: 'Everyone' },
  { key: 'amenities', label: 'Amenities policy', group: 'policies', note: 'booking, fees and hours for shared spaces', required: false, match: /amenit/i, audience: 'Everyone' },
  { key: 'insurance', label: 'Insurance policies', group: 'insurance', note: 'master policy, declarations pages and certificates', required: false, match: /insurance|declarations? page|\bcoi\b|certificate of insurance/i, audience: 'Everyone' },
  { key: 'reserve-study', label: 'Reserve study', group: 'reserve', note: 'components, their life and replacement cost', required: true, match: /reserve (study|analysis)/i, audience: 'Everyone' },
  { key: 'budget', label: 'Budgets', group: 'reports', note: 'approved annual budgets', required: false, match: /\bbudgets?\b/i, audience: 'Everyone' },
  { key: 'financials', label: 'Financial statements and audits', group: 'reports', note: 'year-end statements, bank statements and audits', required: false, match: /financial|balance sheet|income statement|\baudit|year end statement|bank statement/i, audience: 'Everyone' },
  { key: 'tax', label: 'Tax returns', group: 'reports', note: 'the association\'s federal and state returns', required: false, match: /tax return|\b1120 ?h?\b/i, audience: 'Board' },
  { key: 'minutes', label: 'Meeting minutes', group: 'minutes', note: 'past board and annual meeting minutes', required: false, match: /\bminutes\b/i, audience: 'Everyone' },
];

/** The catalogue entry a document's name belongs to, if any (first match wins; the order above settles ties). */
export function entryFor(name: string): CatalogueEntry | undefined {
  const n = name.replace(/[_-]+/g, ' '); // "1302 R St NW_Bylaws": an underscore isn't a word break
  return DOC_CATALOGUE.find(e => e.match.test(n));
}

/** The section a document outside the catalogue belongs in. */
export function groupOf(name: string): DocGroup {
  const e = entryFor(name);
  if (e) return e.group;
  if (/contract|agreement|proposal|\bbid\b/i.test(name)) return 'contracts';
  return 'policies';
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether two document names are the same document: the same catalogue entry or, outside the catalogue, the same name. */
export function sameDocument(a: string, b: string): boolean {
  const ea = entryFor(a), eb = entryFor(b);
  if (ea || eb) return ea?.key === eb?.key;
  return norm(a) === norm(b);
}

export const currentFiles = (d: LegalDocument) => d.attachments.filter(a => !a.archived);
export const pastFiles = (d: LegalDocument) => d.attachments.filter(a => a.archived).sort((a, b) => (b.period || b.uploadedAt || '').localeCompare(a.period || a.uploadedAt || ''));
/** The current version: the newest file that isn't archived. */
export const currentFile = (d: LegalDocument) => [...currentFiles(d)].sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))[0];

/** The building's document for a name, if it has one (the copy with a current file first). */
export function findDocument(name: string, docs = useBuildingStore.getState().legalDocuments): LegalDocument | undefined {
  const matches = docs.filter(d => sameDocument(d.name, name));
  return matches.find(d => currentFiles(d).length) ?? matches.find(d => d.attachments.length) ?? matches[0];
}

export type NewFile = { name: string; size: string; type: string; fileId?: string; period?: string };
const sameFile = (a: LegalDocFile, f: NewFile) => (f.fileId && a.fileId ? a.fileId === f.fileId : a.name === f.name);
const today = () => new Date().toISOString().slice(0, 10);

/** What filing a current file under these documents would replace: the current files already on them. */
export function replacedBy(names: string[], file: NewFile): { doc: LegalDocument; files: LegalDocFile[] }[] {
  const out: { doc: LegalDocument; files: LegalDocFile[] }[] = [];
  for (const name of names) {
    const doc = findDocument(name);
    const files = doc ? currentFiles(doc).filter(a => !sameFile(a, file)) : [];
    if (doc && files.length) out.push({ doc, files });
  }
  return out;
}

export interface PlaceOptions {
  /** A past version: kept as history, replaces nothing. */
  past?: boolean;
  /** What happens to the current file it replaces. Archive keeps it as an earlier version. */
  replaced?: 'archive' | 'delete';
  /** The version or date of a document made for it. */
  version?: string;
}

function setFiles(id: string, attachments: LegalDocFile[]) {
  useBuildingStore.getState().updateLegalDocument(id, { attachments });
}

/**
 * File one file under one or more documents. A document the building doesn't
 * have yet is made; one it has gets the file as its new current version (the
 * old one archived or deleted) or, for a past version, as history. A file
 * already on a document isn't added twice. Returns the document ids, in order.
 */
export function placeFile(names: string[], file: NewFile, opts: PlaceOptions = {}): string[] {
  const ids: string[] = [];
  const stamp = today();
  const fileId = file.fileId ?? `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const entry: LegalDocFile = { name: file.name, size: file.size, type: file.type, fileId, uploadedAt: stamp, ...(file.period ? { period: file.period } : {}) };
  for (const name of names) {
    let doc = findDocument(name);
    if (!doc) {
      useBuildingStore.getState().addLegalDocument({ name, version: opts.version || file.period || String(new Date().getFullYear()), size: file.size, status: 'current' });
      doc = [...useBuildingStore.getState().legalDocuments].reverse().find(d => d.name === name);
      if (!doc) continue;
    }
    if (ids.includes(doc.id)) continue;
    ids.push(doc.id);
    // Without an id of its own, the same file is the one with the same name.
    const had = doc.attachments.find(a => sameFile(a, file));
    if (opts.past) {
      if (had && had.archived) continue;
      setFiles(doc.id, had ? doc.attachments.map(a => (a === had ? { ...a, archived: stamp, period: file.period ?? a.period } : a)) : [...doc.attachments, { ...entry, archived: stamp }]);
      continue;
    }
    if (had && !had.archived) continue;
    const rest = doc.attachments.filter(a => a !== had).flatMap(a => {
      if (a.archived) return [a];
      return opts.replaced === 'delete' ? [] : [{ ...a, archived: stamp, archivedBy: fileId }];
    });
    setFiles(doc.id, [...rest, { ...entry, uploadedAt: had?.uploadedAt ?? stamp }]);
  }
  return ids;
}

/**
 * Take a file back out of every document it's on (except those named in
 * `keep`). Files it had replaced become current again; a document left with
 * no files at all is removed.
 */
export function unplaceFile(file: { fileId?: string; name: string }, keep: string[] = []): void {
  const b = useBuildingStore.getState();
  for (const d of [...b.legalDocuments]) {
    if (keep.some(n => sameDocument(d.name, n))) continue;
    const on = d.attachments.filter(a => sameFile(a, file as NewFile));
    if (!on.length) continue;
    const ids = new Set(on.map(a => a.fileId).filter(Boolean));
    const rest = d.attachments.filter(a => !on.includes(a)).map(a => (a.archivedBy && ids.has(a.archivedBy) ? { ...a, archived: undefined, archivedBy: undefined } : a));
    if (rest.length) setFiles(d.id, rest);
    else b.removeLegalDocument(d.id);
  }
}

/** Put a file on exactly these documents: taken off any others, added where it's missing. */
export function setFilePlaces(names: string[], file: NewFile & { fileId: string }, opts: PlaceOptions = {}): string[] {
  unplaceFile(file, names);
  return placeFile(names, file, opts);
}

/** The files a file replaced, on any document (kept as earlier versions). */
export function replacedFiles(fileId: string): { doc: LegalDocument; file: LegalDocFile }[] {
  return useBuildingStore.getState().legalDocuments.flatMap(d => d.attachments.filter(a => a.archivedBy === fileId).map(file => ({ doc: d, file })));
}

const fileKey = (a: LegalDocFile) => [a.fileId, a.name, a.uploadedAt, a.archived].join('|');

/** Delete one file from a document (an earlier version, or one a new file replaced). */
export function deleteFile(docId: string, file: LegalDocFile): void {
  const d = useBuildingStore.getState().legalDocuments.find(x => x.id === docId);
  if (d) setFiles(docId, d.attachments.filter(a => fileKey(a) !== fileKey(file)));
}

/** Make an earlier version current again (the current one becomes an earlier version). */
export function restoreFile(docId: string, file: LegalDocFile): void {
  const d = useBuildingStore.getState().legalDocuments.find(x => x.id === docId);
  if (!d) return;
  const stamp = today();
  setFiles(docId, d.attachments.map(a => (fileKey(a) === fileKey(file) ? { ...a, archived: undefined, archivedBy: undefined } : a.archived ? a : { ...a, archived: stamp })));
}

/** File a copy of a document (kept for callers that file one file under one name). */
export function fileDocument(name: string, opts: { version: string; attachment?: { name: string; size: string; type: string } }): string | null {
  if (!opts.attachment) {
    const existing = findDocument(name);
    if (existing) return existing.id;
    useBuildingStore.getState().addLegalDocument({ name, version: opts.version, size: '', status: 'current' });
    return [...useBuildingStore.getState().legalDocuments].reverse().find(d => d.name === name)?.id ?? null;
  }
  return placeFile([name], opts.attachment, { version: opts.version })[0] ?? null;
}
