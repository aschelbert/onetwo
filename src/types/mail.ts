// ─── Mail Types ─────────────────────────────────────────────
// Printed mail goes through a vendor the building holds its own account
// with (DocuPost or LetterStream) and pays directly; the app only pushes
// letters into that account.

export type MailProviderId = 'docupost' | 'letterstream';

export interface MailProviderInfo {
  id: MailProviderId;
  label: string;
  /** One line for the picker. */
  tagline: string;
  /** Where the building opens its own account (LetterStream's comes from the server: our partner link). */
  signupUrl: string;
  portalUrl: string;
  /** Which credentials the vendor issues. */
  credentials: ('apiId' | 'apiKey')[];
  /** Where in the vendor's site the credentials are found. */
  credentialHint: string;
  /** How the building pays the vendor. */
  billing: string;
  /** Whether the app can read tracking back from the vendor. */
  hasStatusApi: boolean;
}

export const MAIL_PROVIDERS: Record<MailProviderId, MailProviderInfo> = {
  docupost: {
    id: 'docupost',
    label: 'DocuPost',
    tagline: 'Open an account in minutes, fund it from $10, letters go out at once',
    signupUrl: 'https://docupost.com/',
    portalUrl: 'https://app.docupost.com/',
    credentials: ['apiKey'],
    credentialHint: 'Account settings → Developer → Generate API Token',
    billing: 'Prepaid balance on the building\'s DocuPost account; each letter is deducted when sent',
    hasStatusApi: false,
  },
  letterstream: {
    id: 'letterstream',
    label: 'LetterStream',
    tagline: 'HOA mail specialist with signed return receipts in the account; needs our partner link',
    signupUrl: '',
    portalUrl: 'https://secure.letterstream.com/',
    credentials: ['apiId', 'apiKey'],
    credentialHint: 'My Account → API Information (only accounts opened through the partner link have it)',
    billing: 'Paid in the building\'s LetterStream account per letter, or from a prepaid balance',
    hasStatusApi: true,
  },
};

export const DEFAULT_MAIL_PROVIDER: MailProviderId = 'docupost';

export type MailDeliveryMethod =
  | 'first-class'
  | 'certified'
  | 'certified-return-receipt'
  | 'certified-electronic-return-receipt';

export type MailStatus =
  | 'draft'
  | 'approved'
  | 'awaiting-payment'
  | 'submitted'
  | 'processing'
  | 'mailed'
  | 'in-transit'
  | 'delivered'
  | 'returned'
  | 'failed';

export interface PostalAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface MailStatusEvent {
  status: MailStatus;
  timestamp: string;
  source: string;
  detail?: string;
}

export interface CostBreakdown {
  baseCostCents: number;
  additionalPagesCents: number;
  returnEnvelopeCents: number;
  totalCents: number;
}

export interface MailRecord {
  id: string;
  letterstreamJobId?: string;
  caseId: string;
  stepId?: string;
  tenantId: string;
  templateId: string;
  templateName: string;
  recipient: {
    name: string;
    address: PostalAddress;
  };
  sender: {
    name: string;
    address: PostalAddress;
  };
  deliveryMethod: MailDeliveryMethod;
  status: MailStatus;
  statusHistory: MailStatusEvent[];
  cost: CostBreakdown;
  pageCount: number;
  includeReturnEnvelope: boolean;
  emailCopy: boolean;
  emailAddress?: string;
  /** Which vendor the letter went to. */
  mailProvider?: MailProviderId;
  /** The building's dashboard at the vendor, where the letter is paid for and tracked. */
  letterstreamPortalUrl?: string;
  mergeVariables: Record<string, string>;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
}

export interface MailingSettings {
  enabled: boolean;
  /** The building's own vendor account is connected (credentials on file, server side). */
  mailConnected: boolean;
  /** Which vendor; '' until connected. */
  mailProvider: MailProviderId | '';
  /** Masked credential, e.g. ••••1234. The secret never reaches the browser. */
  mailCredentialMasked: string;
  mailConnectedAt: string;
  /** 'verified' | 'unverified' | 'invalid' | '' */
  mailStatus: string;
  /** LetterStream's partner sign-up link, from the server; '' until configured. */
  letterstreamPartnerUrl: string;
  senderAddress: PostalAddress;
  senderName: string;
  defaultDeliveryMethod: MailDeliveryMethod;
  enableEmailCopy: boolean;
  glAccountPostage: string;
}

