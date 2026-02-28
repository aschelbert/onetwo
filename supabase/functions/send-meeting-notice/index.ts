// supabase/functions/send-meeting-notice/index.ts
// Sends a meeting notice email to all building members
// Called from BoardRoomPage when scheduling or notifying about meetings

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
    if (!tu || (tu.role !== "board_member" && tu.role !== "property_manager")) {
      return new Response(JSON.stringify({ error: "Only board members can send meeting notices" }), {
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
    const { title, date, time, location, virtualLink, agenda, recipients } = body;

    if (!title || !date) {
      return new Response(JSON.stringify({ error: "Title and date are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!MJ_API_KEY || !MJ_SECRET_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Email not configured" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const formattedDate = new Date(date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const formattedTime = time || "TBD";
    const locationText = location || "TBD";
    const agendaItems = Array.isArray(agenda) && agenda.length > 0
      ? agenda.map((a: string, i: number) => `<li style="color: #333; font-size: 14px; padding: 4px 0;">${i + 1}. ${a}</li>`).join("")
      : '<li style="color: #666; font-size: 14px;">Agenda to be distributed</li>';
    const virtualBlock = virtualLink
      ? `<div style="margin-top: 16px; text-align: center;"><a href="${virtualLink}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Join Virtual Meeting →</a><p style="color: #666; font-size: 11px; margin-top: 8px;">${virtualLink}</p></div>`
      : "";

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
          <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">Meeting Notice</h1>
          <p style="color: #666; font-size: 14px; margin: 0;">${buildingName}</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #1a1a1a; font-size: 18px; margin: 0 0 16px;">${title}</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="color: #666; font-size: 13px; padding: 6px 0; width: 80px;">📅 Date</td><td style="color: #333; font-size: 14px; font-weight: 600;">${formattedDate}</td></tr>
            <tr><td style="color: #666; font-size: 13px; padding: 6px 0;">🕐 Time</td><td style="color: #333; font-size: 14px; font-weight: 600;">${formattedTime}</td></tr>
            <tr><td style="color: #666; font-size: 13px; padding: 6px 0;">📍 Location</td><td style="color: #333; font-size: 14px; font-weight: 600;">${locationText}</td></tr>
          </table>
          <div style="border-top: 1px solid #e5e7eb; margin-top: 16px; padding-top: 16px;">
            <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Agenda</p>
            <ol style="margin: 0; padding-left: 0; list-style: none;">${agendaItems}</ol>
          </div>
          ${virtualBlock}
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${SITE_URL}" style="display: inline-block; background: #3D3D3D; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">View in Board Room →</a>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>${buildingName}<br>Powered by <strong>ONE two</strong> HOA GovOps</p>
        </div>
      </div>
    `;

    const agendaText = Array.isArray(agenda) ? agenda.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n") : "Agenda to be distributed";
    const textBody = `Meeting Notice — ${buildingName}\n\n${title}\n\nDate: ${formattedDate}\nTime: ${formattedTime}\nLocation: ${locationText}\n${virtualLink ? `Virtual: ${virtualLink}\n` : ""}\nAgenda:\n${agendaText}\n\nView details: ${SITE_URL}`;

    // Determine recipients
    let emailRecipients: Array<{ email: string; name: string }> = [];
    if (recipients && Array.isArray(recipients) && recipients.length > 0) {
      emailRecipients = recipients;
    } else {
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

    const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
    let sentCount = 0;

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
              Subject: `${buildingName} — Meeting Notice: ${title} (${formattedDate})`,
              TextPart: textBody,
              HTMLPart: htmlBody,
            }],
          }),
        });
        if (res.ok) sentCount++;
      } catch (e) {
        console.error("Send error for", recipient.email, ":", e);
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount, total: emailRecipients.length }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-meeting-notice error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
