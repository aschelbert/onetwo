import { beforeEach, describe, expect, it, vi } from 'vitest';

// The database, as the work order service sees it: one row per work order, and every write in the order it lands.
const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  writes: [] as string[],
  // How long each write takes, by its kind: the invoice is slow, so without ordering it lands after the payment.
  delay: { insert: 20, approved: 0, invoiced: 40, paid: 0 } as Record<string, number>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isBackendEnabled: true,
  getActiveTenantId: () => 't1',
  setActiveTenantId: () => {},
  logDbError: () => {},
}));

vi.mock('@/lib/services/financial', async (orig) => {
  const real = await orig<typeof import('@/lib/services/financial')>();
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  return {
    ...real,
    createWorkOrder: async (_t: string, wo: { id: string; status: string }) => {
      await wait(db.delay.insert);
      db.rows.set(wo.id, { ...wo });
      db.writes.push(`insert:${wo.status}`);
      return true;
    },
    updateWorkOrderByLocalId: async (_t: string, id: string, wo: { status: string; paidDate: string | null }) => {
      await wait(db.delay[wo.status] ?? 0);
      // An update before the insert lands finds no row and changes nothing, like the real one.
      if (!db.rows.has(id)) { db.writes.push(`missed:${wo.status}`); return true; }
      db.rows.set(id, { ...db.rows.get(id), ...wo });
      db.writes.push(`update:${wo.status}`);
      return true;
    },
    // The ledger's own writes are not under test here.
    createGLEntry: async () => true,
    upsertFinancialSettings: async () => true,
  };
});

import { useFinancialStore, queueWorkOrderWrite } from '@/store/useFinancialStore';

const settle = () => new Promise(r => setTimeout(r, 150));

beforeEach(() => {
  db.rows.clear(); db.writes.length = 0;
  useFinancialStore.setState({ tenantId: 't1', workOrders: [], generalLedger: [], closedThrough: null });
});

describe('work order writes', () => {
  it('a bill invoiced and paid back to back ends paid in the database', async () => {
    const s = useFinancialStore.getState();
    s.createWorkOrder({ title: 'Lobby bulb', vendor: 'TaskRabbit · Andre R.', amount: 58, acctNum: '5010', caseId: 'c1' });
    const id = useFinancialStore.getState().workOrders[0].id;
    useFinancialStore.getState().approveWorkOrder(id);
    useFinancialStore.getState().receiveInvoice(id, 'TR-1', 130);
    useFinancialStore.getState().payWorkOrder(id);
    await settle();
    expect(db.writes).toEqual(['insert:paid', 'update:paid', 'update:paid', 'update:paid']);
    expect(db.rows.get(id)).toMatchObject({ status: 'paid', amount: 130, invoiceNum: 'TR-1' });
    expect(db.rows.get(id)?.paidDate).toBeTruthy();
    expect(db.rows.get(id)?.glEntryId).toBeTruthy();
  });

  it('never sends a change before its insert has landed', async () => {
    useFinancialStore.getState().createWorkOrder({ title: 'Rack', vendor: 'Apex', amount: 90, acctNum: '5010' });
    const id = useFinancialStore.getState().workOrders[0].id;
    useFinancialStore.getState().approveWorkOrder(id);
    await settle();
    expect(db.writes.some(w => w.startsWith('missed'))).toBe(false);
    expect(db.rows.get(id)).toMatchObject({ status: 'approved' });
  });

  it('keeps going after a write fails', async () => {
    const order: string[] = [];
    queueWorkOrderWrite('WO-X', async () => { order.push('a'); throw new Error('network'); });
    await queueWorkOrderWrite('WO-X', async () => { order.push('b'); });
    expect(order).toEqual(['a', 'b']);
  });

  it('writes for different work orders don\'t wait on each other', async () => {
    const order: string[] = [];
    const slow = queueWorkOrderWrite('WO-A', () => new Promise(r => setTimeout(() => { order.push('A'); r(true); }, 40)));
    const fast = queueWorkOrderWrite('WO-B', async () => { order.push('B'); });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['B', 'A']);
  });
});
