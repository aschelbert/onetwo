import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Communication,
  DeliveryChannel,
  CommunicationSource,
  ComposePanelContext,
  AnnouncementPriority,
} from '@/types/communication';
import type { MailDeliveryMethod } from '@/types/mail';
import { PRICING, calculateMailingCost } from '@/types/mail';
import { useComplianceStore } from './useComplianceStore';
import { useIssuesStore } from './useIssuesStore';

interface CommunicationsState {
  communications: Communication[];
  addCommunication: (comm: Communication) => void;
  updateCommunication: (id: string, partial: Partial<Communication>) => void;
  getCommunicationsByCase: (caseId: string) => Communication[];
  sendCommunication: (params: {
    scope: 'community' | 'unit';
    subject: string;
    body: string;
    templateId: string | null;
    templateName: string | null;
    channels: DeliveryChannel[];
    recipientUnit: string | null;
    recipientName: string | null;
    recipientEmail: string | null;
    mailDeliveryMethod: MailDeliveryMethod | null;
    mailLetterCount: number;
    announcementPriority?: AnnouncementPriority;
    caseId: string | null;
    stepIdx: number | null;
    source: CommunicationSource;
    createdBy: string;
  }) => Communication;
}

const SEED_COMMUNICATIONS: Communication[] = [
  {
    id: 'comm_1',
    scope: 'unit',
    recipientUnit: '502',
    recipientName: 'Emma Johnson',
    recipientEmail: 'emma.j@email.com',
    recipientAddress: null,
    subject: 'Violation Notice — Unit 502 — Unauthorized Balcony Enclosure',
    body: 'Dear Emma Johnson,\n\nThe Board of Directors hereby notifies you...',
    templateId: 'lt1',
    templateName: 'Violation Notice — First Warning',
    channels: ['email', 'mail'],
    emailStatus: 'delivered',
    mailStatus: 'In Transit',
    mailDeliveryMethod: 'certified-electronic-return-receipt',
    mailCostCents: 1116,
    mailLetterCount: 1,
    caseId: 'c31',
    stepIdx: 2,
    source: 'case-workflow',
    createdAt: '2026-03-01',
    createdBy: 'John Smith',
    sentAt: '2026-03-01',
    status: 'sent',
  },
  {
    id: 'comm_2',
    scope: 'community',
    recipientUnit: null,
    recipientName: null,
    recipientEmail: null,
    recipientAddress: null,
    subject: 'March Board Meeting — Agenda Published',
    body: 'Dear Homeowners,\n\nThe next Board meeting is scheduled for...',
    templateId: null,
    templateName: null,
    channels: ['announcement', 'email'],
    announcementPriority: 'normal',
    emailStatus: 'delivered',
    emailDeliveredCount: 12,
    emailBouncedCount: 0,
    mailStatus: null,
    mailDeliveryMethod: null,
    mailCostCents: 0,
    caseId: null,
    stepIdx: null,
    source: 'compose',
    createdAt: '2026-02-20',
    createdBy: 'Robert Mitchell',
    sentAt: '2026-02-20',
    status: 'sent',
  },
  {
    id: 'comm_3',
    scope: 'community',
    recipientUnit: null,
    recipientName: null,
    recipientEmail: null,
    recipientAddress: null,
    subject: 'Annual Budget & Assessment Notice',
    body: 'Dear Homeowners,\n\nThe Board has approved the 2026-2027 operating budget...',
    templateId: null,
    templateName: 'Annual Budget & Assessment Notice',
    channels: ['announcement', 'email', 'mail'],
    announcementPriority: 'important',
    emailStatus: 'delivered',
    emailDeliveredCount: 12,
    emailBouncedCount: 1,
    mailStatus: 'Delivered',
    mailDeliveryMethod: 'first-class',
    mailCostCents: 1476,
    mailLetterCount: 12,
    caseId: null,
    stepIdx: null,
    source: 'compose',
    createdAt: '2026-01-15',
    createdBy: 'Robert Mitchell',
    sentAt: '2026-01-15',
    status: 'sent',
  },
  {
    id: 'comm_4',
    scope: 'unit',
    recipientUnit: '403',
    recipientName: 'Maria Garcia',
    recipientEmail: 'maria.g@email.com',
    recipientAddress: null,
    subject: 'Assessment Delinquency Notice',
    body: 'Dear Maria Garcia,\n\nOur records indicate that your account has a past-due balance...',
    templateId: 'lt2',
    templateName: 'Collection — Past Due Notice',
    channels: ['email', 'mail'],
    emailStatus: 'delivered',
    mailStatus: 'Delivered',
    mailDeliveryMethod: 'first-class',
    mailCostCents: 123,
    mailLetterCount: 1,
    caseId: null,
    stepIdx: null,
    source: 'compose',
    createdAt: '2026-01-10',
    createdBy: 'Robert Mitchell',
    sentAt: '2026-01-10',
    status: 'sent',
  },
];

