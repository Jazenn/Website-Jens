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
    const { email, name, type, message, isAnonymous } = await request.json()

    if (!email || !message) {
      return new Response(JSON.stringify({ error: 'Email and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isAnon = isAnonymous === true
    const displayName = isAnon ? 'Anoniem' : (typeof name === 'string' && name.trim() ? name.trim() : 'Onbekend')
    const displayEmail = isAnon ? 'Anoniem' : email
    const subject = isAnon 
      ? 'Nieuw anoniem bericht op Website Jens' 
      : `Nieuw bericht van ${displayName} op Website Jens`

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
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <h1 style="font-size: 20px; color: #7c3aed; margin-top: 0;">Nieuw bericht ontvangen</h1>
            <p>Er is een nieuw bericht achtergelaten op de profielpagina van Website Jens.</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p><strong>Afzender:</strong> ${displayName}</p>
            ${!isAnon ? `<p><strong>E-mail:</strong> ${displayEmail}</p>` : ''}
            <p><strong>Bericht:</strong></p>
            <div style="background-color: #f9fafb; border-left: 4px solid #7c3aed; padding: 16px; margin: 16px 0; border-radius: 8px; font-style: italic; color: #374151; white-space: pre-wrap;">${message}</div>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            ${adminUrl ? `<p style="margin-bottom: 0;"><a href="${adminUrl}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 9999px; font-size: 14px; font-weight: 500;">Open het adminpaneel</a></p>` : ''}
          </div>
        `,
        text: `Nieuw bericht op Website Jens\n\nAfzender: ${displayName}\n${!isAnon ? `E-mail: ${displayEmail}\n` : ''}\nBericht:\n${message}${adminUrl ? `\n\nAdminpaneel: ${adminUrl}` : ''}`,
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
    const errorMessage = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
