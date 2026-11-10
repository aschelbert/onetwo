// supabase/functions/check-mail-status/index.ts
// Asks the building's printed-mail vendor where one of its letters stands,
// using the building's own credentials. Any member of the building may ask.
// DocuPost has no status API, so for it the answer points at the dashboard.

import { PROVIDER_INFO, isProvider, jobStatus, vendorError } from "../_shared/mailProvider.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { "Authorization": auth, "apikey": SB_ANON } });
    if (!userRes.ok) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = await userRes.json();

    const tu = await sbGet("tenant_users", { "user_id": `eq.${user.id}`, "select": "tenant_id", "limit": "1" });
    if (!tu?.tenant_id) return jsonResponse({ error: "You are not a member of a building" }, 403);

    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== "string") return jsonResponse({ error: "Missing jobId" }, 400);

    const acct = await sbGet("mail_provider_accounts", { "tenant_id": `eq.${tu.tenant_id}`, "select": "provider,api_id,api_key" });
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
