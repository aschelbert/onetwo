// supabase/functions/send-mail/index.ts
// Renders the notice as a PDF and pushes it into the *building's* own account
// with its printed-mail vendor (DocuPost or LetterStream). No money moves
// here: the vendor prices the letter and the building pays the vendor for it.
// We only report where the letter stands, and keep the building's record of it
// (mail_records), so the whole board sees the letter on any device.

import { PROVIDER_INFO, actualDeliveryMethod, isCredentialError, isFundsError, isProvider, submitLetter, vendorError } from "../_shared/mailProvider.ts";
import { clientFields, getMailRecord, saveMailRecord, validRecordId, type MailRecordData } from "../_shared/mailRecords.ts";
import { renderLetterPdf } from "../_shared/letterPdf.ts";
import { pruneOldLetters, storeLetterPdf } from "../_shared/letterStorage.ts";
import { toStateCode } from "../_shared/usStates.ts";
import { authUser, cors, jsonResponse, membership, restGetOne, restWrite } from "../_shared/supabaseRest.ts";

export const NOT_CONNECTED = "The building's mail account isn't connected. A board member connects DocuPost or LetterStream under Settings → Mailing.";

const METHODS = new Set(["first-class", "certified", "certified-return-receipt", "certified-electronic-return-receipt"]);

