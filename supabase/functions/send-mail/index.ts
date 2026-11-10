// supabase/functions/send-mail/index.ts
// Renders the notice as a PDF and pushes it into the *building's* own account
// with its printed-mail vendor (DocuPost or LetterStream). No money moves
// here: the vendor prices the letter and the building pays the vendor for it.
// We only report where the letter stands.

import { PROVIDER_INFO, isCredentialError, isFundsError, isProvider, submitLetter, vendorError } from "../_shared/mailProvider.ts";
import { renderLetterPdf } from "../_shared/letterPdf.ts";
import { storeLetterPdf } from "../_shared/letterStorage.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

export const NOT_CONNECTED = "The building's mail account isn't connected. A board member connects DocuPost or LetterStream under Settings → Mailing.";

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

/** Record what the vendor just told us about the saved credential. */
async function markAccount(tenantId: string, patch: Record<string, unknown>) {
  await fetch(`${SB_URL}/rest/v1/mail_provider_accounts?tenant_id=eq.${tenantId}`, {
    method: "PATCH",
    headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify(patch),
  }).catch(e => console.error("markAccount failed:", e));
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

    // ── 3. The building's vendor account ───────────────────
    const acct = await sbGet("mail_provider_accounts", { "tenant_id": `eq.${tenantId}`, "select": "provider,api_id,api_key,status" });
    if (!acct?.api_key || !isProvider(acct.provider)) return jsonResponse({ error: NOT_CONNECTED, notConnected: true }, 400);
    const provider = acct.provider;
    const info = PROVIDER_INFO[provider];

    // ── 4. Render, store if the vendor fetches by URL, submit ──
    const { bytes, pageCount } = await renderLetterPdf({ subject, body: letterBody, sender, recipient });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `notice-${stamp}.pdf`;
    const label = `${stamp} ${subject}`.slice(0, 36) + (caseId ? ` [${String(caseId).slice(0, 8)}]` : "");

    let pdfUrl: string | undefined;
    if (info.needsPdfUrl) {
      try {
        pdfUrl = (await storeLetterPdf(tenantId, bytes, fileName)).signedUrl;
      } catch (e) {
        console.error("Could not store the letter for the vendor:", e);
        return jsonResponse({ error: `The letter could not be stored for ${info.label} to fetch: ${String(e)}` }, 500);
      }
    }

    let result;
    try {
      result = await submitLetter(provider, { apiId: acct.api_id || undefined, apiKey: acct.api_key }, {
        pdf: bytes,
        pdfUrl,
        pdfFileName: fileName,
        pageCount,
        label,
        deliveryMethod,
        recipient,
        sender,
        includeReturnEnvelope: !!includeReturnEnvelope,
      });
    } catch (e) {
      const v = vendorError(e);
      if (v) {
        console.error(`${info.label} refused the letter:`, v.message, v.raw);
        if (isCredentialError(provider, v.message)) {
          await markAccount(tenantId, { status: "invalid", last_error: v.message });
          return jsonResponse({ error: `${info.label} rejected the building's saved credentials (${v.message}). A board member can paste a fresh one under Settings → Mailing.`, invalidCredentials: true, vendor: v.raw }, 422);
        }
        if (isFundsError(provider, v.message)) {
          return jsonResponse({ error: `The building's ${info.label} balance is too low for this letter. Add funds at ${info.label} and send it again.`, needsFunds: true, portalUrl: info.portalUrl, vendor: v.raw }, 402);
        }
        return jsonResponse({ error: `${info.label} did not accept the letter: ${v.message}`, vendor: v.raw }, v.httpStatus === 0 ? 502 : 422);
      }
      throw e;
    }

    // The vendor accepted a letter with these credentials, so they are verified.
    if (acct.status !== "verified") await markAccount(tenantId, { status: "verified", last_error: null, last_verified_at: new Date().toISOString() });

    // ── 5. Where it stands ─────────────────────────────────
    return jsonResponse({
      success: true,
      provider,
      providerLabel: info.label,
      jobId: result.jobId || null,
      status: result.status,
      awaitingPayment: result.status === "awaiting-payment",
      portalUrl: info.portalUrl,
      pageCount,
      deliveryMethod,
      message: result.message,
    });
  } catch (err) {
    console.error("send-mail error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
