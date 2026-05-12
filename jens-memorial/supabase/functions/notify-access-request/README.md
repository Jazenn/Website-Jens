# notify-access-request

Supabase Edge Function die een e-mail naar de admin stuurt wanneer een nieuwe niet-admin gebruiker voor het eerst in de `users` tabel wordt aangemaakt.

## Secrets

Gebruik Supabase CLI:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set ADMIN_NOTIFICATION_EMAIL=your_email@example.com
supabase secrets set NOTIFICATION_FROM_EMAIL="Website Jens <onboarding@resend.dev>"
supabase secrets set SITE_URL=https://your-site-url.example
```

Voor Resend werkt `onboarding@resend.dev` alleen goed voor testmails naar het e-mailadres van je Resend-account. Voor productie is een geverifieerd domein beter.

## Deploy

```bash
supabase functions deploy notify-access-request
```

## Trigger

De frontend roept deze function automatisch aan vanuit `AuthContext.jsx` nadat een nieuwe niet-admin gebruiker is aangemaakt.
