// connect-letterstream: RETIRED in favour of connect-mail-provider, which
// handles DocuPost and LetterStream alike. Answers 410 Gone until the slot is
// deleted with `supabase functions delete connect-letterstream`.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, baggage, sentry-trace",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(
    JSON.stringify({ error: "Retired. Use connect-mail-provider with a provider of docupost or letterstream.", retired: true }),
    { status: 410, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