type Addr = { name: string; line1: string; line2?: string; city: string; state: string; zip: string };
/** A complete postal address with the state as its USPS code, or null when something required is missing. */
function address(name: unknown, a: unknown): Addr | null {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const pick = (k: string) => String(o[k] ?? "").trim();
  const out = { name: String(name ?? "").trim(), line1: pick("line1"), line2: pick("line2") || undefined, city: pick("city"), state: toStateCode(pick("state")), zip: pick("zip") };
  return out.name && out.line1 && out.city && out.state && out.zip ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // ── 1. Who is asking, for which building ───────────────
    const user = await authUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const tu = await membership(user.id);
    if (!tu?.tenant_id || tu.role !== "board_member") return jsonResponse({ error: "Only board members can send mail" }, 403);
    const tenantId = tu.tenant_id;

    // ── 2. The letter ──────────────────────────────────────
    const body = await req.json();
    const { recipientName, recipientAddress, senderName, senderAddress, templateId, subject, letterBody, includeReturnEnvelope, caseId } = body;
    let deliveryMethod = body.deliveryMethod;

    if (!METHODS.has(deliveryMethod)) return jsonResponse({ error: "Unknown delivery method" }, 400);
    if (!templateId || !subject || !letterBody) return jsonResponse({ error: "The letter's template, subject and body are required" }, 400);
    const recipient = address(recipientName, recipientAddress);
    if (!recipient) return jsonResponse({ error: "The recipient needs a name and a full postal address" }, 400);

    const tenant = await restGetOne("tenants", { "id": `eq.${tenantId}`, "select": "name" });
    const sender = address(senderName || tenant?.name, senderAddress);
    if (!sender) return jsonResponse({ error: "The building's return address is incomplete. Set it under Building → Contacts." }, 400);

    // ── 3. The building's vendor account ───────────────────
    const acct = await restGetOne("mail_provider_accounts", { "tenant_id": `eq.${tenantId}`, "select": "provider,api_id,api_key,status,funds_low_at" });
    if (!acct?.api_key || !isProvider(acct.provider)) return jsonResponse({ error: NOT_CONNECTED, notConnected: true }, 400);
    const provider = acct.provider;
    const info = PROVIDER_INFO[provider];
    // What the vendor will really send: DocuPost's return receipt is always the electronic one.
    deliveryMethod = actualDeliveryMethod(provider, deliveryMethod);

    // ── 4. Render, store if the vendor fetches by URL, submit ──
    const { bytes, pageCount } = await renderLetterPdf({ subject, body: letterBody, sender, recipient });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `notice-${stamp}.pdf`;
    const label = `${stamp} ${subject}`.slice(0, 36) + (caseId ? ` [${String(caseId).slice(0, 8)}]` : "");

    // The building's record of this letter. Saving it never blocks the letter itself.
    const startedAt = new Date().toISOString();
    // The browser's id is kept so its copy and this one are the same letter, unless that id is already on the record.
    const freshId = () => `mr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const recordId = validRecordId(body.record?.id) && !(await getMailRecord(tenantId, body.record.id)) ? body.record.id as string : freshId();
    const record: MailRecordData = {
      templateName: String(subject).slice(0, 200),
      cost: { baseCostCents: 0, additionalPagesCents: 0, returnEnvelopeCents: 0, totalCents: 0 },
      mergeVariables: {},
      ...Object.fromEntries(Object.entries(clientFields(body.record)).filter(([, v]) => v !== undefined)),
      id: recordId,
      caseId: caseId ? String(caseId).slice(0, 120) : "",
      tenantId,
      templateId: String(templateId).slice(0, 120),
      subject: String(subject).slice(0, 300),
      recipient: { name: recipient.name, address: { line1: recipient.line1, line2: recipient.line2, city: recipient.city, state: recipient.state, zip: recipient.zip } },
      sender: { name: sender.name, address: { line1: sender.line1, line2: sender.line2, city: sender.city, state: sender.state, zip: sender.zip } },
      deliveryMethod,
      pageCount,
      includeReturnEnvelope: !!includeReturnEnvelope,
      mailProvider: provider,
      letterstreamPortalUrl: info.portalUrl,
      sentBy: user.email || user.id,
      createdAt: startedAt,
      status: "approved",
      statusHistory: [
        { status: "draft", timestamp: startedAt, source: "system", detail: "Notice created" },
        { status: "approved", timestamp: startedAt, source: "system", detail: "Notice approved for sending" },
      ],
    };
    const settle = async (status: string, detail: string, extra: Record<string, unknown> = {}): Promise<{ record: MailRecordData; recorded: boolean }> => {
      const ts = new Date().toISOString();
      Object.assign(record, extra, { status, statusHistory: [...record.statusHistory, { status, timestamp: ts, source: "system", detail }] });
      const recorded = await saveMailRecord(tenantId, user.id, record).catch((e) => { console.error("Could not save the mail record:", e); return false; });
      return { record, recorded };
    };

    let pdfUrl: string | undefined;
    if (info.needsPdfUrl) {
      try {
        await pruneOldLetters(tenantId);
        pdfUrl = (await storeLetterPdf(tenantId, bytes, fileName)).signedUrl;
      } catch (e) {
        console.error("Could not store the letter for the vendor:", e);
        const msg = `The letter could not be stored for ${info.label} to fetch: ${String(e)}`;
        return jsonResponse({ error: msg, ...(await settle("failed", msg)) }, 500);
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
          await restWrite("PATCH", `mail_provider_accounts?tenant_id=eq.${tenantId}`, { status: "invalid", last_error: v.message });
          const msg = `${info.label} rejected the building's saved credentials (${v.message}). A board member can paste a fresh one under Settings → Mailing.`;
          return jsonResponse({ error: msg, invalidCredentials: true, vendor: v.raw, ...(await settle("failed", msg)) }, 422);
        }
        if (isFundsError(provider, v.message)) {
          // Remember it, so the whole board sees the account needs money before the next letter.
          const fundsLowAt = new Date().toISOString();
          await restWrite("PATCH", `mail_provider_accounts?tenant_id=eq.${tenantId}`, { funds_low_at: fundsLowAt });
          const msg = `The building's ${info.label} balance is too low for this letter. Add funds at ${info.label} and send it again.`;
          return jsonResponse({ error: msg, needsFunds: true, fundsLowAt, portalUrl: info.portalUrl, vendor: v.raw, ...(await settle("failed", msg)) }, 402);
        }
        const msg = `${info.label} did not accept the letter: ${v.message}`;
        return jsonResponse({ error: msg, vendor: v.raw, ...(await settle("failed", msg)) }, v.httpStatus === 0 ? 502 : 422);
      }
      throw e;
    }

    // The vendor accepted a letter with these credentials, so they are verified and the account has funds.
    if (acct.status !== "verified" || acct.funds_low_at) {
      await restWrite("PATCH", `mail_provider_accounts?tenant_id=eq.${tenantId}`, { funds_low_at: null, ...(acct.status !== "verified" ? { status: "verified", last_error: null, last_verified_at: new Date().toISOString() } : {}) });
    }
    const saved = await settle(result.status, result.message, { sentAt: new Date().toISOString(), letterstreamJobId: result.jobId || undefined });

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
      ...saved,
    });
  } catch (err) {
    console.error("send-mail error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
