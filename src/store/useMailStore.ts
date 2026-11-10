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
import { generateLocalId } from '@/lib/generateId';

/** What the board sees when a letter is sent without the building's LetterStream account on file. */
export const LETTERSTREAM_NOT_CONNECTED = "The building's LetterStream account isn't connected. Connect it under Settings → Mailing.";

/** The connect-letterstream function's answer. */
interface LetterStreamStatus {
  connected: boolean;
  apiIdMasked: string | null;
  status: string | null;
  connectedAt: string | null;
  partnerUrl: string | null;
  portalUrl: string | null;
  note?: string | null;
  error?: string;
}

interface MailState {
  mailingSettings: MailingSettings;
  mailRecords: MailRecord[];
  updateMailingSettings: (partial: Partial<MailingSettings>) => void;
  addMailRecord: (record: MailRecord) => void;
  updateMailRecord: (id: string, partial: Partial<MailRecord>) => void;
  getMailRecordsByCase: (caseId: string) => MailRecord[];
  /** Ask the server whether the building's LetterStream account is connected. */
  loadMailingSettings: (tenantId: string) => Promise<void>;
  /** Save the building's own LetterStream API ID and key (board only). Resolves to a note when saved but not yet verified. */
  connectLetterStream: (apiId: string, apiKey: string) => Promise<{ note?: string }>;
  disconnectLetterStream: () => Promise<void>;
  sendNotice: (params: {
    caseId: string;
    stepId?: string;
    tenantId: string;
    templateId: string;
    templateName: string;
    /** The rendered letter: what gets printed. */
    subject: string;
    body: string;
    recipient: { name: string; address: PostalAddress };
    deliveryMethod: MailDeliveryMethod;
    pageCount: number;
    includeReturnEnvelope: boolean;
    emailCopy: boolean;
    emailAddress?: string;
    mergeVariables: Record<string, string>;
  }) => Promise<MailRecord>;
}

const DEFAULT_SETTINGS: MailingSettings = {
  enabled: true,
  letterstreamConnected: false,
  letterstreamApiIdMasked: '',
  letterstreamConnectedAt: '',
  letterstreamStatus: '',
  letterstreamPartnerUrl: '',
  letterstreamPortalUrl: 'https://secure.letterstream.com/',
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
};

function fromStatus(s: LetterStreamStatus): Partial<MailingSettings> {
  return {
    letterstreamConnected: !!s.connected,
    letterstreamApiIdMasked: s.apiIdMasked || '',
    letterstreamConnectedAt: s.connectedAt || '',
    letterstreamStatus: s.status || '',
    letterstreamPartnerUrl: s.partnerUrl || '',
    letterstreamPortalUrl: s.portalUrl || DEFAULT_SETTINGS.letterstreamPortalUrl,
  };
}

