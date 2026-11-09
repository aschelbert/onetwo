/**
 * The building's fee schedule: what the board may charge an owner and how
 * much (deposits, fines, certificates, interest, special assessments). One
 * row per fee in the `fee_schedule` table; a building with no rows yet gets
 * the defaults below, written to the database on first load (and by
 * migration 048's trigger for buildings created after it). Edits write
 * through, so every board member sees the same schedule.
 *
 * The late fee is not a row here. Billing rules (the financial store's
 * lateFeeEnabled, lateFeeAmount and lateFeeGraceDays, saved on
 * financial_settings) are its only home; `lateFeeAsScheduleItem` renders
 * it alongside the schedule wherever the two are listed together.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateLocalId } from '@/lib/generateId';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as feeSvc from '@/lib/services/feeSchedule';

// ─── Types ──────────────────────────────────────
export interface FeeScheduleItem {
  id: string;
  name: string;
  category: 'assessment' | 'administrative' | 'violation' | 'move' | 'amenity' | 'legal';
  amount: number;
  amountType: 'flat' | 'percentage';
  frequency: 'one-time' | 'monthly' | 'per-occurrence' | 'daily' | 'weekly';
  description: string;
  authority: string;
  glAccount: string;
  enabled: boolean;
  isDefault: boolean;
  /** Display order; defaults keep their order, added fees go last. */
  sortOrder?: number;
}

interface FeeScheduleState {
  fees: FeeScheduleItem[];
  /** The building the schedule was loaded for; writes go there. */
  tenantId: string | null;
  loadFromDb: (tenantId: string) => Promise<void>;
  /** Back to the defaults, for a building that has not loaded yet. */
  reset: () => void;
  getFees: () => FeeScheduleItem[];
  getFeesByCategory: (cat: FeeScheduleItem['category']) => FeeScheduleItem[];
  getFee: (id: string) => FeeScheduleItem | undefined;
  getFeeByName: (name: string) => FeeScheduleItem | undefined;
  addFee: (fee: Omit<FeeScheduleItem, 'id' | 'isDefault'>) => void;
  updateFee: (id: string, updates: Partial<Omit<FeeScheduleItem, 'id' | 'isDefault'>>) => void;
  removeFee: (id: string) => void;
  toggleFee: (id: string) => void;
}

/** The id the late fee had when it was a schedule row; dropped from any saved copy. */
export const LATE_FEE_ROW_ID = 'fee-late';

// ─── Defaults: the schedule a building starts with (mirrored by seed_fee_schedule, migration 048) ──
export const defaultFees: FeeScheduleItem[] = [
  { id: 'fee-move-in', name: 'Move-In Deposit', category: 'move', amount: 250, amountType: 'flat', frequency: 'one-time', description: 'Refundable deposit required prior to move-in to cover potential damage to common areas.', authority: 'House Rules Section 4', glAccount: '4050', enabled: true, isDefault: true, sortOrder: 0 },
  { id: 'fee-move-out', name: 'Move-Out Deposit', category: 'move', amount: 250, amountType: 'flat', frequency: 'one-time', description: 'Refundable deposit required prior to move-out to cover potential damage to common areas.', authority: 'House Rules Section 4', glAccount: '4050', enabled: true, isDefault: true, sortOrder: 1 },
  { id: 'fee-amenity', name: 'Amenity Rental Fee', category: 'amenity', amount: 0, amountType: 'flat', frequency: 'per-occurrence', description: 'Fee for reserving common area amenities (party room, rooftop, etc.). Amount varies by amenity.', authority: 'House Rules Section 6', glAccount: '4060', enabled: true, isDefault: true, sortOrder: 2 },
  { id: 'fee-violation-1st', name: 'Violation Fine - 1st Offense', category: 'violation', amount: 50, amountType: 'flat', frequency: 'per-occurrence', description: 'Fine for first documented violation of association rules or covenants.', authority: 'DC Code 29-910.01', glAccount: '4070', enabled: true, isDefault: true, sortOrder: 3 },
  { id: 'fee-violation-2nd', name: 'Violation Fine - 2nd Offense', category: 'violation', amount: 100, amountType: 'flat', frequency: 'per-occurrence', description: 'Fine for second documented violation of the same rule within 12 months.', authority: 'DC Code 29-910.01', glAccount: '4070', enabled: true, isDefault: true, sortOrder: 4 },
  { id: 'fee-violation-3rd', name: 'Violation Fine - 3rd+ Offense', category: 'violation', amount: 200, amountType: 'flat', frequency: 'per-occurrence', description: 'Fine for third or subsequent violations of the same rule within 12 months.', authority: 'DC Code 29-910.01', glAccount: '4070', enabled: true, isDefault: true, sortOrder: 5 },
  { id: 'fee-violation-recurring', name: 'Recurring Violation Fine', category: 'violation', amount: 50, amountType: 'flat', frequency: 'daily', description: 'Ongoing fine for unresolved violations after hearing, assessed daily or weekly as determined by the board.', authority: 'DC Code 29-910.01', glAccount: '4070', enabled: true, isDefault: true, sortOrder: 6 },
  { id: 'fee-resale-cert', name: 'Resale/Estoppel Certificate Fee', category: 'administrative', amount: 100, amountType: 'flat', frequency: 'per-occurrence', description: 'Processing fee for issuing a resale certificate or estoppel letter for unit sale or refinance.', authority: 'DC Condominium Act', glAccount: '4050', enabled: true, isDefault: true, sortOrder: 7 },
  { id: 'fee-arch-review', name: 'Architectural Review Deposit', category: 'administrative', amount: 500, amountType: 'flat', frequency: 'per-occurrence', description: 'Refundable deposit for architectural modification requests, applied toward review and inspection costs.', authority: 'Bylaws Section 9', glAccount: '4050', enabled: true, isDefault: true, sortOrder: 8 },
  { id: 'fee-lien-recording', name: 'Lien Recording Fee', category: 'legal', amount: 35, amountType: 'flat', frequency: 'per-occurrence', description: 'County recorder fee for filing a lien against a delinquent unit, passed through to the unit owner.', authority: 'DC Code 42-1903.13', glAccount: '4050', enabled: true, isDefault: true, sortOrder: 9 },
  { id: 'fee-lien-release', name: 'Lien Release Recording Fee', category: 'legal', amount: 35, amountType: 'flat', frequency: 'per-occurrence', description: 'County recorder fee for releasing a previously filed lien after balance is paid.', authority: 'DC Code 42-1903.13', glAccount: '4050', enabled: true, isDefault: true, sortOrder: 10 },
  { id: 'fee-nsf', name: 'Returned Check / NSF Fee', category: 'assessment', amount: 35, amountType: 'flat', frequency: 'per-occurrence', description: 'Fee for payments returned due to insufficient funds or closed account.', authority: 'Bylaws Section 7', glAccount: '4030', enabled: true, isDefault: true, sortOrder: 11 },
  { id: 'fee-interest', name: 'Interest on Unpaid Balance', category: 'assessment', amount: 1.5, amountType: 'percentage', frequency: 'monthly', description: 'Monthly interest charged on unpaid assessment balances after the grace period.', authority: 'DC Code 42-1903.13(a)', glAccount: '4040', enabled: true, isDefault: true, sortOrder: 12 },
  { id: 'fee-special-assessment', name: 'Special Assessment', category: 'assessment', amount: 0, amountType: 'flat', frequency: 'one-time', description: 'One-time assessment levied by the board for capital improvements or emergency expenses. Amount set per resolution.', authority: 'Bylaws Section 5', glAccount: '4020', enabled: true, isDefault: true, sortOrder: 13 },
];

