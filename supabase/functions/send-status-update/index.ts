// supabase/functions/send-status-update/index.ts
// Sends an email to the issue reporter when the status changes
// Called by the issues store when updateIssueStatus is invoked with backend enabled

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

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "#d97706",
  RESOLVED: "#059669",
  CLOSED: "#6b7280",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify caller
    const authHeader = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "Authorization": authHeader, "apikey": SB_ANON },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const user = await userRes.json();

    // Get tenant
    const tuRes = await fetch(
      `${SB_URL}/rest/v1/tenant_users?user_id=eq.${user.id}&select=tenant_id,role`,
      { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/json" } }
    );
    const tuList = await tuRes.json();
    const tu = tuList?.[0];
    if (!tu) {
      return new Response(JSON.stringify({ error: "No tenant membership" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const tRes = await fetch(
      `${SB_URL}/rest/v1/tenants?id=eq.${tu.tenant_id}&select=name`,
      { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/vnd.pgrst.object+json" } }
    );
    const tenant = await tRes.json();
    const buildingName = tenant?.name || "Your HOA";

    const body = await req.json();
    const { recipientEmail, recipientName, issueTitle, newStatus, boardComment } = body;

    if (!recipientEmail || !issueTitle || !newStatus) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!MJ_API_KEY || !MJ_SECRET_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Email not configured" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const statusLabel = STATUS_LABELS[newStatus] || newStatus;
    const statusColor = STATUS_COLORS[newStatus] || "#4b5563";
    const commentHtml = boardComment ? `<div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin-top: 16px;"><p style="color: #15803d; font-size: 12px; font-weight: 600; margin: 0 0 4px;">Board Comment:</p><p style="color: #166534; font-size: 14px; margin: 0;">${boardComment.replace(/\n/g, "<br>")}</p></div>` : "";

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
          <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">Issue Status Update</h1>
          <p style="color: #666; font-size: 14px; margin: 0;">${buildingName}</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="color: #333; font-size: 16px; font-weight: 600; margin: 0 0 12px;">${issueTitle}</p>
          <div style="display: inline-block; background: ${statusColor}; color: white; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${statusLabel}</div>
          ${commentHtml}
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${SITE_URL}" style="display: inline-block; background: #3D3D3D; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">View in Community Room →</a>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>You received this because you submitted this issue.<br>Powered by <strong>ONE two</strong> HOA GovOps</p>
        </div>
      </div>
    `;

    const textBody = `Issue Status Update — ${buildingName}\n\n${issueTitle}\nNew Status: ${statusLabel}\n${boardComment ? `\nBoard Comment: ${boardComment}` : ''}\n\nView details: ${SITE_URL}`;

    const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: "noreply@getonetwo.com", Name: buildingName },
          To: [{ Email: recipientEmail, Name: recipientName || recipientEmail.split("@")[0] }],
          Subject: `${buildingName} — Your issue "${issueTitle}" is now ${statusLabel}`,
          TextPart: textBody,
          HTMLPart: htmlBody,
        }],
      }),
    });

    return new Response(JSON.stringify({ success: res.ok, sent: res.ok ? 1 : 0 }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-status-update error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
