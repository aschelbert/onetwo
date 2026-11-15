import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for the tasker_jobs table: upserts land in `rows`, keyed like the real primary key.
const db = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), upserts: [] as Record<string, unknown>[], failSelect: false, slowFirst: false }));

vi.mock('@/lib/supabase', () => ({
  isBackendEnabled: true,
  getActiveTenantId: () => 't1',
  setActiveTenantId: () => {},
  logDbError: () => {},
  supabase: {
    from: (table: string) => {
      if (table !== 'tasker_jobs') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: (_c: string, tid: string) => ({ order: async () => db.failSelect
          ? { data: null, error: { message: 'boom' } }
          : { data: [...db.rows.values()].filter(r => r.tenant_id === tid).map(r => ({ id: r.id, data: r.data })), error: null } }) }),
        upsert: async (row: Record<string, unknown>, opts: { onConflict: string }) => {
          expect(opts.onConflict).toBe('tenant_id,id');
          if (db.slowFirst && db.upserts.length === 0) await new Promise(r => setTimeout(r, 30));
          db.upserts.push(row);
          db.rows.set(`${row.tenant_id}:${row.id}`, row);
          return { error: null };
        },
      };
    },
  },
}));

import { useTaskerStore, type TaskerJob } from '@/store/useTaskerStore';

const job = (over: Partial<TaskerJob> = {}): TaskerJob => ({
  id: 'TJ-1', caseId: '7b0c4d2e-0000-4000-8000-000000000001', stepIdx: 2, checkId: 'ck1', category: 'handyman', title: 'Lobby bulb', details: '',
  date: '2026-11-14', slot: 'afternoon', access: 'Front desk', taskerId: 'tr-andre', taskerName: 'Andre R.', rate: 58, estimateHours: 1,
  estimate: 58, parts: 0, notifyOwner: true, status: 'requested', woId: null, bookedBy: 'Maya K.', createdAt: '2026-11-14T15:00:00Z', events: [], ...over,
});
const flush = () => new Promise(r => setTimeout(r, 60));

beforeEach(() => {
  db.rows.clear(); db.upserts.length = 0; db.failSelect = false; db.slowFirst = false;
  useTaskerStore.setState({ jobs: [], loaded: false });
});

describe('tasker_jobs', () => {
  it('saves a job with its key columns and the whole job as data', async () => {
    useTaskerStore.getState().addJob(job());
    await flush();
    expect(db.upserts[0]).toMatchObject({ tenant_id: 't1', id: 'TJ-1', case_id: '7b0c4d2e-0000-4000-8000-000000000001', step_idx: 2, check_id: 'ck1', status: 'requested', tasker_id: 'tr-andre', work_order_local_id: null });
    expect((db.upserts[0].data as TaskerJob).title).toBe('Lobby bulb');
  });

  it('saves every change in order, so the table ends on the latest status even when a save is slow', async () => {
    db.slowFirst = true;
    useTaskerStore.getState().addJob(job());
    useTaskerStore.getState().updateJob('TJ-1', { status: 'scheduled', woId: 'WO-006' }, { who: 'TaskRabbit', text: 'Accepted' });
    useTaskerStore.getState().updateJob('TJ-1', { status: 'on-the-way' });
    await flush();
    expect(db.upserts.map(u => u.status)).toEqual(['on-the-way', 'on-the-way', 'on-the-way']);
    expect(db.rows.get('t1:TJ-1')).toMatchObject({ status: 'on-the-way', work_order_local_id: 'WO-006' });
  });

  it('loads the building\'s jobs, replacing what this browser had; a failed load keeps them', async () => {
    db.rows.set('t1:TJ-9', { tenant_id: 't1', id: 'TJ-9', data: job({ id: 'TJ-9', status: 'paid' }) });
    db.rows.set('t2:TJ-8', { tenant_id: 't2', id: 'TJ-8', data: job({ id: 'TJ-8' }) });
    useTaskerStore.setState({ jobs: [job({ id: 'TJ-stale' })] });
    await useTaskerStore.getState().load('t1');
    expect(useTaskerStore.getState().jobs.map(j => [j.id, j.status])).toEqual([['TJ-9', 'paid']]);
    expect(useTaskerStore.getState().loaded).toBe(true);

    db.failSelect = true;
    await useTaskerStore.getState().load('t1');
    expect(useTaskerStore.getState().jobs.map(j => j.id)).toEqual(['TJ-9']);
  });
});
