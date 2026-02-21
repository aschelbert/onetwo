export type MeetingType = 'BOARD' | 'ANNUAL' | 'SPECIAL' | 'QUARTERLY' | 'COMMITTEE';
export type MeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface MeetingVote {
  id: string;
  motion: string;
  status: 'open' | 'closed';
  result?: string;
  votes: Array<{ name: string; role: string; vote: 'approve' | 'deny' | 'abstain' }>;
}

export interface AgendaItem {
  id: string;
  title: string;
  description: string;
  duration: number;
  presenter: string;
  type: 'discussion' | 'vote' | 'report' | 'other';
}

export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  date: string;
  time: string;
  location: string;
  status: MeetingStatus;
  description: string;
  agenda: AgendaItem[];
  attendees: {
    board: string[];
    residents: string[];
    guests: string[];
  };
  minutes: string;
  votes: MeetingVote[];
  documents: Array<{ name: string; type: string; size: string }>;
}
