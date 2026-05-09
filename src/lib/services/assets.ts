import { supabase, logDbError } from '@/lib/supabase';
import type { BuildingAsset } from '@/store/useBuildingStore';

// ── Fetch all assets for a tenant ──

export async function fetchAssets(tenantId: string): Promise<BuildingAsset[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('building_assets')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { logDbError('fetchAssets error:', error); return null; }
  return (data || []).map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    location: r.location,
    condition: r.condition,
    installedDate: r.installed_date || '',
    originalCost: Number(r.original_cost) || 0,
    usefulLifeYears: r.useful_life_years || 20,
    remainingLifeYears: r.remaining_life_years || 20,
    replacementCostToday: Number(r.replacement_cost_today) || 0,
    inflationRate: Number(r.inflation_rate) || 3,
    criticality: r.criticality || 'Medium',
    annualMaintenanceCost: Number(r.annual_maintenance_cost) || 0,
    annualOperatingCost: Number(r.annual_operating_cost) || 0,
    parentAssetId: r.parent_asset_id || null,
    reserveItemId: r.reserve_item_id || '',
    maintenanceScheduleIds: r.maintenance_schedule_ids || [],
    workOrderIds: r.work_order_ids || [],
    vendorIds: r.vendor_ids || [],
    insurancePolicyIds: r.insurance_policy_ids || [],
    amenityConfigId: r.amenity_config_id || '',
    glAccountNum: r.gl_account_num || '',
    budgetCategoryId: r.budget_category_id || '',
    spendingApprovalIds: r.spending_approval_ids || [],
    conditionHistory: r.condition_history || [],
    warranties: r.warranties || [],
    notes: r.notes || '',
    insuredValue: Number(r.insured_value) || 0,
  }));
}

// ── Create a new asset ──

export async function createAsset(tenantId: string, a: Omit<BuildingAsset, 'id'>): Promise<BuildingAsset | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('building_assets')
    .insert({
      tenant_id: tenantId,
      name: a.name,
      category: a.category,
      location: a.location,
      condition: a.condition,
      installed_date: a.installedDate,
      original_cost: a.originalCost,
      useful_life_years: a.usefulLifeYears,
      remaining_life_years: a.remainingLifeYears,
      replacement_cost_today: a.replacementCostToday,
      inflation_rate: a.inflationRate,
      criticality: a.criticality,
      annual_maintenance_cost: a.annualMaintenanceCost,
      annual_operating_cost: a.annualOperatingCost,
      parent_asset_id: a.parentAssetId || null,
      reserve_item_id: a.reserveItemId,
      maintenance_schedule_ids: a.maintenanceScheduleIds,
      work_order_ids: a.workOrderIds,
      vendor_ids: a.vendorIds,
      insurance_policy_ids: a.insurancePolicyIds,
      amenity_config_id: a.amenityConfigId,
      gl_account_num: a.glAccountNum,
      budget_category_id: a.budgetCategoryId,
      spending_approval_ids: a.spendingApprovalIds,
      condition_history: a.conditionHistory,
      warranties: a.warranties,
      notes: a.notes,
      insured_value: a.insuredValue,
    })
    .select()
    .single();
  if (error) { logDbError('createAsset error:', error); return null; }
  return {
    id: data.id,
    name: data.name,
    category: data.category,
    location: data.location,
    condition: data.condition,
    installedDate: data.installed_date || '',
    originalCost: Number(data.original_cost) || 0,
    usefulLifeYears: data.useful_life_years,
    remainingLifeYears: data.remaining_life_years,
    replacementCostToday: Number(data.replacement_cost_today) || 0,
    inflationRate: Number(data.inflation_rate) || 3,
    criticality: data.criticality,
    annualMaintenanceCost: Number(data.annual_maintenance_cost) || 0,
    annualOperatingCost: Number(data.annual_operating_cost) || 0,
    parentAssetId: data.parent_asset_id || null,
    reserveItemId: data.reserve_item_id || '',
    maintenanceScheduleIds: data.maintenance_schedule_ids || [],
    workOrderIds: data.work_order_ids || [],
    vendorIds: data.vendor_ids || [],
    insurancePolicyIds: data.insurance_policy_ids || [],
    amenityConfigId: data.amenity_config_id || '',
    glAccountNum: data.gl_account_num || '',
    budgetCategoryId: data.budget_category_id || '',
    spendingApprovalIds: data.spending_approval_ids || [],
    conditionHistory: data.condition_history || [],
    warranties: data.warranties || [],
    notes: data.notes || '',
    insuredValue: Number(data.insured_value) || 0,
  };
}

// ── Update an asset ──

export async function updateAsset(id: string, a: Partial<BuildingAsset>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (a.name !== undefined) row.name = a.name;
  if (a.category !== undefined) row.category = a.category;
  if (a.location !== undefined) row.location = a.location;
  if (a.condition !== undefined) row.condition = a.condition;
  if (a.installedDate !== undefined) row.installed_date = a.installedDate;
  if (a.originalCost !== undefined) row.original_cost = a.originalCost;
  if (a.usefulLifeYears !== undefined) row.useful_life_years = a.usefulLifeYears;
  if (a.remainingLifeYears !== undefined) row.remaining_life_years = a.remainingLifeYears;
  if (a.replacementCostToday !== undefined) row.replacement_cost_today = a.replacementCostToday;
  if (a.inflationRate !== undefined) row.inflation_rate = a.inflationRate;
  if (a.criticality !== undefined) row.criticality = a.criticality;
  if (a.annualMaintenanceCost !== undefined) row.annual_maintenance_cost = a.annualMaintenanceCost;
  if (a.annualOperatingCost !== undefined) row.annual_operating_cost = a.annualOperatingCost;
  if (a.parentAssetId !== undefined) row.parent_asset_id = a.parentAssetId || null;
  if (a.reserveItemId !== undefined) row.reserve_item_id = a.reserveItemId;
  if (a.maintenanceScheduleIds !== undefined) row.maintenance_schedule_ids = a.maintenanceScheduleIds;
  if (a.workOrderIds !== undefined) row.work_order_ids = a.workOrderIds;
  if (a.vendorIds !== undefined) row.vendor_ids = a.vendorIds;
  if (a.insurancePolicyIds !== undefined) row.insurance_policy_ids = a.insurancePolicyIds;
  if (a.amenityConfigId !== undefined) row.amenity_config_id = a.amenityConfigId;
  if (a.glAccountNum !== undefined) row.gl_account_num = a.glAccountNum;
  if (a.budgetCategoryId !== undefined) row.budget_category_id = a.budgetCategoryId;
  if (a.spendingApprovalIds !== undefined) row.spending_approval_ids = a.spendingApprovalIds;
  if (a.conditionHistory !== undefined) row.condition_history = a.conditionHistory;
  if (a.warranties !== undefined) row.warranties = a.warranties;
  if (a.notes !== undefined) row.notes = a.notes;
  if (a.insuredValue !== undefined) row.insured_value = a.insuredValue;
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from('building_assets').update(row).eq('id', id);
  if (error) { logDbError('updateAsset error:', error); return false; }
  return true;
}

// ── Delete an asset ──

export async function deleteAsset(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('building_assets').delete().eq('id', id);
  if (error) { logDbError('deleteAsset error:', error); return false; }
  return true;
}
