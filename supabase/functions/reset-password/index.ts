// supabase/functions/reset-password/index.ts
// Uses Supabase Admin API to generate reset link, sends it by email
// Zero dependencies
import { emailConfigured, sendEmail, suppressionReason } from "../_shared/email.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.getonetwo.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
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

    // The app's own email isn't set up: tell the page, which asks Supabase Auth to send its
    // built-in reset email instead. Answered before any lookup, so it says nothing about whether the user exists.
    if (!emailConfigured()) {
      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
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
          redirect_to: SITE_URL + "/reset-password",
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
    
    // The action_link goes through Supabase's verify endpoint
    // which redirects to redirect_to with the tokens in the hash
    // We'll send this link directly — Supabase will handle the redirect
    const actionLink = linkData.action_link || "";

    if (!actionLink) {
      console.error("No action_link in response:", JSON.stringify(linkData));
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Modify the action_link to include our redirect
    // The action_link format: https://project.supabase.co/auth/v1/verify?token=...&type=recovery&redirect_to=...
    let resetLink = actionLink;
    const redirectTo = encodeURIComponent(SITE_URL + "/reset-password");
    if (resetLink.includes("redirect_to=")) {
      resetLink = resetLink.replace(/redirect_to=[^&]*/, `redirect_to=${redirectTo}`);
    } else {
      resetLink += `&redirect_to=${redirectTo}`;
    }

    // Send the email
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

    const emailRes = await sendEmail({
      to: { email: email, name: email.split("@")[0] },
      subject: "Reset your ONE two password",
      text: textBody,
      html: htmlBody,
    });

    if (emailRes.ok) console.log("Reset email sent to:", email);

    // They pressed Unsubscribe at some point, so our provider drops everything
    // we send them, this included. A reset they asked for should still arrive:
    // Supabase Auth sends its own, which does not go through that provider.
    // Not after a spam report or a dead mailbox.
    if (emailRes.optedOut && ["unsubscribed", "blocked"].includes((await suppressionReason(email)) || "")) {
      const recover = await fetch(`${SB_URL}/auth/v1/recover?redirect_to=${redirectTo}`, {
        method: "POST",
        headers: { "apikey": SB_ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!recover.ok) console.error("Fallback reset email failed:", recover.status, (await recover.text()).slice(0, 200));
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

