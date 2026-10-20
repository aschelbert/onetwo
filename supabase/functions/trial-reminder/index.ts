// supabase/functions/trial-reminder/index.ts
// Sends a trial-ending reminder email to the account owner.
// Called by chargebee-webhook on subscription_trial_end_reminder.
// Idempotent: checks trial_reminder_sent_at before sending.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const headers = (extra?: Record<string, string>) => ({
  ...cors,
  "Content-Type": "application/json",
  ...extra,
});

async function sendMailjet(params: {
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}) {
  const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: "noreply@getonetwo.com", Name: "ONE two HOA" },
        To: [{ Email: params.to, Name: params.toName }],
        Subject: params.subject,
        TextPart: params.textBody,
        HTMLPart: params.htmlBody,
      }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Mailjet error:", res.status, body);
  }
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { subscription_id, tenant_id } = await req.json();

    if (!subscription_id && !tenant_id) {
      return new Response(JSON.stringify({ error: "subscription_id or tenant_id required" }), {
        status: 400, headers: headers(),
      });
    }

    const svcHeaders = {
      "apikey": SB_SERVICE_KEY,
      "Authorization": `Bearer ${SB_SERVICE_KEY}`,
      "Accept": "application/vnd.pgrst.object+json",
    };

    // Find subscription
    const subFilter = subscription_id
      ? `chargebee_subscription_id=eq.${subscription_id}`
      : `tenant_id=eq.${tenant_id}`;
    const subRes = await fetch(
      `${SB_URL}/rest/v1/subscriptions?${subFilter}&select=id,tenant_id,tier,trial_ends_at,trial_reminder_sent_at,billing_interval,addon_on_call,pm_addon`,
      { headers: svcHeaders }
    );
    const sub = await subRes.json();
    if (!sub?.tenant_id) {
      return new Response(JSON.stringify({ error: "Subscription not found" }), {
        status: 404, headers: headers(),
      });
    }

    // Idempotent check
    if (sub.trial_reminder_sent_at) {
      return new Response(JSON.stringify({ success: true, already_sent: true }), {
        status: 200, headers: headers(),
      });
    }

    // Get tenant name
    const tenantRes = await fetch(
      `${SB_URL}/rest/v1/tenants?id=eq.${sub.tenant_id}&select=name`,
      { headers: svcHeaders }
    );
    const tenant = await tenantRes.json();

    // Get account owner
    const ownerRes = await fetch(
      `${SB_URL}/rest/v1/tenant_users?tenant_id=eq.${sub.tenant_id}&is_account_owner=eq.true&select=user_id,email`,
      { headers: { ...svcHeaders, "Accept": "application/json" } }
    );
    const owners = await ownerRes.json();
    const owner = owners?.[0];

    if (!owner?.email) {
      return new Response(JSON.stringify({ error: "No owner found" }), {
        status: 404, headers: headers(),
      });
    }

    // Calculate days remaining
    const trialEnds = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : 0;

    // Build email
    const planLabel = sub.tier === "facilities" ? "Plus Facilities" : "Self-Managed";
    const addCardUrl = `${SITE_URL}/subscription`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
          <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h1>
          <p style="color: #666; font-size: 14px; margin: 0;">${tenant?.name || 'Your building'} on ONE two</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="color: #333; font-size: 14px; margin: 0 0 12px;">Your free trial of the <strong>${planLabel}</strong> plan will end ${trialEnds ? `on ${trialEnds.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'soon'}.</p>
          <p style="color: #333; font-size: 14px; margin: 0;">Add a payment method to keep your building data and continue using ONE two without interruption.</p>
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${addCardUrl}" style="display: inline-block; background: #3D3D3D; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">Add a card →</a>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>If you don't add a payment method, your account will be paused but your data will be preserved.</p>
          <p style="margin-top: 16px;">Powered by <strong>ONE two</strong> HOA GovOps</p>
        </div>
      </div>
    `;

    const textBody = `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}\n\nYour free trial of the ${planLabel} plan for ${tenant?.name || 'your building'} will end ${trialEnds ? `on ${trialEnds.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'soon'}.\n\nAdd a payment method to continue: ${addCardUrl}\n\nIf you don't add a payment method, your account will be paused but your data will be preserved.`;

    // Send email
    let sent = false;
    if (MJ_API_KEY && MJ_SECRET_KEY) {
      sent = await sendMailjet({
        to: owner.email,
        toName: owner.email.split("@")[0],
        subject: `Your ONE two trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        htmlBody,
        textBody,
      });
    }

    // Mark as sent (idempotent)
    await fetch(
      `${SB_URL}/rest/v1/subscriptions?id=eq.${sub.id}`,
      {
        method: "PATCH",
        headers: {
          ...svcHeaders,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ trial_reminder_sent_at: new Date().toISOString() }),
      }
    );

    return new Response(JSON.stringify({ success: true, sent, daysLeft }), {
      status: 200, headers: headers(),
    });
  } catch (err) {
    console.error("trial-reminder error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: headers(),
    });
  }
});
