// supabase/functions/_shared/letterstream.ts
// The one place that speaks to LetterStream. Partnership mode: every call is
// made with the *building's* API ID and key, so the job lands in the
// building's own LetterStream account and LetterStream bills the building.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ WIRE FORMAT: VERIFY AGAINST THE API GUIDE LETTERSTREAM SENDS AT APPROVAL │
// │ LetterStream publishes its API guide only to approved partner accounts.  │
// │ The endpoint, the signature recipe and the field names below follow its  │
// │ documented v1 API as best known; anything that differs in the guide you  │
// │ receive is changed HERE and nowhere else. Error text from LetterStream   │
// │ is passed through verbatim so a mismatch shows up on the first call.     │
// └─────────────────────────────────────────────────────────────────────────┘

export const LETTERSTREAM_API_URL = Deno.env.get("LETTERSTREAM_API_URL") || "https://secure.letterstream.com/apis/index.php";
export const LETTERSTREAM_PORTAL_URL = Deno.env.get("LETTERSTREAM_PORTAL_URL") || "https://secure.letterstream.com/";
/** Where a board goes to open the building's own LetterStream account (our unique partner link). */
export const LETTERSTREAM_PARTNER_URL = Deno.env.get("LETTERSTREAM_PARTNER_URL") || "";

export interface LetterStreamCredentials {
  apiId: string;
  apiKey: string;
}

export type DeliveryMethod = "first-class" | "certified" | "certified-return-receipt" | "certified-electronic-return-receipt";

/** Our delivery methods → LetterStream mail-type codes. Confirm the codes in the API guide. */
const MAIL_TYPE: Record<DeliveryMethod, string> = {
  "first-class": "firstclass",
  "certified": "certified",
  "certified-return-receipt": "certified_return_receipt",
  "certified-electronic-return-receipt": "certified_err",
};

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface SubmitJobInput {
  /** Unique, human-readable job name shown in the building's LetterStream dashboard. */
  jobName: string;
  deliveryMethod: DeliveryMethod;
  pdf: Uint8Array;
  pdfFileName: string;
  pageCount: number;
  recipient: Address;
  sender: Address;
  includeReturnEnvelope: boolean;
}

export interface SubmitJobResult {
  jobId: string;
  /** LetterStream's own status word, when it gives one. */
  status?: string;
  raw: unknown;
}

export interface JobStatusResult {
  jobId: string;
  status: string;
  trackingNumber?: string;
  mailedAt?: string;
  deliveredAt?: string;
  raw: unknown;
}

export class LetterStreamError extends Error {
  constructor(message: string, readonly httpStatus: number, readonly raw?: unknown) {
    super(message);
    this.name = "LetterStreamError";
  }
}

const enc = new TextEncoder();

async function md5Hex(input: string): Promise<string> {
  // Deno's WebCrypto exposes MD5 under the non-standard name; fall back to a tiny pure implementation if not.
  try {
    const buf = await crypto.subtle.digest("MD5", enc.encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return md5Pure(input);
  }
}

/**
 * Request signature. Documented v1 recipe: unix timestamp `t`, and
 * `h = base64(md5(apiId + t + apiKey)).substr(10, 30)`. If the guide you
 * receive differs, change it here.
 */
export async function signature(creds: LetterStreamCredentials, t: number): Promise<string> {
  const hex = await md5Hex(`${creds.apiId}${t}${creds.apiKey}`);
  return btoa(hex).substring(10, 40);
}

async function authFields(creds: LetterStreamCredentials): Promise<Record<string, string>> {
  const t = Math.floor(Date.now() / 1000);
  return { a: creds.apiId, t: String(t), h: await signature(creds, t), responseformat: "json" };
}

async function call(creds: LetterStreamCredentials, fields: Record<string, string>, file?: { field: string; name: string; bytes: Uint8Array }): Promise<unknown> {
  const form = new FormData();
  for (const [k, v] of Object.entries({ ...(await authFields(creds)), ...fields })) form.append(k, v);
  if (file) form.append(file.field, new Blob([file.bytes], { type: "application/pdf" }), file.name);

  let res: Response;
  try {
    res = await fetch(LETTERSTREAM_API_URL, { method: "POST", body: form });
  } catch (e) {
    throw new LetterStreamError(`LetterStream could not be reached: ${String(e)}`, 0);
  }
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* LetterStream answered with text, not JSON */ }

  const err = errorIn(data);
  if (!res.ok || err) {
    throw new LetterStreamError(err || `LetterStream answered ${res.status}`, res.status || 502, data);
  }
  return data;
}

