import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  MailRecord,
  MailingSettings,
  MailDeliveryMethod,
  MailStatus,
  PostalAddress,
} from '@/types/mail';
import { calculateMailingCost } from '@/types/mail';
import { useIssuesStore } from './useIssuesStore';

interface MailState {
  mailingSettings: MailingSettings;
  mailRecords: MailRecord[];
  updateMailingSettings: (partial: Partial<MailingSettings>) => void;
  addMailRecord: (record: MailRecord) => void;
  updateMailRecord: (id: string, partial: Partial<MailRecord>) => void;
  getMailRecordsByCase: (caseId: string) => MailRecord[];
  sendNotice: (params: {
    caseId: string;
    stepId?: string;
    tenantId: string;
    templateId: string;
    templateName: string;
    recipient: { name: string; address: PostalAddress };
    deliveryMethod: MailDeliveryMethod;
    pageCount: number;
    includeReturnEnvelope: boolean;
    emailCopy: boolean;
    emailAddress?: string;
    mergeVariables: Record<string, string>;
  }) => Promise<MailRecord>;
}

export const useMailStore = create<MailState>()(persist((set, get) => ({
  mailingSettings: {
    enabled: true,
    stripePaymentMethodId: '',
    stripeCustomerId: '',
    cardLast4: '6411',
    cardBrand: 'Visa',
    senderAddress: {
      line1: '1234 Constitution Avenue NW',
      city: 'Washington',
      state: 'DC',
      zip: '20001',
    },
    senderName: 'Castle Condos HOA',
    defaultDeliveryMethod: 'certified',
    enableEmailCopy: true,
    glAccountPostage: '6900',
  },
  mailRecords: [],

  updateMailingSettings: (partial) => {
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...partial } }));
  },

  addMailRecord: (record) => {
    set(s => ({ mailRecords: [record, ...s.mailRecords] }));
  },

  updateMailRecord: (id, partial) => {
    set(s => ({
      mailRecords: s.mailRecords.map(r => r.id === id ? { ...r, ...partial } : r),
    }));
  },

  getMailRecordsByCase: (caseId) => {
    return get().mailRecords.filter(r => r.caseId === caseId);
  },

  sendNotice: async (params) => {
    const settings = get().mailingSettings;
    const cost = calculateMailingCost(params.deliveryMethod, params.pageCount, params.includeReturnEnvelope);
    const now = new Date().toISOString();
    const id = 'mr_' + Date.now();

    const record: MailRecord = {
      id,
      caseId: params.caseId,
      stepId: params.stepId,
      tenantId: params.tenantId,
      templateId: params.templateId,
      templateName: params.templateName,
      recipient: params.recipient,
      sender: {
        name: settings.senderName,
        address: settings.senderAddress,
      },
      deliveryMethod: params.deliveryMethod,
      status: 'draft',
      statusHistory: [{ status: 'draft', timestamp: now, source: 'system', detail: 'Notice created' }],
      cost,
      pageCount: params.pageCount,
      includeReturnEnvelope: params.includeReturnEnvelope,
      emailCopy: params.emailCopy,
      emailAddress: params.emailAddress,
      mergeVariables: params.mergeVariables,
      createdAt: now,
    };

    // Simulate the send flow with status progression
    set(s => ({ mailRecords: [record, ...s.mailRecords] }));

    const advanceStatus = (newStatus: MailStatus, detail: string) => {
      const ts = new Date().toISOString();
      set(s => ({
        mailRecords: s.mailRecords.map(r => {
          if (r.id !== id) return r;
          return {
            ...r,
            status: newStatus,
            statusHistory: [...r.statusHistory, { status: newStatus, timestamp: ts, source: 'system', detail }],
            ...(newStatus === 'submitted' ? { sentAt: ts, letterstreamJobId: 'ls_sim_' + Date.now() } : {}),
          };
        }),
      }));
    };

    // Simulate flow: draft → approved → charging → submitted
    await new Promise(res => setTimeout(res, 300));
    advanceStatus('approved', 'Notice approved for sending');

    await new Promise(res => setTimeout(res, 300));
    advanceStatus('charging', `Charging ${settings.cardBrand} ending ${settings.cardLast4}`);

    await new Promise(res => setTimeout(res, 400));
    advanceStatus('submitted', 'Submitted to LetterStream for processing');

    // Add Decision Trail entry
    useIssuesStore.getState().addTrailEntry(params.caseId, {
      type: 'notice_sent',
      date: new Date().toISOString(),
      actor: 'Board',
      summary: `Sent "${params.templateName}" via ${params.deliveryMethod.replace(/-/g, ' ')} to ${params.recipient.name}`,
      details: `Cost: $${(cost.totalCents / 100).toFixed(2)} | Delivery method: ${params.deliveryMethod}`,
    });

    return get().mailRecords.find(r => r.id === id)!;
  },
}), {
  name: 'onetwo-mail',
}));
