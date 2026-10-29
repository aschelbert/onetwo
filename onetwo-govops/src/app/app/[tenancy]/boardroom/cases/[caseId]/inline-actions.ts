'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { getTenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'
import { revalidatePath } from 'next/cache'
import type { StepAttachment, CaseEvent, CaseVote, FormalNotice } from '@/types/inline-actions'

// Data tables (step_attachments, case_events, case_votes, formal_notices) live in
// the TENANT Supabase project. Use getTenantSupabaseAdmin() for data queries;
// createServerSupabase() for auth only. Storage buckets are also on the tenant project.
/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Attachments ────────────────────────────────────────────────────────────

export async function uploadStepAttachment(
  caseId: string,
  stepNumber: number,
  tenantId: string,
  formData: FormData
): Promise<StepAttachment> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const db = getTenantSupabaseAdmin()

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const ext = file.name.split('.').pop() ?? ''
  const uid = crypto.randomUUID()
  const storagePath = `${tenantId}/${caseId}/${stepNumber}/${uid}.${ext}`

  // Storage upload uses the tenant project
  const { error: uploadErr } = await db.storage
    .from('case-attachments')
    .upload(storagePath, file, { contentType: file.type })

  if (uploadErr) throw new Error(uploadErr.message)

  const { data, error } = await (db as any)
    .from('step_attachments')
    .insert({
      tenant_id: tenantId,
      case_id: caseId,
      step_number: stepNumber,
      file_name: file.name,
      file_size: file.size,
      content_type: file.type,
      storage_path: storagePath,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/boardroom/cases/${caseId}`)
  return data as StepAttachment
}

export async function deleteStepAttachment(attachmentId: string): Promise<void> {
  const db = getTenantSupabaseAdmin()

  // Fetch the record to get storage_path
  const { data: att, error: fetchErr } = await (db as any)
    .from('step_attachments')
    .select('storage_path, case_id')
    .eq('id', attachmentId)
    .single()

  if (fetchErr) throw new Error(fetchErr.message)

  // Delete from storage
  await db.storage.from('case-attachments').remove([att.storage_path])

  // Delete the row
  const { error } = await (db as any)
    .from('step_attachments')
    .delete()
    .eq('id', attachmentId)

  if (error) throw new Error(error.message)
  revalidatePath(`/boardroom/cases/${att.case_id}`)
}

export async function getStepAttachments(
  caseId: string,
  stepNumber: number
): Promise<StepAttachment[]> {
  const db = getTenantSupabaseAdmin()

  const { data, error } = await (db as any)
    .from('step_attachments')
    .select('*')
    .eq('case_id', caseId)
    .eq('step_number', stepNumber)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as StepAttachment[]
}

export async function getAttachmentSignedUrl(storagePath: string): Promise<string> {
  const db = getTenantSupabaseAdmin()

  const { data, error } = await db.storage
    .from('case-attachments')
    .createSignedUrl(storagePath, 60 * 60) // 1 hour expiry

  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ─── Events ─────────────────────────────────────────────────────────────────

export async function createCaseEvent(
  caseId: string,
  tenantId: string,
  eventData: {
    stepNumber?: number
    eventType: 'meeting' | 'deadline' | 'reminder'
    title: string
    description?: string
    location?: string
    startsAt: string
    endsAt?: string
    allDay?: boolean
  }
): Promise<CaseEvent> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const db = getTenantSupabaseAdmin()

  const { data, error } = await (db as any)
    .from('case_events')
    .insert({
      tenant_id: tenantId,
      case_id: caseId,
      step_number: eventData.stepNumber ?? null,
      event_type: eventData.eventType,
      title: eventData.title,
      description: eventData.description ?? null,
      location: eventData.location ?? null,
      starts_at: eventData.startsAt,
      ends_at: eventData.endsAt ?? null,
      all_day: eventData.allDay ?? false,
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/boardroom/cases/${caseId}`)
  return data as CaseEvent
}

