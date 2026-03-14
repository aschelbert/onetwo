import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

interface FeeScheduleState {
  fees: FeeScheduleItem[];
  getFees: () => FeeScheduleItem[];
  getFeesByCategory: (cat: FeeScheduleItem['category']) => FeeScheduleItem[];
  getFee: (id: string) => FeeScheduleItem | undefined;
  getFeeByName: (name: string) => FeeScheduleItem | undefined;
  addFee: (fee: Omit<FeeScheduleItem, 'id' | 'isDefault'>) => void;
  updateFee: (id: string, updates: Partial<Omit<FeeScheduleItem, 'id' | 'isDefault'>>) => void;
  removeFee: (id: string) => void;
  toggleFee: (id: string) => void;
}

// ─── Default Seed Data ──────────────────────────
const defaultFees: FeeScheduleItem[] = [
  {
    id: 'fee-late',
    name: 'Late Fee',
    category: 'assessment',
    amount: 25,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Fee assessed when monthly HOA assessment payment is received after the grace period.',
    authority: 'Bylaws Section 7.2',
    glAccount: '4030',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-move-in',
    name: 'Move-In Deposit',
    category: 'move',
    amount: 250,
    amountType: 'flat',
    frequency: 'one-time',
    description: 'Refundable deposit required prior to move-in to cover potential damage to common areas.',
    authority: 'House Rules Section 4',
    glAccount: '4050',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-move-out',
    name: 'Move-Out Deposit',
    category: 'move',
    amount: 250,
    amountType: 'flat',
    frequency: 'one-time',
    description: 'Refundable deposit required prior to move-out to cover potential damage to common areas.',
    authority: 'House Rules Section 4',
    glAccount: '4050',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-amenity',
    name: 'Amenity Rental Fee',
    category: 'amenity',
    amount: 0,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Fee for reserving common area amenities (party room, rooftop, etc.). Amount varies by amenity.',
    authority: 'House Rules Section 6',
    glAccount: '4060',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-violation-1st',
    name: 'Violation Fine - 1st Offense',
    category: 'violation',
    amount: 50,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Fine for first documented violation of association rules or covenants.',
    authority: 'DC Code 29-910.01',
    glAccount: '4070',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-violation-2nd',
    name: 'Violation Fine - 2nd Offense',
    category: 'violation',
    amount: 100,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Fine for second documented violation of the same rule within 12 months.',
    authority: 'DC Code 29-910.01',
    glAccount: '4070',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-violation-3rd',
    name: 'Violation Fine - 3rd+ Offense',
    category: 'violation',
    amount: 200,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Fine for third or subsequent violations of the same rule within 12 months.',
    authority: 'DC Code 29-910.01',
    glAccount: '4070',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-violation-recurring',
    name: 'Recurring Violation Fine',
    category: 'violation',
    amount: 50,
    amountType: 'flat',
    frequency: 'daily',
    description: 'Ongoing fine for unresolved violations after hearing, assessed daily or weekly as determined by the board.',
    authority: 'DC Code 29-910.01',
    glAccount: '4070',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-resale-cert',
    name: 'Resale/Estoppel Certificate Fee',
    category: 'administrative',
    amount: 100,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Processing fee for issuing a resale certificate or estoppel letter for unit sale or refinance.',
    authority: 'DC Condominium Act',
    glAccount: '4050',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-arch-review',
    name: 'Architectural Review Deposit',
    category: 'administrative',
    amount: 500,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Refundable deposit for architectural modification requests, applied toward review and inspection costs.',
    authority: 'Bylaws Section 9',
    glAccount: '4050',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-lien-recording',
    name: 'Lien Recording Fee',
    category: 'legal',
    amount: 35,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'County recorder fee for filing a lien against a delinquent unit, passed through to the unit owner.',
    authority: 'DC Code 42-1903.13',
    glAccount: '4050',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-lien-release',
    name: 'Lien Release Recording Fee',
    category: 'legal',
    amount: 35,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'County recorder fee for releasing a previously filed lien after balance is paid.',
    authority: 'DC Code 42-1903.13',
    glAccount: '4050',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-nsf',
    name: 'Returned Check / NSF Fee',
    category: 'assessment',
    amount: 35,
    amountType: 'flat',
    frequency: 'per-occurrence',
    description: 'Fee for payments returned due to insufficient funds or closed account.',
    authority: 'Bylaws Section 7',
    glAccount: '4030',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-interest',
    name: 'Interest on Unpaid Balance',
    category: 'assessment',
    amount: 1.5,
    amountType: 'percentage',
    frequency: 'monthly',
    description: 'Monthly interest charged on unpaid assessment balances after the grace period.',
    authority: 'DC Code 42-1903.13(a)',
    glAccount: '4040',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'fee-special-assessment',
    name: 'Special Assessment',
    category: 'assessment',
    amount: 0,
    amountType: 'flat',
    frequency: 'one-time',
    description: 'One-time assessment levied by the board for capital improvements or emergency expenses. Amount set per resolution.',
    authority: 'Bylaws Section 5',
    glAccount: '4020',
    enabled: true,
    isDefault: true,
  },
];

// ─── Store ──────────────────────────────────────
export const useFeeScheduleStore = create<FeeScheduleState>()(persist((set, get) => ({
  fees: defaultFees,

  getFees: () => get().fees,

  getFeesByCategory: (cat) => get().fees.filter(f => f.category === cat),

  getFee: (id) => get().fees.find(f => f.id === id),

  getFeeByName: (name) => get().fees.find(f => f.name === name),

  addFee: (fee) => {
    const id = 'fee-' + Date.now();
    set(s => ({
      fees: [...s.fees, { ...fee, id, isDefault: false }],
    }));
  },

  updateFee: (id, updates) => {
    set(s => ({
      fees: s.fees.map(f => f.id === id ? { ...f, ...updates } : f),
    }));
  },

  removeFee: (id) => {
    const fee = get().fees.find(f => f.id === id);
    if (fee?.isDefault) return; // default fees can't be removed
    set(s => ({
      fees: s.fees.filter(f => f.id !== id),
    }));
  },

  toggleFee: (id) => {
    set(s => ({
      fees: s.fees.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f),
    }));
  },
}), {
  name: 'onetwo-fee-schedule',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
