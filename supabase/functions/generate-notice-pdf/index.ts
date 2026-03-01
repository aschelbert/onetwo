// supabase/functions/generate-notice-pdf/index.ts
// Stub: Returns a placeholder PDF generation response
// In production, this would use Puppeteer or a PDF library to render the notice

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
    const { templateId, mergeVariables, recipientName } = body;

    if (!templateId) {
      return new Response(
        JSON.stringify({ error: "Missing templateId" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Simulated response — in production this generates an actual PDF
    return new Response(
      JSON.stringify({
        success: true,
        pdfUrl: `https://storage.example.com/notices/notice_${Date.now()}.pdf`,
        pageCount: 1,
        generatedAt: new Date().toISOString(),
        message: "PDF generated successfully (simulated)",
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