export async function getCaseEvents(
  caseId: string,
  stepNumber?: number
): Promise<CaseEvent[]> {
  const db = getTenantSupabaseAdmin()

  let query = (db as any)
    .from('case_events')
    .select('*')
    .eq('case_id', caseId)
    .order('starts_at', { ascending: true })

  if (stepNumber !== undefined) {
    query = query.eq('step_number', stepNumber)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as CaseEvent[]
}

// ─── Votes ──────────────────────────────────────────────────────────────────

export async function createCaseVote(
  caseId: string,
  tenantId: string,
  voteData: {
    stepNumber?: number
    motion: string
    voteType: 'simple_majority' | 'super_majority' | 'unanimous'
  }
): Promise<CaseVote> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const db = getTenantSupabaseAdmin()

  const { data, error } = await (db as any)
    .from('case_votes')
    .insert({
      tenant_id: tenantId,
      case_id: caseId,
      step_number: voteData.stepNumber ?? null,
      motion: voteData.motion,
      vote_type: voteData.voteType,
      status: 'open',
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/boardroom/cases/${caseId}`)
  return data as CaseVote
}

export async function castVote(
  voteId: string,
  voterName: string,
  voterRole: string | null,
  vote: 'yea' | 'nay' | 'abstain'
): Promise<void> {
  const db = getTenantSupabaseAdmin()

  const { error } = await (db as any)
    .from('case_vote_tallies')
    .insert({
      vote_id: voteId,
      voter_name: voterName,
      voter_role: voterRole,
      vote,
    })

  if (error) throw new Error(error.message)
}

export async function closeVote(
  voteId: string,
  outcome: 'passed' | 'failed' | 'tabled'
): Promise<void> {
  const db = getTenantSupabaseAdmin()

  const { error } = await (db as any)
    .from('case_votes')
    .update({ status: outcome, closed_at: new Date().toISOString() })
    .eq('id', voteId)

  if (error) throw new Error(error.message)
}

export async function getCaseVotes(
  caseId: string,
  stepNumber?: number
): Promise<CaseVote[]> {
  const db = getTenantSupabaseAdmin()

  let query = (db as any)
    .from('case_votes')
    .select('*, case_vote_tallies(*)')
    .eq('case_id', caseId)
    .order('opened_at', { ascending: false })

  if (stepNumber !== undefined) {
    query = query.eq('step_number', stepNumber)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return ((data ?? []) as any[]).map((v) => ({
    ...v,
    tallies: v.case_vote_tallies ?? [],
  })) as CaseVote[]
}

// ─── Notices ────────────────────────────────────────────────────────────────

export async function createFormalNotice(
  caseId: string,
  tenantId: string,
  noticeData: {
    stepNumber?: number
    noticeType: 'formal_notice' | 'certified_mail'
    recipientName: string
    recipientAddress?: string
    subject: string
    body: string
    trackingNumber?: string
  }
): Promise<FormalNotice> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const db = getTenantSupabaseAdmin()

  const { data, error } = await (db as any)
    .from('formal_notices')
    .insert({
      tenant_id: tenantId,
      case_id: caseId,
      step_number: noticeData.stepNumber ?? null,
      notice_type: noticeData.noticeType,
      recipient_name: noticeData.recipientName,
      recipient_address: noticeData.recipientAddress ?? null,
      subject: noticeData.subject,
      body: noticeData.body,
      tracking_number: noticeData.trackingNumber ?? null,
      status: 'draft',
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/boardroom/cases/${caseId}`)
  return data as FormalNotice
}

export async function updateNoticeStatus(
  noticeId: string,
  status: 'draft' | 'sent' | 'delivered' | 'returned',
  trackingNumber?: string
): Promise<void> {
  const db = getTenantSupabaseAdmin()

  const updates: Record<string, unknown> = { status }
  if (status === 'sent') updates.sent_at = new Date().toISOString()
  if (trackingNumber !== undefined) updates.tracking_number = trackingNumber

  const { error } = await (db as any)
    .from('formal_notices')
    .update(updates)
    .eq('id', noticeId)

  if (error) throw new Error(error.message)
}

export async function getFormalNotices(
  caseId: string,
  stepNumber?: number
): Promise<FormalNotice[]> {
  const db = getTenantSupabaseAdmin()

  let query = (db as any)
    .from('formal_notices')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })

  if (stepNumber !== undefined) {
    query = query.eq('step_number', stepNumber)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as FormalNotice[]
}

// ─── Batch-create calendar events from PM tasks ──────────────────────

export async function batchCreateCaseEvents(
  caseId: string,
  tenantId: string,
  events: Array<{
    stepNumber?: number
    eventType: 'deadline' | 'reminder' | 'meeting'
    title: string
    description?: string
    startsAt: string
    allDay: boolean
  }>
): Promise<CaseEvent[]> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const db = getTenantSupabaseAdmin()

  const rows = events.map((e) => ({
    tenant_id: tenantId,
    case_id: caseId,
    step_number: e.stepNumber ?? null,
    event_type: e.eventType,
    title: e.title,
    description: e.description ?? null,
    location: null,
    starts_at: e.startsAt,
    ends_at: null,
    all_day: e.allDay,
    created_by: user?.id ?? null,
  }))

  const { data, error } = await (db as any)
    .from('case_events')
    .insert(rows)
    .select()

  if (error) throw new Error(error.message)
  revalidatePath(`/boardroom/cases/${caseId}`)
  return (data ?? []) as CaseEvent[]
}
