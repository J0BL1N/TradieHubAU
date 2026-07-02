# Google OAuth Setup Checklist

TradieHubAU supports Google OAuth sign-in/sign-up through Supabase Auth. The frontend handles redirects to `/auth/callback` which handles session synchronization cleanly.

Follow this checklist to configure Google Sign-In for both local development and production.

---

## 1. Google Cloud Console Configuration
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select your existing `TradieHubAU` project.
3. Navigate to **APIs & Services** > **OAuth consent screen**:
   *   Select User Type (normally **External** for public beta).
   *   Fill in App Name (`TradieHubAU`), user support email, and developer contact information.
   *   Scopes: Add `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
4. Navigate to **APIs & Services** > **Credentials**:
   *   Click **Create Credentials** > **OAuth client ID**.
   *   Select Application type: **Web application**.
   *   Name it `TradieHubAU Auth Client`.
   *   **Authorized JavaScript origins**:
       *   `http://localhost:5173` (Local Dev)
       *   `https://[YOUR-PRODUCTION-FRONTEND-SUBDOMAIN].pages.dev` (Render/Cloudflare production placeholder)
   *   **Authorized redirect URIs**:
       *   Enter your Supabase project callback URI exactly (do not enter the frontend URL here):
           `https://<SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback`
5. Click **Create** and copy the generated **Client ID** and **Client Secret**.

---

## 2. Supabase Dashboard Configuration
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Authentication** > **Providers** > **Google**.
3. Toggle Google provider to **Enabled**.
4. Paste the **Client ID** and **Client Secret** copied from Google Cloud Console.
5. In **Redirect URLs** (Authentication > URL Configuration):
   *   **Site URL**:
       *   Dev: `http://localhost:5173`
       *   Prod: `https://[YOUR-PRODUCTION-FRONTEND-SUBDOMAIN].pages.dev` (or custom domain)
   *   **Redirect URLs** (Additional Redirect URIs):
       *   `http://localhost:5173/auth/callback`
       *   `https://[YOUR-PRODUCTION-FRONTEND-SUBDOMAIN].pages.dev/auth/callback`

---

## 3. Environment Variables
No Google secrets should ever be committed to the repository or stored in the frontend environment files.
Ensure the following variables are correctly configured in `frontend/.env.local` for local dev (and via provider dashboard for production):
*   `VITE_SUPABASE_URL=https://<SUPABASE-PROJECT-REF>.supabase.co`
*   `VITE_SUPABASE_ANON_KEY=your_publishable_anon_key`

---

## 4. Manual Testing Steps for Jay
Once configured, perform these verification steps to ensure Google OAuth functions as intended:

*   [ ] **Start Auth Flow**: Go to the login page (`/auth` or `/login`) and click **Continue with Google**. Verify you are redirected to the Google Account selection screen.
*   [ ] **Cancel flow**: Click "Cancel" or click back from the Google consent screen. Verify you are redirected back to the login screen with a safe error message or no crash.
*   [ ] **Successful signup**: Select a Google account that is NOT yet registered in TradieHubAU. Verify you are signed up, redirected back to the `/auth/callback` loader page, and then successfully redirected to the landing page `/` logged-in.
*   [ ] **Profile generation check**: Run the following database query to ensure the sign-up trigger automatically created a corresponding profile record:
    ```sql
    SELECT id, email, display_name, role FROM public.users WHERE email = 'your-google-email@example.com';
    ```
*   [ ] **Successful login**: Sign out, go back to `/login`, click **Continue with Google**, and select the same Google account. Verify you are logged in instantly.
