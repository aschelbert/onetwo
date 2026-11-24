/**
 * Photos attached to requests and property-log entries, in the private
 * building-photos bucket at <tenant_id>/<folder>/<file>. Any member of the
 * building can add and view them (an owner photographs a leak; the board and
 * the vendor need to see it). Without a backend a small image is kept inline
 * so the demo building still shows what was attached.
 */
import { getActiveTenantId, logDbError, supabase } from '@/lib/supabase';
import { generateLocalId } from '@/lib/generateId';

export const PHOTOS_BUCKET = 'building-photos';
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const INLINE_LIMIT = 400 * 1024;

export interface Photo {
  id: string;
  name: string;
  /** Storage path, when stored in the bucket. */
  path?: string;
  /** Inline image, only where there is no backend to store it. */
  dataUrl?: string;
  addedAt: string;
  by: string;
}

const safeName = (name: string) => name.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim() || 'photo';

const readInline = (file: File) => new Promise<string | null>(resolve => {
  const r = new FileReader();
  r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
  r.onerror = () => resolve(null);
  r.readAsDataURL(file);
});

export interface UploadResult { photos: Photo[]; skipped: string[] }

/** Store each image; anything too large, not an image, or that failed to upload is returned in `skipped` with why. */
export async function uploadPhotos(folder: string, files: File[], by: string): Promise<UploadResult> {
  const tenantId = getActiveTenantId();
  const out: UploadResult = { photos: [], skipped: [] };
  for (const file of files) {
    if (!file.type.startsWith('image/')) { out.skipped.push(`${file.name} is not an image`); continue; }
    if (file.size > MAX_PHOTO_BYTES) { out.skipped.push(`${file.name} is over 10 MB`); continue; }
    const id = generateLocalId('ph');
    const base = { id, name: file.name, addedAt: new Date().toISOString(), by };
    if (supabase && tenantId) {
      const path = `${tenantId}/${folder}/${id}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file, { contentType: file.type });
      if (error) { logDbError('uploadPhotos error:', error); out.skipped.push(`${file.name} could not be uploaded`); continue; }
      out.photos.push({ ...base, path });
    } else if (file.size <= INLINE_LIMIT) {
      const dataUrl = await readInline(file);
      if (dataUrl) out.photos.push({ ...base, dataUrl }); else out.skipped.push(`${file.name} could not be read`);
    } else {
      out.skipped.push(`${file.name} is too large to keep until the building is connected`);
    }
  }
  return out;
}

/** A link the browser can show: the inline image, or a short-lived signed URL. */
export async function photoUrl(photo: Photo): Promise<string | null> {
  if (photo.dataUrl) return photo.dataUrl;
  if (!supabase || !photo.path) return null;
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(photo.path, 600);
  if (error) { logDbError('photoUrl error:', error); return null; }
  return data?.signedUrl ?? null;
}
