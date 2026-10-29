export interface StepAttachment {
  id: string
  tenant_id: string
  case_id: string
  step_number: number
  file_name: string
  file_size: number | null
  content_type: string | null
  storage_path: string
  uploaded_by: string | null
  created_at: string
}

export interface CaseEvent {
  id: string
  tenant_id: string
  case_id: string
  step_number: number | null
  event_type: 'meeting' | 'deadline' | 'reminder'
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  created_by: string | null
  created_at: string
}

export interface CaseVote {
  id: string
  tenant_id: string
  case_id: string
  step_number: number | null
  motion: string
  vote_type: 'simple_majority' | 'super_majority' | 'unanimous'
  status: 'open' | 'passed' | 'failed' | 'tabled'
  opened_at: string
  closed_at: string | null
  created_by: string | null
  tallies?: CaseVoteTally[]
}

export interface CaseVoteTally {
  id: string
  vote_id: string
  voter_name: string
  voter_role: string | null
  vote: 'yea' | 'nay' | 'abstain'
  cast_at: string
}

export interface FormalNotice {
  id: string
  tenant_id: string
  case_id: string
  step_number: number | null
  notice_type: 'formal_notice' | 'certified_mail'
  recipient_name: string
  recipient_address: string | null
  subject: string
  body: string
  tracking_number: string | null
  status: 'draft' | 'sent' | 'delivered' | 'returned'
  sent_at: string | null
  created_by: string | null
  created_at: string
}
