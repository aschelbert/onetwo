// supabase/functions/_shared/stripeAccount.ts
// Where a building's Stripe Connect account stands, and what happens the moment
// Stripe verifies it. Shared by connect-stripe-account (the board clicking
// Check now), stripe-webhook (Stripe's own account.updated) and
// stripe-account-status (the daily sweep), so the account is marked verified
// and the board is told exactly once, whichever path notices first.
// Zero dependencies: raw fetch to Stripe, the Supabase REST and Auth APIs, and Mailjet.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

export const STRIPE_SETTINGS_SELECT = "tenant_id,stripe_connect_id,stripe_onboarding_complete,stripe_connected_by,stripe_verified_at,hoa_due_day";

export interface StripeSettings {
  tenant_id: string;
  stripe_connect_id: string | null;
  stripe_onboarding_complete: boolean;
  stripe_connected_by?: string | null;
  stripe_verified_at?: string | null;
  hoa_due_day?: number | null;
}

export interface StripeAccountState {
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** Fields Stripe still wants before charges can be enabled (empty while it is only reviewing). */
  requirementsDue: string[];
}

export interface ConfirmResult extends StripeAccountState {
  onboardingComplete: boolean;
  /** This call is the one that flipped the account to verified (so the board was just told). */
  justVerified: boolean;
  emailed: number;
}

