import { supabase, logDbError } from '@/lib/supabase';

// ── Types ──

export interface ReportConfig {
  id: string;
  name: string;
  type: 'board_packet' | 'monthly_summary' | 'compliance_report' | 'financial_snapshot';
  sections: Array<{ id: string; label: string; enabled: boolean }>;
  schedule: 'manual' | 'monthly' | 'quarterly';
  lastGenerated: string;
  createdBy: string;
}

export interface GeneratedReport {
  id: string;
  configId: string;
  name: string;
  type: string;
  generatedAt: string;
  generatedBy: string;
  snapshot: Record<string, any>;
}

// ── Row converters: Configs ──

function rowToConfig(r: Record<string, unknown>): ReportConfig {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as ReportConfig['type'],
    sections: (r.sections || []) as ReportConfig['sections'],
    schedule: r.schedule as ReportConfig['schedule'],
    lastGenerated: r.last_generated as string,
    createdBy: r.created_by as string,
  };
}

function configToRow(c: Partial<ReportConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.type !== undefined) row.type = c.type;
  if (c.sections !== undefined) row.sections = c.sections;
  if (c.schedule !== undefined) row.schedule = c.schedule;
  if (c.lastGenerated !== undefined) row.last_generated = c.lastGenerated;
  if (c.createdBy !== undefined) row.created_by = c.createdBy;
  return row;
}

// ── Row converters: Reports ──

function rowToReport(r: Record<string, unknown>): GeneratedReport {
  return {
    id: r.id as string,
    configId: r.config_id as string,
    name: r.name as string,
    type: r.type as string,
    generatedAt: r.generated_at as string,
    generatedBy: r.generated_by as string,
    snapshot: (r.snapshot || {}) as Record<string, any>,
  };
}

function reportToRow(rp: Partial<GeneratedReport>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (rp.configId !== undefined) row.config_id = rp.configId;
  if (rp.name !== undefined) row.name = rp.name;
  if (rp.type !== undefined) row.type = rp.type;
  if (rp.generatedAt !== undefined) row.generated_at = rp.generatedAt;
  if (rp.generatedBy !== undefined) row.generated_by = rp.generatedBy;
  if (rp.snapshot !== undefined) row.snapshot = rp.snapshot;
  return row;
}

// ── Configs CRUD ──

export async function fetchConfigs(tenantId: string): Promise<ReportConfig[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('report_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });
  if (error) { logDbError('fetchConfigs error:', error); return null; }
  return (data || []).map(rowToConfig);
}

export async function createConfig(tenantId: string, config: Omit<ReportConfig, 'id'>): Promise<ReportConfig | null> {
  if (!supabase) return null;
  const row = configToRow(config);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('report_configs')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createConfig error:', error); return null; }
  return rowToConfig(data);
}

export async function updateConfig(id: string, updates: Partial<ReportConfig>): Promise<boolean> {
  if (!supabase) return false;
  const row = configToRow(updates);
  const { error } = await supabase.from('report_configs').update(row).eq('id', id);
  if (error) { logDbError('updateConfig error:', error); return false; }
  return true;
}

export async function deleteConfig(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('report_configs').delete().eq('id', id);
  if (error) { logDbError('deleteConfig error:', error); return false; }
  return true;
}

// ── Reports CRUD ──

export async function fetchReports(tenantId: string): Promise<GeneratedReport[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('generated_reports')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('generated_at', { ascending: false });
  if (error) { logDbError('fetchReports error:', error); return null; }
  return (data || []).map(rowToReport);
}

export async function createReport(tenantId: string, report: Omit<GeneratedReport, 'id'>): Promise<GeneratedReport | null> {
  if (!supabase) return null;
  const row = reportToRow(report);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('generated_reports')
    .insert(row)
    .select()
    .single();
  if (error) { logDbError('createReport error:', error); return null; }
  return rowToReport(data);
}

export async function deleteReport(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('generated_reports').delete().eq('id', id);
  if (error) { logDbError('deleteReport error:', error); return false; }
  return true;
}
