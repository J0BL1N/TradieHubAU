
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  try {
    const { to, subject, html } = await req.json()

    if (!to || !subject || !html) {
        throw new Error('Missing required fields: to, subject, html')
    }

    // 1. If Resend Key exists, send real email
    if (RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'TradieHub <noreply@tradiehub.com.au>',
                to: [to],
                subject: subject,
                html: html
            })
        })
        
        const data = await res.json()
        if (!res.ok) throw new Error(JSON.stringify(data))
        
        return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" }
        })
    }

    // 2. Fallback: Log to console (Mock)
    console.log('📧 MOCK EMAIL SENT:')
    console.log('To:', to)
    console.log('Subject:', subject)
    // console.log('Body:', html) // Too verbose

    return new Response(JSON.stringify({ 
        success: true, 
        mock: true,
        message: 'Email logged to server endpoint' 
    }), {
        headers: { "Content-Type": "application/json" }
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})
