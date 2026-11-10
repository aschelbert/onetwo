// ─── Mail Types (LetterStream, Partnership mode) ───────────
// The building holds its own LetterStream account and pays LetterStream
// directly; the app only pushes jobs into that account.

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
  /** The building's LetterStream dashboard, where the job is paid for and tracked. */
  letterstreamPortalUrl?: string;
  mergeVariables: Record<string, string>;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
}

export interface MailingSettings {
  enabled: boolean;
  /** The building's own LetterStream account is connected (API ID and key on file, server side). */
  letterstreamConnected: boolean;
  /** Masked API ID, e.g. ••••1234. The key never reaches the browser. */
  letterstreamApiIdMasked: string;
  letterstreamConnectedAt: string;
  /** 'verified' | 'unverified' | 'invalid' | '' */
  letterstreamStatus: string;
  /** Our partner sign-up link, from the server; the building opens its account through it. */
  letterstreamPartnerUrl: string;
  letterstreamPortalUrl: string;
  senderAddress: PostalAddress;
  senderName: string;
  defaultDeliveryMethod: MailDeliveryMethod;
  enableEmailCopy: boolean;
  glAccountPostage: string;
}

// ─── Pricing (cents) ─────────────────────────────────────
// Estimates only, from LetterStream's published per-piece rates. LetterStream
// sets the real price and charges the building's own account for it; the app
// never bills postage.

export const ESTIMATE_NOTE = "Estimate. LetterStream prices the letter and bills the building's own LetterStream account.";

export const PRICING: Record<string, number> = {
  'first-class': 123,
  'certified': 834,
  'certified-return-receipt': 1116,
  'certified-electronic-return-receipt': 1116,
  additionalPage: 12,
  returnEnvelope: 15,
  returnEnvelopeStamped: 98,
};

// ─── Utilities ───────────────────────────────────────────

export function calculateMailingCost(
  method: MailDeliveryMethod,
  pageCount: number,
  includeReturnEnvelope: boolean,
): CostBreakdown {
  const baseCostCents = PRICING[method] || 0;
  const additionalPagesCents = Math.max(0, pageCount - 1) * PRICING.additionalPage;
  const returnEnvelopeCents = includeReturnEnvelope ? PRICING.returnEnvelope : 0;
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