// ─── Pricing (cents) ─────────────────────────────────────
// Estimates only, from each vendor's published per-piece rates. The vendor
// sets the real price and charges the building's own account for it; the app
// never bills postage.

export const ESTIMATE_NOTE = "Estimate. The mail vendor prices the letter and bills the building's own account.";

/** The vendor's name for copy, or a neutral phrase before one is connected. */
export const mailProviderLabel = (s: Pick<MailingSettings, 'mailProvider'>): string => (s.mailProvider ? MAIL_PROVIDERS[s.mailProvider].label : 'the mail vendor');

/** Per-piece estimates in cents, by vendor. First page included in the base; extra pages added. */
export const PROVIDER_PRICING: Record<MailProviderId, Record<string, number>> = {
  // DocuPost: 95¢ letter + 30¢ B&W page + 23¢ First Class upgrade; Certified upgrade $10.25.
  // Certified + return receipt adds USPS's return receipt fee on top; shown as the certified rate plus that.
  docupost: {
    'first-class': 148,
    'certified': 1173,
    'certified-return-receipt': 1538,
    'certified-electronic-return-receipt': 1538,
    additionalPage: 30,
    returnEnvelope: 0,
    returnEnvelopeStamped: 0,
  },
  // LetterStream's published per-piece rates.
  letterstream: {
    'first-class': 123,
    'certified': 834,
    'certified-return-receipt': 1116,
    'certified-electronic-return-receipt': 1116,
    additionalPage: 12,
    returnEnvelope: 15,
    returnEnvelopeStamped: 98,
  },
};

export const pricingFor = (provider: MailProviderId | '' | undefined): Record<string, number> => PROVIDER_PRICING[provider || DEFAULT_MAIL_PROVIDER];

/** The default vendor's estimates, for screens that quote before a vendor is chosen. */
export const PRICING: Record<string, number> = PROVIDER_PRICING[DEFAULT_MAIL_PROVIDER];

// ─── Utilities ───────────────────────────────────────────

export function calculateMailingCost(
  method: MailDeliveryMethod,
  pageCount: number,
  includeReturnEnvelope: boolean,
  provider?: MailProviderId | '',
): CostBreakdown {
  const p = pricingFor(provider);
  const baseCostCents = p[method] || 0;
  const additionalPagesCents = Math.max(0, pageCount - 1) * p.additionalPage;
  const returnEnvelopeCents = includeReturnEnvelope ? p.returnEnvelope : 0;
  const totalCents = baseCostCents + additionalPagesCents + returnEnvelopeCents;
  return { baseCostCents, additionalPagesCents, returnEnvelopeCents, totalCents };
}

export function formatDeliveryMethod(method: MailDeliveryMethod): string {
  switch (method) {
    case 'first-class': return 'First Class';
    case 'certified': return 'Certified Mail';
    case 'certified-return-receipt': return 'Certified + Return Receipt';
    case 'certified-electronic-return-receipt': return 'Certified + Electronic Return Receipt';
  }
}

export function getRecommendedDeliveryMethod(
  letterCategory: string,
  _jurisdiction?: string,
): { method: MailDeliveryMethod; reason: string } {
  if (letterCategory === 'violation') {
    return {
      method: 'certified-electronic-return-receipt',
      reason: 'Certified mail with return receipt recommended for violation notices to establish proof of delivery',
    };
  }
  if (letterCategory === 'collection') {
    return {
      method: 'certified',
      reason: 'Certified mail recommended for collection notices per association collection policy',
    };
  }
  if (letterCategory === 'notice') {
    return {
      method: 'certified',
      reason: 'Certified mail recommended for formal notices to ensure documented delivery',
    };
  }
  return {
    method: 'first-class',
    reason: 'First class mail is sufficient for general correspondence',
  };
}
