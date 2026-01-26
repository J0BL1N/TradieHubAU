
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { record } = await req.json()
    if (!record) throw new Error('No record found')

    // Message Data
    const { conversation_id, sender_id, text } = record

    // Init Supabase (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get Conversation Participants to find Recipient
    const { data: convo, error: cErr } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', conversation_id)
        .single()
    
    if (cErr || !convo) throw new Error('Conversation search failed')

    // Identify Recipient (The "Other" person)
    // Start with simplistic 'two participants' assumption
    // Schema `user1_id` / `user2_id`.
    const recipientId = (convo.user1_id === sender_id) ? convo.user2_id : convo.user1_id;

    // 2. Get Recipient Profile (Email)
    // Note: 'users' table might not have email if we didn't sync it securely there.
    // Ideally we look up auth.users but we can't do that easily via Client SDK in some contexts without admin.
    // BUT we are admin here.
    const { data: { user }, error: uErr } = await supabaseAdmin.auth.admin.getUserById(recipientId);
    
    if (uErr || !user || !user.email) {
        // Fallback: Check if 'users' table has email contact? No, usually generic mock.
        console.log('Recipient email not found for ID:', recipientId);
        return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), { headers: { "Content-Type": "application/json" } })
    }

    // 3. Send Notification
    const { data, error } = await supabaseAdmin.functions.invoke('send-email', {
        body: {
            to: user.email,
            subject: `New message on TradieHub`,
            html: `
              <h1>You have a new message!</h1>
              <p>Someone sent you a message regarding your job/service.</p>
              <blockquote>${text.substring(0, 100)}${text.length > 100 ? '...' : ''}</blockquote>
              <a href="${Deno.env.get('SITE_URL') ?? 'http://localhost:8080'}/pages/messages.html?conversation=${conversation_id}">View Message</a>
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
