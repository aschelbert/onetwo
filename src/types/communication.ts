import type { PostalAddress, MailDeliveryMethod } from './mail';

// ── Delivery & Status Types ─────────────────────────────────

export type DeliveryChannel = 'announcement' | 'email' | 'mail';

export type CommunicationSource =
  | 'compose'
  | 'case-workflow'
  | 'scheduled'
  | 'system';

export type CommunicationStatus =
  | 'draft'
  | 'sending'
  | 'sent'
  | 'partial'
  | 'failed';

export type EmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed';

export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

// ── Communication Record ────────────────────────────────────

export interface Communication {
  id: string;
  scope: 'community' | 'unit';

  // Audience
  recipientUnit: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientAddress: PostalAddress | null;

  // Content
  subject: string;
  body: string;
  templateId: string | null;
  templateName: string | null;

  // Delivery
  channels: DeliveryChannel[];
  announcementPriority?: AnnouncementPriority;
  emailStatus: EmailStatus | null;
  emailDeliveredCount?: number;
  emailBouncedCount?: number;
  mailStatus: string | null;
  mailDeliveryMethod: MailDeliveryMethod | null;
  mailCostCents: number;
  mailLetterCount?: number;

  // Source
  caseId: string | null;
  stepIdx: number | null;
  source: CommunicationSource;

  // Metadata
  createdAt: string;
  createdBy: string;
  sentAt: string | null;
  status: CommunicationStatus;
}

// ── Compose Panel Context ───────────────────────────────────

export interface ComposePanelContext {
  scope?: 'community' | 'unit';
  scopeLocked?: boolean;
  recipientUnit?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientAddress?: string;
  caseId?: string;
  stepIdx?: number;
  caseLink?: string;
  source?: CommunicationSource;
  autoTemplateId?: string;
}
