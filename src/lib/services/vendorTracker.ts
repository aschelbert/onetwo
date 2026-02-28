import { supabase } from '@/lib/supabase';

// ── Types ──

export interface VendorBid {
  id: string;
  vendorId: string;
  vendorName: string;
  project: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected';
  submittedDate: string;
  notes: string;
  attachments: Array<{ name: string; size: string }>;
}

export interface VendorReview {
  id: string;
  vendorId: string;
  vendorName: string;
  rating: number;
  review: string;
  reviewer: string;
  date: string;
}

export interface VendorContract {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  startDate: string;
  endDate: string;
  amount: number;
  status: 'active' | 'expired' | 'pending';
  autoRenew: boolean;
  attachments: Array<{ name: string; size: string }>;
  notes: string;
}

// ── Row converters: Bids ──

function rowToBid(r: Record<string, unknown>): VendorBid {
  return {
    id: r.id as string,
    vendorId: r.vendor_id as string,
    vendorName: r.vendor_name as string,
    project: r.project as string,
    amount: r.amount as number,
    status: r.status as VendorBid['status'],
    submittedDate: r.submitted_date as string,
    notes: r.notes as string,
    attachments: (r.attachments || []) as VendorBid['attachments'],
  };
}

function bidToRow(b: Partial<VendorBid>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (b.vendorId !== undefined) row.vendor_id = b.vendorId;
  if (b.vendorName !== undefined) row.vendor_name = b.vendorName;
  if (b.project !== undefined) row.project = b.project;
  if (b.amount !== undefined) row.amount = b.amount;
  if (b.status !== undefined) row.status = b.status;
  if (b.submittedDate !== undefined) row.submitted_date = b.submittedDate;
  if (b.notes !== undefined) row.notes = b.notes;
  if (b.attachments !== undefined) row.attachments = b.attachments;
  return row;
}

// ── Row converters: Reviews ──

function rowToReview(r: Record<string, unknown>): VendorReview {
  return {
    id: r.id as string,
    vendorId: r.vendor_id as string,
    vendorName: r.vendor_name as string,
    rating: r.rating as number,
    review: r.review as string,
    reviewer: r.reviewer as string,
    date: r.date as string,
  };
}

function reviewToRow(rv: Partial<VendorReview>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (rv.vendorId !== undefined) row.vendor_id = rv.vendorId;
  if (rv.vendorName !== undefined) row.vendor_name = rv.vendorName;
  if (rv.rating !== undefined) row.rating = rv.rating;
  if (rv.review !== undefined) row.review = rv.review;
  if (rv.reviewer !== undefined) row.reviewer = rv.reviewer;
  if (rv.date !== undefined) row.date = rv.date;
  return row;
}

// ── Row converters: Contracts ──

function rowToContract(r: Record<string, unknown>): VendorContract {
  return {
    id: r.id as string,
    vendorId: r.vendor_id as string,
    vendorName: r.vendor_name as string,
    title: r.title as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    amount: r.amount as number,
    status: r.status as VendorContract['status'],
    autoRenew: r.auto_renew as boolean,
    attachments: (r.attachments || []) as VendorContract['attachments'],
    notes: r.notes as string,
  };
}

function contractToRow(c: Partial<VendorContract>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.vendorId !== undefined) row.vendor_id = c.vendorId;
  if (c.vendorName !== undefined) row.vendor_name = c.vendorName;
  if (c.title !== undefined) row.title = c.title;
  if (c.startDate !== undefined) row.start_date = c.startDate;
  if (c.endDate !== undefined) row.end_date = c.endDate;
  if (c.amount !== undefined) row.amount = c.amount;
  if (c.status !== undefined) row.status = c.status;
  if (c.autoRenew !== undefined) row.auto_renew = c.autoRenew;
  if (c.attachments !== undefined) row.attachments = c.attachments;
  if (c.notes !== undefined) row.notes = c.notes;
  return row;
}

// ── Bids CRUD ──

export async function fetchBids(tenantId: string): Promise<VendorBid[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vendor_bids')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('submitted_date', { ascending: false });
  if (error) { console.error('fetchBids error:', error); return null; }
  return (data || []).map(rowToBid);
}

export async function createBid(tenantId: string, bid: Omit<VendorBid, 'id'>): Promise<VendorBid | null> {
  if (!supabase) return null;
  const row = bidToRow(bid);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('vendor_bids')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createBid error:', error); return null; }
  return rowToBid(data);
}

export async function updateBid(id: string, updates: Partial<VendorBid>): Promise<boolean> {
  if (!supabase) return false;
  const row = bidToRow(updates);
  const { error } = await supabase.from('vendor_bids').update(row).eq('id', id);
  if (error) { console.error('updateBid error:', error); return false; }
  return true;
}

export async function deleteBid(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('vendor_bids').delete().eq('id', id);
  if (error) { console.error('deleteBid error:', error); return false; }
  return true;
}

// ── Reviews CRUD ──

export async function fetchReviews(tenantId: string): Promise<VendorReview[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vendor_reviews')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { console.error('fetchReviews error:', error); return null; }
  return (data || []).map(rowToReview);
}

export async function createReview(tenantId: string, review: Omit<VendorReview, 'id'>): Promise<VendorReview | null> {
  if (!supabase) return null;
  const row = reviewToRow(review);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('vendor_reviews')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createReview error:', error); return null; }
  return rowToReview(data);
}

export async function deleteReview(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('vendor_reviews').delete().eq('id', id);
  if (error) { console.error('deleteReview error:', error); return false; }
  return true;
}

// ── Contracts CRUD ──

export async function fetchContracts(tenantId: string): Promise<VendorContract[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vendor_contracts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: false });
  if (error) { console.error('fetchContracts error:', error); return null; }
  return (data || []).map(rowToContract);
}

export async function createContract(tenantId: string, contract: Omit<VendorContract, 'id'>): Promise<VendorContract | null> {
  if (!supabase) return null;
  const row = contractToRow(contract);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('vendor_contracts')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createContract error:', error); return null; }
  return rowToContract(data);
}

export async function updateContract(id: string, updates: Partial<VendorContract>): Promise<boolean> {
  if (!supabase) return false;
  const row = contractToRow(updates);
  const { error } = await supabase.from('vendor_contracts').update(row).eq('id', id);
  if (error) { console.error('updateContract error:', error); return false; }
  return true;
}

export async function deleteContract(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('vendor_contracts').delete().eq('id', id);
  if (error) { console.error('deleteContract error:', error); return false; }
  return true;
}

// ── Parallel fetch all vendor tracker data ──

export async function fetchAllVendorTrackerData(tenantId: string): Promise<{
  bids: VendorBid[] | null;
  reviews: VendorReview[] | null;
  contracts: VendorContract[] | null;
}> {
  const [bids, reviews, contracts] = await Promise.all([
    fetchBids(tenantId),
    fetchReviews(tenantId),
    fetchContracts(tenantId),
  ]);
  return { bids, reviews, contracts };
}
