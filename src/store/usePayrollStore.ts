import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFinancialStore } from './useFinancialStore';
import { supabase } from '@/lib/supabase';

/* ── Types ─────────────────────────────────────────────────── */

export interface StaffMember {
  id: string;
  name: string;
  type: 'employee' | 'contractor';
  role: string;
  rate: number;
  email: string;
  phone: string;
  taxId: string;        // masked e.g. "***-**-1234"
  startDate: string;
  status: 'active' | 'inactive';
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
}

export interface TimeEntry {
  id: string;
  staffId: string;
  date: string;
  hours: number;
  description: string;
}

export interface PayRun {
  id: string;
  staffId: string;
  periodStart: string;
  periodEnd: string;
  hoursWorked: number;
  grossPay: number;
  deductions: number;
  withholdingPct: number;
  netPay: number;
  status: 'draft' | 'processing' | 'paid' | 'failed';
  paidDate: string | null;
  glEntryId: string | null;
  paymentMethod: 'stripe' | 'manual' | null;
  stripeTransferId: string | null;
  withholdingGlEntryId: string | null;
}

export interface Form1099 {
  id: string;
  staffId: string;
  year: number;
  totalCompensation: number;
  status: 'draft' | 'generated' | 'sent';
  generatedDate: string | null;
  sentDate: string | null;
}

/* ── Seed data ─────────────────────────────────────────────── */

const seedStaff: StaffMember[] = [
  { id: 'staff1', name: 'Carlos Mendez', type: 'employee', role: 'Superintendent', rate: 32, email: 'carlos.m@example.com', phone: '202-555-0601', taxId: '***-**-4821', startDate: '2023-03-15', status: 'active', stripeAccountId: null, stripeOnboardingComplete: false },
  { id: 'staff2', name: 'Bright Shine Cleaning LLC', type: 'contractor', role: 'Cleaning Service', rate: 45, email: 'info@brightshine.com', phone: '202-555-0602', taxId: '***-**-7733', startDate: '2024-01-10', status: 'active', stripeAccountId: null, stripeOnboardingComplete: false },
  { id: 'staff3', name: 'Tony Russo', type: 'contractor', role: 'Handyman', rate: 55, email: 'tony.r@example.com', phone: '202-555-0603', taxId: '***-**-9156', startDate: '2024-06-01', status: 'active', stripeAccountId: null, stripeOnboardingComplete: false },
];

const seedTimeEntries: TimeEntry[] = [
  // Carlos – Jan 2026
  { id: 'te1', staffId: 'staff1', date: '2026-01-06', hours: 8, description: 'Building walkthrough & maintenance checks' },
  { id: 'te2', staffId: 'staff1', date: '2026-01-13', hours: 8, description: 'Plumbing coordination, vendor meetings' },
  { id: 'te3', staffId: 'staff1', date: '2026-01-20', hours: 8, description: 'HVAC filter replacements all floors' },
  { id: 'te4', staffId: 'staff1', date: '2026-01-27', hours: 8, description: 'Snow removal & salt application' },
  // Bright Shine – Jan 2026
  { id: 'te5', staffId: 'staff2', date: '2026-01-10', hours: 6, description: 'Common area deep clean' },
  { id: 'te6', staffId: 'staff2', date: '2026-01-24', hours: 6, description: 'Lobby & hallway cleaning' },
  // Tony – Jan 2026
  { id: 'te7', staffId: 'staff3', date: '2026-01-15', hours: 4, description: 'Unit 302 door repair' },
  { id: 'te8', staffId: 'staff3', date: '2026-01-29', hours: 3, description: 'Parking gate adjustment' },
  // Carlos – Feb 2026
  { id: 'te9', staffId: 'staff1', date: '2026-02-03', hours: 8, description: 'Roof leak emergency response' },
  { id: 'te10', staffId: 'staff1', date: '2026-02-10', hours: 8, description: 'Fire safety equipment inspection' },
  // Bright Shine – Feb 2026
  { id: 'te11', staffId: 'staff2', date: '2026-02-07', hours: 6, description: 'Bi-weekly common area clean' },
  // Tony – Feb 2026
  { id: 'te12', staffId: 'staff3', date: '2026-02-12', hours: 5, description: 'Mailbox lock replacements' },
];