/** LetterStream signals failure inside the body; surface its words. */
function errorIn(data: unknown): string | null {
  if (typeof data === "string") return /error|invalid|denied|unauthori[sz]ed/i.test(data) ? data.slice(0, 200) : null;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.error) return String(typeof d.error === "object" ? JSON.stringify(d.error) : d.error);
  if (d.errors) return String(Array.isArray(d.errors) ? d.errors.join("; ") : JSON.stringify(d.errors));
  if (typeof d.status === "string" && /^(error|fail)/i.test(d.status)) return String(d.message || d.status);
  if (d.success === false) return String(d.message || "LetterStream refused the request");
  return null;
}

/**
 * Check that the building's credentials work. Uses the documented price-check
 * call with no job, which is free and does not create anything in the account.
 */
export async function verifyCredentials(creds: LetterStreamCredentials): Promise<{ ok: true; raw: unknown } | { ok: false; reason: string; reachable: boolean }> {
  try {
    const raw = await call(creds, { mode: "pricecheck" });
    return { ok: true, raw };
  } catch (e) {
    if (e instanceof LetterStreamError) return { ok: false, reason: e.message, reachable: e.httpStatus !== 0 };
    return { ok: false, reason: String(e), reachable: false };
  }
}

/** Push one letter into the building's LetterStream account. It sits there until the building pays for it (or has a prepaid balance). */
export async function submitJob(creds: LetterStreamCredentials, input: SubmitJobInput): Promise<SubmitJobResult> {
  const r = input.recipient;
  const s = input.sender;
  const fields: Record<string, string> = {
    job: input.jobName,
    mail_type: MAIL_TYPE[input.deliveryMethod],
    pages: String(input.pageCount),
    duplex: "0",
    color: "0",
    return_envelope: input.includeReturnEnvelope ? "1" : "0",
    recipient_name: r.name,
    recipient_address1: r.line1,
    recipient_address2: r.line2 || "",
    recipient_city: r.city,
    recipient_state: r.state,
    recipient_zip: r.zip,
    return_name: s.name,
    return_address1: s.line1,
    return_address2: s.line2 || "",
    return_city: s.city,
    return_state: s.state,
    return_zip: s.zip,
  };
  const raw = await call(creds, fields, { field: "single_file", name: input.pdfFileName, bytes: input.pdf });
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const jobId = String(d.job_id ?? d.jobid ?? d.id ?? d.job ?? "");
  if (!jobId) throw new LetterStreamError("LetterStream accepted the job but returned no job id", 502, raw);
  return { jobId, status: d.status ? String(d.status) : undefined, raw };
}

/** Ask LetterStream where a job stands. */
export async function jobStatus(creds: LetterStreamCredentials, jobId: string): Promise<JobStatusResult> {
  const raw = await call(creds, { mode: "status", job: jobId });
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    jobId,
    status: String(d.status ?? d.job_status ?? "unknown"),
    trackingNumber: d.tracking_number ? String(d.tracking_number) : undefined,
    mailedAt: d.mailed_date ? String(d.mailed_date) : undefined,
    deliveredAt: d.delivered_date ? String(d.delivered_date) : undefined,
    raw,
  };
}

/** Map LetterStream's status words onto the app's MailStatus. Unknown words fall through unchanged. */
export function normalizeStatus(s: string): string {
  const w = s.toLowerCase();
  if (/await|unpaid|cart|payment/.test(w)) return "awaiting-payment";
  if (/test|pending|received|submitted|queued/.test(w)) return "submitted";
  if (/production|processing|printing|proof/.test(w)) return "processing";
  if (/mailed|complete/.test(w)) return "mailed";
  if (/transit/.test(w)) return "in-transit";
  if (/deliver/.test(w)) return "delivered";
  if (/return/.test(w)) return "returned";
  if (/cancel|fail|error|reject/.test(w)) return "failed";
  return w;
}

export function maskApiId(apiId: string): string {
  if (apiId.length <= 4) return "••••";
  return `${"•".repeat(Math.max(2, apiId.length - 4))}${apiId.slice(-4)}`;
}

// ─── Pure MD5 fallback (RFC 1321), only used where WebCrypto lacks MD5 ─────
function md5Pure(str: string): string {
  const bytes = enc.encode(str);
  const K = new Uint32Array(64);
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);
  const padLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const msg = new Uint8Array(padLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const bitLen = bytes.length * 8;
  new DataView(msg.buffer).setUint32(padLen - 8, bitLen >>> 0, true);
  new DataView(msg.buffer).setUint32(padLen - 4, Math.floor(bitLen / 2 ** 32), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  const dv = new DataView(msg.buffer);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a0, true); ov.setUint32(4, b0, true); ov.setUint32(8, c0, true); ov.setUint32(12, d0, true);
  return Array.from(out).map(b => b.toString(16).padStart(2, "0")).join("");
}
