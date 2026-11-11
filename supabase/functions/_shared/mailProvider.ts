// supabase/functions/_shared/mailProvider.ts
// One face for every printed-mail vendor. The building holds its own account
// with the vendor and pays it directly; we keep the credentials
// (mail_provider_accounts) and push letters into that account.

import * as ls from "./letterstream.ts";
import * as dp from "./docupost.ts";

export type MailProviderId = "docupost" | "letterstream";
export const PROVIDERS: MailProviderId[] = ["docupost", "letterstream"];
export const isProvider = (s: unknown): s is MailProviderId => s === "docupost" || s === "letterstream";

export type DeliveryMethod = ls.DeliveryMethod;
export type Address = ls.Address;

export interface Credentials {
  /** LetterStream only. */
  apiId?: string;
  apiKey: string;
}

export interface SubmitInput {
  /** The rendered letter. */
  pdf: Uint8Array;
  /** Where the PDF can be fetched by URL, for vendors that need one. */
  pdfUrl?: string;
  pdfFileName: string;
  pageCount: number;
  /** Shown in the vendor's dashboard. */
  label: string;
  deliveryMethod: DeliveryMethod;
  recipient: Address;
  sender: Address;
  includeReturnEnvelope: boolean;
}

export interface SubmitResult {
  jobId: string;
  /** The app's MailStatus right after submission. */
  status: "submitted" | "awaiting-payment";
  message: string;
}

export interface ProviderInfo {
  id: MailProviderId;
  label: string;
  /** Where the building opens its own account. */
  signupUrl: string | null;
  /** The building's dashboard at the vendor. */
  portalUrl: string;
  /** Which credential fields the vendor issues. */
  credentials: ("apiId" | "apiKey")[];
  /** Whether the vendor fetches the letter by URL (so we must store it). */
  needsPdfUrl: boolean;
  /** Whether jobStatus() can ask the vendor. */
  hasStatusApi: boolean;
}

export const PROVIDER_INFO: Record<MailProviderId, ProviderInfo> = {
  docupost: {
    id: "docupost",
    label: "DocuPost",
    signupUrl: dp.DOCUPOST_SIGNUP_URL,
    portalUrl: dp.DOCUPOST_PORTAL_URL,
    credentials: ["apiKey"],
    needsPdfUrl: true,
    hasStatusApi: false,
  },
  letterstream: {
    id: "letterstream",
    label: "LetterStream",
    signupUrl: ls.LETTERSTREAM_PARTNER_URL || null,
    portalUrl: ls.LETTERSTREAM_PORTAL_URL,
    credentials: ["apiId", "apiKey"],
    needsPdfUrl: false,
    hasStatusApi: true,
  },
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; reachable: boolean }
  /** The vendor cannot confirm a credential without sending a letter; the first letter will. */
  | { ok: "pending"; reason: string };

export async function verifyCredentials(provider: MailProviderId, c: Credentials): Promise<VerifyResult> {
  if (provider === "docupost") {
    if (!dp.tokenLooksValid(c.apiKey)) return { ok: false, reason: "That does not look like a DocuPost API token", reachable: true };
    return { ok: "pending", reason: "DocuPost confirms a token only when a letter is sent; the first letter will verify it." };
  }
  const r = await ls.verifyCredentials({ apiId: c.apiId || "", apiKey: c.apiKey });
  return r.ok ? { ok: true } : r;
}

/** Whether a vendor refusal means the saved credential itself is bad. */
export function isCredentialError(provider: MailProviderId, message: string): boolean {
  if (provider === "docupost") return dp.INVALID_TOKEN.test(message);
  // Only authentication failures, not "Invalid zip code" and the like.
  return /invalid (api ?)?(id|key|hash|credential|token|signature)|unauthori[sz]ed|authentication|access denied|not authori[sz]ed|bad hash/i.test(message);
}

/** Whether a vendor refusal means the building's account needs money, not a fix. */
export function isFundsError(provider: MailProviderId, message: string): boolean {
  return provider === "docupost" ? dp.INSUFFICIENT_FUNDS.test(message) : /insufficient|balance|unpaid/i.test(message);
}

export async function submitLetter(provider: MailProviderId, c: Credentials, input: SubmitInput): Promise<SubmitResult> {
  if (provider === "docupost") {
    if (!input.pdfUrl) throw new Error("DocuPost needs the letter by URL");
    const r = await dp.sendLetter(c.apiKey, {
      pdfUrl: input.pdfUrl,
      deliveryMethod: input.deliveryMethod,
      recipient: input.recipient,
      sender: input.sender,
      includeReturnEnvelope: input.includeReturnEnvelope,
      description: input.label,
    });
    return {
      jobId: r.letterId,
      status: "submitted",
      message: "Queued in the building's DocuPost account and paid from its balance. It can still be cancelled there for a short while; tracking is in the DocuPost dashboard.",
    };
  }
  const job = await ls.submitJob({ apiId: c.apiId || "", apiKey: c.apiKey }, {
    jobName: input.label,
    deliveryMethod: input.deliveryMethod,
    pdf: input.pdf,
    pdfFileName: input.pdfFileName,
    pageCount: input.pageCount,
    recipient: input.recipient,
    sender: input.sender,
    includeReturnEnvelope: input.includeReturnEnvelope,
  });
  const normalized = job.status ? ls.normalizeStatus(job.status) : "awaiting-payment";
  const status = normalized === "awaiting-payment" ? "awaiting-payment" : "submitted";
  return {
    jobId: job.jobId,
    status,
    message: status === "awaiting-payment"
      ? "Submitted to the building's LetterStream account. It mails once the building pays for it there, or at once if the account has a prepaid balance."
      : `Submitted to the building's LetterStream account (${normalized}).`,
  };
}

export interface StatusResult {
  currentStatus: string;
  vendorStatus: string | null;
  trackingNumber: string | null;
  mailedAt: string | null;
  deliveredAt: string | null;
  /** True when the vendor has no status API and the dashboard is the only place to look. */
  dashboardOnly: boolean;
}

export async function jobStatus(provider: MailProviderId, c: Credentials, jobId: string): Promise<StatusResult> {
  if (provider === "docupost") {
    return { currentStatus: "submitted", vendorStatus: null, trackingNumber: null, mailedAt: null, deliveredAt: null, dashboardOnly: true };
  }
  const s = await ls.jobStatus({ apiId: c.apiId || "", apiKey: c.apiKey }, jobId);
  return { currentStatus: ls.normalizeStatus(s.status), vendorStatus: s.status, trackingNumber: s.trackingNumber ?? null, mailedAt: s.mailedAt ?? null, deliveredAt: s.deliveredAt ?? null, dashboardOnly: false };
}

/** The vendor's own words for a refusal, whichever module raised it. */
export function vendorError(e: unknown): { message: string; httpStatus: number; raw: unknown } | null {
  if (e instanceof ls.LetterStreamError) return { message: e.message, httpStatus: e.httpStatus, raw: e.raw ?? null };
  if (e instanceof dp.DocuPostError) return { message: e.message, httpStatus: e.httpStatus, raw: e.raw ?? null };
  return null;
}

export function maskCredential(provider: MailProviderId, c: { api_id: string | null; api_key: string }): string {
  const s = provider === "letterstream" ? c.api_id || "" : c.api_key;
  if (s.length <= 4) return "••••";
  return `${"•".repeat(Math.max(2, Math.min(8, s.length - 4)))}${s.slice(-4)}`;
}