const seedPayRuns: PayRun[] = [
  // Carlos – Jan 2026: 32 hrs × $32 = $1024, 22% withholding = $225.28, net = $798.72
  { id: 'pr1', staffId: 'staff1', periodStart: '2026-01-01', periodEnd: '2026-01-31', hoursWorked: 32, grossPay: 1024, deductions: 225.28, withholdingPct: 22, netPay: 798.72, status: 'paid', paidDate: '2026-02-01', glEntryId: null, paymentMethod: 'manual', stripeTransferId: null, withholdingGlEntryId: null },
  // Bright Shine – Jan 2026: 12 hrs × $45 = $540, 0% = $0, net = $540
  { id: 'pr2', staffId: 'staff2', periodStart: '2026-01-01', periodEnd: '2026-01-31', hoursWorked: 12, grossPay: 540, deductions: 0, withholdingPct: 0, netPay: 540, status: 'paid', paidDate: '2026-02-01', glEntryId: null, paymentMethod: 'manual', stripeTransferId: null, withholdingGlEntryId: null },
  // Tony – Jan 2026: 7 hrs × $55 = $385, 0% = $0, net = $385
  { id: 'pr3', staffId: 'staff3', periodStart: '2026-01-01', periodEnd: '2026-01-31', hoursWorked: 7, grossPay: 385, deductions: 0, withholdingPct: 0, netPay: 385, status: 'paid', paidDate: '2026-02-01', glEntryId: null, paymentMethod: 'manual', stripeTransferId: null, withholdingGlEntryId: null },
];

/* ── Store ──────────────────────────────────────────────────── */

interface PayrollState {
  staff: StaffMember[];
  timeEntries: TimeEntry[];
  payRuns: PayRun[];
  form1099s: Form1099[];

  // Staff CRUD
  addStaff: (s: Omit<StaffMember, 'id'>) => void;
  updateStaff: (id: string, u: Partial<StaffMember>) => void;
  updateStaffStripe: (staffId: string, stripeAccountId: string, onboardingComplete: boolean) => void;

  // Time entries
  addTimeEntry: (e: Omit<TimeEntry, 'id'>) => void;
  updateTimeEntry: (id: string, u: Partial<TimeEntry>) => void;
  deleteTimeEntry: (id: string) => void;

  // Pay runs
  createPayRun: (staffId: string, periodStart: string, periodEnd: string) => PayRun;
  processPayRun: (id: string, paymentMethod: 'stripe' | 'manual') => Promise<void>;

  // 1099s
  generate1099: (staffId: string, year: number) => void;
  markSent: (id: string) => void;
}

