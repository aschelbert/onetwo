// supabase/functions/reset-password/index.ts
// Uses Supabase Admin API to generate reset link, sends via Mailjet
// Zero dependencies

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
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
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Use Supabase Admin API to generate a password recovery link
    const genRes = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "apikey": SB_SERVICE_KEY,
        "Authorization": `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "recovery",
        email: email,
        options: {
          redirect_to: `${SITE_URL}/reset-password`,
        },
      }),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      console.error("Generate link error:", genRes.status, err);
      // Don't reveal if user exists or not
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const linkData = await genRes.json();
    const resetLink = linkData.action_link || "";

    if (!resetLink) {
      console.error("No action_link in response:", JSON.stringify(linkData));
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rewrite the link to go through our app instead of Supabase's default
    // The action_link points to Supabase, which redirects to our redirect_to URL
    // We'll use it as-is since Supabase handles the token verification

    // Send via Mailjet
    const auth = btoa(`${MJ_API_KEY}:${MJ_SECRET_KEY}`);
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #3D3D3D; border-radius: 8px; width: 48px; height: 48px; line-height: 48px; color: white; font-weight: bold; font-size: 24px;">+</div>
          <h1 style="font-size: 20px; color: #1a1a1a; margin: 16px 0 4px;">Reset Your Password</h1>
          <p style="color: #666; font-size: 14px; margin: 0;">We received a request to reset your password.</p>
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${resetLink}" style="display: inline-block; background: #3D3D3D; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">Reset Password &rarr;</a>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p>This link expires in 1 hour.</p>
          <p style="margin-top: 16px;">Powered by <strong>ONE two</strong> HOA GovOps</p>
        </div>
      </div>
    `;

    const textBody = `Reset your password\n\nClick this link to reset your password:\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\nThis link expires in 1 hour.`;

    const mjRes = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: "noreply@getonetwo.com", Name: "ONE two HOA" },
          To: [{ Email: email, Name: email.split("@")[0] }],
          Subject: "Reset your ONE two password",
          TextPart: textBody,
          HTMLPart: htmlBody,
        }],
      }),
    });

    if (!mjRes.ok) {
      const mjErr = await mjRes.text();
      console.error("Mailjet error:", mjRes.status, mjErr);
    } else {
      console.log("Reset email sent to:", email);
    }

    // Always return success (don't reveal if user exists)
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("reset-password error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

