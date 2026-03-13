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
import { supabase } from '@/lib/supabase';

interface MailState {
  mailingSettings: MailingSettings;
  mailRecords: MailRecord[];
  updateMailingSettings: (partial: Partial<MailingSettings>) => void;
  addMailRecord: (record: MailRecord) => void;
  updateMailRecord: (id: string, partial: Partial<MailRecord>) => void;
  getMailRecordsByCase: (caseId: string) => MailRecord[];
  loadMailingSettings: (tenantId: string) => Promise<void>;
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
    cardLast4: '',
    cardBrand: '',
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

  loadMailingSettings: async (tenantId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('financial_settings')
      .select('mailing_stripe_customer_id, mailing_stripe_payment_method, mailing_card_last4, mailing_card_brand')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) return;

    set(s => ({
      mailingSettings: {
        ...s.mailingSettings,
        stripeCustomerId: data.mailing_stripe_customer_id || '',
        stripePaymentMethodId: data.mailing_stripe_payment_method || '',
        cardLast4: data.mailing_card_last4 || '',
        cardBrand: data.mailing_card_brand || '',
      },
    }));
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

    // Add record in draft state
    set(s => ({ mailRecords: [record, ...s.mailRecords] }));

    const advanceStatus = (newStatus: MailStatus, detail: string, extra?: Partial<MailRecord>) => {
      const ts = new Date().toISOString();
      set(s => ({
        mailRecords: s.mailRecords.map(r => {
          if (r.id !== id) return r;
          return {
            ...r,
            status: newStatus,
            statusHistory: [...r.statusHistory, { status: newStatus, timestamp: ts, source: 'system', detail }],
            ...extra,
          };
        }),
      }));
    };

    // Advance to approved
    advanceStatus('approved', 'Notice approved for sending');

    // Advance to charging
    advanceStatus('charging', `Charging ${settings.cardBrand || 'card'} ending ${settings.cardLast4 || '****'}`);

    // Call the send-mail edge function for real charge + submit
    if (supabase) {
      const { data, error } = await supabase.functions.invoke('send-mail', {
        body: {
          recipientName: params.recipient.name,
          recipientAddress: params.recipient.address,
          senderName: settings.senderName,
          senderAddress: settings.senderAddress,
          deliveryMethod: params.deliveryMethod,
          templateId: params.templateId,
          mergeVariables: params.mergeVariables,
          pageCount: params.pageCount,
          includeReturnEnvelope: params.includeReturnEnvelope,
        },
      });

      if (error || data?.error) {
        const errorMsg = data?.error || error?.message || 'Send failed';
        advanceStatus('failed', errorMsg);
        throw new Error(errorMsg);
      }

      // Success — advance to submitted with IDs from the server
      advanceStatus('submitted', 'Submitted to LetterStream for processing', {
        sentAt: new Date().toISOString(),
        stripePaymentIntentId: data.paymentIntentId,
        letterstreamJobId: data.jobId,
      });
    } else {
      // Demo mode: simulate the flow
      await new Promise(res => setTimeout(res, 400));
      advanceStatus('submitted', 'Submitted to LetterStream for processing (demo)', {
        sentAt: new Date().toISOString(),
        letterstreamJobId: 'ls_sim_' + Date.now(),
      });
    }

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
