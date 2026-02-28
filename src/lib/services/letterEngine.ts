import { supabase } from '@/lib/supabase';

// ── Types ──

export interface LetterTemplate {
  id: string;
  name: string;
  category: 'violation' | 'collection' | 'notice' | 'welcome' | 'maintenance' | 'general';
  subject: string;
  body: string;
  variables: Array<{ name: string; label: string; defaultValue: string }>;
}

export interface GeneratedLetter {
  id: string;
  templateId: string;
  templateName: string;
  recipient: string;
  unitNumber: string;
  subject: string;
  body: string;
  status: 'draft' | 'sent' | 'archived';
  sentDate: string;
  sentVia: string;
  createdBy: string;
}

// ── Row converters: Templates ──

function rowToTemplate(r: Record<string, unknown>): LetterTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    category: r.category as LetterTemplate['category'],
    subject: r.subject as string,
    body: r.body as string,
    variables: (r.variables || []) as LetterTemplate['variables'],
  };
}

function templateToRow(t: Partial<LetterTemplate>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.name !== undefined) row.name = t.name;
  if (t.category !== undefined) row.category = t.category;
  if (t.subject !== undefined) row.subject = t.subject;
  if (t.body !== undefined) row.body = t.body;
  if (t.variables !== undefined) row.variables = t.variables;
  return row;
}

// ── Row converters: Letters ──

function rowToLetter(r: Record<string, unknown>): GeneratedLetter {
  return {
    id: r.id as string,
    templateId: r.template_id as string,
    templateName: r.template_name as string,
    recipient: r.recipient as string,
    unitNumber: r.unit_number as string,
    subject: r.subject as string,
    body: r.body as string,
    status: r.status as GeneratedLetter['status'],
    sentDate: r.sent_date as string,
    sentVia: r.sent_via as string,
    createdBy: r.created_by as string,
  };
}

function letterToRow(l: Partial<GeneratedLetter>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (l.templateId !== undefined) row.template_id = l.templateId;
  if (l.templateName !== undefined) row.template_name = l.templateName;
  if (l.recipient !== undefined) row.recipient = l.recipient;
  if (l.unitNumber !== undefined) row.unit_number = l.unitNumber;
  if (l.subject !== undefined) row.subject = l.subject;
  if (l.body !== undefined) row.body = l.body;
  if (l.status !== undefined) row.status = l.status;
  if (l.sentDate !== undefined) row.sent_date = l.sentDate;
  if (l.sentVia !== undefined) row.sent_via = l.sentVia;
  if (l.createdBy !== undefined) row.created_by = l.createdBy;
  return row;
}

// ── Templates CRUD ──

export async function fetchTemplates(tenantId: string): Promise<LetterTemplate[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('letter_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });
  if (error) { console.error('fetchTemplates error:', error); return null; }
  return (data || []).map(rowToTemplate);
}

export async function createTemplate(tenantId: string, template: Omit<LetterTemplate, 'id'>): Promise<LetterTemplate | null> {
  if (!supabase) return null;
  const row = templateToRow(template);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('letter_templates')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createTemplate error:', error); return null; }
  return rowToTemplate(data);
}

export async function updateTemplate(id: string, updates: Partial<LetterTemplate>): Promise<boolean> {
  if (!supabase) return false;
  const row = templateToRow(updates);
  const { error } = await supabase.from('letter_templates').update(row).eq('id', id);
  if (error) { console.error('updateTemplate error:', error); return false; }
  return true;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('letter_templates').delete().eq('id', id);
  if (error) { console.error('deleteTemplate error:', error); return false; }
  return true;
}

// ── Letters CRUD ──

export async function fetchLetters(tenantId: string): Promise<GeneratedLetter[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('generated_letters')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchLetters error:', error); return null; }
  return (data || []).map(rowToLetter);
}

export async function createLetter(tenantId: string, letter: Omit<GeneratedLetter, 'id'>): Promise<GeneratedLetter | null> {
  if (!supabase) return null;
  const row = letterToRow(letter);
  row.tenant_id = tenantId;
  const { data, error } = await supabase
    .from('generated_letters')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createLetter error:', error); return null; }
  return rowToLetter(data);
}

export async function updateLetter(id: string, updates: Partial<GeneratedLetter>): Promise<boolean> {
  if (!supabase) return false;
  const row = letterToRow(updates);
  const { error } = await supabase.from('generated_letters').update(row).eq('id', id);
  if (error) { console.error('updateLetter error:', error); return false; }
  return true;
}

export async function deleteLetter(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('generated_letters').delete().eq('id', id);
  if (error) { console.error('deleteLetter error:', error); return false; }
  return true;
}
