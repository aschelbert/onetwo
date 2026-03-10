// ─── Property Log ───────────────────────────────────────────────

export type PropertyLogType =
  | 'walkthrough'
  | 'inspection'
  | 'condition_assessment'
  | 'incident'
  | 'maintenance_observation'

export type PropertyLogStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface PropertyLogFinding {
  id: string
  area: string
  condition: string
  description: string
  photo_urls: string[]
}

export interface PropertyLogActionItem {
  id: string
  description: string
  assigned_to: string
  due_date: string
  status: 'pending' | 'in_progress' | 'done'
}

export interface PropertyLog {
  id: string
  tenant_id: string
  type: PropertyLogType
  title: string
  date: string
  conducted_by: string
  location: string
  status: PropertyLogStatus
  findings: PropertyLogFinding[]
  action_items: PropertyLogActionItem[]
  notes: string
  created_at: string
  updated_at: string
}

// ─── PM Scorecard ───────────────────────────────────────────────

export type ScorecardCategory =
  | 'responsiveness'
  | 'maintenance_quality'
  | 'communication'
  | 'financial_management'
  | 'compliance'
  | 'resident_satisfaction'

export const SCORECARD_CATEGORIES: { value: ScorecardCategory; label: string; description: string }[] = [
  { value: 'responsiveness', label: 'Responsiveness', description: 'Response time to requests and issues' },
  { value: 'maintenance_quality', label: 'Maintenance Quality', description: 'Quality and timeliness of maintenance work' },
  { value: 'communication', label: 'Communication', description: 'Clarity and frequency of communication' },
  { value: 'financial_management', label: 'Financial Management', description: 'Budget adherence, financial reporting' },
  { value: 'compliance', label: 'Compliance', description: 'Regulatory and legal compliance' },
  { value: 'resident_satisfaction', label: 'Resident Satisfaction', description: 'Resident happiness and complaint resolution' },
]

export interface PMScorecardEntry {
  id: string
  tenant_id: string
  period: string
  category: ScorecardCategory
  score: number
  notes: string
  scored_by: string
  created_at: string
  updated_at: string
}

export interface PMScorecardReview {
  id: string
  tenant_id: string
  period: string
  overall_rating: number
  summary: string
  strengths: string[]
  improvements: string[]
  reviewed_by: string
  created_at: string
  updated_at: string
}

export function getScoreBand(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'Strong', color: '#047857', bg: '#ecfdf5' }
  if (score >= 50) return { label: 'Moderate', color: '#a16207', bg: '#fef9c3' }
  return { label: 'Needs Improvement', color: '#d12626', bg: '#fef2f2' }
}

// ─── Task Tracking ──────────────────────────────────────────────

export type TaskCategory =
  | 'maintenance'
  | 'administrative'
  | 'compliance'
  | 'communication'
  | 'financial'
  | 'other'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled'

export interface AssociationTask {
  id: string
  tenant_id: string
  title: string
  description: string
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  assigned_to: string | null
  created_by: string
  due_date: string | null
  completed_at: string | null
  property_log_id: string | null
  notes: string
  created_at: string
  updated_at: string
  // joined fields
  assigned_user_name?: string
  created_by_name?: string
}

export const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'communication', label: 'Communication' },
  { value: 'financial', label: 'Financial' },
  { value: 'other', label: 'Other' },
]

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-800' },
  high: { label: 'High', className: 'bg-amber-100 text-amber-800' },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-800' },
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; variant: string }> = {
  backlog: { label: 'Backlog', variant: 'gray' },
  todo: { label: 'To Do', variant: 'blue' },
  in_progress: { label: 'In Progress', variant: 'amber' },
  done: { label: 'Done', variant: 'green' },
  canceled: { label: 'Canceled', variant: 'gray' },
}
