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
import { MAIL_ENDED, MAIL_PROVIDERS, calculateMailingCost, cleanTrackingNumber, effectiveDeliveryMethod, formatMailStatus, mailProviderLabel } from '@/types/mail';
import { useAuthStore } from './useAuthStore';
import { getActiveTenantId, isBackendEnabled } from '@/lib/supabase';
import * as svc from '@/lib/services/mailRecords';
import { useIssuesStore } from './useIssuesStore';
import { useBuildingStore } from './useBuildingStore';
import { toStateCode } from '@/lib/usStates';
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
  fundsLowAt?: string | null;
  balanceCents?: number | null;
  balanceRecordedAt?: string | null;
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
  /** The building's letters from mail_records (board, manager and account owner only). */
  loadMailRecords: (tenantId?: string) => Promise<void>;
  /**
   * Record what the vendor's own page shows for a letter: its USPS tracking
   * number and where it stands. For vendors with no status API (DocuPost) this
   * is how tracking reaches the app. Throws when it cannot be saved.
   */
  recordTracking: (id: string, update: { trackingNumber?: string; status?: MailStatus; date?: string }) => Promise<void>;
  /** Ask the vendor where a letter stands (vendors with a status API). Resolves to a note when there is nothing to read. */
  refreshMailStatus: (id: string) => Promise<{ note?: string }>;
  /** Record the balance the vendor's own page shows, in cents; null forgets it. */
  setMailBalance: (cents: number | null) => Promise<void>;
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
  mailFundsLowAt: '',
  mailBalanceCents: null,
  mailBalanceRecordedAt: '',
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
    mailFundsLowAt: s.fundsLowAt || '',
    mailBalanceCents: s.balanceCents ?? null,
    mailBalanceRecordedAt: s.balanceRecordedAt || '',
    letterstreamPartnerUrl: partner || '',
  };
}

const mask = (s: string) => `••••${s.slice(-4)}`;

/** The connection fields, cleared: what a building looks like before any vendor is connected. */
export const NO_MAIL_CONNECTION: Pick<MailingSettings, 'mailConnected' | 'mailProvider' | 'mailCredentialMasked' | 'mailConnectedAt' | 'mailStatus' | 'mailFundsLowAt' | 'mailBalanceCents' | 'mailBalanceRecordedAt'> = {
  mailConnected: false, mailProvider: '', mailCredentialMasked: '', mailConnectedAt: '', mailStatus: '', mailFundsLowAt: '', mailBalanceCents: null, mailBalanceRecordedAt: '',
};

/** Swap in the server's copy of a letter, or add it. */
const withRecord = (records: MailRecord[], r: MailRecord): MailRecord[] => (records.some(x => x.id === r.id) ? records.map(x => x.id === r.id ? r : x) : [r, ...records]);

/** A postal address with its state as the USPS code the vendors require. */
export const normalizeAddress = (a: PostalAddress): PostalAddress => ({ ...a, state: toStateCode(a.state) });

/**
 * Who the letter is from: the building, by its name and the address under
 * Building › Contacts. The persisted sender fields are only a fallback for a
 * building that has not entered an address yet (the demo building).
 */