export const useCommunicationsStore = create<CommunicationsState>()(persist((set, get) => ({
  communications: SEED_COMMUNICATIONS,

  addCommunication: (comm) => {
    set(s => ({ communications: [comm, ...s.communications] }));
  },

  updateCommunication: (id, partial) => {
    set(s => ({
      communications: s.communications.map(c => c.id === id ? { ...c, ...partial } : c),
    }));
  },

  getCommunicationsByCase: (caseId) => {
    return get().communications.filter(c => c.caseId === caseId);
  },

  sendCommunication: (params) => {
    const id = 'comm_' + Date.now();
    const now = new Date().toISOString().split('T')[0];

    // Calculate mail cost
    let mailCostCents = 0;
    if (params.channels.includes('mail') && params.mailDeliveryMethod) {
      const priceKey = params.mailDeliveryMethod === 'certified-electronic-return-receipt'
        ? 'certified-electronic-return-receipt'
        : params.mailDeliveryMethod;
      mailCostCents = (PRICING[priceKey] || 0) * params.mailLetterCount;
    }

    const comm: Communication = {
      id,
      scope: params.scope,
      recipientUnit: params.recipientUnit,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      recipientAddress: null,
      subject: params.subject,
      body: params.body,
      templateId: params.templateId,
      templateName: params.templateName,
      channels: params.channels,
      announcementPriority: params.announcementPriority,
      emailStatus: params.channels.includes('email') ? 'sent' : null,
      emailDeliveredCount: params.scope === 'community' ? params.mailLetterCount : undefined,
      mailStatus: params.channels.includes('mail') ? 'Submitted' : null,
      mailDeliveryMethod: params.mailDeliveryMethod,
      mailCostCents,
      mailLetterCount: params.channels.includes('mail') ? params.mailLetterCount : undefined,
      caseId: params.caseId,
      stepIdx: params.stepIdx,
      source: params.source,
      createdAt: now,
      createdBy: params.createdBy,
      sentAt: now,
      status: 'sent',
    };

    set(s => ({ communications: [comm, ...s.communications] }));

    // If community scope, create an announcement
    if (params.scope === 'community' && params.channels.includes('announcement')) {
      const catMap: Record<string, string> = {
        'board-update': 'general',
        'maintenance-alert': 'maintenance',
        'meeting-notice': 'meeting',
        'budget-notice': 'financial',
        'election-notice': 'meeting',
        'policy-change': 'rules',
      };
      const annCategory = catMap[params.templateId || ''] || 'general';
      useComplianceStore.getState().addAnnouncement({
        title: params.subject,
        body: params.body,
        category: annCategory as any,
        postedBy: params.createdBy,
        postedDate: now,
        pinned: params.announcementPriority === 'urgent' || params.announcementPriority === 'important',
      });
    }

    // If from a case workflow, add a trail entry
    if (params.caseId) {
      const channelList = params.channels.map(c =>
        c === 'mail' ? `Physical Mail (${params.mailDeliveryMethod || 'mail'})` :
        c === 'email' ? 'Email' : 'Announcement'
      ).join(' + ');
      const costStr = mailCostCents > 0 ? ` Cost: $${(mailCostCents / 100).toFixed(2)}.` : '';

      const today = new Date().toISOString().split('T')[0];
      useIssuesStore.getState().addTrailEntry(params.caseId, {
        type: 'notice_sent',
        date: today,
        actor: params.createdBy,
        summary: `"${params.subject}" sent via ${channelList}${params.recipientName ? ` to ${params.recipientName}` : ' to All Owners'}.${costStr}`,
      });
    }

    return comm;
  },
}), {
  name: 'communications-store',
  version: 2,
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
    communications: persisted?.communications?.length ? persisted.communications : current.communications,
  }),
}));
