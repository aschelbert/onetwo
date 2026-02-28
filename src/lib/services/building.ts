import { supabase } from '@/lib/supabase';
import type {
  BoardMember, ManagementInfo, LegalCounsel,
  LegalDocument, InsurancePolicy, Vendor,
} from '@/store/useBuildingStore';

// ── Board Members ──

export async function fetchBoardMembers(tenantId: string): Promise<BoardMember[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('board_members')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchBoardMembers error:', error); return null; }
  return (data || []).map(r => ({
    id: r.id, name: r.name, role: r.role, email: r.email, phone: r.phone, term: r.term,
  }));
}

export async function createBoardMember(tenantId: string, m: Omit<BoardMember, 'id'>): Promise<BoardMember | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('board_members')
    .insert({ tenant_id: tenantId, name: m.name, role: m.role, email: m.email, phone: m.phone, term: m.term })
    .select()
    .single();
  if (error) { console.error('createBoardMember error:', error); return null; }
  return { id: data.id, name: data.name, role: data.role, email: data.email, phone: data.phone, term: data.term };
}

export async function updateBoardMember(id: string, m: Partial<BoardMember>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (m.name !== undefined) row.name = m.name;
  if (m.role !== undefined) row.role = m.role;
  if (m.email !== undefined) row.email = m.email;
  if (m.phone !== undefined) row.phone = m.phone;
  if (m.term !== undefined) row.term = m.term;
  const { error } = await supabase.from('board_members').update(row).eq('id', id);
  if (error) { console.error('updateBoardMember error:', error); return false; }
  return true;
}

export async function deleteBoardMember(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('board_members').delete().eq('id', id);
  if (error) { console.error('deleteBoardMember error:', error); return false; }
  return true;
}

// ── Management Info ──

export async function fetchManagementInfo(tenantId: string): Promise<ManagementInfo | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('management_info')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) { console.error('fetchManagementInfo error:', error); return null; }
  if (!data) return null;
  return {
    company: data.company, contact: data.contact, title: data.title,
    email: data.email, phone: data.phone, emergency: data.emergency,
    address: data.address, hours: data.hours, afterHours: data.after_hours,
  };
}

export async function upsertManagementInfo(tenantId: string, m: Partial<ManagementInfo>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = { tenant_id: tenantId };
  if (m.company !== undefined) row.company = m.company;
  if (m.contact !== undefined) row.contact = m.contact;
  if (m.title !== undefined) row.title = m.title;
  if (m.email !== undefined) row.email = m.email;
  if (m.phone !== undefined) row.phone = m.phone;
  if (m.emergency !== undefined) row.emergency = m.emergency;
  if (m.address !== undefined) row.address = m.address;
  if (m.hours !== undefined) row.hours = m.hours;
  if (m.afterHours !== undefined) row.after_hours = m.afterHours;
  const { error } = await supabase.from('management_info').upsert(row, { onConflict: 'tenant_id' });
  if (error) { console.error('upsertManagementInfo error:', error); return false; }
  return true;
}

// ── Legal Counsel ──

export async function fetchLegalCounsel(tenantId: string): Promise<LegalCounsel[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('legal_counsel')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchLegalCounsel error:', error); return null; }
  return (data || []).map(r => ({
    id: r.id, firm: r.firm, attorney: r.attorney, email: r.email, phone: r.phone, specialty: r.specialty,
  }));
}

export async function createLegalCounsel(tenantId: string, c: Omit<LegalCounsel, 'id'>): Promise<LegalCounsel | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('legal_counsel')
    .insert({ tenant_id: tenantId, firm: c.firm, attorney: c.attorney, email: c.email, phone: c.phone, specialty: c.specialty })
    .select()
    .single();
  if (error) { console.error('createLegalCounsel error:', error); return null; }
  return { id: data.id, firm: data.firm, attorney: data.attorney, email: data.email, phone: data.phone, specialty: data.specialty };
}

export async function updateLegalCounsel(id: string, c: Partial<LegalCounsel>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (c.firm !== undefined) row.firm = c.firm;
  if (c.attorney !== undefined) row.attorney = c.attorney;
  if (c.email !== undefined) row.email = c.email;
  if (c.phone !== undefined) row.phone = c.phone;
  if (c.specialty !== undefined) row.specialty = c.specialty;
  const { error } = await supabase.from('legal_counsel').update(row).eq('id', id);
  if (error) { console.error('updateLegalCounsel error:', error); return false; }
  return true;
}

export async function deleteLegalCounsel(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('legal_counsel').delete().eq('id', id);
  if (error) { console.error('deleteLegalCounsel error:', error); return false; }
  return true;
}

// ── Legal Documents ──

export async function fetchLegalDocuments(tenantId: string): Promise<LegalDocument[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchLegalDocuments error:', error); return null; }
  return (data || []).map(r => ({
    id: r.id, name: r.name, version: r.version, size: r.size,
    status: r.status as 'current' | 'review-due',
    attachments: (r.attachments || []) as LegalDocument['attachments'],
  }));
}

