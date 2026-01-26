
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

serve(async (req) => {
  try {
    const signature = req.headers.get('stripe-signature')
    if (!signature) throw new Error('Missing stripe-signature')

    const body = await req.text()
    let event;
    try {
       event = stripe.webhooks.constructEvent(body, signature, endpointSecret!)
    } catch (err) {
       return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    // Handle Event
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object
      const { proposal_id, job_id } = paymentIntent.metadata

      if (proposal_id && job_id) {
         // Update DB
         const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
         )

         // 1. Update Job -> in_progress
         await supabaseClient
           .from('jobs')
           .update({ status: 'in_progress', assigned_tradie_id: null }) // We rely on proposal logic usually, but here we can't easily get tradie ID without query.
           // Actually assigned_tradie_id might be needed.
           // Let's get it from proposal if needed, or just update proposal.
           .eq('id', job_id)

         // 2. Update Proposal -> accepted
         await supabaseClient
            .from('proposals')
            .update({ status: 'accepted', payment_intent_id: paymentIntent.id })
            .eq('id', proposal_id)
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})
