// supabase/functions/check-mail-status/index.ts
// Asks the building's printed-mail vendor where one of its letters stands,
// using the building's own credentials, and writes the answer onto the
// building's record of the letter (mail_records). The board, the property
// manager and the account owner may ask.
// DocuPost has no status API, so for it the answer points at the dashboard;
// the board records the USPS tracking number from there instead.

import { PROVIDER_INFO, isProvider, jobStatus, vendorError } from "../_shared/mailProvider.ts";
import { canManageMail, getMailRecord, saveMailRecord, validRecordId } from "../_shared/mailRecords.ts";
import { authUser, cors, jsonResponse, membership, restGetOne } from "../_shared/supabaseRest.ts";

const KNOWN = new Set(["awaiting-payment", "submitted", "processing", "mailed", "in-transit", "delivered", "returned", "failed"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const user = await authUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const tu = await membership(user.id);
    if (!tu?.tenant_id) return jsonResponse({ error: "You are not a member of a building" }, 403);
    if (!canManageMail(tu)) return jsonResponse({ error: "Only the board and the property manager can check the building's mail" }, 403);

    const { jobId: askedJobId, recordId } = await req.json();
    const record = validRecordId(recordId) ? await getMailRecord(tu.tenant_id, recordId) : null;
    if (recordId && !record) return jsonResponse({ error: "That letter is not on the building's record" }, 404);
    const jobId = record?.letterstreamJobId || askedJobId;
    if (!jobId || typeof jobId !== "string") return jsonResponse({ error: record ? "The vendor gave no id for this letter, so it can only be looked up in its dashboard" : "Missing jobId" }, 400);

    const acct = await restGetOne("mail_provider_accounts", { "tenant_id": `eq.${tu.tenant_id}`, "select": "provider,api_id,api_key" });
    if (!acct?.api_key || !isProvider(acct.provider)) return jsonResponse({ error: "The building's mail account isn't connected", notConnected: true }, 400);
    // A letter sent through a vendor the building has since left can't be asked about with the new one's keys.
    if (record?.mailProvider && record.mailProvider !== acct.provider) return jsonResponse({ error: `This letter went through ${PROVIDER_INFO[record.mailProvider as keyof typeof PROVIDER_INFO]?.label ?? "another vendor"}, which is no longer connected` }, 400);
    const info = PROVIDER_INFO[acct.provider];

    try {
      const s = await jobStatus(acct.provider, { apiId: acct.api_id || undefined, apiKey: acct.api_key }, jobId);

      // Write what the vendor said onto the building's record, when it says something new.
      let saved = record;
      if (record && !s.dashboardOnly && KNOWN.has(s.currentStatus)) {
        const changed = s.currentStatus !== record.status || (s.trackingNumber && s.trackingNumber !== record.trackingNumber);
        if (changed) {
          const ts = new Date().toISOString();
          saved = {
            ...record,
            status: s.currentStatus,
            statusHistory: s.currentStatus !== record.status
              ? [...(record.statusHistory ?? []), { status: s.currentStatus, timestamp: ts, source: acct.provider, detail: s.vendorStatus ? `${info.label}: ${s.vendorStatus}` : `Reported by ${info.label}` }]
              : record.statusHistory,
            trackingNumber: s.trackingNumber || record.trackingNumber,
            deliveredAt: s.currentStatus === "delivered" ? s.deliveredAt || record.deliveredAt || ts : record.deliveredAt,
          };
          await saveMailRecord(tu.tenant_id, null, saved);
        }
      }

      return jsonResponse({
        success: true,
        provider: acct.provider,
        jobId,
        currentStatus: s.currentStatus,
        vendorStatus: s.vendorStatus,
        trackingNumber: s.trackingNumber,
        mailedAt: s.mailedAt,
        deliveredAt: s.deliveredAt,
        dashboardOnly: s.dashboardOnly,
        portalUrl: info.portalUrl,
        record: saved,
        message: s.dashboardOnly ? `${info.label} shows tracking in its dashboard; it has no status API. Record the USPS tracking number from the letter's page there.` : null,
      });
    } catch (e) {
      const v = vendorError(e);
      if (v) return jsonResponse({ error: `${info.label}: ${v.message}` }, v.httpStatus === 0 ? 502 : 422);
      throw e;
    }
  } catch (err) {
    console.error("check-mail-status error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
