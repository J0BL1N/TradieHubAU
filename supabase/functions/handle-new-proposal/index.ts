
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { record } = await req.json()
    if (!record) throw new Error('No record found')

    const { job_id, tradie_id, price } = record

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch Job to get Customer (Owner)
    const { data: job, error: jErr } = await supabaseAdmin
        .from('jobs')
        .select('*, customer:users!customer_id(display_name)') // 'users' relation
         // Note: we need customer_id to find email.
        .eq('id', job_id)
        .single()

    if (jErr || !job) throw new Error('Job not found')

    // 2. Fetch Tradie Name
    const { data: tradie } = await supabaseAdmin
        .from('users')
        .select('display_name')
        .eq('id', tradie_id)
        .single()
    
    const tradieName = tradie?.display_name || 'A Tradie';

    // 3. Get Customer Email
    const { data: { user }, error: uErr } = await supabaseAdmin.auth.admin.getUserById(job.customer_id);
    
    if (uErr || !user || !user.email) {
         console.log('Customer email not found for ID:', job.customer_id);
         return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), { headers: { "Content-Type": "application/json" } })
    }

    // 4. Send Email
    await supabaseAdmin.functions.invoke('send-email', {
        body: {
            to: user.email,
            subject: `New Quote: $${price} for ${job.title}`,
            html: `
              <h1>New Quote Received!</h1>
              <p><strong>${tradieName}</strong> has submitted a quote for your job.</p>
              <p>Price: <strong>$${price}</strong></p>
              <a href="${Deno.env.get('SITE_URL') ?? 'http://localhost:8080'}/pages/jobs.html">View Quote</a>
            `
        }
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})
