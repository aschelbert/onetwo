// supabase/functions/unsubscribe/index.ts
// The address in the List-Unsubscribe header of product emails.
//
//   POST ?t=<token>   one-click unsubscribe (RFC 8058): the mail app sends
//                     this itself when the recipient presses its Unsubscribe
//                     button. Records the opt-out and answers 200.
//   GET  ?t=<token>   someone followed the address by hand: send them to the
//                     unsubscribe page, which asks before changing anything
//                     (link scanners open GET links, so GET must not act).
//
// No sign-in: the token in the link is the proof. Deploy with JWT
// verification off.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://app.getonetwo.com").replace(/\/+$/, "");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") || "";

  if (req.method === "GET") {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SITE_URL}/unsubscribe${UUID.test(token) ? `?t=${token}` : ""}` },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }
  if (!UUID.test(token)) {
    return new Response("Unknown unsubscribe link", { status: 400 });
  }

  const res = await fetch(`${SB_URL}/rest/v1/rpc/set_marketing_by_token`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: token, p_opt_in: false }),
  });
  if (!res.ok) {
    console.error("unsubscribe: could not record opt-out:", res.status, (await res.text()).slice(0, 200));
    return new Response("Could not unsubscribe. Please try again.", { status: 500 });
  }
  const result = await res.json();
  if (!result) {
    return new Response("Unknown unsubscribe link", { status: 404 });
  }
  return new Response("You are unsubscribed from ONE two product emails.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
