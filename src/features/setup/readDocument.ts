/**
 * Reading a setup document: turn the file into what the read-setup-document
 * edge function takes (PDFs and images as base64, CSV and Excel as text),
 * send it, and add the result to the setup store. The file itself is kept in
 * memory for this visit only, so a failed reading can be retried.
 */
import { supabase } from '@/lib/supabase';
import type { ReadResult, SetupDoc } from './setupModel';
import { useSetupStore } from './useSetupStore';
import { fileSetupDocument } from './applySetup';

const FUNCTION = 'read-setup-document';
export const MAX_FILE_BYTES = 22 * 1024 * 1024;
export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.xlsx,application/pdf,image/*,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type Payload = { fileName: string; mediaType: string; data?: string; text?: string };

const files = new Map<string, File>();

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** What the function needs for a file, or an error to show. */
export async function payloadFor(file: File): Promise<Payload | { error: string }> {
  const name = file.name;
  const lower = name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) return { error: 'This file is over 22 MB. Split it, or upload just the pages that matter.' };
  if (lower.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    const text = sheets.map(s => `Sheet: ${s.sheet}\n${s.data.map(row => row.map(cell).join(',')).join('\n')}`).join('\n\n');
    return { fileName: name, mediaType: 'text/csv', text };
  }
  if (lower.endsWith('.xls') || lower.endsWith('.doc') || lower.endsWith('.docx')) {
    return { error: 'Save this file as a PDF (or Excel .xlsx for a spreadsheet) and upload that.' };
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt') || file.type.startsWith('text/')) {
    return { fileName: name, mediaType: 'text/plain', text: await file.text() };
  }
  const mediaType = file.type || (lower.endsWith('.pdf') ? 'application/pdf' : '');
  if (mediaType !== 'application/pdf' && !/^image\/(png|jpeg|gif|webp)$/.test(mediaType)) {
    return { error: "This file type can't be read. Upload a PDF, a photo of the page, a CSV or an Excel file." };
  }
  return { fileName: name, mediaType, data: await base64(file) };
}

async function errorText(err: unknown): Promise<{ message: string; notConfigured: boolean }> {
  // supabase-js puts the response on `context` for HTTP errors.
  const ctx = (err as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      return { message: body?.error || 'The document could not be read.', notConfigured: body?.code === 'not_configured' };
    } catch { /* fall through */ }
  }
  return { message: 'The document could not be read. Check your connection and try again.', notConfigured: false };
}

/** Whether document reading is switched on (the API key is set on the server). Null when there is no backend. */
export async function readingAvailable(): Promise<boolean | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION, { method: 'GET' });
    if (error) return false;
    return !!(data as { configured?: boolean })?.configured;
  } catch {
    return false;
  }
}

/** Send one file for reading. Returns the reading or throws an Error with a message to show. */
export async function readSetupDocument(payload: Payload): Promise<ReadResult> {
  if (!supabase) throw new Error('Document reading needs the live app. In the demo, set the building up by hand.');
  const { data, error } = await supabase.functions.invoke(FUNCTION, { body: payload });
  if (error) throw new Error((await errorText(error)).message);
  const result = (data as { result?: ReadResult })?.result;
  if (!result) throw new Error('The reading came back empty. Try again.');
  return result;
}

const newId = () => `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Add files to setup and read them one after another (a few at a time keeps within rate limits). */
export async function addAndRead(list: File[]): Promise<void> {
  const store = useSetupStore.getState();
  const queued: string[] = [];
  for (const file of list) {
    const id = newId();
    files.set(id, file);
    store.addDoc({ id, name: file.name, size: file.size, mediaType: file.type, status: 'reading', addedAt: new Date().toISOString() });
    queued.push(id);
  }
  const worker = async () => {
    while (queued.length) {
      const id = queued.shift()!;
      await readOne(id);
    }
  };
  await Promise.all([worker(), worker()]);
}

/** Read (or read again) a document added this visit. */
export async function readOne(id: string): Promise<void> {
  const { updateDoc } = useSetupStore.getState();
  const file = files.get(id);
  if (!file) { updateDoc(id, { status: 'error', error: 'Add the file again to read it.' }); return; }
  updateDoc(id, { status: 'reading', error: undefined });
  try {
    const payload = await payloadFor(file);
    if ('error' in payload) { updateDoc(id, { status: 'error', error: payload.error }); return; }
    const result = await readSetupDocument(payload);
    updateDoc(id, { status: 'read', result });
    const doc = useSetupStore.getState().docs.find(d => d.id === id);
    if (doc && !doc.filedAs) updateDoc(id, { filedAs: fileSetupDocument(doc as SetupDoc & { result: ReadResult }) ?? undefined });
  } catch (e) {
    updateDoc(id, { status: 'error', error: e instanceof Error ? e.message : 'The document could not be read.' });
  }
}

export const canRetry = (id: string) => files.has(id);
