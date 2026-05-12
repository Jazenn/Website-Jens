declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_NOTIFICATION_EMAIL = Deno.env.get('ADMIN_NOTIFICATION_EMAIL')
const FROM_EMAIL = Deno.env.get('NOTIFICATION_FROM_EMAIL') ?? 'Website Jens <onboarding@resend.dev>'
const SITE_URL = Deno.env.get('SITE_URL') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!RESEND_API_KEY || !ADMIN_NOTIFICATION_EMAIL) {
    return new Response(JSON.stringify({ error: 'Notification service is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { email, name } = await request.json()

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const displayName = typeof name === 'string' && name.trim() ? name.trim() : 'Onbekend'
    const adminUrl = SITE_URL ? `${SITE_URL.replace(/\/$/, '')}/admin` : ''

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_NOTIFICATION_EMAIL,
        subject: 'Nieuwe toegangsaanvraag voor Website Jens',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h1 style="font-size: 20px;">Nieuwe toegangsaanvraag</h1>
            <p>Er is een nieuwe toegangsaanvraag voor Website Jens.</p>
            <p><strong>Naam:</strong> ${displayName}</p>
            <p><strong>E-mail:</strong> ${email}</p>
            ${adminUrl ? `<p><a href="${adminUrl}">Open het adminpaneel</a></p>` : ''}
          </div>
        `,
        text: `Nieuwe toegangsaanvraag voor Website Jens\n\nNaam: ${displayName}\nE-mail: ${email}${adminUrl ? `\n\nAdminpaneel: ${adminUrl}` : ''}`,
      }),
    })

    if (!resendResponse.ok) {
      const details = await resendResponse.text()
      return new Response(JSON.stringify({ error: 'Email provider failed', details }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