/** The late fee as it reads next to the schedule: a view of Billing rules, never stored here. */
export function lateFeeAsScheduleItem(rules: { lateFeeEnabled: boolean; lateFeeAmount: number; lateFeeGraceDays: number }): FeeScheduleItem {
  return {
    id: LATE_FEE_ROW_ID, name: 'Late Fee', category: 'assessment', amount: rules.lateFeeAmount, amountType: 'flat', frequency: 'per-occurrence',
    description: `Charged on dues still unpaid ${rules.lateFeeGraceDays} days after the due date. Set under Billing rules.`,
    authority: '', glAccount: '4030', enabled: rules.lateFeeEnabled, isDefault: true, sortOrder: -1,
  };
}

const freshDefaults = () => defaultFees.map(f => ({ ...f }));
const nextOrder = (fees: FeeScheduleItem[]) => fees.reduce((m, f) => Math.max(m, f.sortOrder ?? 0), -1) + 1;

// ─── Store ──────────────────────────────────────
export const useFeeScheduleStore = create<FeeScheduleState>()(persist((set, get) => {
  const tenant = () => get().tenantId || getActiveTenantId();
  const write = (fee: FeeScheduleItem) => { const tid = tenant(); if (isBackendEnabled && tid) feeSvc.upsertFee(tid, fee); };
  return {
    fees: freshDefaults(),
    tenantId: null,

    loadFromDb: async (tenantId) => {
      set({ tenantId });
      const rows = await feeSvc.fetchFees(tenantId);
      if (!rows) return; // could not read: keep what is showing
      if (rows.length === 0) {
        // A building with no schedule yet starts from the defaults, written once so every browser sees the same list.
        const fees = freshDefaults();
        set({ fees });
        feeSvc.upsertFees(tenantId, fees);
        return;
      }
      set({ fees: rows.filter(f => f.id !== LATE_FEE_ROW_ID) });
    },

    reset: () => set({ fees: freshDefaults(), tenantId: null }),

    getFees: () => get().fees,
    getFeesByCategory: (cat) => get().fees.filter(f => f.category === cat),
    getFee: (id) => get().fees.find(f => f.id === id),
    getFeeByName: (name) => get().fees.find(f => f.name === name),

    addFee: (fee) => {
      const item: FeeScheduleItem = { ...fee, id: generateLocalId('fee-'), isDefault: false, sortOrder: nextOrder(get().fees) };
      set(s => ({ fees: [...s.fees, item] }));
      write(item);
    },

    updateFee: (id, updates) => {
      set(s => ({ fees: s.fees.map(f => f.id === id ? { ...f, ...updates } : f) }));
      const fee = get().fees.find(f => f.id === id);
      if (fee) write(fee);
    },

    removeFee: (id) => {
      const fee = get().fees.find(f => f.id === id);
      if (!fee || fee.isDefault) return; // default fees can be turned off, not removed
      set(s => ({ fees: s.fees.filter(f => f.id !== id) }));
      const tid = tenant();
      if (isBackendEnabled && tid) feeSvc.deleteFee(tid, id);
    },

    toggleFee: (id) => {
      set(s => ({ fees: s.fees.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f) }));
      const fee = get().fees.find(f => f.id === id);
      if (fee) write(fee);
    },
  };
}, {
  name: 'onetwo-fee-schedule',
  version: 3,
  partialize: (s) => ({ fees: s.fees }),
  // deno-lint-ignore no-explicit-any
  merge: (persisted: any, current: any) => {
    const saved = (persisted?.fees || []).filter((f: FeeScheduleItem) => f.id !== LATE_FEE_ROW_ID);
    return { ...current, fees: saved.length ? saved : current.fees };
  },
}));
