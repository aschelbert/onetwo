export type IssuePriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IssueStatus = 'SUBMITTED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type IssueType = 'BUILDING_PUBLIC' | 'UNIT_PRIVATE';

export interface Issue {
  id: string;
  type: IssueType;
  category: string;
  priority: IssuePriority;
  status: IssueStatus;
  title: string;
  description: string;
  reportedBy: string;
  reporterName: string;
  reporterEmail: string;
  unitNumber?: string;
  submittedDate: string;
  upvotes: Array<{ userId: string; userName: string; unitNumber: string }>;
  viewCount: number;
  comments: Array<{
    id: string;
    author: string;
    text: string;
    date: string;
  }>;
  reviewNotes: Array<{
    id: string;
    author: string;
    text: string;
    date: string;
  }>;
  comms: CaseComm[];
}

export type CasePriority = 'urgent' | 'high' | 'medium' | 'low';
export type CaseApproach = 'pre' | 'self' | 'legal';
export type CaseStatus = 'open' | 'closed';

export interface CaseStep {
  id: string;
  s: string;
  t?: string;
  d?: string | null;
  detail?: string | null;
  w?: string;
  action?: { type: 'navigate' | 'modal' | 'inline'; target: string; label: string };
  done: boolean;
  doneDate: string | null;
  userNotes: string;
  stepAttachments?: CaseAttachment[];
}

export interface AdditionalApproach {
  approach: CaseApproach;
  addedDate: string;
  steps: CaseStep[];
}

export interface CaseComm {
  id: string;
  type: string;
  subject: string;
  date: string;
  method: string;
  recipient: string;
  sentBy: string;
  notes: string;
  status: string;
}

export interface CaseAttachment {
  name: string;
  type: string;
  date: string;
  size: string;
}

export interface BoardVote {
  motion: string;
  date: string;
  votes: Array<{ name: string; role: string; vote: string }>;
}

export interface CaseTrackerCase {
  id: string;
  catId: string;
  sitId: string;
  title: string;
  unit: string;
  owner: string;
  approach: CaseApproach;
  status: CaseStatus;
  priority: CasePriority;
  created: string;
  notes: string;
  steps: CaseStep[] | null;
  linkedWOs: string[];
  linkedLetterIds: string[];
  linkedInvoiceIds: string[];
  linkedMeetingIds: string[];
  attachments: CaseAttachment[];
  boardVotes: BoardVote | null;
  additionalApproaches: AdditionalApproach[];
  comms: CaseComm[];
  assignedTo?: string;
  assignedRole?: string;
  dueDate?: string;
  source?: string;
  sourceId?: string;
  completedAt?: string;
}