export async function createLegalDocument(tenantId: string, d: Omit<LegalDocument, 'id' | 'attachments'>): Promise<LegalDocument | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('legal_documents')
    .insert({ tenant_id: tenantId, name: d.name, version: d.version, size: d.size, status: d.status })
    .select()
    .single();
  if (error) { console.error('createLegalDocument error:', error); return null; }
  return { id: data.id, name: data.name, version: data.version, size: data.size, status: data.status, attachments: [] };
}

export async function updateLegalDocument(id: string, d: Partial<LegalDocument>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (d.name !== undefined) row.name = d.name;
  if (d.version !== undefined) row.version = d.version;
  if (d.size !== undefined) row.size = d.size;
  if (d.status !== undefined) row.status = d.status;
  if (d.attachments !== undefined) row.attachments = d.attachments;
  const { error } = await supabase.from('legal_documents').update(row).eq('id', id);
  if (error) { console.error('updateLegalDocument error:', error); return false; }
  return true;
}

export async function deleteLegalDocument(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('legal_documents').delete().eq('id', id);
  if (error) { console.error('deleteLegalDocument error:', error); return false; }
  return true;
}

// ── Insurance Policies ──

export async function fetchInsurancePolicies(tenantId: string): Promise<InsurancePolicy[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('insurance_policies')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchInsurancePolicies error:', error); return null; }
  return (data || []).map(r => ({
    id: r.id, type: r.type, carrier: r.carrier, coverage: r.coverage,
    premium: r.premium, expires: r.expires, policyNum: r.policy_num,
    attachments: (r.attachments || []) as InsurancePolicy['attachments'],
  }));
}

export async function createInsurancePolicy(tenantId: string, p: Omit<InsurancePolicy, 'id' | 'attachments'>): Promise<InsurancePolicy | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('insurance_policies')
    .insert({
      tenant_id: tenantId, type: p.type, carrier: p.carrier, coverage: p.coverage,
      premium: p.premium, expires: p.expires, policy_num: p.policyNum,
    })
    .select()
    .single();
  if (error) { console.error('createInsurancePolicy error:', error); return null; }
  return {
    id: data.id, type: data.type, carrier: data.carrier, coverage: data.coverage,
    premium: data.premium, expires: data.expires, policyNum: data.policy_num, attachments: [],
  };
}

export async function updateInsurancePolicy(id: string, p: Partial<InsurancePolicy>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (p.type !== undefined) row.type = p.type;
  if (p.carrier !== undefined) row.carrier = p.carrier;
  if (p.coverage !== undefined) row.coverage = p.coverage;
  if (p.premium !== undefined) row.premium = p.premium;
  if (p.expires !== undefined) row.expires = p.expires;
  if (p.policyNum !== undefined) row.policy_num = p.policyNum;
  if (p.attachments !== undefined) row.attachments = p.attachments;
  const { error } = await supabase.from('insurance_policies').update(row).eq('id', id);
  if (error) { console.error('updateInsurancePolicy error:', error); return false; }
  return true;
}

export async function deleteInsurancePolicy(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('insurance_policies').delete().eq('id', id);
  if (error) { console.error('deleteInsurancePolicy error:', error); return false; }
  return true;
}

// ── Vendors ──

export async function fetchVendors(tenantId: string): Promise<Vendor[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchVendors error:', error); return null; }
  return (data || []).map(r => ({
    id: r.id, name: r.name, service: r.service, contact: r.contact,
    phone: r.phone, email: r.email, contract: r.contract,
    status: r.status as 'active' | 'inactive',
  }));
}

export async function createVendor(tenantId: string, v: Omit<Vendor, 'id'>): Promise<Vendor | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      tenant_id: tenantId, name: v.name, service: v.service, contact: v.contact,
      phone: v.phone, email: v.email, contract: v.contract, status: v.status,
    })
    .select()
    .single();
  if (error) { console.error('createVendor error:', error); return null; }
  return {
    id: data.id, name: data.name, service: data.service, contact: data.contact,
    phone: data.phone, email: data.email, contract: data.contract, status: data.status,
  };
}

export async function updateVendor(id: string, v: Partial<Vendor>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (v.name !== undefined) row.name = v.name;
  if (v.service !== undefined) row.service = v.service;
  if (v.contact !== undefined) row.contact = v.contact;
  if (v.phone !== undefined) row.phone = v.phone;
  if (v.email !== undefined) row.email = v.email;
  if (v.contract !== undefined) row.contract = v.contract;
  if (v.status !== undefined) row.status = v.status;
  const { error } = await supabase.from('vendors').update(row).eq('id', id);
  if (error) { console.error('updateVendor error:', error); return false; }
  return true;
}

export async function deleteVendor(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  if (error) { console.error('deleteVendor error:', error); return false; }
  return true;
}

// ── Bulk fetch for loadFromDb ──

export async function fetchAllBuildingData(tenantId: string) {
  const [board, management, counsel, docs, insurance, vendors] = await Promise.all([
    fetchBoardMembers(tenantId),
    fetchManagementInfo(tenantId),
    fetchLegalCounsel(tenantId),
    fetchLegalDocuments(tenantId),
    fetchInsurancePolicies(tenantId),
    fetchVendors(tenantId),
  ]);
  return { board, management, counsel, docs, insurance, vendors };
}
