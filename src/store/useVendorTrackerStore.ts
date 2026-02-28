import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as vendorSvc from '@/lib/services/vendorTracker';
import type { VendorBid, VendorReview, VendorContract } from '@/lib/services/vendorTracker';

export type { VendorBid, VendorReview, VendorContract } from '@/lib/services/vendorTracker';

interface VendorTrackerState {
  bids: VendorBid[];
  reviews: VendorReview[];
  contracts: VendorContract[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addBid: (bid: Omit<VendorBid, 'id'>, tenantId?: string) => void;
  updateBid: (id: string, updates: Partial<VendorBid>) => void;
  deleteBid: (id: string) => void;
  addReview: (review: Omit<VendorReview, 'id'>, tenantId?: string) => void;
  deleteReview: (id: string) => void;
  addContract: (contract: Omit<VendorContract, 'id'>, tenantId?: string) => void;
  updateContract: (id: string, updates: Partial<VendorContract>) => void;
  deleteContract: (id: string) => void;
}

export const useVendorTrackerStore = create<VendorTrackerState>()(persist((set) => ({
  bids: [
    { id: 'vb1', vendorId: 'v4', vendorName: 'Metro Elevator Co', project: 'Elevator Modernization', amount: 82000, status: 'pending', submittedDate: '2026-02-15', notes: 'Includes cab interior upgrade', attachments: [] },
    { id: 'vb2', vendorId: '', vendorName: 'Schindler Elevator Corp', project: 'Elevator Modernization', amount: 91500, status: 'pending', submittedDate: '2026-02-18', notes: 'Premium package with 5-year warranty', attachments: [] },
    { id: 'vb3', vendorId: '', vendorName: 'KONE Inc', project: 'Elevator Modernization', amount: 78500, status: 'pending', submittedDate: '2026-02-20', notes: 'Basic modernization, 3-year warranty', attachments: [] },
  ],
  reviews: [
    { id: 'vr1', vendorId: 'v1', vendorName: 'Green Thumb Landscaping', rating: 4, review: 'Consistent and reliable. Responsive to special requests.', reviewer: 'Jennifer Adams', date: '2026-01-15' },
    { id: 'vr2', vendorId: 'v2', vendorName: 'Cool Air Services', rating: 5, review: 'Excellent annual maintenance. Quick response for emergency HVAC repair in December.', reviewer: 'Jennifer Adams', date: '2026-01-20' },
  ],
  contracts: [
    { id: 'vc1', vendorId: 'v1', vendorName: 'Green Thumb Landscaping', title: 'Monthly Landscaping Service', startDate: '2025-01-01', endDate: '2026-12-31', amount: 7800, status: 'active', autoRenew: true, attachments: [], notes: '$650/mo. Includes seasonal plantings.' },
    { id: 'vc2', vendorId: 'v2', vendorName: 'Cool Air Services', title: 'Annual HVAC Maintenance', startDate: '2025-06-01', endDate: '2026-05-31', amount: 3200, status: 'active', autoRenew: true, attachments: [], notes: 'Includes 2 seasonal inspections.' },
  ],

  loadFromDb: async (tenantId: string) => {
    const [bids, reviews, contracts] = await Promise.all([
      vendorSvc.fetchBids(tenantId),
      vendorSvc.fetchReviews(tenantId),
      vendorSvc.fetchContracts(tenantId),
    ]);
    const updates: Partial<VendorTrackerState> = {};
    if (bids) updates.bids = bids;
    if (reviews) updates.reviews = reviews;
    if (contracts) updates.contracts = contracts;
    if (Object.keys(updates).length > 0) set(updates);
  },

  addBid: (bid, tenantId?) => {
    const id = 'vb' + Date.now();
    set(s => ({ bids: [{ id, ...bid }, ...s.bids] }));
    if (isBackendEnabled && tenantId) {
      vendorSvc.createBid(tenantId, bid).then(dbRow => {
        if (dbRow) set(s => ({ bids: s.bids.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateBid: (id, updates) => {
    set(s => ({ bids: s.bids.map(b => b.id === id ? { ...b, ...updates } : b) }));
    if (isBackendEnabled) vendorSvc.updateBid(id, updates);
  },

  deleteBid: (id) => {
    set(s => ({ bids: s.bids.filter(b => b.id !== id) }));
    if (isBackendEnabled) vendorSvc.deleteBid(id);
  },

  addReview: (review, tenantId?) => {
    const id = 'vr' + Date.now();
    set(s => ({ reviews: [{ id, ...review }, ...s.reviews] }));
    if (isBackendEnabled && tenantId) {
      vendorSvc.createReview(tenantId, review).then(dbRow => {
        if (dbRow) set(s => ({ reviews: s.reviews.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  deleteReview: (id) => {
    set(s => ({ reviews: s.reviews.filter(r => r.id !== id) }));
    if (isBackendEnabled) vendorSvc.deleteReview(id);
  },

  addContract: (contract, tenantId?) => {
    const id = 'vc' + Date.now();
    set(s => ({ contracts: [{ id, ...contract }, ...s.contracts] }));
    if (isBackendEnabled && tenantId) {
      vendorSvc.createContract(tenantId, contract).then(dbRow => {
        if (dbRow) set(s => ({ contracts: s.contracts.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateContract: (id, updates) => {
    set(s => ({ contracts: s.contracts.map(c => c.id === id ? { ...c, ...updates } : c) }));
    if (isBackendEnabled) vendorSvc.updateContract(id, updates);
  },

  deleteContract: (id) => {
    set(s => ({ contracts: s.contracts.filter(c => c.id !== id) }));
    if (isBackendEnabled) vendorSvc.deleteContract(id);
  },
}), {
  name: 'onetwo-vendor-tracker',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
