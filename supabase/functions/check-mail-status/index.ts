// supabase/functions/check-mail-status/index.ts
// Stub: Returns simulated delivery status progression
// In production, this would query the LetterStream API for real tracking data

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
    const { jobId } = body;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Simulated status progression based on time since job creation
    const now = new Date();
    const statusEvents = [
      { status: "submitted", timestamp: now.toISOString(), detail: "Job submitted to LetterStream" },
      { status: "processing", timestamp: now.toISOString(), detail: "Document being prepared for print" },
      { status: "mailed", timestamp: now.toISOString(), detail: "Mail piece entered USPS mail stream" },
    ];

    return new Response(
      JSON.stringify({
        jobId,
        currentStatus: "mailed",
        statusHistory: statusEvents,
        trackingNumber: "9400111899223456789012",
        estimatedDeliveryDate: new Date(now.getTime() + 3 * 86400000).toISOString().split("T")[0],
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
