// supabase/functions/send-mail/index.ts
// Stub: Accepts mail parameters and returns a simulated LetterStream response
// In production, this would call the LetterStream API with real credentials

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
    const {
      recipientName,
      recipientAddress,
      senderName,
      senderAddress,
      deliveryMethod,
      templateId,
      mergeVariables,
      pageCount,
      includeReturnEnvelope,
    } = body;

    // Validate required fields
    if (!recipientName || !recipientAddress || !deliveryMethod || !templateId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Simulated response — in production this calls LetterStream API
    const jobId = "ls_sim_" + Date.now();
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5);

    return new Response(
      JSON.stringify({
        jobId,
        status: "submitted",
        estimatedDeliveryDate: estimatedDelivery.toISOString().split("T")[0],
        deliveryMethod,
        pageCount: pageCount || 1,
        message: "Mail job submitted successfully (simulated)",
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
