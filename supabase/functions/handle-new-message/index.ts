// Deno Edge Function: handle-new-message
// Status: Disabled (legacy notification webhook; not required by the current MVP)
//
// The former implementation trusted a caller-supplied message record, performed
// service-role reads, and invoked the legacy email relay. Notification automation
// must remain disabled until v0.7.x provides authenticated webhook origin checks,
// minimal event identifiers, server-side record re-reads, authorization, rate
// limiting, preferences, and delivery auditing.
//
// This handler deliberately does not parse the request body, read service-role
// credentials, query Supabase, or invoke another Edge Function.

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
      error: "Message notification webhook is disabled.",
      code: "MESSAGE_WEBHOOK_DISABLED",
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
