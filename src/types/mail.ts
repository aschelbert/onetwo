// ─── Mail Types (LetterStream Integration) ─────────────────

export type MailDeliveryMethod =
  | 'first-class'
  | 'certified'
  | 'certified-return-receipt'
  | 'certified-electronic-return-receipt';

export type MailStatus =
  | 'draft'
  | 'approved'
  | 'charging'
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
  stripeChargeId?: string;
  stripePaymentIntentId?: string;
  mergeVariables: Record<string, string>;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
}

export interface MailingSettings {
  enabled: boolean;
  stripePaymentMethodId: string;
  stripeCustomerId: string;
  cardLast4: string;
  cardBrand: string;
  senderAddress: PostalAddress;
  senderName: string;
  defaultDeliveryMethod: MailDeliveryMethod;
  enableEmailCopy: boolean;
  glAccountPostage: string;
}

// ─── Pricing (cents) ─────────────────────────────────────

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
