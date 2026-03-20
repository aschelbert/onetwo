// supabase/functions/notify-signup/index.ts
// Sends internal notification email to alyssa@getonetwo.com when someone
// signs up for the demo or joins the waitlist.
// Fire-and-forget from client — failures logged but don't block UX.

const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = await req.json();
    const type: "demo" | "waitlist" = body.type;

    if (!type || !["demo", "waitlist"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid type (demo | waitlist)" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!MJ_API_KEY || !MJ_SECRET_KEY) {
      console.warn("Mailjet not configured — skipping notification email");
      return new Response(
        JSON.stringify({ sent: false, error: "Email not configured" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let subject: string;
    let detailsHtml: string;
    let detailsText: string;

    if (type === "demo") {
      const { name, email, condo_name, unit_count, member_type, subscription_interest } = body;
      if (!name || !email) {
        return new Response(
          JSON.stringify({ error: "Missing required fields for demo notification" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      subject = `New Demo Signup: ${name}`;

      const tierLabel: Record<string, string> = {
        compliance_pro: "Compliance Pro",
        community_plus: "Community+",
        management_suite: "Management Suite",
      };
      const memberLabel: Record<string, string> = {
        resident: "Resident",
        board_member: "Board Member",
        property_manager: "Property Manager",
        other: "Other",
      };

      detailsHtml = `
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Name</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Email</td><td style="padding:8px 12px;font-size:13px;font-weight:600;"><a href="mailto:${email}" style="color:#d62839;">${email}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Community</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${condo_name || "—"}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Units</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${unit_count || "—"}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Role</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${memberLabel[member_type] || member_type || "—"}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Tier Interest</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${tierLabel[subscription_interest] || subscription_interest || "—"}</td></tr>`;

      detailsText = `Name: ${name}\nEmail: ${email}\nCommunity: ${condo_name || "—"}\nUnits: ${unit_count || "—"}\nRole: ${memberLabel[member_type] || member_type || "—"}\nTier Interest: ${tierLabel[subscription_interest] || subscription_interest || "—"}`;
    } else {
      // waitlist
      const { name, email, community_name, unit_count, board_role, spot_number } = body;
      if (!name || !email) {
        return new Response(
          JSON.stringify({ error: "Missing required fields for waitlist notification" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const roleLabel: Record<string, string> = {
        president: "President",
        treasurer: "Treasurer",
        secretary: "Secretary",
        member: "Member",
      };

      subject = `New Waitlist Signup (#${spot_number}): ${name}`;

      detailsHtml = `
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Name</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Email</td><td style="padding:8px 12px;font-size:13px;font-weight:600;"><a href="mailto:${email}" style="color:#d62839;">${email}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Community</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${community_name || "—"}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Units</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${unit_count || "—"}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Board Role</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${roleLabel[board_role] || board_role || "—"}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Spot #</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#d62839;">#${spot_number}</td></tr>`;

      detailsText = `Name: ${name}\nEmail: ${email}\nCommunity: ${community_name || "—"}\nUnits: ${unit_count || "—"}\nBoard Role: ${roleLabel[board_role] || board_role || "—"}\nSpot: #${spot_number}`;
    }

    const typeLabel = type === "demo" ? "Demo Signup" : "Waitlist Signup";

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-family: Georgia, serif; font-size: 24px; font-weight: 900; color: #0f1a2e;">
            ONE <span style="color: #d62839;">two</span>
          </div>
        </div>

        <div style="background: ${type === "demo" ? "#e0f2fe" : "#fde8ea"}; border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 20px;">
          <p style="color: ${type === "demo" ? "#0369a1" : "#d62839"}; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0;">
            New ${typeLabel}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 12px; overflow: hidden;">
          ${detailsHtml}
        </table>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px;">
          <p>This is an automated notification from getonetwo.com</p>
        </div>
      </div>`;

    const textBody = `New ${typeLabel}\n${"=".repeat(30)}\n${detailsText}`;

    const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: "noreply@getonetwo.com", Name: "ONE two HOA" },
            To: [{ Email: "alyssa@getonetwo.com", Name: "Alyssa" }],
            Subject: subject,
            TextPart: textBody,
            HTMLPart: htmlBody,
          },
        ],
      }),
    });

    const resBody = await res.text();
    if (!res.ok) {
      console.error("Mailjet error:", res.status, resBody);
      return new Response(
        JSON.stringify({ sent: false, error: "Email delivery failed" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    console.log(`Signup notification (${type}) sent to alyssa@getonetwo.com`);
    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-signup error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
