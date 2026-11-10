// supabase/functions/connect-letterstream/index.ts
// The building's own LetterStream account (Partnership mode), the way
// connect-stripe-account is the building's own Stripe account.
// Actions: status (any member), connect / disconnect (board members).
// Credentials live in letterstream_accounts, which only the service role can
// read; the app sees a masked API ID and a connected flag.

import { LETTERSTREAM_PARTNER_URL, LETTERSTREAM_PORTAL_URL, maskApiId, verifyCredentials } from "../_shared/letterstream.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

async function sbQuery(method: string, table: string, params?: Record<string, string>, body?: unknown, prefer?: string) {
  const url = new URL(`${SB_URL}/rest/v1/${table}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    "apikey": SB_SERVICE_KEY,
    "Authorization": `Bearer ${SB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": prefer || (method === "POST" ? "return=representation" : "return=minimal"),
  };
  if (method === "GET") headers["Accept"] = "application/vnd.pgrst.object+json";
  const res = await fetch(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (method === "GET") return res.ok ? await res.json() : null;
  return res.ok;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function statusPayload(row: { api_id: string; status: string; connected_at: string; last_verified_at: string | null; last_error: string | null } | null) {
  return {
    success: true,
    connected: !!row,
    apiIdMasked: row ? maskApiId(row.api_id) : null,
    status: row?.status ?? null,
    connectedAt: row?.connected_at ?? null,
    lastVerifiedAt: row?.last_verified_at ?? null,
    lastError: row?.last_error ?? null,
    partnerUrl: LETTERSTREAM_PARTNER_URL || null,
    portalUrl: LETTERSTREAM_PORTAL_URL,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { "Authorization": auth, "apikey": SB_ANON } });
    if (!userRes.ok) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = await userRes.json();

    const tu = await sbQuery("GET", "tenant_users", { "user_id": `eq.${user.id}`, "select": "tenant_id,role", "limit": "1" });
    if (!tu?.tenant_id) return jsonResponse({ error: "You are not a member of a building" }, 403);
    const tenantId: string = tu.tenant_id;

    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";
    if (action !== "status" && tu.role !== "board_member") {
      return jsonResponse({ error: "Only board members can manage the building's LetterStream account" }, 403);
    }

    const select = "api_id,status,connected_at,last_verified_at,last_error";

    // ═══ status ═══
    if (action === "status") {
      const row = await sbQuery("GET", "letterstream_accounts", { "tenant_id": `eq.${tenantId}`, select });
      return jsonResponse(statusPayload(row));
    }

    // ═══ connect ═══
    // The board pastes the API ID and key from the building's own LetterStream
    // account (My Account → API Information). The account must have been
    // opened through our partner link, or LetterStream issues no credentials.
    if (action === "connect") {
      const apiId = String(body.apiId || "").trim();
      const apiKey = String(body.apiKey || "").trim();
      if (!apiId || !apiKey) return jsonResponse({ error: "Both the API ID and the API key are required" }, 400);
      if (apiId.length > 128 || apiKey.length > 256) return jsonResponse({ error: "That does not look like a LetterStream API ID and key" }, 400);

      const check = await verifyCredentials({ apiId, apiKey });
      // A wrong key is refused outright. If LetterStream itself cannot be reached
      // right now, the credentials are saved as unverified so the board is not blocked.
      if (!check.ok && check.reachable) {
        return jsonResponse({ error: `LetterStream did not accept these credentials: ${check.reason}` }, 400);
      }
      const now = new Date().toISOString();
      const row = {
        tenant_id: tenantId,
        api_id: apiId,
        api_key: apiKey,
        status: check.ok ? "verified" : "unverified",
        last_error: check.ok ? null : check.reason,
        connected_by: user.id,
        connected_at: now,
        last_verified_at: check.ok ? now : null,
      };
      const ok = await sbQuery("POST", "letterstream_accounts?on_conflict=tenant_id", {}, row, "resolution=merge-duplicates,return=minimal");
      if (!ok) return jsonResponse({ error: "Could not save the LetterStream credentials" }, 500);

      const saved = await sbQuery("GET", "letterstream_accounts", { "tenant_id": `eq.${tenantId}`, select });
      return jsonResponse({ ...statusPayload(saved), verified: check.ok, note: check.ok ? null : `Saved, but not yet verified: ${check.reason}` });
    }

    // ═══ disconnect ═══
    if (action === "disconnect") {
      const ok = await sbQuery("DELETE", `letterstream_accounts?tenant_id=eq.${tenantId}`);
      if (!ok) return jsonResponse({ error: "Could not remove the LetterStream credentials" }, 500);
      return jsonResponse(statusPayload(null));
    }

    return jsonResponse({ error: "Invalid action. Use: status, connect, disconnect" }, 400);
  } catch (err) {
    console.error("connect-letterstream error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
