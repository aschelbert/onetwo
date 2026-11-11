// supabase/functions/_shared/docupost.ts
// DocuPost's Send Letter API, called with the *building's* API token so the
// letter is paid from the building's own DocuPost balance.
//
// Reference: https://help.docupost.com/developer-documentation/send-letter-api
//   POST https://app.docupost.com/api/1.1/wf/sendletter?api_token=…&to_name=…
//   The letter is a PDF the API fetches by URL (max 10 MB, 8.5x11), or raw
//   HTML in the body (max 9,000 characters). Names and the description are
//   capped at 40 characters, states are 2-letter codes, ZIPs are 5 digits.
//   class=usps_first_class with servicelevel=certified | certified_return_receipt
//   for the certified options. Status is tracked in the DocuPost dashboard;
//   there is no status API. A letter can be cancelled there for a short
//   window after sending (five minutes to a few hours), and a sandbox mode
//   can be switched on where the token is generated (sandbox still needs a
//   funded balance: an unfunded account answers "Insufficient funds").

export const DOCUPOST_API_URL = Deno.env.get("DOCUPOST_API_URL") || "https://app.docupost.com/api/1.1/wf/sendletter";
export const DOCUPOST_PORTAL_URL = Deno.env.get("DOCUPOST_PORTAL_URL") || "https://app.docupost.com/";
export const DOCUPOST_SIGNUP_URL = Deno.env.get("DOCUPOST_SIGNUP_URL") || "https://docupost.com/";

export type DeliveryMethod = "first-class" | "certified" | "certified-return-receipt" | "certified-electronic-return-receipt";

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface SendLetterInput {
  /** Public (signed) URL the API fetches the PDF from. */
  pdfUrl: string;
  deliveryMethod: DeliveryMethod;
  recipient: Address;
  sender: Address;
  includeReturnEnvelope: boolean;
  /** Internal note shown in the DocuPost dashboard and exports (40 chars). */
  description?: string;
}

export interface SendLetterResult {
  /** DocuPost's id for the letter when it gives one; otherwise empty. */
  letterId: string;
  raw: unknown;
}

export class DocuPostError extends Error {
  constructor(message: string, readonly httpStatus: number, readonly raw?: unknown) {
    super(message);
    this.name = "DocuPostError";
  }
}

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const zip5 = (z: string) => z.replace(/\D/g, "").slice(0, 5);
const state2 = (s: string) => s.trim().toUpperCase().slice(0, 2);

async function post(apiToken: string, params: Record<string, string>): Promise<{ status: number; data: unknown }> {
  const url = new URL(DOCUPOST_API_URL);
  url.searchParams.set("api_token", apiToken);
  for (const [k, v] of Object.entries(params)) if (v !== "") url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url.toString(), { method: "POST" });
  } catch (e) {
    throw new DocuPostError(`DocuPost could not be reached: ${String(e)}`, 0);
  }
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data };
}

/** The message DocuPost puts in an error body, in any of the shapes it uses. */
function messageIn(data: unknown): string {
  if (typeof data === "string") return data.slice(0, 200);
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const body = (d.body && typeof d.body === "object" ? d.body : d) as Record<string, unknown>;
  return String(body.message ?? body.error ?? body.reason ?? d.message ?? "").slice(0, 300);
}

/**
 * DocuPost checks the required letter fields before the token and has no
 * read-only call, so a token can only be confirmed by sending a letter.
 * Here we check its shape; send-mail marks the account verified after the
 * first letter DocuPost accepts, or invalid when it answers "Invalid API token".
 */
export function tokenLooksValid(apiToken: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(apiToken);
}

export const INVALID_TOKEN = /invalid api token/i;
export const INSUFFICIENT_FUNDS = /insufficient funds/i;

/** Queue one letter in the building's DocuPost account. The balance is charged at once. */
export async function sendLetter(apiToken: string, input: SendLetterInput): Promise<SendLetterResult> {
  const r = input.recipient;
  const s = input.sender;
  const params: Record<string, string> = {
    pdf: input.pdfUrl,
    class: "usps_first_class",
    color: "false",
    to_name: cap(r.name, 40),
    to_address1: r.line1,
    to_address2: r.line2 || "",
    to_city: r.city,
    to_state: state2(r.state),
    to_zip: zip5(r.zip),
    from_name: cap(s.name, 40),
    from_address1: s.line1,
    from_address2: s.line2 || "",
    from_city: s.city,
    from_state: state2(s.state),
    from_zip: zip5(s.zip),
    description: cap(input.description || "", 40),
  };
  if (input.deliveryMethod === "certified") params.servicelevel = "certified";
  if (input.deliveryMethod === "certified-return-receipt" || input.deliveryMethod === "certified-electronic-return-receipt") params.servicelevel = "certified_return_receipt";
  if (input.includeReturnEnvelope) params.return_envelope = "true";

  const { status, data } = await post(apiToken, params);
  const msg = messageIn(data);
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  // Refusals come back as HTTP 200 with { "error": "…" } ("Invalid API token",
  // "Insufficient funds"); gateway validation as HTTP 400 with body.status.
  const failed = status < 200 || status >= 300 || !!d.error || /^error$/i.test(String(d.status ?? "")) || (typeof d.body === "object" && d.body !== null && /error/i.test(String((d.body as Record<string, unknown>).status ?? "")));
  if (failed) throw new DocuPostError(msg || `DocuPost answered ${status}`, status === 200 ? 422 : status || 502, data);

  const resp = (d.response && typeof d.response === "object" ? d.response : d) as Record<string, unknown>;
  const idKey = Object.keys(resp).find(k => /^(letter_?id|mail_?id|id|_id)$/i.test(k));
  return { letterId: idKey ? String(resp[idKey]) : "", raw: data };
}
