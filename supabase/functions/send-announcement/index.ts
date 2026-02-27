// supabase/functions/send-announcement/index.ts
// Sends an announcement email to all residents/owners in the building via Mailjet
// Called by board members when posting an announcement with "also send via email" checked

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

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  maintenance: "Maintenance",
  financial: "Financial",
  safety: "Safety",
  rules: "Rules & Policies",
  meeting: "Meeting",
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "#4b5563",
  maintenance: "#d97706",
  financial: "#059669",
  safety: "#dc2626",
  rules: "#7c3aed",
  meeting: "#2563eb",
};

function buildHtml(params: {
  title: string;
  body: string;
  category: string;
  postedBy: string;
  buildingName: string;
}): string {
  const catLabel = CATEGORY_LABELS[params.category] || "General";
  const catColor = CATEGORY_COLORS[params.category] || "#4b5563";
  const bodyHtml = params.body.replace(/\n/g, "<br>");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
        <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">${params.title}</h1>
        <p style="color: #666; font-size: 14px; margin: 0;">New announcement from ${params.buildingName}</p>
      </div>
      <div style="margin-bottom: 16px; text-align: center;">
        <span style="display: inline-block; background: ${catColor}; color: white; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${catLabel}</span>
      </div>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0;">${bodyHtml}</p>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${SITE_URL}" style="display: inline-block; background: #3D3D3D; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">View in Community Room →</a>
      </div>
      <div style="text-align: center; color: #999; font-size: 12px;">
        <p>Posted by <strong>${params.postedBy}</strong> · ${params.buildingName}</p>
        <p style="margin-top: 16px;">Powered by <strong>ONE two</strong> HOA GovOps</p>
      </div>
    </div>
  `;
}

function buildText(params: {
  title: string;
  body: string;
  category: string;
  postedBy: string;
  buildingName: string;
}): string {
  const catLabel = CATEGORY_LABELS[params.category] || "General";
  return `${params.title}\n[${catLabel}] — ${params.buildingName}\n\n${params.body}\n\nPosted by ${params.postedBy}\n\nView in the Community Room: ${SITE_URL}\n\nPowered by ONE two HOA GovOps`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify caller is authenticated
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

    // Verify caller is a board member and get tenant
    const tuRes = await fetch(
      `${SB_URL}/rest/v1/tenant_users?user_id=eq.${user.id}&select=tenant_id,role`,
      { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/json" } }
    );
    const tuList = await tuRes.json();
    const tu = tuList?.[0];
    if (!tu || (tu.role !== "board_member" && tu.role !== "property_manager")) {
      return new Response(JSON.stringify({ error: "Only board members and property managers can send announcement emails" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get tenant/building info
    const tRes = await fetch(
      `${SB_URL}/rest/v1/tenants?id=eq.${tu.tenant_id}&select=name,subdomain`,
      { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/vnd.pgrst.object+json" } }
    );
    const tenant = await tRes.json();
    const buildingName = tenant?.name || "Your HOA";

    const body = await req.json();
    const { title, announcementBody, category, postedBy, recipients } = body;

    if (!title || !announcementBody) {
      return new Response(JSON.stringify({ error: "Title and body are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build email content
    const htmlBody = buildHtml({ title, body: announcementBody, category: category || "general", postedBy: postedBy || "Board", buildingName });
    const textBody = buildText({ title, body: announcementBody, category: category || "general", postedBy: postedBy || "Board", buildingName });
    const subject = `${buildingName} — ${title}`;

    // Determine recipients
    let emailRecipients: Array<{ email: string; name: string }> = [];

    if (recipients && Array.isArray(recipients) && recipients.length > 0) {
      // Use provided recipient list (from frontend building members)
      emailRecipients = recipients;
    } else {
      // Fall back to querying tenant_users for all members
      const membersRes = await fetch(
        `${SB_URL}/rest/v1/tenant_users?tenant_id=eq.${tu.tenant_id}&select=user_id`,
        { headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Accept": "application/json" } }
      );
      const members = await membersRes.json();
      if (Array.isArray(members)) {
        for (const m of members) {
          const uRes = await fetch(`${SB_URL}/auth/v1/admin/users/${m.user_id}`, {
            headers: { "apikey": SB_SERVICE_KEY, "Authorization": `Bearer ${SB_SERVICE_KEY}` },
          });
          if (uRes.ok) {
            const uData = await uRes.json();
            if (uData?.email) {
              emailRecipients.push({ email: uData.email, name: uData.user_metadata?.name || uData.email.split("@")[0] });
            }
          }
        }
      }
    }

    if (emailRecipients.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No recipients found" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check Mailjet credentials
    if (!MJ_API_KEY || !MJ_SECRET_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Email not configured — Mailjet credentials missing" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Send emails (Mailjet supports up to 50 recipients per Messages array entry)
    // We'll send individually to personalize and avoid exposing recipient lists
    const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
    let sentCount = 0;
    const errors: string[] = [];

    for (const recipient of emailRecipients) {
      try {
        const res = await fetch("https://api.mailjet.com/v3.1/send", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Messages: [{
              From: { Email: "noreply@getonetwo.com", Name: buildingName },
              To: [{ Email: recipient.email, Name: recipient.name }],
              Subject: subject,
              TextPart: textBody,
              HTMLPart: htmlBody,
            }],
          }),
        });

        if (res.ok) {
          sentCount++;
          console.log("Announcement email sent to:", recipient.email);
        } else {
          const errText = await res.text();
          console.error("Mailjet error for", recipient.email, ":", res.status, errText);
          errors.push(`${recipient.email}: ${res.status}`);
        }
      } catch (e) {
        console.error("Send error for", recipient.email, ":", e);
        errors.push(`${recipient.email}: ${String(e)}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: sentCount,
      total: emailRecipients.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-announcement error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
