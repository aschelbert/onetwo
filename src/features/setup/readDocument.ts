/**
 * Adding setup documents. Everything happens in the browser: no outside
 * service, no per-document cost.
 *  - Spreadsheets (CSV, Excel) are imported by their column headings (`importSpreadsheet`).
 *  - PDFs and plain text are read with rules for the settings and lists setup
 *    uses (`extractText`), and filed in Building › Documents.
 *  - Pasted text is read the same way.
 *  - Anything else (Word, photos, scanned PDFs with no text) is filed; its
 *    settings are asked in Fill the gaps.
 * The text of each file is kept in memory for this visit, so changing what a
 * document is reads it again with that kind's rules.
 */
import { READER_VERSION, type DocType, type SetupDoc } from './setupModel';
import { useSetupStore } from './useSetupStore';
import { fileSetupDocument, retypeSetupDocument } from './applySetup';
import { parseCsv, readSheets, type Cell } from './importSpreadsheet';
import { detectType, extractFromPages, foundIn } from './extractText';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.doc,.docx,application/pdf,image/*,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const isSpreadsheet = (name: string) => /\.(csv|xlsx)$/i.test(name);

/** A first guess at what a document is, from its name; the text and the person can change it. */
export function guessType(name: string): DocType {
  const n = name.toLowerCase();
  if (/bylaw/.test(n)) return 'bylaws';
  if (/declar(?!ations? page)|cc&?rs|covenant|master deed/.test(n)) return 'declaration';
  if (/insur|declarations? page|\bcoi\b|certificate/.test(n)) return 'insurance';
  if (/reserve/.test(n)) return 'reserve_study';
  if (/rule|regulation|polic(y|ies)/.test(n)) return 'rules';
  if (/budget/.test(n)) return 'budget';
  if (/minute/.test(n)) return 'minutes';
  if (/contract|agreement|management/.test(n)) return 'contract';
  if (/statement|bank|balance|financial|audit/.test(n)) return 'financial_statement';
  if (/owner|roster|directory/.test(n)) return 'owner_list';
  return 'other';
}

const text = new Map<string, { pages: string[][]; paged: boolean }>();
const newId = () => `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const titleOf = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/_+/g, ' ').trim();

async function sheetsOf(file: File): Promise<{ name: string; rows: Cell[][] }[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    return sheets.map(s => ({ name: s.sheet, rows: s.data as unknown as Cell[][] }));
  }
  return [{ name: file.name, rows: parseCsv(await file.text()) }];
}

/** Read text with the rules for its kind and record the result on the document. */
function applyReading(id: string, pages: string[][], paged: boolean, docType: DocType, name: string) {
  const { updateDoc } = useSetupStore.getState();
  const result = extractFromPages(pages, { title: titleOf(name), docType, paged });
  const n = foundIn(result);
  result.summary = n ? `${n} found` : '';
  updateDoc(id, n ? { status: 'read', result, docType, reader: READER_VERSION } : { status: 'filed', result: undefined, docType, reader: READER_VERSION, note: 'Filed. Its text was read but no settings, lists or sections setup recognises were found. Paste a section into "Paste text", or add them in Fill the gaps.' });
}

/** Add one file. */
export async function addOne(file: File): Promise<void> {
  const { addDoc, updateDoc } = useSetupStore.getState();
  const id = newId();
  const base: SetupDoc = { id, name: file.name, size: file.size, mediaType: file.type, status: 'reading', addedAt: new Date().toISOString() };
  addDoc(base);
  if (file.size > MAX_FILE_BYTES) { updateDoc(id, { status: 'error', error: 'This file is over 25 MB. Split it, or keep just the pages that matter.' }); return; }

  if (isSpreadsheet(file.name)) {
    try {
      const result = readSheets(await sheetsOf(file), titleOf(file.name));
      if ('error' in result) { updateDoc(id, { status: 'error', error: result.error }); return; }
      updateDoc(id, { status: 'read', result, docType: result.docType, reader: READER_VERSION });
    } catch {
      updateDoc(id, { status: 'error', error: "This spreadsheet couldn't be opened. Save it as CSV or Excel (.xlsx) and try again." });
    }
    return;
  }

  let docType = guessType(file.name);
  let filedAs = fileSetupDocument({ ...base, docType }) ?? undefined;
  updateDoc(id, { filedAs });
  const lower = file.name.toLowerCase();
  try {
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      const { pdfLines } = await import('./pdfText');
      const pages = await pdfLines(file);
      if (!pages.some(p => p.length)) { updateDoc(id, { status: 'filed', docType, reader: READER_VERSION, note: 'Filed. This PDF is a scan: it has no text layer to read. Paste the key sections into "Paste text", or add them in Fill the gaps.' }); return; }
      docType = detectType(pages, docType);
      if (docType !== guessType(file.name)) { filedAs = retypeSetupDocument({ ...base, filedAs }, docType); updateDoc(id, { filedAs }); }
      text.set(id, { pages, paged: true });
      applyReading(id, pages, true, docType, file.name);
      return;
    }
    if (lower.endsWith('.txt') || file.type === 'text/plain') {
      const pages = [(await file.text()).split(/\r?\n/)];
      docType = detectType(pages, docType);
      text.set(id, { pages, paged: false });
      applyReading(id, pages, false, docType, file.name);
      return;
    }
  } catch (err) {
    console.error('[setup] reading failed for', file.name, err);
    const name = (err as { name?: string })?.name ?? '';
    const note = name === 'PasswordException'
      ? 'Filed. This PDF is password protected, so its text can\'t be read. Save a copy without the password and add it again, or paste the key sections into "Paste text".'
      : name === 'InvalidPDFException'
        ? 'Filed. This file isn\'t a readable PDF (it may be damaged). Try saving it again as PDF, or paste the key sections into "Paste text".'
        : `Filed. Its text couldn't be read (${[name, err instanceof Error ? err.message : ''].filter(Boolean).join(': ') || 'unknown error'}). Paste the key sections into "Paste text", or add them in Fill the gaps.`;
    updateDoc(id, { status: 'filed', docType, reader: READER_VERSION, note });
    return;
  }
  updateDoc(id, { status: 'filed', docType, note: lower.match(/\.docx?$/) ? 'Filed. Save Word files as PDF to have their text read.' : 'Filed in Building › Documents.' });
}

/** Add several files, in order. */
export async function addFiles(list: File[]): Promise<void> {
  for (const f of list) await addOne(f);
}

/** Read pasted text (copied from a document, an email, a web page). */
export function addPastedText(raw: string, docType: DocType, label: string): void {
  const lines = raw.split(/\r?\n/);
  const pages = [lines];
  const type = detectType(pages, docType);
  const id = newId();
  const name = label.trim() || `Pasted text · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  useSetupStore.getState().addDoc({ id, name, size: raw.length, mediaType: 'text/plain', status: 'reading', addedAt: new Date().toISOString(), pasted: true });
  text.set(id, { pages, paged: false });
  applyReading(id, pages, false, type, name);
}

/** Change what a document is: renames it in Building › Documents and, when its text is at hand, reads it again with that kind's rules. */
export function retype(doc: SetupDoc, docType: DocType): void {
  const filedAs = retypeSetupDocument(doc, docType);
  if (filedAs !== doc.filedAs) useSetupStore.getState().updateDoc(doc.id, { filedAs });
  const t = text.get(doc.id);
  if (t) applyReading(doc.id, t.pages, t.paged, docType, doc.name);
  else useSetupStore.getState().updateDoc(doc.id, { docType });
}

export const canReread = (id: string) => text.has(id);
