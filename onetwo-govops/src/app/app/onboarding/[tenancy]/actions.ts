'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  BuildingProfileData,
  BoardMember,
  ManagementInfo,
  LegalCounselData,
  BylawsRules,
  UnitData,
  UnitImportResult,
  ChartOfAccountEntry,
  BudgetCategory,
  ReserveItem,
  InvitePayload,
  ChecklistField,
} from '@/types/onboarding'

// ─── Checklist ───────────────────────────────────────────────────────────────

export async function getOnboardingChecklist(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('onboarding_checklists')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (!data) {
    const { data: created, error: insertError } = await (supabase as any)
      .from('onboarding_checklists')
      .insert({ tenancy_id: tenancyId, account_created: true })
      .select()
      .single()
    if (insertError) throw new Error(insertError.message)
    return created
  }

  return data
}

export async function updateChecklistStep(
  tenancyId: string,
  field: ChecklistField,
  value: boolean
) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('onboarding_checklists')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('tenancy_id', tenancyId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

// ─── Step 1: Building Profile ────────────────────────────────────────────────

export async function getBuildingProfile(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('tenancies')
    .select('name, address, city, state, zip, year_built, total_units, entity_type, fiscal_year_end_month')
    .eq('id', tenancyId)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as BuildingProfileData
}

export async function saveBuildingProfile(tenancyId: string, data: Partial<BuildingProfileData>) {
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('tenancies')
    .update(data as any)
    .eq('id', tenancyId)

  if (error) throw new Error(error.message)

  await updateChecklistStep(tenancyId, 'building_profile_complete', true)
  revalidatePath(`/app/onboarding`)
}

// ─── Step 2: Governance — Board Members ──────────────────────────────────────

export async function getBoardMembers(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('board_members')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data as BoardMember[]
}

export async function upsertBoardMember(tenancyId: string, member: BoardMember) {
  const supabase = await createServerSupabase()
  const payload = {
    tenancy_id: tenancyId,
    name: member.name,
    role: member.role,
    email: member.email,
    phone: member.phone,
    term_start: member.term_start,
    term_end: member.term_end,
    updated_at: new Date().toISOString(),
  }

  if (member.id) {
    const { error } = await (supabase as any)
      .from('board_members')
      .update(payload)
      .eq('id', member.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await (supabase as any)
      .from('board_members')
      .insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/app/onboarding`)
}

export async function deleteBoardMember(id: string) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('board_members')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

// ─── Step 2: Governance — Management Info ────────────────────────────────────

export async function getManagementInfo(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('management_info')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as ManagementInfo | null
}

export async function saveManagementInfo(tenancyId: string, info: Partial<ManagementInfo>) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('management_info')
    .upsert(
      { tenancy_id: tenancyId, ...info, updated_at: new Date().toISOString() },
      { onConflict: 'tenancy_id' }
    )
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

// ─── Step 2: Governance — Legal Counsel ──────────────────────────────────────

export async function getLegalCounsel(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('legal_counsel')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data as LegalCounselData[]
}

export async function upsertLegalCounsel(tenancyId: string, counsel: LegalCounselData) {
  const supabase = await createServerSupabase()
  const payload = {
    tenancy_id: tenancyId,
    firm_name: counsel.firm_name,
    attorney_name: counsel.attorney_name,
    email: counsel.email,
    phone: counsel.phone,
    specialty: counsel.specialty,
    updated_at: new Date().toISOString(),
  }

  if (counsel.id) {
    const { error } = await (supabase as any)
      .from('legal_counsel')
      .update(payload)
      .eq('id', counsel.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await (supabase as any)
      .from('legal_counsel')
      .insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/app/onboarding`)
}

export async function deleteLegalCounsel(id: string) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('legal_counsel')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

// ─── Step 3: Legal Documents ─────────────────────────────────────────────────

export async function getLegalDocuments(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('legal_documents')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function uploadLegalDocument(tenancyId: string, formData: FormData) {
  const supabase = await createServerSupabase()
  const file = formData.get('file') as File
  const docType = (formData.get('doc_type') as string) || 'other'

  if (!file) throw new Error('No file provided')

  const storagePath = `${tenancyId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('legal-documents')
    .upload(storagePath, file)

  if (uploadError) throw new Error(uploadError.message)

  const { error: insertError } = await (supabase as any)
    .from('legal_documents')
    .insert({
      tenancy_id: tenancyId,
      name: file.name,
      doc_type: docType,
      file_size: file.size,
      storage_path: storagePath,
      status: 'active',
    })

  if (insertError) throw new Error(insertError.message)

  await updateChecklistStep(tenancyId, 'bylaws_uploaded', true)
  revalidatePath(`/app/onboarding`)
}

export async function deleteLegalDocument(id: string, storagePath: string) {
  const supabase = await createServerSupabase()

  await supabase.storage.from('legal-documents').remove([storagePath])

  const { error } = await (supabase as any)
    .from('legal_documents')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

export async function saveBylawsRules(tenancyId: string, docId: string, rules: BylawsRules) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('legal_documents')
    .update({ bylaws_rules: rules, updated_at: new Date().toISOString() })
    .eq('id', docId)

  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

// ─── Step 4: Units ───────────────────────────────────────────────────────────

export async function getUnits(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('units')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .order('number', { ascending: true })

  if (error) throw new Error(error.message)
  return data as UnitData[]
}

export async function upsertUnit(tenancyId: string, unit: UnitData) {
  const supabase = await createServerSupabase()
  const payload = {
    tenancy_id: tenancyId,
    number: unit.number,
    owner_name: unit.owner_name,
    email: unit.email,
    phone: unit.phone,
    monthly_fee: unit.monthly_fee,
    voting_pct: unit.voting_pct,
    status: unit.status || 'occupied',
    balance: unit.balance,
    move_in_date: unit.move_in_date,
    sqft: unit.sqft,
    bedrooms: unit.bedrooms,
    parking: unit.parking,
    updated_at: new Date().toISOString(),
  }

  if (unit.id) {
    const { error } = await (supabase as any)
      .from('units')
      .update(payload)
      .eq('id', unit.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await (supabase as any)
      .from('units')
      .insert(payload)
    if (error) throw new Error(error.message)
  }

  await updateChecklistStep(tenancyId, 'units_configured', true)
  revalidatePath(`/app/onboarding`)
}

export async function deleteUnit(id: string) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('units')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

export async function importUnitsFromCSV(
  tenancyId: string,
  csvText: string
): Promise<UnitImportResult> {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return { inserted: 0, errors: [{ row: 0, message: 'CSV must have a header row and at least one data row' }] }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const numberIdx = headers.indexOf('number')
  const ownerIdx = headers.indexOf('owner')
  const emailIdx = headers.indexOf('email')
  const phoneIdx = headers.indexOf('phone')
  const feeIdx = headers.indexOf('monthly_fee')
  const votingIdx = headers.indexOf('voting_pct')
  const sqftIdx = headers.indexOf('sqft')
  const bedroomsIdx = headers.indexOf('bedrooms')
  const parkingIdx = headers.indexOf('parking')

  if (numberIdx === -1) return { inserted: 0, errors: [{ row: 0, message: 'CSV must have a "number" column' }] }

  const errors: UnitImportResult['errors'] = []
  const units: any[] = []
  const seen = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    const num = cols[numberIdx]

    if (!num) {
      errors.push({ row: i, message: 'Missing unit number' })
      continue
    }

    if (seen.has(num)) {
      errors.push({ row: i, message: `Duplicate unit number: ${num}` })
      continue
    }
    seen.add(num)

    const fee = feeIdx >= 0 ? parseFloat(cols[feeIdx]) : null
    const voting = votingIdx >= 0 ? parseFloat(cols[votingIdx]) : null

    if (feeIdx >= 0 && cols[feeIdx] && isNaN(fee!)) {
      errors.push({ row: i, message: `Invalid monthly_fee: ${cols[feeIdx]}` })
      continue
    }
    if (votingIdx >= 0 && cols[votingIdx] && isNaN(voting!)) {
      errors.push({ row: i, message: `Invalid voting_pct: ${cols[votingIdx]}` })
      continue
    }

    units.push({
      tenancy_id: tenancyId,
      number: num,
      owner_name: ownerIdx >= 0 ? cols[ownerIdx] || '' : '',
      email: emailIdx >= 0 ? cols[emailIdx] || '' : '',
      phone: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
      monthly_fee: fee || 0,
      voting_pct: voting || 0,
      sqft: sqftIdx >= 0 && cols[sqftIdx] ? parseInt(cols[sqftIdx]) || null : null,
      bedrooms: bedroomsIdx >= 0 && cols[bedroomsIdx] ? parseInt(cols[bedroomsIdx]) || null : null,
      parking: parkingIdx >= 0 ? cols[parkingIdx] || '' : '',
    })
  }

  if (units.length > 0) {
    const supabase = await createServerSupabase()
    const { error } = await (supabase as any)
      .from('units')
      .upsert(units, { onConflict: 'tenancy_id,number' })

    if (error) {
      errors.push({ row: -1, message: error.message })
    } else {
      await updateChecklistStep(tenancyId, 'units_configured', true)
    }
  }

  revalidatePath(`/app/onboarding`)
  return { inserted: units.length, errors }
}

// ─── Step 5: Financial Setup ─────────────────────────────────────────────────

export async function getFinancialSettings(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('financial_settings')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function saveFinancialSettings(tenancyId: string, settings: Record<string, any>) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('financial_settings')
    .upsert(
      { tenancy_id: tenancyId, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'tenancy_id' }
    )
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

export async function getChartOfAccounts(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('chart_of_accounts')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .order('account_number', { ascending: true })

  if (error) throw new Error(error.message)
  return data as ChartOfAccountEntry[]
}

export async function seedDefaultChartOfAccounts(tenancyId: string) {
  const defaults = [
    { account_number: '1000', name: 'Operating Cash', account_type: 'asset', sub_type: 'current' },
    { account_number: '1100', name: 'Reserve Cash', account_type: 'asset', sub_type: 'current' },
    { account_number: '1200', name: 'Accounts Receivable', account_type: 'asset', sub_type: 'current' },
    { account_number: '2000', name: 'Accounts Payable', account_type: 'liability', sub_type: 'current' },
    { account_number: '2100', name: 'Prepaid Assessments', account_type: 'liability', sub_type: 'current' },
    { account_number: '3000', name: 'Retained Earnings', account_type: 'equity', sub_type: null },
    { account_number: '4000', name: 'Assessment Income', account_type: 'revenue', sub_type: null },
    { account_number: '4100', name: 'Late Fees', account_type: 'revenue', sub_type: null },
    { account_number: '4200', name: 'Interest Income', account_type: 'revenue', sub_type: null },
    { account_number: '5000', name: 'Management Fees', account_type: 'expense', sub_type: 'operating' },
    { account_number: '5100', name: 'Insurance', account_type: 'expense', sub_type: 'operating' },
    { account_number: '5200', name: 'Utilities', account_type: 'expense', sub_type: 'operating' },
    { account_number: '5300', name: 'Maintenance & Repairs', account_type: 'expense', sub_type: 'operating' },
    { account_number: '5400', name: 'Landscaping', account_type: 'expense', sub_type: 'operating' },
    { account_number: '5500', name: 'Legal & Professional', account_type: 'expense', sub_type: 'operating' },
    { account_number: '5600', name: 'Administrative', account_type: 'expense', sub_type: 'operating' },
    { account_number: '6000', name: 'Reserve Contribution', account_type: 'expense', sub_type: 'reserve' },
  ]

  const supabase = await createServerSupabase()
  const rows = defaults.map(d => ({ ...d, tenancy_id: tenancyId }))
  const { error } = await (supabase as any)
    .from('chart_of_accounts')
    .upsert(rows, { onConflict: 'tenancy_id,account_number', ignoreDuplicates: true })

  // If upsert with onConflict doesn't work (no unique constraint on those), just insert
  if (error) {
    // Delete existing and re-insert
    await (supabase as any).from('chart_of_accounts').delete().eq('tenancy_id', tenancyId)
    const { error: insertError } = await (supabase as any)
      .from('chart_of_accounts')
      .insert(rows)
    if (insertError) throw new Error(insertError.message)
  }

  revalidatePath(`/app/onboarding`)
}

export async function upsertChartOfAccount(tenancyId: string, entry: ChartOfAccountEntry) {
  const supabase = await createServerSupabase()
  const payload = {
    tenancy_id: tenancyId,
    account_number: entry.account_number,
    name: entry.name,
    account_type: entry.account_type,
    sub_type: entry.sub_type,
    parent_id: entry.parent_id,
    updated_at: new Date().toISOString(),
  }

  if (entry.id) {
    const { error } = await (supabase as any)
      .from('chart_of_accounts')
      .update(payload)
      .eq('id', entry.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await (supabase as any)
      .from('chart_of_accounts')
      .insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/app/onboarding`)
}

export async function deleteChartOfAccount(id: string) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('chart_of_accounts')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

export async function getBudgetCategories(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('budget_categories')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data as BudgetCategory[]
}

export async function upsertBudgetCategory(tenancyId: string, cat: BudgetCategory) {
  const supabase = await createServerSupabase()
  const payload = {
    tenancy_id: tenancyId,
    name: cat.name,
    budgeted_amount: cat.budgeted_amount,
    updated_at: new Date().toISOString(),
  }

  if (cat.id) {
    const { error } = await (supabase as any)
      .from('budget_categories')
      .update(payload)
      .eq('id', cat.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await (supabase as any)
      .from('budget_categories')
      .insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/app/onboarding`)
}

export async function deleteBudgetCategory(id: string) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('budget_categories')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

export async function getReserveItems(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('reserve_items')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data as ReserveItem[]
}

export async function upsertReserveItem(tenancyId: string, item: ReserveItem) {
  const supabase = await createServerSupabase()
  const payload = {
    tenancy_id: tenancyId,
    name: item.name,
    estimated_cost: item.estimated_cost,
    current_funding: item.current_funding,
    useful_life: item.useful_life,
    years_remaining: item.years_remaining,
    is_contingency: item.is_contingency,
    updated_at: new Date().toISOString(),
  }

  if (item.id) {
    const { error } = await (supabase as any)
      .from('reserve_items')
      .update(payload)
      .eq('id', item.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await (supabase as any)
      .from('reserve_items')
      .insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/app/onboarding`)
}

export async function deleteReserveItem(id: string) {
  const supabase = await createServerSupabase()
  const { error } = await (supabase as any)
    .from('reserve_items')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/app/onboarding`)
}

// ─── Step 6: Stripe Connect ─────────────────────────────────────────────────

export async function initiateStripeConnect(tenancyId: string, returnUrl: string) {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.functions.invoke('connect-stripe-account', {
    body: {
      action: 'create',
      tenancy_id: tenancyId,
      return_url: returnUrl,
    },
  })

  if (error) throw new Error(error.message)
  return data as { accountId: string; onboardingUrl: string }
}

export async function checkStripeConnectStatus(tenancyId: string) {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.functions.invoke('connect-stripe-account', {
    body: {
      action: 'check_status',
      tenancy_id: tenancyId,
    },
  })

  if (error) throw new Error(error.message)

  if (data?.charges_enabled && data?.details_submitted) {
    await updateChecklistStep(tenancyId, 'payment_processing_configured', true)
  }

  return data as { charges_enabled: boolean; details_submitted: boolean }
}

// ─── Step 7: Invites ─────────────────────────────────────────────────────────

export async function getExistingUsers(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('tenant_users')
    .select('id, email, display_name, role_id, status, user_roles(name)')
    .eq('tenancy_id', tenancyId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data || []).map((u: any) => ({
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    role_id: u.role_id,
    role_name: u.user_roles?.name || u.role_id,
    status: u.status,
  }))
}

export async function inviteUser(tenancyId: string, payload: InvitePayload) {
  const supabase = await createServerSupabase()

  // Check if user already exists for this tenancy
  const { data: existing } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('tenancy_id', tenancyId)
    .eq('email', payload.email)
    .maybeSingle()

  if (existing) throw new Error('User already exists for this tenancy')

  // Insert tenant_users row
  const { error: insertError } = await supabase
    .from('tenant_users')
    .insert({
      tenancy_id: tenancyId,
      email: payload.email,
      display_name: payload.display_name || payload.email.split('@')[0],
      role_id: payload.role_id,
      status: 'invited',
    } as any)

  if (insertError) throw new Error(insertError.message)

  // Send Supabase Auth invite
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(payload.email)
  // Non-fatal — the user row is created even if auth invite fails
  if (inviteError) {
    console.error('Auth invite failed (non-fatal):', inviteError.message)
  }

  await updateChecklistStep(tenancyId, 'first_user_invited', true)
  revalidatePath(`/app/onboarding`)
}

export async function inviteBatch(tenancyId: string, invites: InvitePayload[]) {
  const results: { email: string; success: boolean; error?: string }[] = []

  for (const invite of invites) {
    try {
      await inviteUser(tenancyId, invite)
      results.push({ email: invite.email, success: true })
    } catch (e) {
      results.push({ email: invite.email, success: false, error: (e as Error).message })
    }
  }

  return results
}

// ─── Step 8: Go Live ─────────────────────────────────────────────────────────

export async function setGoLive(tenancyId: string) {
  await updateChecklistStep(tenancyId, 'go_live', true)
  revalidatePath(`/app/onboarding`)
  revalidatePath(`/app`)
}

// ─── Setup Progress (Setup Hub) ──────────────────────────────────────────────

export async function getSetupProgress(tenancyId: string) {
  const { computeSetupProgress } = await import('@/lib/setup/compute-setup-progress')
  const features = await getTenantFeatures(tenancyId)
  return computeSetupProgress(tenancyId, features)
}

// ─── Tenant Features ─────────────────────────────────────────────────────────

export async function getTenantFeatures(tenancyId: string) {
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any)
    .from('tenant_features')
    .select('*')
    .eq('tenancy_id', tenancyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

// ─── User Roles ──────────────────────────────────────────────────────────────

export async function getUserRoles() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}