export const useMailStore = create<MailState>()(persist((set, get) => ({
  mailingSettings: DEFAULT_SETTINGS,
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

  loadMailingSettings: async () => {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke('connect-letterstream', { body: { action: 'status' } });
    if (error || !data || data.error) return;
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...fromStatus(data as LetterStreamStatus) } }));
  },

  connectLetterStream: async (apiId, apiKey) => {
    if (!supabase) {
      // Demo mode: nothing to verify against, so just remember that it is connected.
      set(s => ({ mailingSettings: { ...s.mailingSettings, letterstreamConnected: true, letterstreamApiIdMasked: `••••${apiId.slice(-4)}`, letterstreamConnectedAt: new Date().toISOString(), letterstreamStatus: 'unverified' } }));
      return { note: 'Demo mode: saved locally, not verified with LetterStream.' };
    }
    const { data, error } = await supabase.functions.invoke('connect-letterstream', { body: { action: 'connect', apiId, apiKey } });
    if (error || !data || data.error) throw new Error(data?.error || error?.message || 'Could not connect the LetterStream account');
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...fromStatus(data as LetterStreamStatus) } }));
    return { note: (data as LetterStreamStatus).note || undefined };
  },

  disconnectLetterStream: async () => {
    if (supabase) {
      const { data, error } = await supabase.functions.invoke('connect-letterstream', { body: { action: 'disconnect' } });
      if (error || !data || data.error) throw new Error(data?.error || error?.message || 'Could not disconnect the LetterStream account');
    }
    set(s => ({ mailingSettings: { ...s.mailingSettings, letterstreamConnected: false, letterstreamApiIdMasked: '', letterstreamConnectedAt: '', letterstreamStatus: '' } }));
  },

  sendNotice: async (params) => {
    const settings = get().mailingSettings;
    const cost = calculateMailingCost(params.deliveryMethod, params.pageCount, params.includeReturnEnvelope);
    const now = new Date().toISOString();
    const id = generateLocalId('mr_');

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

    advanceStatus('approved', 'Notice approved for sending');

    if (!settings.letterstreamConnected) {
      advanceStatus('failed', LETTERSTREAM_NOT_CONNECTED);
      throw new Error(LETTERSTREAM_NOT_CONNECTED);
    }

    if (supabase) {
      // The server renders the PDF and pushes it into the building's LetterStream account.
      const { data, error } = await supabase.functions.invoke('send-mail', {
        body: {
          recipientName: params.recipient.name,
          recipientAddress: params.recipient.address,
          senderName: settings.senderName,
          senderAddress: settings.senderAddress,
          deliveryMethod: params.deliveryMethod,
          templateId: params.templateId,
          subject: params.subject,
          letterBody: params.body,
          includeReturnEnvelope: params.includeReturnEnvelope,
          caseId: params.caseId,
        },
      });

      if (error || data?.error) {
        const errorMsg = data?.error || error?.message || 'Send failed';
        advanceStatus('failed', errorMsg);
        if (data?.notConnected) set(s => ({ mailingSettings: { ...s.mailingSettings, letterstreamConnected: false } }));
        throw new Error(errorMsg);
      }

      const status: MailStatus = data.status === 'awaiting-payment' ? 'awaiting-payment' : 'submitted';
      advanceStatus(status, data.message || "Submitted to the building's LetterStream account", {
        sentAt: new Date().toISOString(),
        letterstreamJobId: data.jobId,
        letterstreamPortalUrl: data.portalUrl || settings.letterstreamPortalUrl,
        pageCount: data.pageCount || params.pageCount,
      });
    } else {
      // Demo mode: nothing is printed; say so.
      await new Promise(res => setTimeout(res, 400));
      advanceStatus('awaiting-payment', "Submitted to the building's LetterStream account (demo, nothing was sent)", {
        sentAt: new Date().toISOString(),
        letterstreamJobId: generateLocalId('ls_demo_'),
        letterstreamPortalUrl: settings.letterstreamPortalUrl,
      });
    }

    // Add Decision Trail entry
    useIssuesStore.getState().addTrailEntry(params.caseId, {
      type: 'notice_sent',
      date: new Date().toISOString(),
      actor: 'Board',
      summary: `Sent "${params.templateName}" via ${params.deliveryMethod.replace(/-/g, ' ')} to ${params.recipient.name}`,
      details: `Estimated postage: $${(cost.totalCents / 100).toFixed(2)}, billed by LetterStream to the building's account | Delivery method: ${params.deliveryMethod}`,
    });

    return get().mailRecords.find(r => r.id === id)!;
  },
}), {
  name: 'onetwo-mail',
  version: 3,
  // v2 kept a Stripe card on file for postage; v3 keeps the building's LetterStream connection instead.
  migrate: (persisted) => {
    const p = (persisted ?? {}) as { mailingSettings?: Record<string, unknown>; mailRecords?: MailRecord[] };
    const old = p.mailingSettings ?? {};
    const { stripePaymentMethodId: _a, stripeCustomerId: _b, cardLast4: _c, cardBrand: _d, ...kept } = old as Record<string, unknown>;
    return {
      mailingSettings: { ...DEFAULT_SETTINGS, ...kept },
      mailRecords: (p.mailRecords ?? []).map(r => (r.status as string) === 'charging' ? { ...r, status: 'failed' as MailStatus } : r),
    };
  },
}));