export const usePayrollStore = create<PayrollState>()(persist((set, get) => ({
  staff: seedStaff,
  timeEntries: seedTimeEntries,
  payRuns: seedPayRuns,
  form1099s: [],

  /* ── Staff ─────────────────────────── */

  addStaff: (s) => {
    const id = 'staff' + Date.now();
    set(st => ({ staff: [...st.staff, { id, ...s }] }));
  },

  updateStaff: (id, u) => {
    set(st => ({ staff: st.staff.map(s => s.id === id ? { ...s, ...u } : s) }));
  },

  updateStaffStripe: (staffId, stripeAccountId, onboardingComplete) => {
    set(st => ({
      staff: st.staff.map(s =>
        s.id === staffId ? { ...s, stripeAccountId, stripeOnboardingComplete: onboardingComplete } : s
      ),
    }));
  },

  /* ── Time entries ──────────────────── */

  addTimeEntry: (e) => {
    const id = 'te' + Date.now();
    set(st => ({ timeEntries: [...st.timeEntries, { id, ...e }] }));
  },

  updateTimeEntry: (id, u) => {
    set(st => ({ timeEntries: st.timeEntries.map(e => e.id === id ? { ...e, ...u } : e) }));
  },

  deleteTimeEntry: (id) => {
    set(st => ({ timeEntries: st.timeEntries.filter(e => e.id !== id) }));
  },

  /* ── Pay runs ──────────────────────── */

  createPayRun: (staffId, periodStart, periodEnd) => {
    const state = get();
    const member = state.staff.find(s => s.id === staffId)!;
    const entries = state.timeEntries.filter(e =>
      e.staffId === staffId && e.date >= periodStart && e.date <= periodEnd
    );
    const hoursWorked = entries.reduce((sum, e) => sum + e.hours, 0);
    const grossPay = Math.round(hoursWorked * member.rate * 100) / 100;
    const withholdingPct = member.type === 'employee' ? 22 : 0;
    const deductions = Math.round(grossPay * withholdingPct / 100 * 100) / 100;
    const netPay = Math.round((grossPay - deductions) * 100) / 100;

    const pr: PayRun = {
      id: 'pr' + Date.now(),
      staffId,
      periodStart,
      periodEnd,
      hoursWorked,
      grossPay,
      deductions,
      withholdingPct,
      netPay,
      status: 'draft',
      paidDate: null,
      glEntryId: null,
      paymentMethod: null,
      stripeTransferId: null,
      withholdingGlEntryId: null,
    };
    set(st => ({ payRuns: [...st.payRuns, pr] }));
    return pr;
  },

  processPayRun: async (id, paymentMethod) => {
    const state = get();
    const pr = state.payRuns.find(p => p.id === id);
    if (!pr || pr.status === 'paid' || pr.status === 'processing') return;

    const member = state.staff.find(s => s.id === pr.staffId)!;
    const today = new Date().toISOString().slice(0, 10);

    // Set status to processing immediately
    set(st => ({
      payRuns: st.payRuns.map(p =>
        p.id === id ? { ...p, status: 'processing' as const, paymentMethod } : p
      ),
    }));

    const glPost = useFinancialStore.getState().glPost;
    let glEntryId: string | null = null;
    let withholdingGlEntryId: string | null = null;

    if (pr.withholdingPct > 0) {
      // Employee with withholding: 2 GL entries
      // 1) Debit 5200 (Wages), Credit 2040 (Withholding Payable) for grossPay
      const accrualEntry = glPost(
        today,
        `Payroll accrual — ${member.name} (${pr.periodStart} to ${pr.periodEnd})`,
        '5200',
        '2040',
        pr.grossPay,
        'payroll',
        pr.id,
      );
      withholdingGlEntryId = accrualEntry.id;

      // 2) Debit 2040, Credit 1010 (Operating Cash) for netPay
      const payEntry = glPost(
        today,
        `Payroll payment — ${member.name} (${pr.periodStart} to ${pr.periodEnd})`,
        '2040',
        '1010',
        pr.netPay,
        'payroll',
        pr.id,
      );
      glEntryId = payEntry.id;
    } else {
      // Contractor (0% withholding): 1 GL entry
      // Debit 5210 (Contract Services), Credit 1010 for netPay
      const entry = glPost(
        today,
        `Payroll — ${member.name} (${pr.periodStart} to ${pr.periodEnd})`,
        '5210',
        '1010',
        pr.netPay,
        'payroll',
        pr.id,
      );
      glEntryId = entry.id;
    }

    // Handle Stripe payment if selected and staff has connected account
    if (paymentMethod === 'stripe' && member.stripeAccountId && member.stripeOnboardingComplete && supabase) {
      try {
        const { data, error } = await supabase.functions.invoke('staff-payment', {
          body: {
            action: 'process_payment',
            stripeAccountId: member.stripeAccountId,
            amount: pr.netPay,
            staffName: member.name,
            payRunId: pr.id,
            periodStart: pr.periodStart,
            periodEnd: pr.periodEnd,
          },
        });

        if (error || !data?.transferId) {
          set(st => ({
            payRuns: st.payRuns.map(p =>
              p.id === id ? { ...p, status: 'failed' as const, glEntryId, withholdingGlEntryId } : p
            ),
          }));
          return;
        }

        set(st => ({
          payRuns: st.payRuns.map(p =>
            p.id === id ? { ...p, status: 'paid' as const, paidDate: today, glEntryId, withholdingGlEntryId, stripeTransferId: data.transferId } : p
          ),
        }));
      } catch {
        set(st => ({
          payRuns: st.payRuns.map(p =>
            p.id === id ? { ...p, status: 'failed' as const, glEntryId, withholdingGlEntryId } : p
          ),
        }));
      }
    } else {
      // Manual payment — mark paid after GL posting
      set(st => ({
        payRuns: st.payRuns.map(p =>
          p.id === id ? { ...p, status: 'paid' as const, paidDate: today, glEntryId, withholdingGlEntryId } : p
        ),
      }));
    }
  },

  /* ── 1099s ─────────────────────────── */

  generate1099: (staffId, year) => {
    const state = get();
    const paidRuns = state.payRuns.filter(
      pr => pr.staffId === staffId && pr.status === 'paid' &&
        pr.periodStart.startsWith(String(year))
    );
    const totalCompensation = paidRuns.reduce((sum, pr) => sum + pr.grossPay, 0);
    const today = new Date().toISOString().slice(0, 10);

    const existing = state.form1099s.find(f => f.staffId === staffId && f.year === year);
    if (existing) {
      set(st => ({
        form1099s: st.form1099s.map(f =>
          f.id === existing.id
            ? { ...f, totalCompensation, status: 'generated' as const, generatedDate: today }
            : f
        ),
      }));
    } else {
      set(st => ({
        form1099s: [...st.form1099s, {
          id: '1099-' + Date.now(),
          staffId,
          year,
          totalCompensation,
          status: 'generated',
          generatedDate: today,
          sentDate: null,
        }],
      }));
    }
  },

  markSent: (id) => {
    const today = new Date().toISOString().slice(0, 10);
    set(st => ({
      form1099s: st.form1099s.map(f =>
        f.id === id ? { ...f, status: 'sent' as const, sentDate: today } : f
      ),
    }));
  },
}), {
  name: 'onetwo-payroll',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
