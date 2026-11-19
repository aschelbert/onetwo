// supabase/functions/notify-signup/index.ts
// Sends an internal notification email to the CONTACT_INBOX secret when someone
// signs up for the demo or a new building is provisioned.
// Fire-and-forget from client — failures logged but don't block UX.
import { emailConfigured, sendEmail } from "../_shared/email.ts";

const CONTACT_INBOX = Deno.env.get("CONTACT_INBOX") || "";

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
    const type: "demo" | "building" = body.type;

    if (!type || !["demo", "building"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid type (demo | building)" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!CONTACT_INBOX) {
      console.warn("CONTACT_INBOX not configured — skipping notification email");
      return new Response(
        JSON.stringify({ sent: false, error: "Recipient not configured" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!emailConfigured()) {
      console.warn("Email not configured — skipping notification email");
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
      // building — called by chargebee-checkout / provision_tenant
      const { name, email, plan } = body;
      if (!name || !email) {
        return new Response(
          JSON.stringify({ error: "Missing required fields for building notification" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      subject = `New building: ${name}`;

      detailsHtml = `
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Building</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Email</td><td style="padding:8px 12px;font-size:13px;font-weight:600;"><a href="mailto:${email}" style="color:#d62839;">${email}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#64748b;font-size:13px;">Plan</td><td style="padding:8px 12px;font-size:13px;font-weight:600;">${plan || "—"}</td></tr>`;

      detailsText = `Building: ${name}\nEmail: ${email}\nPlan: ${plan || "—"}`;
    }

    const typeLabel = type === "demo" ? "Demo Signup" : "New Building";

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-family: Georgia, serif; font-size: 24px; font-weight: 900; color: #0f1a2e;">
            ONE <span style="color: #d62839;">two</span>
          </div>
        </div>

        <div style="background: ${type === "demo" ? "#e0f2fe" : "#d1fae5"}; border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 20px;">
          <p style="color: ${type === "demo" ? "#0369a1" : "#059669"}; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0;">
            ${typeLabel}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 12px; overflow: hidden;">
          ${detailsHtml}
        </table>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px;">
          <p>This is an automated notification from getonetwo.com</p>
        </div>
      </div>`;

    const textBody = `${typeLabel}\n${"=".repeat(30)}\n${detailsText}`;

    const res = await sendEmail({
      to: { email: CONTACT_INBOX },
      subject: subject,
      text: textBody,
      html: htmlBody,
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ sent: false, error: "Email delivery failed" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    console.log(`Signup notification (${type}) sent`);
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
