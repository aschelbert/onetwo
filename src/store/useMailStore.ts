import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  MailRecord,
  MailingSettings,
  MailDeliveryMethod,
  MailProviderId,
  MailStatus,
  PostalAddress,
} from '@/types/mail';
import { MAIL_PROVIDERS, calculateMailingCost, mailProviderLabel } from '@/types/mail';
import { useIssuesStore } from './useIssuesStore';
import { supabase } from '@/lib/supabase';
import { generateLocalId } from '@/lib/generateId';

/** What the board sees when a letter is sent without the building's mail account on file. */
export const MAIL_NOT_CONNECTED = "The building's mail account isn't connected. Connect DocuPost or LetterStream under Settings → Mailing.";

/** The connect-mail-provider function's answer. */
interface MailProviderStatus {
  connected: boolean;
  provider: MailProviderId | null;
  credentialMasked: string | null;
  status: string | null;
  connectedAt: string | null;
  portalUrl: string | null;
  signupUrl: string | null;
  providers?: { id: MailProviderId; signupUrl: string | null }[];
  note?: string | null;
  error?: string;
}

export interface MailCredentials {
  /** LetterStream only. */
  apiId?: string;
  apiKey: string;
}

interface MailState {
  mailingSettings: MailingSettings;
  mailRecords: MailRecord[];
  updateMailingSettings: (partial: Partial<MailingSettings>) => void;
  addMailRecord: (record: MailRecord) => void;
  updateMailRecord: (id: string, partial: Partial<MailRecord>) => void;
  getMailRecordsByCase: (caseId: string) => MailRecord[];
  /** Ask the server which vendor account the building has connected. */
  loadMailingSettings: (tenantId: string) => Promise<void>;
  /** Save the building's own vendor credentials (board only). Resolves to a note when saved but not yet verified. */
  connectMailProvider: (provider: MailProviderId, creds: MailCredentials) => Promise<{ note?: string }>;
  disconnectMailProvider: () => Promise<void>;
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
  mailConnected: false,
  mailProvider: '',
  mailCredentialMasked: '',
  mailConnectedAt: '',
  mailStatus: '',
  letterstreamPartnerUrl: '',
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

function fromStatus(s: MailProviderStatus): Partial<MailingSettings> {
  const partner = s.providers?.find(p => p.id === 'letterstream')?.signupUrl ?? (s.provider === 'letterstream' ? s.signupUrl : null);
  return {
    mailConnected: !!s.connected,
    mailProvider: s.connected && s.provider ? s.provider : '',
    mailCredentialMasked: s.credentialMasked || '',
    mailConnectedAt: s.connectedAt || '',
    mailStatus: s.status || '',
    letterstreamPartnerUrl: partner || '',
  };
}

const mask = (s: string) => `••••${s.slice(-4)}`;

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
    const { data, error } = await supabase.functions.invoke('connect-mail-provider', { body: { action: 'status' } });
    if (error || !data || data.error) return;
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...fromStatus(data as MailProviderStatus) } }));
  },

  connectMailProvider: async (provider, creds) => {
    if (!supabase) {
      // Demo mode: nothing to verify against, so just remember that it is connected.
      const shown = provider === 'letterstream' ? creds.apiId || '' : creds.apiKey;
      set(s => ({ mailingSettings: { ...s.mailingSettings, mailConnected: true, mailProvider: provider, mailCredentialMasked: mask(shown), mailConnectedAt: new Date().toISOString(), mailStatus: 'unverified' } }));
      return { note: `Demo mode: saved locally, not verified with ${MAIL_PROVIDERS[provider].label}.` };
    }
    const { data, error } = await supabase.functions.invoke('connect-mail-provider', { body: { action: 'connect', provider, apiId: creds.apiId, apiKey: creds.apiKey } });
    if (error || !data || data.error) throw new Error(data?.error || error?.message || `Could not connect ${MAIL_PROVIDERS[provider].label}`);
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...fromStatus(data as MailProviderStatus) } }));
    return { note: (data as MailProviderStatus).note || undefined };
  },

  disconnectMailProvider: async () => {
    if (supabase) {
      const { data, error } = await supabase.functions.invoke('connect-mail-provider', { body: { action: 'disconnect' } });
      if (error || !data || data.error) throw new Error(data?.error || error?.message || 'Could not disconnect the mail account');
    }
    set(s => ({ mailingSettings: { ...s.mailingSettings, mailConnected: false, mailProvider: '', mailCredentialMasked: '', mailConnectedAt: '', mailStatus: '' } }));
  },

  sendNotice: async (params) => {
    const settings = get().mailingSettings;
    const cost = calculateMailingCost(params.deliveryMethod, params.pageCount, params.includeReturnEnvelope, settings.mailProvider);
    const now = new Date().toISOString();
    const id = generateLocalId('mr_');
    const vendor = mailProviderLabel(settings);
    const portalUrl = settings.mailProvider ? MAIL_PROVIDERS[settings.mailProvider].portalUrl : '';

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
      mailProvider: settings.mailProvider || undefined,
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

    if (!settings.mailConnected || !settings.mailProvider) {
      advanceStatus('failed', MAIL_NOT_CONNECTED);
      throw new Error(MAIL_NOT_CONNECTED);
    }

    if (supabase) {
      // The server renders the PDF and pushes it into the building's vendor account.
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
        if (data?.notConnected) set(s => ({ mailingSettings: { ...s.mailingSettings, mailConnected: false, mailProvider: '' } }));
        throw new Error(errorMsg);
      }

      const status: MailStatus = data.status === 'awaiting-payment' ? 'awaiting-payment' : 'submitted';
      advanceStatus(status, data.message || `Submitted to the building's ${vendor} account`, {
        sentAt: new Date().toISOString(),
        letterstreamJobId: data.jobId || undefined,
        letterstreamPortalUrl: data.portalUrl || portalUrl,
        pageCount: data.pageCount || params.pageCount,
      });
    } else {
      // Demo mode: nothing is printed; say so.
      await new Promise(res => setTimeout(res, 400));
      const demoStatus: MailStatus = settings.mailProvider === 'letterstream' ? 'awaiting-payment' : 'submitted';
      advanceStatus(demoStatus, `Submitted to the building's ${vendor} account (demo, nothing was sent)`, {
        sentAt: new Date().toISOString(),
        letterstreamJobId: generateLocalId(`${settings.mailProvider === 'letterstream' ? 'ls' : 'dp'}_demo_`),
        letterstreamPortalUrl: portalUrl,
      });
    }

    // Add Decision Trail entry
    useIssuesStore.getState().addTrailEntry(params.caseId, {
      type: 'notice_sent',
      date: new Date().toISOString(),
      actor: 'Board',
      summary: `Sent "${params.templateName}" via ${params.deliveryMethod.replace(/-/g, ' ')} to ${params.recipient.name}`,
      details: `Estimated postage: $${(cost.totalCents / 100).toFixed(2)}, billed by ${vendor} to the building's account | Delivery method: ${params.deliveryMethod}`,
    });

    return get().mailRecords.find(r => r.id === id)!;
  },
}), {
  name: 'onetwo-mail',
  version: 4,
  // v2 kept a Stripe card on file; v3 a LetterStream connection; v4 any vendor (DocuPost or LetterStream).
  migrate: (persisted, version) => {
    const p = (persisted ?? {}) as { mailingSettings?: Record<string, unknown>; mailRecords?: MailRecord[] };
    const old = p.mailingSettings ?? {};
    const {
      stripePaymentMethodId: _a, stripeCustomerId: _b, cardLast4: _c, cardBrand: _d,
      letterstreamConnected, letterstreamApiIdMasked, letterstreamConnectedAt, letterstreamStatus, letterstreamPortalUrl: _e,
      ...kept
    } = old as Record<string, unknown>;
    const fromV3: Partial<MailingSettings> = version === 3 && letterstreamConnected
      ? { mailConnected: true, mailProvider: 'letterstream', mailCredentialMasked: String(letterstreamApiIdMasked || ''), mailConnectedAt: String(letterstreamConnectedAt || ''), mailStatus: String(letterstreamStatus || '') }
      : {};
    return {
      mailingSettings: { ...DEFAULT_SETTINGS, ...kept, ...fromV3 },
      mailRecords: (p.mailRecords ?? []).map(r => (r.status as string) === 'charging' ? { ...r, status: 'failed' as MailStatus } : r),
    };
  },
}));
