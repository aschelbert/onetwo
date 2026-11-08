/**
 * Intercom attachments are private (migration 039): a message keeps the
 * storage path, and a file opens through a short-lived signed link. Messages
 * sent before then hold a public URL, which is read back as its path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ uploads: [] as string[], removed: [] as string[][], signed: [] as [string, number, unknown][], failUpload: false }));
vi.mock('@/lib/supabase', () => ({
  logDbError: () => {},
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => { calls.uploads.push(`${bucket}:${path}`); return { error: calls.failUpload ? { message: 'denied' } : null }; },
        remove: async (paths: string[]) => { calls.removed.push(paths); return { error: null }; },
        createSignedUrl: async (path: string, secs: number, opts: unknown) => { calls.signed.push([path, secs, opts]); return { data: { signedUrl: `https://signed/${path}` }, error: null }; },
      }),
    },
  },
}));

import { attachmentPath, openTeamAttachment, removeTeamAttachment, uploadTeamAttachment } from '@/lib/services/teamAttachments';

beforeEach(() => { calls.uploads = []; calls.removed = []; calls.signed = []; calls.failUpload = false; });

describe('intercom attachments', () => {
  it('stores a file privately under the building and returns its path', async () => {
    const path = await uploadTeamAttachment('t1', new File(['x'], 'Roof quote (v2).pdf'));
    expect(path).toMatch(/^t1\/[0-9a-f-]{36}-Roof quote \(v2\)\.pdf$/);
    expect(calls.uploads).toEqual([`team-attachments:${path}`]);
    calls.failUpload = true;
    expect(await uploadTeamAttachment('t1', new File(['x'], 'a.pdf'))).toBeNull();
  });

  it('opens a file through a 60-second link, including ones saved as a public URL before 039', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await openTeamAttachment('t1/abc-Quote.pdf', 'Quote.pdf')).toBe(true);
    expect(await openTeamAttachment('https://x.supabase.co/storage/v1/object/public/team-attachments/t1/old%20file.pdf', 'old file.pdf')).toBe(true);
    expect(calls.signed).toEqual([['t1/abc-Quote.pdf', 60, { download: 'Quote.pdf' }], ['t1/old file.pdf', 60, { download: 'old file.pdf' }]]);
    expect(click).toHaveBeenCalledTimes(2);
    expect(attachmentPath('t1/x.pdf')).toBe('t1/x.pdf');
  });

  it('removes a file whose message was never sent', async () => {
    await removeTeamAttachment('t1/abc-Quote.pdf');
    expect(calls.removed).toEqual([['t1/abc-Quote.pdf']]);
  });
});
