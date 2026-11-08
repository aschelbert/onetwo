/**
 * Intercom attachments, in the private team-attachments bucket (migration
 * 039) at <tenant_id>/<uuid>-<name>. team_messages.attachment_url holds the
 * storage path; a file opens through a 60-second signed link, for team
 * members who can see the message it's attached to.
 */
import { logDbError, supabase } from '@/lib/supabase';

const BUCKET = 'team-attachments';

/** The storage path of an attachment: messages sent before 039 hold its public URL instead. */
export function attachmentPath(stored: string): string {
  const marker = `/${BUCKET}/`;
  const i = stored.indexOf(marker);
  return /^https?:\/\//.test(stored) && i >= 0 ? decodeURIComponent(stored.slice(i + marker.length).split('?')[0]) : stored;
}

/** Upload a file for a message; returns its storage path, or null when it couldn't be stored. */
export async function uploadTeamAttachment(tenantId: string, file: File): Promise<string | null> {
  if (!supabase) return null;
  const safe = file.name.replace(/[^\w.\-() ]+/g, '_').trim() || 'file';
  const path = `${tenantId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) { logDbError('uploadTeamAttachment error:', error); return null; }
  return path;
}

/** Remove a file whose message was never sent. */
export async function removeTeamAttachment(path: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) logDbError('removeTeamAttachment error:', error);
}

/** Open an attachment through a short-lived link; false when it couldn't be opened. */
export async function openTeamAttachment(stored: string, name: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachmentPath(stored), 60, { download: name });
  if (error || !data?.signedUrl) { if (error) logDbError('openTeamAttachment error:', error); return false; }
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
