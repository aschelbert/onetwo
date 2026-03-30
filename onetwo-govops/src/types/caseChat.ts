export type ThreadType = 'internal' | 'owner'

export type MessageType = 'message' | 'note' | 'event' | 'step_complete' | 'status_change'

export type SenderRole = 'board' | 'pm' | 'owner' | 'system'

export interface CaseThread {
  id: string
  tenant_id: string
  case_id: string
  thread_type: ThreadType
  created_at: string
}

export interface CaseMessage {
  id: string
  tenant_id: string
  thread_id: string
  case_id: string
  sender_id: string | null
  sender_name: string
  sender_role: SenderRole
  msg_type: MessageType
  body: string
  event_meta: Record<string, unknown> | null
  attachment_url: string | null
  attachment_name: string | null
  read_by: string[]
  created_at: string
}

export interface CaseChatState {
  isOpen: boolean
  activeThread: ThreadType
  threads: Record<ThreadType, CaseThread | null>
  messages: Record<ThreadType, CaseMessage[]>
  unreadCounts: Record<ThreadType, number>
  isSending: boolean
  isLoading: boolean
}
