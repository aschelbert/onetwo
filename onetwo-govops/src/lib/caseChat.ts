import { createClient } from './supabase/client'
import type { CaseThread, CaseMessage, ThreadType } from '../types/caseChat'

function getSupabase() {
  return createClient()
}

/** Get or create a thread for a case. */
export async function getOrCreateThread(
  caseId: string,
  tenantId: string,
  threadType: ThreadType
): Promise<CaseThread> {
  const supabase = getSupabase()

  const { data: existing } = await supabase
    .from('case_threads' as any)
    .select('*')
    .eq('case_id', caseId)
    .eq('thread_type', threadType)
    .single()

  if (existing) return existing as unknown as CaseThread

  const { data, error } = await supabase
    .from('case_threads' as any)
    .insert({ case_id: caseId, tenant_id: tenantId, thread_type: threadType })
    .select()
    .single()

  if (error) throw error
  return data as unknown as CaseThread
}

/** Fetch all messages for a thread, oldest first. */
export async function fetchMessages(threadId: string): Promise<CaseMessage[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('case_messages' as any)
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as CaseMessage[]
}

/** Send a message. */
export async function sendMessage(params: {
  threadId: string
  caseId: string
  tenantId: string
  senderId: string
  senderName: string
  senderRole: string
  body: string
  msgType?: string
  eventMeta?: Record<string, unknown>
  attachmentUrl?: string
  attachmentName?: string
}): Promise<CaseMessage> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('case_messages' as any)
    .insert({
      thread_id: params.threadId,
      case_id: params.caseId,
      tenant_id: params.tenantId,
      sender_id: params.senderId,
      sender_name: params.senderName,
      sender_role: params.senderRole,
      body: params.body,
      msg_type: params.msgType ?? 'message',
      event_meta: params.eventMeta ?? null,
      attachment_url: params.attachmentUrl ?? null,
      attachment_name: params.attachmentName ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as unknown as CaseMessage
}

/** Mark messages as read by current user. */
export async function markMessagesRead(
  messageIds: string[],
  userId: string
): Promise<void> {
  const supabase = getSupabase()
  for (const msgId of messageIds) {
    await supabase.rpc('mark_case_message_read' as any, {
      p_message_id: msgId,
      p_user_id: userId,
    })
  }
}

/** Subscribe to new messages in a thread. Returns unsubscribe function. */
export function subscribeToThread(
  threadId: string,
  onMessage: (msg: CaseMessage) => void
): () => void {
  const supabase = getSupabase()

  const channel = supabase
    .channel(`case-chat-${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'case_messages',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => onMessage(payload.new as CaseMessage)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
