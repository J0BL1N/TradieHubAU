
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})
// Platform fee percent (e.g. 10%)
const PLATFORM_FEE_PERCENT = 0.10;

serve(async (req) => {
  try {
    // 1. Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    // Get user from token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Invalid User Token')

    // 2. Parse Body
    const { proposalId, jobId } = await req.json()
    if (!proposalId) throw new Error('Missing proposalId')

    // 3. Fetch Proposal & Tradie Details
    // We need to know who we are paying (tradie_id) -> stripe_account_id
    const { data: proposal, error: propError } = await supabaseClient
      .from('proposals')
      .select('*, tradie:users!tradie_id(stripe_account_id)')
      .eq('id', proposalId)
      .single()
    
    if (propError || !proposal) throw new Error('Proposal not found')
    
    const tradieStripeId = proposal.tradie?.stripe_account_id
    if (!tradieStripeId) throw new Error('Tradie has not connected their bank account yet.')

    // 4. Calculate Amount
    // Stripe expects cents/integers. 
    const amount = Math.round(proposal.price * 100); 
    const applicationFee = Math.round(amount * PLATFORM_FEE_PERCENT);

    // 5. Create Payment Intent
    // Use "Direct Charge" or "Destination Charge"?
    // For Marketplaces where we take a fee, standard Connect Destination Charge (on_behalf_of optional but recommended for extensive control) 
    // or transfer_data.destination.
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      transfer_data: {
        destination: tradieStripeId,
      },
      application_fee_amount: applicationFee,
      metadata: {
        proposal_id: proposalId,
        job_id: jobId,
        customer_id: user.id
      }
    })

    return new Response(
      JSON.stringify({ 
        clientSecret: paymentIntent.client_secret,
        publishableKey: Deno.env.get('STRIPE_PUBLISHABLE_KEY') // Optional convenience
      }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})
