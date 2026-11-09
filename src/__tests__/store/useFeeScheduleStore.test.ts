/**
 * The fee schedule is the building's, not the browser's: a building with no
 * rows gets the defaults written once, a building with rows shows them, and
 * every edit writes through. The late fee is never a row; it reads from
 * Billing rules next to the schedule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFees, lateFeeAsScheduleItem, LATE_FEE_ROW_ID, useFeeScheduleStore, type FeeScheduleItem } from '@/store/useFeeScheduleStore';
import * as feeSvc from '@/lib/services/feeSchedule';

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  isBackendEnabled: true,
  getActiveTenantId: () => null,
}));
vi.mock('@/lib/services/feeSchedule', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/feeSchedule')>()),
  fetchFees: vi.fn(),
  upsertFees: vi.fn(async () => true),
  upsertFee: vi.fn(async () => true),
  deleteFee: vi.fn(async () => true),
}));

const TENANT = '00000000-0000-4000-8000-000000000002';
const own: FeeScheduleItem = { id: 'fee-pool', name: 'Pool key', category: 'amenity', amount: 40, amountType: 'flat', frequency: 'one-time', description: '', authority: '', glAccount: '4060', enabled: true, isDefault: false, sortOrder: 0 };

beforeEach(() => {
  vi.mocked(feeSvc.upsertFees).mockClear(); vi.mocked(feeSvc.upsertFee).mockClear(); vi.mocked(feeSvc.deleteFee).mockClear();
  useFeeScheduleStore.getState().reset();
});

describe('defaults', () => {
  it('has no late fee row; the late fee reads from Billing rules', () => {
    expect(defaultFees.some(f => f.id === LATE_FEE_ROW_ID || /late/i.test(f.name))).toBe(false);
    const late = lateFeeAsScheduleItem({ lateFeeEnabled: true, lateFeeAmount: 35, lateFeeGraceDays: 10 });
    expect(late).toMatchObject({ id: LATE_FEE_ROW_ID, amount: 35, enabled: true, glAccount: '4030' });
    expect(late.description).toContain('10 days');
  });
});

describe('loading a building', () => {
  it('with no schedule: keeps the defaults and writes them once', async () => {
    vi.mocked(feeSvc.fetchFees).mockResolvedValue([]);
    await useFeeScheduleStore.getState().loadFromDb(TENANT);
    expect(useFeeScheduleStore.getState().fees.map(f => f.id)).toEqual(defaultFees.map(f => f.id));
    expect(feeSvc.upsertFees).toHaveBeenCalledTimes(1);
    expect(vi.mocked(feeSvc.upsertFees).mock.calls[0][0]).toBe(TENANT);
    expect(vi.mocked(feeSvc.upsertFees).mock.calls[0][1].length).toBe(defaultFees.length);
  });

  it('with a schedule: shows it as it is, dropping an old late-fee row, and writes nothing', async () => {
    vi.mocked(feeSvc.fetchFees).mockResolvedValue([{ ...own }, { ...own, id: LATE_FEE_ROW_ID, name: 'Late Fee' }]);
    await useFeeScheduleStore.getState().loadFromDb(TENANT);
    expect(useFeeScheduleStore.getState().fees).toEqual([own]);
    expect(feeSvc.upsertFees).not.toHaveBeenCalled();
  });

  it('that cannot be read: leaves the defaults showing', async () => {
    vi.mocked(feeSvc.fetchFees).mockResolvedValue(null);
    await useFeeScheduleStore.getState().loadFromDb(TENANT);
    expect(useFeeScheduleStore.getState().fees.length).toBe(defaultFees.length);
    expect(feeSvc.upsertFees).not.toHaveBeenCalled();
  });
});

describe('edits write through to the building', () => {
  beforeEach(async () => {
    vi.mocked(feeSvc.fetchFees).mockResolvedValue([{ ...own }]);
    await useFeeScheduleStore.getState().loadFromDb(TENANT);
  });

  it('adding a fee writes it with the next sort order', () => {
    useFeeScheduleStore.getState().addFee({ name: 'Gate remote', category: 'administrative', amount: 60, amountType: 'flat', frequency: 'one-time', description: '', authority: '', glAccount: '4050', enabled: true });
    const added = useFeeScheduleStore.getState().fees.find(f => f.name === 'Gate remote')!;
    expect(added.isDefault).toBe(false);
    expect(added.sortOrder).toBe(1);
    expect(feeSvc.upsertFee).toHaveBeenCalledWith(TENANT, added);
  });

  it('changing an amount and turning a fee off both write the whole row', () => {
    useFeeScheduleStore.getState().updateFee('fee-pool', { amount: 45 });
    expect(feeSvc.upsertFee).toHaveBeenLastCalledWith(TENANT, expect.objectContaining({ id: 'fee-pool', amount: 45 }));
    useFeeScheduleStore.getState().toggleFee('fee-pool');
    expect(feeSvc.upsertFee).toHaveBeenLastCalledWith(TENANT, expect.objectContaining({ id: 'fee-pool', enabled: false }));
  });

  it('removing a fee deletes its row; a default fee cannot be removed', () => {
    useFeeScheduleStore.getState().removeFee('fee-pool');
    expect(useFeeScheduleStore.getState().fees).toEqual([]);
    expect(feeSvc.deleteFee).toHaveBeenCalledWith(TENANT, 'fee-pool');
    useFeeScheduleStore.setState({ fees: [{ ...own, id: 'fee-nsf', isDefault: true }] });
    useFeeScheduleStore.getState().removeFee('fee-nsf');
    expect(useFeeScheduleStore.getState().fees.length).toBe(1);
    expect(feeSvc.deleteFee).toHaveBeenCalledTimes(1);
  });

  it('reset returns to the defaults for the next building', () => {
    useFeeScheduleStore.getState().reset();
    expect(useFeeScheduleStore.getState().fees.length).toBe(defaultFees.length);
    expect(useFeeScheduleStore.getState().tenantId).toBeNull();
  });
});
