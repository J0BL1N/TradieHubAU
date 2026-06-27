# Google OAuth Setup

TradieHubAU supports Google sign-in through Supabase Auth. The frontend redirects OAuth sign-ins to:

- `https://tradiehubau.pages.dev/auth/callback`
- `http://localhost:5173/auth/callback`

Supabase dashboard checklist:

1. Enable the Google provider in Supabase Auth.
2. Add the Google OAuth client ID and client secret in Supabase.
3. Add the allowed redirect URLs above in Supabase Auth URL configuration.
4. In Google Cloud, configure the OAuth callback URL to point to Supabase:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
```

Do not store Google client secrets in the repo or frontend environment files.
