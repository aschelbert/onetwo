// supabase/functions/waitlist-confirm/index.ts
// Sends waitlist confirmation email via Mailjet
// Called fire-and-forget from client — failures logged but don't block UX
// Zero dependencies — raw fetch

const MJ_API_KEY = Deno.env.get("MAILJET_API_KEY") || "";
const MJ_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { name, email, community_name, spot_number } = await req.json();

    if (!name || !email || !spot_number) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!MJ_API_KEY || !MJ_SECRET_KEY) {
      console.warn("Mailjet not configured — skipping confirmation email");
      return new Response(JSON.stringify({ sent: false, error: "Email not configured" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const firstName = name.split(" ")[0];

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="font-family: Georgia, serif; font-size: 24px; font-weight: 900; color: #0f1a2e;">
            ONE <span style="color: #d62839;">two</span>
          </div>
          <h1 style="font-size: 22px; color: #0f1a2e; margin: 20px 0 8px; font-family: Georgia, serif;">
            You're #${spot_number} on the waitlist!
          </h1>
          <p style="color: #64748b; font-size: 14px; margin: 0;">
            ${firstName}, your spot for <strong>${community_name}</strong> is secured.
          </p>
        </div>

        <div style="background: #fde8ea; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="color: #d62839; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Your spot</p>
          <p style="font-family: Georgia, serif; font-size: 48px; font-weight: 900; color: #d62839; margin: 0;">#${spot_number}</p>
          <p style="color: #64748b; font-size: 13px; margin: 8px 0 0;">of 20 early-adopter communities</p>
        </div>

        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="font-size: 15px; color: #0f1a2e; margin: 0 0 12px;">Early-adopter benefits:</h2>
          <ul style="color: #64748b; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Lock in founding pricing — guaranteed for life</li>
            <li>Priority onboarding with hands-on setup</li>
            <li>Direct line to the founding team</li>
            <li>Shape the product roadmap with your feedback</li>
          </ul>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${SITE_URL}" style="display: inline-block; background: #d62839; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Visit ONE two →
          </a>
        </div>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.6;">
          <p>We'll reach out soon with next steps as we prepare to launch in Washington, DC.</p>
          <p style="margin-top: 12px;">Powered by <strong>ONE two</strong> — HOA handled.</p>
        </div>
      </div>
    `;

    const textBody = `You're #${spot_number} on the ONE two waitlist!\n\n${firstName}, your spot for ${community_name} is secured.\n\nEarly-adopter benefits:\n- Lock in founding pricing — guaranteed for life\n- Priority onboarding with hands-on setup\n- Direct line to the founding team\n- Shape the product roadmap with your feedback\n\nWe'll reach out soon with next steps as we prepare to launch in Washington, DC.\n\nVisit us: ${SITE_URL}`;

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
          To: [{ Email: email, Name: name }],
          Subject: `You're #${spot_number} on the ONE two waitlist!`,
          TextPart: textBody,
          HTMLPart: htmlBody,
        }],
      }),
    });

    const resBody = await res.text();
    if (!res.ok) {
      console.error("Mailjet error:", res.status, resBody);
      return new Response(JSON.stringify({ sent: false, error: "Email delivery failed" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    console.log("Waitlist confirmation sent to:", email, "spot:", spot_number);
    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("waitlist-confirm error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
