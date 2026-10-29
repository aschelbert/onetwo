'use server'

import { getTenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'
import type { Vendor } from '@/types/case-steps'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Fetch all vendors for a tenant ──────────────────────────────────

export async function getVendors(tenantId: string): Promise<Vendor[]> {
  const db = getTenantSupabaseAdmin()

  const { data, error } = await (db as any)
    .from('vendors')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Vendor[]
}

// ─── Create a new vendor ─────────────────────────────────────────────

export async function createVendor(
  tenantId: string,
  vendor: { name: string; service?: string; phone?: string; email?: string }
): Promise<Vendor> {
  const db = getTenantSupabaseAdmin()

  const { data, error } = await (db as any)
    .from('vendors')
    .insert({
      tenant_id: tenantId,
      name: vendor.name,
      service: vendor.service ?? '',
      contact: '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      contract: '',
      status: 'active',
      w9_on_file: false,
      is_sample: false,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Vendor
}
