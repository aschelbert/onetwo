import { useBuildingStore } from '@/store/useBuildingStore';
/**
 * The documents a building should have on file, by section. Building ›
 * Documents shows one row per entry: the latest copy on file, or "Missing"
 * with Add file when a required one isn't there. Entries that aren't
 * required (a public offering statement, a pets policy) show only once a
 * copy exists. Matching is by the document's name, so a file named
 * "1302 R St NW_Bylaws" and one named "Bylaws (amended 2019)" are the same
 * document, and extra copies collapse into one row.
 */
export type DocGroup = 'governing' | 'policies' | 'insurance' | 'reserve' | 'reports' | 'minutes' | 'contracts';

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
  { key: 'reserve-study', label: 'Reserve study', group: 'reserve', note: 'components, their life and replacement cost', required: true, match: /reserve (study|analysis)/i, audience: 'Everyone' },
];

/** The catalogue entry a document's name belongs to, if any (first match wins; the order above settles ties). */
export function entryFor(name: string): CatalogueEntry | undefined {
  const n = name.replace(/[_-]+/g, ' '); // "1302 R St NW_Bylaws": an underscore isn't a word break
  return DOC_CATALOGUE.find(e => e.match.test(n));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether two document names are the same document: the same catalogue entry or, outside the catalogue, the same name. */
export function sameDocument(a: string, b: string): boolean {
  const ea = entryFor(a), eb = entryFor(b);
  if (ea || eb) return ea?.key === eb?.key;
  return norm(a) === norm(b);
}

type Attachment = { name: string; size: string; type: string };

/**
 * File a copy of a document. When the building already has that document
 * (the same catalogue entry or name), the file is added to it as a new
 * version, and a file of the same name already on it is not added twice;
 * otherwise a new document is made. Returns the document's id.
 */
export function fileDocument(name: string, opts: { version: string; attachment?: Attachment }): string | null {
  const b = useBuildingStore.getState();
  const matches = b.legalDocuments.filter(d => sameDocument(d.name, name));
  const existing = matches.find(d => d.attachments.length) ?? matches[0];
  if (existing) {
    if (opts.attachment && !existing.attachments.some(a => a.name === opts.attachment!.name)) b.addLegalDocAttachment(existing.id, opts.attachment);
    return existing.id;
  }
  b.addLegalDocument({ name, version: opts.version, size: opts.attachment?.size ?? '', status: 'current' });
  const filed = [...useBuildingStore.getState().legalDocuments].reverse().find(d => d.name === name);
  if (!filed) return null;
  if (opts.attachment) b.addLegalDocAttachment(filed.id, opts.attachment);
  return filed.id;
}

/** Take one file off a document; a document left with no file is removed. */
export function unfileDocument(docId: string, fileName: string): void {
  const b = useBuildingStore.getState();
  const d = b.legalDocuments.find(x => x.id === docId);
  if (!d) return;
  const i = d.attachments.findIndex(a => a.name === fileName);
  if (i >= 0) b.removeLegalDocAttachment(docId, i);
  if (!useBuildingStore.getState().legalDocuments.find(x => x.id === docId)?.attachments.length) b.removeLegalDocument(docId);
}
