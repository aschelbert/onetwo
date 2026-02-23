// supabase/functions/send-invite/index.ts
// Creates invitation(s) in DB and sends email(s) via Mailjet
// Supports single invite or bulk (array of invitees)
// Zero dependencies — raw fetch

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a unique invite code: {SUBDOMAIN_PREFIX}-{ROLE_PREFIX}-{4 RANDOM CHARS}
function generateCode(subdomain: string, role: string): string {
  const sub = subdomain.slice(0, 3).toUpperCase();
  const rolePrefix = role === "board_member" ? "BRD" : role === "property_manager" ? "MGR" : "RES";
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let rand = "";
  for (let i = 0; i < 4; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return `${sub}-${rolePrefix}-${rand}`;
}

// Send email via Mailjet
async function sendMailjet(params: {
  to: string;
  toName: string;
  replyTo: string;
  replyToName: string;
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
        ReplyTo: { Email: params.replyTo, Name: params.replyToName },
        To: [{ Email: params.to, Name: params.toName }],
        Subject: params.subject,
        TextPart: params.textBody,
        HTMLPart: params.htmlBody,
      }],
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify user
    const auth = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "Authorization": auth, "apikey": SB_ANON },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const user = await userRes.json();

    // Get user's tenant membership (must be board_member)
    const tuRes = await fetch(
      `${SB_URL}/rest/v1/tenant_users?user_id=eq.${user.id}&select=tenant_id,role`,
      { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/json" } }
    );
    const tuList = await tuRes.json();
    const tu = tuList?.[0];
    if (!tu || tu.role !== "board_member") {
      return new Response(JSON.stringify({ error: "Only board members can send invitations" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get tenant info
    const tRes = await fetch(
      `${SB_URL}/rest/v1/tenants?id=eq.${tu.tenant_id}&select=name,subdomain`,
      { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/vnd.pgrst.object+json" } }
    );
    const tenant = await tRes.json();
    if (!tenant?.name) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Normalize to array for bulk support
    const invitees: Array<{ email: string; role: string; unit?: string }> =
      Array.isArray(body.invitees) ? body.invitees : [{ email: body.email, role: body.role, unit: body.unit }];

    if (!invitees.length || !invitees[0].email) {
      return new Response(JSON.stringify({ error: "At least one email is required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const senderName = body.senderName || user.email?.split("@")[0] || "A board member";
    const results: Array<{ email: string; code: string; sent: boolean; error?: string }> = [];

    for (const inv of invitees) {
      const email = inv.email.trim().toLowerCase();
      const role = inv.role || "resident";
      const unit = inv.unit || null;

      // Generate unique code (retry if collision)
      let code = "";
      let attempts = 0;
      while (attempts < 5) {
        code = generateCode(tenant.subdomain, role);
        const checkRes = await fetch(
          `${SB_URL}/rest/v1/invitations?code=eq.${code}&select=id`,
          { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}` } }
        );
        const existing = await checkRes.json();
        if (!existing?.length) break;
        attempts++;
      }

      // Insert invitation
      const insertRes = await fetch(`${SB_URL}/rest/v1/invitations`, {
        method: "POST",
        headers: {
          "apikey": SB_SERVICE_KEY,
          "Authorization": `Bearer ${SB_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          tenant_id: tu.tenant_id,
          email,
          role,
          unit,
          code,
          invited_by: user.id,
          invited_by_name: senderName,
        }),
      });

      if (!insertRes.ok) {
        const err = await insertRes.text();
        results.push({ email, code, sent: false, error: `DB error: ${err}` });
        continue;
      }

      // Build invite URL
      const inviteUrl = `${SITE_URL}/login?invite=${code}`;

      // Build email
      const roleLabel = role === "board_member" ? "Board Member" : role === "property_manager" ? "Property Manager" : "Resident";
      const unitText = unit ? ` (Unit ${unit})` : "";

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
            <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">You're invited to ${tenant.name}</h1>
            <p style="color: #666; font-size: 14px; margin: 0;">${senderName} has invited you to join as ${roleLabel}${unitText}</p>
          </div>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Your invitation code</p>
            <p style="font-family: monospace; font-size: 28px; font-weight: bold; color: #1a1a1a; margin: 0; letter-spacing: 3px;">${code}</p>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${inviteUrl}" style="display: inline-block; background: #3D3D3D; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">Accept Invitation →</a>
          </div>
          <div style="text-align: center; color: #999; font-size: 12px;">
            <p>Or go to <strong>${SITE_URL}/login</strong> and enter your code manually.</p>
            <p style="margin-top: 16px;">This invitation expires in 30 days.<br>Powered by <strong>ONE two</strong> HOA GovOps</p>
          </div>
        </div>
      `;

      const textBody = `You're invited to ${tenant.name}!\n\n${senderName} has invited you to join as ${roleLabel}${unitText}.\n\nYour invitation code: ${code}\n\nAccept here: ${inviteUrl}\n\nOr go to ${SITE_URL}/login and enter the code.\n\nThis invitation expires in 30 days.`;

      // Send via Mailjet
      if (MJ_API_KEY && MJ_SECRET_KEY) {
        const sent = await sendMailjet({
          to: email,
          toName: email.split("@")[0],
          replyTo: user.email || "noreply@getonetwo.com",
          replyToName: senderName,
          subject: `You're invited to join ${tenant.name} on ONE two`,
          htmlBody,
          textBody,
        });
        results.push({ email, code, sent });
      } else {
        // No Mailjet configured — still create the invitation
        results.push({ email, code, sent: false, error: "Email not configured" });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      invitations: results,
      total: results.length,
      sent: results.filter(r => r.sent).length,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

