// Deno Edge Function: payment-sheet
// Status: Disabled (legacy real-payment endpoint; not used by the simulated MVP)
//
// The current MVP funds protected payments through validated database RPCs and does
// not create provider payment intents. Real provider intent creation, authorization,
// linkage validation, settlement, and reconciliation belong in v0.2.x Real Payments
// Foundation.
//
// This handler deliberately does not parse the request body, read Stripe/Supabase
// secrets, query Supabase, or contact a payment provider.

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
      error: "Real provider payment intents are disabled.",
      code: "PAYMENT_SHEET_DISABLED",
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
