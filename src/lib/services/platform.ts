import { supabase } from '@/lib/supabase';
import type {
  SupportTicket, EmailTemplate,
  Announcement as PlatformAnnouncement,
} from '@/store/usePlatformAdminStore';

// ── Support Tickets ──

function rowToTicket(r: Record<string, unknown>): SupportTicket {
  return {
    id: r.id as string,
    buildingId: r.building_id as string,
    buildingName: r.building_name as string,
    subject: r.subject as string,
    description: r.description as string,
    status: r.status as SupportTicket['status'],
    priority: r.priority as SupportTicket['priority'],
    assignedTo: (r.assigned_to as string) || null,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    notes: (r.notes || []) as SupportTicket['notes'],
  };
}

export async function fetchTickets(): Promise<SupportTicket[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchTickets error:', error); return null; }
  return (data || []).map(rowToTicket);
}

export async function createTicket(ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'notes'>): Promise<SupportTicket | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      building_id: ticket.buildingId, building_name: ticket.buildingName,
      subject: ticket.subject, description: ticket.description,
      status: ticket.status, priority: ticket.priority,
      assigned_to: ticket.assignedTo, created_by: ticket.createdBy,
    })
    .select()
    .single();
  if (error) { console.error('createTicket error:', error); return null; }
  return rowToTicket(data);
}

export async function updateTicket(id: string, updates: Partial<SupportTicket>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.assignedTo !== undefined) row.assigned_to = updates.assignedTo;
  if (updates.notes !== undefined) row.notes = updates.notes;
  const { error } = await supabase.from('support_tickets').update(row).eq('id', id);
  if (error) { console.error('updateTicket error:', error); return false; }
  return true;
}

// ── Email Templates ──

function rowToTemplate(r: Record<string, unknown>): EmailTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    subject: r.subject as string,
    body: r.body as string,
    trigger: r.trigger as EmailTemplate['trigger'],
    lastEdited: r.last_edited as string,
  };
}

export async function fetchTemplates(): Promise<EmailTemplate[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('name');
  if (error) { console.error('fetchTemplates error:', error); return null; }
  return (data || []).map(rowToTemplate);
}

export async function createTemplate(t: Omit<EmailTemplate, 'id' | 'lastEdited'>): Promise<EmailTemplate | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('email_templates')
    .insert({ name: t.name, subject: t.subject, body: t.body, trigger: t.trigger })
    .select()
    .single();
  if (error) { console.error('createTemplate error:', error); return null; }
  return rowToTemplate(data);
}

export async function updateTemplate(id: string, updates: Partial<EmailTemplate>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.subject !== undefined) row.subject = updates.subject;
  if (updates.body !== undefined) row.body = updates.body;
  if (updates.trigger !== undefined) row.trigger = updates.trigger;
  if (updates.lastEdited !== undefined) row.last_edited = updates.lastEdited;
  const { error } = await supabase.from('email_templates').update(row).eq('id', id);
  if (error) { console.error('updateTemplate error:', error); return false; }
  return true;
}

// ── Platform Announcements ──

function rowToAnnouncement(r: Record<string, unknown>): PlatformAnnouncement {
  return {
    id: r.id as string,
    title: r.title as string,
    message: r.message as string,
    audience: r.audience as string,
    status: r.status as 'draft' | 'sent',
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    sentAt: (r.sent_at as string) || null,
  };
}

export async function fetchPlatformAnnouncements(): Promise<PlatformAnnouncement[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('platform_announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchPlatformAnnouncements error:', error); return null; }
  return (data || []).map(rowToAnnouncement);
}

export async function createPlatformAnnouncement(a: Omit<PlatformAnnouncement, 'id' | 'createdAt' | 'sentAt'>): Promise<PlatformAnnouncement | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('platform_announcements')
    .insert({ title: a.title, message: a.message, audience: a.audience, status: a.status, created_by: a.createdBy })
    .select()
    .single();
  if (error) { console.error('createPlatformAnnouncement error:', error); return null; }
  return rowToAnnouncement(data);
}

export async function updatePlatformAnnouncement(id: string, updates: Partial<PlatformAnnouncement>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.message !== undefined) row.message = updates.message;
  if (updates.audience !== undefined) row.audience = updates.audience;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.sentAt !== undefined) row.sent_at = updates.sentAt;
  const { error } = await supabase.from('platform_announcements').update(row).eq('id', id);
  if (error) { console.error('updatePlatformAnnouncement error:', error); return false; }
  return true;
}

export async function deletePlatformAnnouncement(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('platform_announcements').delete().eq('id', id);
  if (error) { console.error('deletePlatformAnnouncement error:', error); return false; }
  return true;
}