const svcHeaders = (extra?: Record<string, string>) => ({
  "apikey": SB_SERVICE_KEY,
  "Authorization": `Bearer ${SB_SERVICE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

async function sbPatch(table: string, filter: string, body: unknown) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: svcHeaders({ "Prefer": "return=minimal" }), body: JSON.stringify(body) });
  if (!res.ok) console.error(`PATCH ${table} failed:`, res.status, await res.text());
  return res.ok;
}

async function sbGetMany<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: svcHeaders({ "Accept": "application/json" }) });
  return res.ok ? await res.json() : [];
}

/**
 * Record a freshly created Connect account on the building's financial
 * settings, creating the row if the board never saved settings before (the
 * setup step comes before any Funds settings are touched). Resets the
 * verification fields so an earlier account's state never carries over.
 */
export async function saveConnectedAccount(tenantId: string, stripeConnectId: string, connectedBy: string | null): Promise<boolean> {
  const res = await fetch(`${SB_URL}/rest/v1/financial_settings?on_conflict=tenant_id`, {
    method: "POST",
    headers: svcHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ tenant_id: tenantId, stripe_connect_id: stripeConnectId, stripe_onboarding_complete: false, stripe_connected_by: connectedBy, stripe_verified_at: null, stripe_status_checked_at: null }),
  });
  if (!res.ok) console.error("Saving the Stripe account on financial_settings failed:", res.status, await res.text());
  return res.ok;
}

export function accountState(account: Record<string, unknown>): StripeAccountState {
  const req = (account.requirements ?? {}) as { currently_due?: string[]; past_due?: string[] };
  return {
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    requirementsDue: [...new Set([...(req.currently_due ?? []), ...(req.past_due ?? [])])],
  };
}

/** The account as Stripe has it. `null` when Stripe says it does not exist (404); throws on any other failure so a sweep never clears an id over a blip. */
export async function fetchStripeAccount(stripeConnectId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://api.stripe.com/v1/accounts/${stripeConnectId}`, { headers: { "Authorization": `Bearer ${STRIPE_KEY}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Stripe account lookup failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

/**
 * Compare Stripe's view of the account with ours. Always records when it was
 * checked. The first time Stripe reports charges enabled and details submitted,
 * marks the building verified, emails the board, and posts the owners'
 * announcement. Pass `account` when the caller already has it (a webhook).
 */
export async function confirmIfVerified(settings: StripeSettings, account?: Record<string, unknown> | null): Promise<ConfirmResult> {
  if (!settings.stripe_connect_id) throw new Error("No Stripe Connect account on this building");
  const acct = account ?? await fetchStripeAccount(settings.stripe_connect_id);
  if (!acct) throw new Error("Stripe account not found");
  const state = accountState(acct);
  const onboardingComplete = state.chargesEnabled && state.detailsSubmitted;
  const now = new Date().toISOString();
  const justVerified = onboardingComplete && !settings.stripe_onboarding_complete;

  await sbPatch("financial_settings", `tenant_id=eq.${settings.tenant_id}`, {
    stripe_status_checked_at: now,
    ...(justVerified ? { stripe_onboarding_complete: true, stripe_verified_at: now } : {}),
  });

  let emailed = 0;
  if (justVerified) {
    try { emailed = await notifyVerified(settings); } catch (err) { console.error("Stripe verified, but telling the board failed:", err); }
  }
  return { ...state, onboardingComplete, justVerified, emailed };
}

// ── Telling people ───────────────────────────────────────────────────────────

async function userEmail(userId: string): Promise<{ email: string; name: string } | null> {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { headers: svcHeaders() });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.email ? { email: u.email, name: u.user_metadata?.name || u.email.split("@")[0] } : null;
}

/** The board member who clicked Connect; failing that, every board member with an email. */
async function boardRecipients(settings: StripeSettings): Promise<{ email: string; name: string }[]> {
  if (settings.stripe_connected_by) {
    const who = await userEmail(settings.stripe_connected_by);
    if (who) return [who];
  }
  const members = await sbGetMany<{ user_id: string }>("tenant_users", `tenant_id=eq.${settings.tenant_id}&role=eq.board_member&status=eq.active&select=user_id`);
  const out: { email: string; name: string }[] = [];
  for (const m of members) { const who = await userEmail(m.user_id); if (who) out.push(who); }
  return out;
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th"}`;

async function sendMailjet(to: { email: string; name: string }, subject: string, htmlBody: string, textBody: string) {
  if (!MJ_API_KEY || !MJ_SECRET_KEY) { console.warn("Mailjet is not configured; Stripe confirmation email not sent"); return false; }
  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: { "Authorization": `Basic ${btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ Messages: [{ From: { Email: "noreply@getonetwo.com", Name: "ONE two HOA" }, To: [{ Email: to.email, Name: to.name }], Subject: subject, TextPart: textBody, HTMLPart: htmlBody }] }),
  });
  if (!res.ok) console.error("Mailjet error:", res.status, await res.text());
  return res.ok;
}

/** Stripe has verified the association: email the board and post the owners' announcement. Returns how many emails went out. */
export async function notifyVerified(settings: StripeSettings): Promise<number> {
  const [tenant] = await sbGetMany<{ name: string; status: string }>("tenants", `id=eq.${settings.tenant_id}&select=name,status`);
  const building = tenant?.name || "Your building";
  const live = tenant?.status === "active";
  const dueDay = settings.hoa_due_day || 1;
  const link = live ? `${SITE_URL}/funds?tab=payments` : `${SITE_URL}/setup?step=payments`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #4F46A8; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">✓</div>
        <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">Stripe has verified ${building}</h1>
        <p style="color: #666; font-size: 14px; margin: 0;">Owners can now pay dues and assessments online</p>
      </div>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="color: #333; font-size: 14px; margin: 0 0 12px;">Stripe finished checking the association's details and switched on card and bank payments for <strong>${building}</strong>.</p>
        <p style="color: #333; font-size: 14px; margin: 0 0 12px;">${live
          ? `Every owner's unit page now offers "Pay online or set up autopay", and an announcement saying so is posted for them. Autopay runs on the ${ordinal(dueDay)} and counts as on time. Checks still work for anyone who prefers them.`
          : `When you go live, every owner's unit page will offer "Pay online or set up autopay", and their invitation will say so. Autopay runs on the ${ordinal(dueDay)} and counts as on time. Checks still work for anyone who prefers them.`}</p>
        <p style="color: #333; font-size: 14px; margin: 0;">Payouts land in the operating account the next business day, and every payment posts to the unit ledger on its own.</p>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${link}" style="display: inline-block; background: #4F46A8; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">${live ? "Open online payments →" : "Back to setup →"}</a>
      </div>
      <div style="text-align: center; color: #999; font-size: 12px;">
        <p>The payment rules (what owners can pay here, bank payments, who covers card fees) can be changed any time under Funds › Online payments.</p>
        <p style="margin-top: 16px;">Powered by <strong>ONE two</strong> HOA GovOps</p>
      </div>
    </div>`;
  const textBody = `Stripe has verified ${building}.\n\nOwners can now pay dues and assessments online by card or bank. ${live ? `Every owner's unit page now offers "Pay online or set up autopay", and an announcement saying so is posted for them.` : `When you go live, every owner's unit page will offer "Pay online or set up autopay".`} Autopay runs on the ${ordinal(dueDay)} and counts as on time. Checks still work for anyone who prefers them.\n\nPayouts land in the operating account the next business day, and every payment posts to the unit ledger on its own.\n\n${link}`;

  let emailed = 0;
  for (const to of await boardRecipients(settings)) {
    if (await sendMailjet(to, `${building}: owners can now pay online`, htmlBody, textBody)) emailed++;
  }

  // Owners' Home card and announcement. Posted once, when verified; a building still setting up shows it to owners the day they are invited.
  const res = await fetch(`${SB_URL}/rest/v1/announcements`, {
    method: "POST",
    headers: svcHeaders({ "Prefer": "return=minimal" }),
    body: JSON.stringify({
      tenant_id: settings.tenant_id,
      title: "Pay online or set up autopay",
      body: `Dues, assessments and fees can now be paid by card or bank from My Unit › Pay. Autopay runs on the ${ordinal(dueDay)} and counts as on time. Checks still work for anyone who prefers them.`,
      category: "financial",
      posted_by: "The board",
      posted_date: new Date().toISOString().slice(0, 10),
      pinned: true,
    }),
  });
  if (!res.ok) console.error("Owners' announcement failed:", res.status, await res.text());
  return emailed;
}
