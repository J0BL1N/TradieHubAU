// Deno Edge Function: stripe-webhook
// Status: Disabled (legacy real-payment webhook; not used by the simulated MVP)
//
// The former handler referenced legacy proposal/job fields and could perform
// service-role lifecycle updates. Real signed provider webhooks, current-schema
// linkage validation, idempotency, settlement, chargebacks, and reconciliation
// belong in v0.2.x Real Payments Foundation.
//
// This handler deliberately does not parse webhook payloads, read Stripe/Supabase
// secrets, verify/process provider events, query Supabase, or mutate jobs/payments.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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
      error: "Real provider payment webhooks are disabled.",
      code: "STRIPE_WEBHOOK_DISABLED",
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
