// supabase/functions/connect-mail-provider/index.ts
// The building's own account with a printed-mail vendor (DocuPost or
// LetterStream), the way connect-stripe-account is its own Stripe account.
// Actions: status (any member), connect / disconnect / set-balance (board members).
// Neither vendor reports its balance, so the board can record what the
// vendor's Funds page shows (set-balance); send-mail notes when a letter was
// refused for lack of funds.
// Credentials live in mail_provider_accounts, which only the service role can
// read; the app sees the provider, a masked credential and a connected flag.

import { PROVIDER_INFO, PROVIDERS, isProvider, maskCredential, verifyCredentials, type MailProviderId } from "../_shared/mailProvider.ts";
import { authUser, cors, jsonResponse, membership, restGetOne, restWrite } from "../_shared/supabaseRest.ts";

type Row = { provider: MailProviderId; api_id: string | null; api_key: string; status: string; connected_at: string; last_verified_at: string | null; last_error: string | null; funds_low_at: string | null; balance_cents: number | null; balance_recorded_at: string | null };

function statusPayload(row: Row | null) {
  const info = row ? PROVIDER_INFO[row.provider] : null;
  return {
    success: true,
    connected: !!row,
    provider: row?.provider ?? null,
    providerLabel: info?.label ?? null,
    credentialMasked: row ? maskCredential(row.provider, row) : null,
    status: row?.status ?? null,
    connectedAt: row?.connected_at ?? null,
    lastVerifiedAt: row?.last_verified_at ?? null,
    lastError: row?.last_error ?? null,
    fundsLowAt: row?.funds_low_at ?? null,
    balanceCents: row?.balance_cents ?? null,
    balanceRecordedAt: row?.balance_recorded_at ?? null,
    portalUrl: info?.portalUrl ?? null,
    signupUrl: info?.signupUrl ?? null,
    // What each vendor offers, so the app can show the choice before anything is connected.
    providers: PROVIDERS.map(p => ({ id: p, label: PROVIDER_INFO[p].label, signupUrl: PROVIDER_INFO[p].signupUrl, portalUrl: PROVIDER_INFO[p].portalUrl, credentials: PROVIDER_INFO[p].credentials })),
  };
}

const SELECT = "provider,api_id,api_key,status,connected_at,last_verified_at,last_error,funds_low_at,balance_cents,balance_recorded_at";
const account = (tenantId: string): Promise<Row | null> => restGetOne("mail_provider_accounts", { "tenant_id": `eq.${tenantId}`, "select": SELECT });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const user = await authUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const tu = await membership(user.id);
    if (!tu?.tenant_id) return jsonResponse({ error: "You are not a member of a building" }, 403);
    const tenantId = tu.tenant_id;

    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";
    if (action !== "status" && tu.role !== "board_member") {
      return jsonResponse({ error: "Only board members can manage the building's mail account" }, 403);
    }

    // ═══ status ═══
    if (action === "status") return jsonResponse(statusPayload(await account(tenantId)));

    // ═══ connect ═══
    if (action === "connect") {
      const provider = body.provider;
      if (!isProvider(provider)) return jsonResponse({ error: "Choose DocuPost or LetterStream" }, 400);
      const info = PROVIDER_INFO[provider];
      const apiId = String(body.apiId || "").trim();
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey || (info.credentials.includes("apiId") && !apiId)) {
        return jsonResponse({ error: provider === "docupost" ? "The DocuPost API token is required" : "Both the API ID and the API key are required" }, 400);
      }
      if (apiId.length > 128 || apiKey.length > 512) return jsonResponse({ error: `That does not look like a ${info.label} credential` }, 400);

      const check = await verifyCredentials(provider, { apiId: apiId || undefined, apiKey });
      // A refused credential is rejected outright. If the vendor itself cannot be
      // reached right now, or cannot confirm a credential without sending a letter,
      // it is saved as unverified so the board is not blocked.
      if (check.ok === false && check.reachable) {
        return jsonResponse({ error: `${info.label} did not accept these credentials: ${check.reason}` }, 400);
      }
      const verified = check.ok === true;
      const now = new Date().toISOString();
      // Fresh keys for the same vendor keep the recorded balance; another vendor is another account.
      const before = await account(tenantId);
      const sameVendor = before?.provider === provider;
      const row = {
        tenant_id: tenantId,
        provider,
        api_id: apiId || null,
        api_key: apiKey,
        status: verified ? "verified" : "unverified",
        last_error: verified || check.ok === "pending" ? null : check.reason,
        connected_by: user.id,
        connected_at: now,
        last_verified_at: verified ? now : null,
        funds_low_at: null,
        balance_cents: sameVendor ? before!.balance_cents : null,
        balance_recorded_at: sameVendor ? before!.balance_recorded_at : null,
      };
      const ok = await restWrite("POST", "mail_provider_accounts?on_conflict=tenant_id", row, "resolution=merge-duplicates,return=minimal");
      if (!ok) return jsonResponse({ error: `Could not save the ${info.label} credentials` }, 500);

      const note = verified ? null : check.ok === "pending" ? `Saved. ${check.reason}` : `Saved, but not yet verified: ${check.reason}`;
      return jsonResponse({ ...statusPayload(await account(tenantId)), verified, note });
    }

    // ═══ set-balance ═══
    // What the vendor's Funds page shows, read off by a board member; null forgets it.
    if (action === "set-balance") {
      if (!(await account(tenantId))) return jsonResponse({ error: "The building's mail account isn't connected" }, 400);
      const raw = body.balanceCents;
      const cents = raw === null || raw === undefined || raw === "" ? null : Math.round(Number(raw));
      if (cents !== null && (!Number.isFinite(cents) || cents < 0 || cents > 100_000_00)) return jsonResponse({ error: "Enter the balance as an amount between $0 and $100,000" }, 400);
      const patch = { balance_cents: cents, balance_recorded_at: cents === null ? null : new Date().toISOString(), ...(cents ? { funds_low_at: null } : {}) };
      const ok = await restWrite("PATCH", `mail_provider_accounts?tenant_id=eq.${tenantId}`, patch);
      if (!ok) return jsonResponse({ error: "Could not save the balance" }, 500);
      return jsonResponse(statusPayload(await account(tenantId)));
    }

    // ═══ disconnect ═══
    if (action === "disconnect") {
      const ok = await restWrite("DELETE", `mail_provider_accounts?tenant_id=eq.${tenantId}`);
      if (!ok) return jsonResponse({ error: "Could not remove the mail account" }, 500);
      return jsonResponse(statusPayload(null));
    }

    return jsonResponse({ error: "Invalid action. Use: status, connect, disconnect, set-balance" }, 400);
  } catch (err) {
    console.error("connect-mail-provider error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
