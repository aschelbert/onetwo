import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = { access_token: 'member-token' };
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session } }) } },
}));

import { createSupportThread, listSupportThreads, replyToSupportThread, toSupportAttachment } from '@/lib/supportApi';

const fetchMock = vi.fn();

describe('supportApi', () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

  it('asks the console backend for the building\'s threads with the member\'s own token', async () => {
    fetchMock.mockReturnValue(ok({ threads: [{ id: 't1', subject: 'Help' }] }));
    const threads = await listSupportThreads('tenant-1');
    expect(threads).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://admin.getonetwo.com/api/tenant-support');
    expect(init.headers.Authorization).toBe('Bearer member-token');
    expect(JSON.parse(init.body)).toEqual({ tenant_id: 'tenant-1', action: 'list' });
  });

  it('never sends a sender name or role; the backend takes those from the member\'s record', async () => {
    fetchMock.mockReturnValue(ok({ thread: { id: 't2' }, message: null, attachmentError: null }));
    await createSupportThread('tenant-1', { subject: 'S', module: 'Funds', priority: 'high', body: 'B' });
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body)).sort()).toEqual(['action', 'body', 'module', 'priority', 'subject', 'tenant_id']);
  });

  it('surfaces the backend\'s reason when a request is refused', async () => {
    fetchMock.mockReturnValue(Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: 'You are not a member of this building' }) }));
    await expect(replyToSupportThread('tenant-1', 't1', { body: 'hi' })).rejects.toThrow('You are not a member of this building');
  });

  it('encodes an image as base64 for upload', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
    expect(await toSupportAttachment(file)).toEqual({ type: 'image/png', data: 'AQID' });
  });
});
