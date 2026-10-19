// supabase/functions/chargebee-portal/index.ts
// Creates a Chargebee Self-Serve Portal session for the current tenant.
// Zero dependencies -- raw fetch to Chargebee API + Supabase REST/Auth.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CHARGEBEE_SITE = Deno.env.get("CHARGEBEE_SITE") || "";
const CHARGEBEE_API_KEY = Deno.env.get("CHARGEBEE_API_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

// ── Supabase REST helper ──

async function sbQuery(
  method: string,
  table: string,
  params?: Record<string, string>,
) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  if (params)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    apikey: SB_SERVICE_KEY,
    Authorization: `Bearer ${SB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  if (method === "GET") headers["Accept"] = "application/vnd.pgrst.object+json";
  const res = await fetch(url.toString(), { method, headers });
  if (method === "GET") {
    return res.ok ? await res.json() : null;
  }
  return res.ok;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // ── Auth: verify user via Supabase Auth API ──
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: SB_ANON },
    });
    if (!userRes.ok) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const user = await userRes.json();

    // ── Authz: caller must be board_member ──
    const tu = await sbQuery("GET", "tenant_users", {
      user_id: `eq.${user.id}`,
      role: "eq.board_member",
      select: "tenant_id",
    });
    if (!tu?.tenant_id) {
      return jsonResponse(
        { error: "Only board members can access the billing portal" },
        403,
      );
    }
    const tenantId = tu.tenant_id;

    // ── Get tenant's chargebee_customer_id ──
    const tenant = await sbQuery("GET", "tenants", {
      id: `eq.${tenantId}`,
      select: "chargebee_customer_id",
    });
    if (!tenant?.chargebee_customer_id) {
      return jsonResponse(
        { error: "No Chargebee customer found for this tenant" },
        404,
      );
    }

    // ── Determine redirect URL ──
    let origin: string | undefined;
    try {
      const body = await req.json();
      origin = body.origin;
    } catch {
      // no body or not JSON -- that is fine
    }
    const redirectUrl = (origin || req.headers.get("origin") || "https://app.getonetwo.com") + "/subscription";

    // ── Create Chargebee portal session ──
    const params = new URLSearchParams();
    params.append("customer[id]", tenant.chargebee_customer_id);
    params.append("redirect_url", redirectUrl);

    const cbRes = await fetch(
      `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/portal_sessions`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(CHARGEBEE_API_KEY + ":"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
    const data = await cbRes.json();

    if (!cbRes.ok) {
      const msg = data?.message || data?.error_msg || JSON.stringify(data);
      console.error("Chargebee portal_sessions error:", msg);
      return jsonResponse({ error: msg }, cbRes.status);
    }

    const portalSession = data.portal_session;
    return jsonResponse({ url: portalSession.access_url });
  } catch (err) {
    console.error("chargebee-portal error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