export function resolveSender(): { name: string; address: PostalAddress } {
  const b = useBuildingStore.getState();
  const s = useMailStore.getState().mailingSettings;
  const fromBuilding = b.address?.street && b.address.city && b.address.zip;
  const address: PostalAddress = fromBuilding
    ? { line1: b.address.street, city: b.address.city, state: b.address.state, zip: b.address.zip }
    : s.senderAddress;
  return { name: (fromBuilding && b.name) || s.senderName, address: normalizeAddress(address) };
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
    const { data, error } = await supabase.functions.invoke('connect-mail-provider', { body: { action: 'status' } });
    // Fail closed: a connection this browser remembers from another building, or from
    // before an outage, must not show as live until the server confirms it.
    if (error || !data || data.error) { set(s => ({ mailingSettings: { ...s.mailingSettings, ...NO_MAIL_CONNECTION } })); return; }
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...fromStatus(data as MailProviderStatus) } }));
  },

  connectMailProvider: async (provider, creds) => {
    if (!supabase) {
      // Demo mode: nothing to verify against, so just remember that it is connected.
      const shown = provider === 'letterstream' ? creds.apiId || '' : creds.apiKey;
      set(s => ({ mailingSettings: { ...s.mailingSettings, mailConnected: true, mailProvider: provider, mailCredentialMasked: mask(shown), mailConnectedAt: new Date().toISOString(), mailStatus: 'unverified', mailFundsLowAt: '' } }));
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
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...NO_MAIL_CONNECTION } }));
  },

  loadMailRecords: async (tenantId) => {
    const tid = tenantId ?? getActiveTenantId();
    if (!isBackendEnabled || !tid) return;
    const rows = await svc.fetchMailRecords(tid);
    // The database is the record: its letters replace what this browser had. A failed load keeps what is here.
    if (!rows) return;
    set({ mailRecords: rows });
    // Letters still on their way through a vendor that answers a status call: ask it, a few at a time.
    const open = rows.filter(r => r.mailProvider && MAIL_PROVIDERS[r.mailProvider].hasStatusApi && r.letterstreamJobId && !MAIL_ENDED.includes(r.status)).slice(0, 10);
    for (const r of open) await get().refreshMailStatus(r.id).catch(() => { /* the letter keeps its last known status */ });
  },

  recordTracking: async (id, update) => {
    const rec = get().mailRecords.find(r => r.id === id);
    if (!rec) throw new Error('That letter is no longer on the list.');
    const typed = (update.trackingNumber ?? '').trim();
    const tracking = typed ? cleanTrackingNumber(typed) : '';
    if (typed && !tracking) throw new Error("That doesn't look like a USPS tracking number. Copy it from the letter's page at the vendor.");
    const who = useAuthStore.getState().currentUser?.name || 'Board';
    const now = new Date().toISOString();
    // A date alone is the day it happened; midday keeps it on that day in every US time zone.
    const when = update.date ? new Date(`${update.date}T12:00:00`).toISOString() : now;
    const history = [...rec.statusHistory];
    const next: MailRecord = { ...rec };
    if (update.trackingNumber !== undefined && tracking !== (rec.trackingNumber || '')) {
      next.trackingNumber = tracking || undefined;
      history.push({ status: update.status ?? rec.status, timestamp: now, source: 'board', detail: tracking ? `USPS tracking ${tracking} recorded by ${who}` : `USPS tracking number removed by ${who}` });
    }
    if (update.status && update.status !== rec.status) {
      next.status = update.status;
      next.deliveredAt = update.status === 'delivered' ? when : undefined;
      history.push({ status: update.status, timestamp: when, source: 'board', detail: `Marked ${formatMailStatus(update.status).toLowerCase()} by ${who}, from the vendor's tracking` });
    }
    if (history.length === rec.statusHistory.length) return;
    next.statusHistory = history;
    const tid = getActiveTenantId();
    if (isBackendEnabled && tid && !(await svc.updateMailRecord(tid, next))) throw new Error('The tracking could not be saved. Check your connection and try again.');
    set(s => ({ mailRecords: withRecord(s.mailRecords, next) }));
  },

  refreshMailStatus: async (id) => {
    const rec = get().mailRecords.find(r => r.id === id);
    if (!rec) return { note: 'That letter is no longer on the list.' };
    const vendor = rec.mailProvider ? MAIL_PROVIDERS[rec.mailProvider] : null;
    if (!vendor?.hasStatusApi) return { note: `${vendor?.label ?? 'The vendor'} has no status API. Record the USPS tracking number from the letter's page there.` };
    if (!supabase) return { note: 'Demo mode: nothing was sent, so there is nothing to track.' };
    const { data, error } = await supabase.functions.invoke('check-mail-status', { body: { recordId: id } });
    if (error || !data || data.error) throw new Error(data?.error || error?.message || `${vendor.label} did not answer`);
    if (data.record) set(s => ({ mailRecords: withRecord(s.mailRecords, data.record as MailRecord) }));
    return { note: data.message || undefined };
  },

  setMailBalance: async (cents) => {
    if (!supabase) {
      set(s => ({ mailingSettings: { ...s.mailingSettings, mailBalanceCents: cents, mailBalanceRecordedAt: cents == null ? '' : new Date().toISOString(), ...(cents ? { mailFundsLowAt: '' } : {}) } }));
      return;
    }
    const { data, error } = await supabase.functions.invoke('connect-mail-provider', { body: { action: 'set-balance', balanceCents: cents } });
    if (error || !data || data.error) throw new Error(data?.error || error?.message || 'Could not save the balance');
    set(s => ({ mailingSettings: { ...s.mailingSettings, ...fromStatus(data as MailProviderStatus) } }));
  },

  sendNotice: async (params) => {
    const settings = get().mailingSettings;
    // What the vendor will really send (DocuPost's return receipt is always the electronic one).
    const deliveryMethod = effectiveDeliveryMethod(params.deliveryMethod, settings.mailProvider);
    const cost = calculateMailingCost(deliveryMethod, params.pageCount, params.includeReturnEnvelope, settings.mailProvider);
    const now = new Date().toISOString();
    const id = generateLocalId('mr_');
    const vendor = mailProviderLabel(settings);
    const portalUrl = settings.mailProvider ? MAIL_PROVIDERS[settings.mailProvider].portalUrl : '';
    const sender = resolveSender();
    const recipient = { name: params.recipient.name, address: normalizeAddress(params.recipient.address) };

    const record: MailRecord = {
      id,
      caseId: params.caseId,
      stepId: params.stepId,
      tenantId: getActiveTenantId() || params.tenantId,
      templateId: params.templateId,
      templateName: params.templateName,
      recipient,
      sender,
      deliveryMethod,
      status: 'draft',
      statusHistory: [{ status: 'draft', timestamp: now, source: 'system', detail: 'Notice created' }],
      cost,
      pageCount: params.pageCount,
      includeReturnEnvelope: params.includeReturnEnvelope,
      emailCopy: params.emailCopy,
      emailAddress: params.emailAddress,
      mergeVariables: params.mergeVariables,
      mailProvider: settings.mailProvider || undefined,
      sentBy: useAuthStore.getState().currentUser?.name || undefined,
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
          recipientName: recipient.name,
          recipientAddress: recipient.address,
          senderName: sender.name,
          senderAddress: sender.address,
          deliveryMethod,
          templateId: params.templateId,
          subject: params.subject,
          letterBody: params.body,
          includeReturnEnvelope: params.includeReturnEnvelope,
          caseId: params.caseId,
          // What the server cannot work out for itself, for the building's record of the letter.
          record: { id, stepId: params.stepId, templateName: params.templateName, cost, emailCopy: params.emailCopy, emailAddress: params.emailAddress, mergeVariables: params.mergeVariables },
        },
      });

      // A refusal comes back as an error whose body still says why; read it rather than "non-2xx status".
      let failure = data?.error ? data : null;
      if (error && !failure) {
        try { failure = await (error as { context?: Response }).context?.json?.(); } catch { /* no body to read */ }
      }
      if (error || failure) {
        const errorMsg = failure?.error || error?.message || 'Send failed';
        advanceStatus('failed', errorMsg);
        // The server kept its own record of the failed letter: show that one.
        if (failure?.record && failure.recorded) set(s => ({ mailRecords: withRecord(s.mailRecords.filter(r => r.id !== id), failure.record as MailRecord) }));
        if (failure?.needsFunds) set(s => ({ mailingSettings: { ...s.mailingSettings, mailFundsLowAt: failure.fundsLowAt || new Date().toISOString() } }));
        if (failure?.notConnected || failure?.invalidCredentials) set(s => ({ mailingSettings: { ...s.mailingSettings, ...(failure.notConnected ? NO_MAIL_CONNECTION : { mailStatus: 'invalid' }) } }));
        throw new Error(errorMsg);
      }

      const status: MailStatus = data.status === 'awaiting-payment' ? 'awaiting-payment' : 'submitted';
      advanceStatus(status, data.message || `Submitted to the building's ${vendor} account`, {
        sentAt: new Date().toISOString(),
        letterstreamJobId: data.jobId || undefined,
        letterstreamPortalUrl: data.portalUrl || portalUrl,
        pageCount: data.pageCount || params.pageCount,
      });
      // The vendor took the letter, so the account has funds; and the server's record is the one to keep.
      set(s => ({
        mailingSettings: { ...s.mailingSettings, mailFundsLowAt: '', mailStatus: 'verified' },
        mailRecords: data.record && data.recorded ? withRecord(s.mailRecords, { ...(data.record as MailRecord), cost: (data.record as MailRecord).cost?.totalCents ? (data.record as MailRecord).cost : cost }) : s.mailRecords,
      }));
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
      summary: `Sent "${params.templateName}" via ${deliveryMethod.replace(/-/g, ' ')} to ${params.recipient.name}`,
      details: `Estimated postage: $${(cost.totalCents / 100).toFixed(2)}, billed by ${vendor} to the building's account | Delivery method: ${deliveryMethod}`,
    });

    return get().mailRecords.find(r => r.id === id)!;
  },
}), {
  name: 'onetwo-mail',
  version: 5,
  // v2 kept a Stripe card on file; v3 a LetterStream connection; v4 any vendor (DocuPost or LetterStream);
  // v5 adds the vendor balance, and letters load from the building's record rather than this browser.
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
