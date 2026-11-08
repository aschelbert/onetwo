/**
 * The files behind Building › Documents, in the private building-documents
 * bucket at <tenant_id>/<file_id>/<file name>. One file filed under several
 * documents is one object. Everyone in the building can download; board
 * members upload and delete (migration 036).
 */
import { getActiveTenantId, logDbError, supabase } from '@/lib/supabase';

export const DOCUMENTS_BUCKET = 'building-documents';

/** Whether files can be stored (a backend and a building to store them under). */
export const canStoreFiles = () => !!supabase && !!getActiveTenantId();

const safeName = (name: string) => name.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim() || 'file';

/** Upload a file; returns its storage path, or null when it couldn't be stored. */
export async function uploadDocumentFile(fileId: string, file: File): Promise<string | null> {
  const tenantId = getActiveTenantId();
  if (!supabase || !tenantId) return null;
  const path = `${tenantId}/${fileId}/${safeName(file.name)}`;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) { logDbError('uploadDocumentFile error:', error); return null; }
  return path;
}

/** A short-lived link that downloads the file under its own name. */
export async function documentDownloadUrl(path: string, name: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60, { download: name });
  if (error) { logDbError('documentDownloadUrl error:', error); return null; }
  return data?.signedUrl ?? null;
}

/** Download a stored file: true when the download started. */
export async function downloadDocumentFile(path: string, name: string): Promise<boolean> {
  const url = await documentDownloadUrl(path, name);
  if (!url) return false;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/** Delete stored files no document uses any more. */
export async function removeDocumentFiles(paths: string[]): Promise<void> {
  if (!supabase || !paths.length) return;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
  if (error) logDbError('removeDocumentFiles error:', error);
}
