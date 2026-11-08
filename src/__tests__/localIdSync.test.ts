/**
 * A record added in the app keeps a local id ("ld6147ad71") until its insert
 * returns. Changes and deletes made in that window must not be sent with the
 * local id (Postgres: 22P02 invalid input syntax for type uuid); they go up
 * once the database id is known.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DB_ID = '11111111-2222-4333-8444-555555555555';
let resolveInsert: (row: unknown) => void = () => {};

vi.mock('@/lib/supabase', () => ({ isBackendEnabled: true, getActiveTenantId: () => 'tenant-1', supabase: null, logDbError: () => {} }));
vi.mock('@/lib/services/building', () => ({
  createLegalDocument: vi.fn(() => new Promise(r => { resolveInsert = r; })),
  updateLegalDocument: vi.fn(async () => true),
  deleteLegalDocument: vi.fn(async () => true),
  createBoardMember: vi.fn(() => new Promise(r => { resolveInsert = r; })),
  updateBoardMember: vi.fn(async () => true),
  deleteBoardMember: vi.fn(async () => true),
}));
vi.mock('@/lib/services/assets', () => ({}));

import * as svc from '@/lib/services/building';
import { useBuildingStore } from '@/store/useBuildingStore';

const flush = () => new Promise(r => setTimeout(r, 0));

describe('records saved before their database id is known', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBuildingStore.setState({ legalDocuments: [], board: [] });
  });

  it('holds an attachment added right after filing until the insert returns, then saves it with the real id', async () => {
    const b = useBuildingStore.getState();
    b.addLegalDocument({ name: 'Bylaws · Bylaws-2019', version: '2019', size: '2 MB', status: 'current' });
    const local = useBuildingStore.getState().legalDocuments[0].id;
    expect(local).toMatch(/^ld/);
    b.addLegalDocAttachment(local, { name: 'Bylaws-2019.pdf', size: '2 MB', type: 'application/pdf' });
    expect(svc.updateLegalDocument).not.toHaveBeenCalled();

    resolveInsert({ id: DB_ID, name: 'Bylaws · Bylaws-2019', version: '2019', size: '2 MB', status: 'current', attachments: [] });
    await flush();
    expect(useBuildingStore.getState().legalDocuments[0].id).toBe(DB_ID);
    expect(svc.updateLegalDocument).toHaveBeenCalledWith(DB_ID, expect.objectContaining({ attachments: [expect.objectContaining({ name: 'Bylaws-2019.pdf' })] }));
    expect(vi.mocked(svc.updateLegalDocument).mock.calls.every(([id]) => id === DB_ID)).toBe(true);
  });

  it('deletes a record removed before its insert returned, once it does', async () => {
    const b = useBuildingStore.getState();
    b.addBoardMember({ name: 'Ana Rivera', role: 'President', email: '', phone: '', term: '' });
    const local = useBuildingStore.getState().board[0].id;
    b.removeBoardMember(local);
    expect(svc.deleteBoardMember).not.toHaveBeenCalled();
    resolveInsert({ id: DB_ID });
    await flush();
    expect(svc.deleteBoardMember).toHaveBeenCalledWith(DB_ID);
    expect(useBuildingStore.getState().board).toEqual([]);
  });
});
