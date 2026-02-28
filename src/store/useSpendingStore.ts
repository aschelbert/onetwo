import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as spendingSvc from '@/lib/services/spending';
import type { SpendingApproval } from '@/lib/services/spending';

export type { SpendingApproval } from '@/lib/services/spending';

export interface FundingAnalysis {
  operatingBalance: number;
  operatingBudgetRemaining: number;
  reserveBalance: number;
  reservePercentFunded: number;
  totalUnits: number;
  perUnitCost: number;
  canFundFromOperating: boolean;
  canFundFromReserves: boolean;
  reserveImpactPct: number;       // how much reserves would drop if funded from reserves
  recommendation: string;          // plain-english recommendation
  options: FundingOption[];
}

export interface FundingOption {
  source: SpendingApproval['fundingSource'];
  label: string;
  available: boolean;
  impact: string;                  // plain-english impact description
  perUnit: number;
  recommended: boolean;
}

interface SpendingState {
  approvals: SpendingApproval[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addApproval: (a: Omit<SpendingApproval, 'id'>, tenantId?: string) => void;
  updateApproval: (id: string, updates: Partial<SpendingApproval>) => void;
  castVote: (id: string, member: string, vote: 'approve' | 'deny') => void;
  deleteApproval: (id: string) => void;
}

export const useSpendingStore = create<SpendingState>()(persist((set) => ({
  approvals: [
    { id: 'sa1', title: 'Lobby security camera replacement', description: 'Replace 4 aging lobby cameras with HD system', amount: 4200, category: 'maintenance', requestedBy: 'Jennifer Adams', status: 'pending', priority: 'normal', vendorName: 'SecureTech Solutions', workOrderId: '', votes: [], threshold: 5000, notes: 'Current cameras failing intermittently', decidedAt: '', fundingSource: 'operating', caseId: '' },
    { id: 'sa2', title: 'Emergency pipe repair — Unit 301', description: 'Burst pipe in unit 301 causing water damage to unit 201 below', amount: 3800, category: 'maintenance', requestedBy: 'Diane Carter', status: 'approved', priority: 'urgent', vendorName: 'Quick Fix Plumbing', workOrderId: '', votes: [{ member: 'Robert Mitchell', vote: 'approve', date: '2026-02-20' }, { member: 'Jennifer Adams', vote: 'approve', date: '2026-02-20' }, { member: 'David Chen', vote: 'approve', date: '2026-02-20' }], threshold: 5000, notes: 'Emergency approval via email vote', decidedAt: '2026-02-20', fundingSource: 'insurance', caseId: '' },
    { id: 'sa3', title: 'Elevator modernization — Phase 1', description: 'Replace elevator control panel and door operators in elevator #1. Building has 2 elevators; phase 2 planned for next fiscal year.', amount: 85000, category: 'capital', requestedBy: 'Robert Mitchell', status: 'pending', priority: 'normal', vendorName: '', workOrderId: '', votes: [], threshold: 5000, notes: 'Reserve study item — elevator #1 past useful life. Phasing reduces per-unit impact.', decidedAt: '', fundingSource: 'reserves', caseId: '' },
  ],

  loadFromDb: async (tenantId: string) => {
    const approvals = await spendingSvc.fetchApprovals(tenantId);
    if (approvals) set({ approvals });
  },

  addApproval: (a, tenantId?) => {
    const id = 'sa' + Date.now();
    set(s => ({ approvals: [{ id, ...a }, ...s.approvals] }));
    if (isBackendEnabled && tenantId) {
      spendingSvc.createApproval(tenantId, a).then(dbRow => {
        if (dbRow) set(s => ({ approvals: s.approvals.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateApproval: (id, updates) => {
    set(s => ({ approvals: s.approvals.map(a => a.id === id ? { ...a, ...updates } : a) }));
    if (isBackendEnabled) spendingSvc.updateApproval(id, updates);
  },

  castVote: (id, member, vote) => {
    set(s => ({
      approvals: s.approvals.map(a => {
        if (a.id !== id) return a;
        const newVotes = [...a.votes.filter(v => v.member !== member), { member, vote, date: new Date().toISOString().split('T')[0] }];
        const approves = newVotes.filter(v => v.vote === 'approve').length;
        const denies = newVotes.filter(v => v.vote === 'deny').length;
        const newStatus = approves >= 3 ? 'approved' : denies >= 3 ? 'denied' : a.status;
        const decidedAt = newStatus !== a.status && newStatus !== 'pending' ? new Date().toISOString().split('T')[0] : a.decidedAt;
        return { ...a, votes: newVotes, status: newStatus, decidedAt };
      })
    }));
    if (isBackendEnabled) {
      const a = useSpendingStore.getState().approvals.find(x => x.id === id);
      if (a) spendingSvc.updateApproval(id, { votes: a.votes, status: a.status, decidedAt: a.decidedAt });
    }
  },

  deleteApproval: (id) => {
    set(s => ({ approvals: s.approvals.filter(a => a.id !== id) }));
    if (isBackendEnabled) spendingSvc.deleteApproval(id);
  },
}), {
  name: 'onetwo-spending',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
