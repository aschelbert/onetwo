// supabase/functions/email-suppression/index.ts
// Turning email back on for an address the provider has stopped delivering to
// (see brevo-webhook and the email_suppressions table).
//
//   { action: "restore-self" }
//       The signed-in person, for their own address. Always allowed: it is
//       their inbox and their choice.
//   { action: "restore-member", tenantId, email }
//       The board, property manager or account owner, for a member of their
//       building. Not allowed after a spam report: only the person who made
//       it can undo that.
//
// Restoring takes the address off Brevo's blocked list and then removes our
// row. If Brevo cannot be reached nothing changes, so the two never disagree.

import { emailConfigured, suppressionReason, unblockAtProvider } from "../_shared/email.ts";
import { authUser, canManageBuilding, cors, jsonResponse, membershipIn, restWrite } from "../_shared/supabaseRest.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/** Whether this address belongs to a member of the building. */
async function isMemberEmail(tenantId: string, email: string): Promise<boolean> {
  const headers = { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}` };
  const res = await fetch(`${SB_URL}/rest/v1/tenant_users?select=user_id,email&tenant_id=eq.${encodeURIComponent(tenantId)}`, { headers });
  if (!res.ok) return false;
  const rows = (await res.json()) as { user_id: string | null; email: string | null }[];
  if (rows.some((r) => (r.email || "").trim().toLowerCase() === email)) return true;
  // The member row may not carry the address; the sign-in always does.
  for (const r of rows) {
    if (!r.user_id) continue;
    const u = await fetch(`${SB_URL}/auth/v1/admin/users/${r.user_id}`, { headers });
    if (u.ok && String((await u.json())?.email || "").toLowerCase() === email) return true;
  }
  return false;
}

async function restore(email: string): Promise<Response> {
  if (!emailConfigured()) return jsonResponse({ success: false, error: "Email is not set up" }, 503);
  if (!(await unblockAtProvider(email))) return jsonResponse({ success: false, error: "Could not reach the email service. Try again in a moment." }, 502);
  if (!(await restWrite("DELETE", `email_suppressions?email=eq.${encodeURIComponent(email)}`))) {
    return jsonResponse({ success: false, error: "Email is back on, but the record did not update. Try again in a moment." }, 500);
  }
  return jsonResponse({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = await authUser(req);
  if (!user?.id) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: { action?: string; tenantId?: string; email?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  if (body.action === "restore-self") {
    const email = (user.email || "").trim().toLowerCase();
    if (!email) return jsonResponse({ error: "This sign-in has no email address" }, 400);
    return await restore(email);
  }

  if (body.action === "restore-member") {
    const email = (body.email || "").trim().toLowerCase();
    if (!body.tenantId || !email) return jsonResponse({ error: "tenantId and email are required" }, 400);
    if (!canManageBuilding(await membershipIn(user.id, body.tenantId))) return jsonResponse({ error: "Only the board or manager can do this" }, 403);
    if (!(await isMemberEmail(body.tenantId, email))) return jsonResponse({ error: "That address is not a member of this building" }, 404);
    if ((await suppressionReason(email)) === "spam") {
      return jsonResponse({ success: false, error: "This person reported the building's email as spam. Only they can turn it back on, from their Account page." }, 409);
    }
    return await restore(email);
  }

  return jsonResponse({ error: "Unknown action" }, 400);
});
