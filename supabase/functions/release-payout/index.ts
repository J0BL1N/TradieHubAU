// Deno Edge Function: release-payout
// Status: Disabled (Legacy / Unused in local MVP simulation)
// Description: Real provider payout settlement is deferred to v0.2.x Real Payments Foundation.
// The frontend calls the database RPC function `approve_job_completion` directly to simulate
// payment release, meaning this service-role-privileged Edge Function is not required.
// Safely disabled to prevent unauthenticated/unauthorized calls from mutating job/payment status.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      error: "Real payout release is disabled in the local MVP simulation. Real Stripe/provider payment integration is deferred to v0.2.x Real Payments Foundation. Please use the database RPC path (approve_job_completion) directly to complete jobs and simulate payment release."
    }),
    {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    }
  )
})
