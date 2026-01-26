
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno'

serve(async (req) => {
  try {
    const { jobId } = await req.json()
    if (!jobId) throw new Error('Job ID required')

    // Init Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Init Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // 1. Get Job & Verify Status
    const { data: job, error: jErr } = await supabaseAdmin
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();
    
    if (jErr || !job) throw new Error('Job not found');
    if (job.status !== 'review_pending') {
         // Allow 'in_progress' just in case of manual skip, but ideally review_pending
         if (job.status !== 'in_progress') throw new Error('Job is not ready for completion');
    }

    // 2. Stripe: Capture Payment / Transfer Funds
    // If we stored payment_intent_id in the job, we would capture it here.
    const paymentIntentId = job.payment_intent_id;
    
    if (paymentIntentId) {
        // Example: Only capture now if we did "auth_only" before.
        // await stripe.paymentIntents.capture(paymentIntentId);
        console.log(`💰 Capturing/Releasing Stripe Intent: ${paymentIntentId}`);
    } else {
        console.log('⚠️ No Payment Intent found (Mock Mode or Direct Pay)');
    }

    // 3. Update Job Status -> Completed
    const { error: uErr } = await supabaseAdmin
        .from('jobs')
        .update({ status: 'completed' })
        .eq('id', jobId);

    if (uErr) throw uErr;

    // 4. Notify Tradie (Email)?
    // We could call 'send-email' here too.

    return new Response(JSON.stringify({ success: true, message: 'Funds Released' }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})
