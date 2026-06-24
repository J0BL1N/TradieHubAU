// Deno Edge Function: send-email
// Status: Disabled (legacy notification relay; not required by the current MVP)
//
// The former implementation accepted caller-controlled recipient, subject, and HTML
// and could relay those values to an email provider. Email delivery must remain
// disabled until v0.7.x provides authenticated event/template workflows, ownership
// validation, rate limiting, preferences, and delivery auditing.
//
// This handler deliberately does not parse the request body, read provider secrets,
// or contact an email provider.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return new Response(
    JSON.stringify({
      error: "Email delivery is disabled.",
      code: "EMAIL_DELIVERY_DISABLED",
    }),
    {
      status: 403,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    },
  );
});
