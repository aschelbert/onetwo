// supabase/functions/send-mail/index.ts
// Renders the notice as a PDF and pushes it into the *building's* LetterStream
// account (Partnership mode). No money moves here: LetterStream prices the job
// and the building pays LetterStream for it, from its prepaid balance or in its
// LetterStream cart. We only report where the job stands.

import { LETTERSTREAM_PORTAL_URL, LetterStreamError, normalizeStatus, submitJob } from "../_shared/letterstream.ts";
import { renderLetterPdf } from "../_shared/letterPdf.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

export const NOT_CONNECTED = "The building's LetterStream account isn't connected. A board member connects it under Settings → Mailing.";

async function sbGet(table: string, params: Record<string, string>) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/vnd.pgrst.object+json" },
  });
  return res.ok ? await res.json() : null;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const METHODS = new Set(["first-class", "certified", "certified-return-receipt", "certified-electronic-return-receipt"]);

type Addr = { name: string; line1: string; line2?: string; city: string; state: string; zip: string };
function address(name: unknown, a: unknown): Addr | null {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const pick = (k: string) => String(o[k] ?? "").trim();
  const out = { name: String(name ?? "").trim(), line1: pick("line1"), line2: pick("line2") || undefined, city: pick("city"), state: pick("state"), zip: pick("zip") };
  return out.name && out.line1 && out.city && out.state && out.zip ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // ── 1. Who is asking, for which building ───────────────
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { "Authorization": auth, "apikey": SB_ANON } });
    if (!userRes.ok) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = await userRes.json();

    const tu = await sbGet("tenant_users", { "user_id": `eq.${user.id}`, "role": "eq.board_member", "select": "tenant_id", "limit": "1" });
    if (!tu?.tenant_id) return jsonResponse({ error: "Only board members can send mail" }, 403);
    const tenantId: string = tu.tenant_id;

    // ── 2. The letter ──────────────────────────────────────
    const body = await req.json();
    const { recipientName, recipientAddress, senderName, senderAddress, deliveryMethod, templateId, subject, letterBody, includeReturnEnvelope, caseId } = body;

    if (!METHODS.has(deliveryMethod)) return jsonResponse({ error: "Unknown delivery method" }, 400);
    if (!templateId || !subject || !letterBody) return jsonResponse({ error: "The letter's template, subject and body are required" }, 400);
    const recipient = address(recipientName, recipientAddress);
    if (!recipient) return jsonResponse({ error: "The recipient needs a name and a full postal address" }, 400);

    const tenant = await sbGet("tenants", { "id": `eq.${tenantId}`, "select": "name" });
    const sender = address(senderName || tenant?.name, senderAddress);
    if (!sender) return jsonResponse({ error: "The building's return address is incomplete. Set it under Building → Contacts." }, 400);

    // ── 3. The building's LetterStream credentials ─────────
    const acct = await sbGet("letterstream_accounts", { "tenant_id": `eq.${tenantId}`, "select": "api_id,api_key,status" });
    if (!acct?.api_id || !acct?.api_key) return jsonResponse({ error: NOT_CONNECTED, notConnected: true }, 400);

    // ── 4. Render and submit ───────────────────────────────
    const { bytes, pageCount } = await renderLetterPdf({ subject, body: letterBody, sender, recipient });
    const stamp = new Date().toISOString().slice(0, 10);
    const jobName = `${stamp} ${subject}`.slice(0, 60) + (caseId ? ` [${String(caseId).slice(0, 12)}]` : "");

    let job;
    try {
      job = await submitJob({ apiId: acct.api_id, apiKey: acct.api_key }, {
        jobName,
        deliveryMethod,
        pdf: bytes,
        pdfFileName: `notice-${stamp}.pdf`,
        pageCount,
        recipient,
        sender,
        includeReturnEnvelope: !!includeReturnEnvelope,
      });
    } catch (e) {
      if (e instanceof LetterStreamError) {
        console.error("LetterStream refused the job:", e.message, e.raw);
        return jsonResponse({ error: `LetterStream did not accept the letter: ${e.message}`, letterstream: e.raw ?? null }, e.httpStatus === 0 ? 502 : 422);
      }
      throw e;
    }

    // ── 5. Where it stands ─────────────────────────────────
    // LetterStream holds API jobs until they are paid for in the building's
    // account (prepaid balance or cart), so the honest status is usually
    // "awaiting payment", not "mailed".
    const status = job.status ? normalizeStatus(job.status) : "awaiting-payment";
    return jsonResponse({
      success: true,
      jobId: job.jobId,
      status,
      awaitingPayment: status === "awaiting-payment" || status === "submitted",
      portalUrl: LETTERSTREAM_PORTAL_URL,
      pageCount,
      deliveryMethod,
      message: status === "awaiting-payment"
        ? "Submitted to the building's LetterStream account. It mails once the building pays for it there, or at once if the account has a prepaid balance."
        : `Submitted to the building's LetterStream account (${status}).`,
    });
  } catch (err) {
    console.error("send-mail error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
