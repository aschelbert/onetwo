// supabase/functions/_shared/marketingEmail.ts
// What every product (marketing) email must go through.
//
// Product emails are news, tips and offers: anything a person did not need
// in order to use their account or building. They may only go to addresses
// whose newest consent answer is yes, and each one must carry a working
// unsubscribe link. Account and building emails (invoices, notices, password
// resets, invitations) are not product emails and do not use this.
//
//   if (!(await marketingAllowed(to))) return;          // never send without consent
//   const unsub = await unsubscribeFor(to);
//   Mailjet message: { ..., Headers: unsub.headers,
//                      TextPart: body + unsub.footerText,
//                      HTMLPart: html + unsub.footerHtml }

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://app.getonetwo.com").replace(/\/+$/, "");

// deno-lint-ignore no-explicit-any
async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

/** Whether this address has opted in to product emails. Any failure counts as no. */
export async function marketingAllowed(email: string): Promise<boolean> {
  try {
    return (await rpc("marketing_email_allowed", { p_email: email })) === true;
  } catch (err) {
    console.error("marketing: consent check failed, not sending:", err);
    return false;
  }
}

export interface UnsubscribeParts {
  /** The page where the recipient confirms. Put this in the email body. */
  url: string;
  /** Lets mail apps show their own Unsubscribe button and act on it in one click (RFC 8058). */
  headers: Record<string, string>;
  footerText: string;
  footerHtml: string;
}

/** The unsubscribe link and headers for one recipient. Throws if a link cannot be made: do not send without one. */
export async function unsubscribeFor(email: string): Promise<UnsubscribeParts> {
  const token = await rpc("unsubscribe_token_for", { p_email: email });
  if (typeof token !== "string" || !token) throw new Error("marketing: no unsubscribe token");
  const url = `${SITE_URL}/unsubscribe?t=${token}`;
  const oneClick = `${SB_URL}/functions/v1/unsubscribe?t=${token}`;
  return {
    url,
    headers: {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    footerText:
      `\n\nYou are getting this because you asked for ONE two product news. Unsubscribe: ${url}\n`,
    footerHtml:
      `<p style="margin-top:24px;font-size:12px;color:#5F6C7B">You are getting this because you asked for ONE two product news. ` +
      `<a href="${url}" style="color:#5F6C7B">Unsubscribe</a></p>`,
  };
}
