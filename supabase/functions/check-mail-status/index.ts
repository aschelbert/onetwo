// supabase/functions/check-mail-status/index.ts
// Asks the building's printed-mail vendor where one of its letters stands,
// using the building's own credentials. Any member of the building may ask.
// DocuPost has no status API, so for it the answer points at the dashboard.

import { PROVIDER_INFO, isProvider, jobStatus, vendorError } from "../_shared/mailProvider.ts";
import { authUser, cors, jsonResponse, membership, restGetOne } from "../_shared/supabaseRest.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const user = await authUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const tu = await membership(user.id);
    if (!tu?.tenant_id) return jsonResponse({ error: "You are not a member of a building" }, 403);

    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== "string") return jsonResponse({ error: "Missing jobId" }, 400);

    const acct = await restGetOne("mail_provider_accounts", { "tenant_id": `eq.${tu.tenant_id}`, "select": "provider,api_id,api_key" });
    if (!acct?.api_key || !isProvider(acct.provider)) return jsonResponse({ error: "The building's mail account isn't connected", notConnected: true }, 400);
    const info = PROVIDER_INFO[acct.provider];

    try {
      const s = await jobStatus(acct.provider, { apiId: acct.api_id || undefined, apiKey: acct.api_key }, jobId);
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
        message: s.dashboardOnly ? `${info.label} shows tracking in its dashboard; it has no status API.` : null,
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
