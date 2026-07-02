# TradieHubAU Production Deployment & Rollback Runbook

This document details the checklist of environment variables, hosting setups, build commands, smoke test steps, and manual database rollback guidelines for the TradieHubAU marketplace launch.

---

## 1. Hosting & Environment Configurations

### Deployed Frontend (Render / Cloudflare Pages)
Configure the following build settings in your hosting dashboard:
*   **Build Command:** `npm run build` (executed inside the `/frontend` directory or specifying the root/base directory as `frontend`).
*   **Publish Directory:** `frontend/dist`
*   **Node Version:** `18.x` or `20.x` recommended.

#### Production Environment Variables
These public variables are compiled into the client bundle. Ensure they point to your live hosted database, not local dev:
*   `VITE_SUPABASE_URL=https://[YOUR-LIVE-PROJECT-REF].supabase.co`
*   `VITE_SUPABASE_ANON_KEY=[YOUR-LIVE-PUBLISHABLE-ANON-KEY]`

---

### Supabase Settings
Confirm these configurations in your hosted Supabase dashboard:

#### Auth Settings
*   **Site URL:** `https://[YOUR-PRODUCTION-DOMAIN].com` (or the Render/Cloudflare pages preview URL `https://tradiehubau.pages.dev`).
*   **Additional Redirect URIs:**
    *   `http://localhost:5173/auth/callback` (for dev/local troubleshooting)
    *   `https://[YOUR-PRODUCTION-DOMAIN].com/auth/callback`
*   **Google Provider:** Enabled with valid Client ID & Client Secret from Google Cloud Console.

#### Storage Buckets
Ensure the following buckets are initialized with correct configurations:
1.  `profile_media` (Private): Cache-control 3600. AVIF/JPEG/PNG allowed.
2.  `portfolio_images` (Public/Private mix): For public contractor gallery images.
3.  `completion_proofs` (Private): Guards completion evidence photos.
4.  `verifications` (Private): Secure storage for ID selfie and licenses.

---

## 2. Pre-Deployment Database Verification
Before pointing the live frontend to the database, verify that all migrations `001_initial_schema.sql` through `092_public_profile_identity_safety.sql` have been sequentially applied.

Run the checklist verification queries in the SQL editor:
```sql
-- 1. Check migrations tracking status (select last applied)
SELECT count(*), max(created_at) FROM public.users; -- Basic schema confirmation

-- 2. Verify all RLS is enabled on critical tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'jobs', 'applications', 'payments', 'job_completion_proofs', 'job_issues', 'notifications');
-- Expected: rowsecurity = true for all.
```

---

## 3. Post-Deployment Manual Smoke Checks (Jay)
Perform the following checks directly in the browser to ensure the live build is functional:

- [ ] **Sign-up & Login:** Complete a new email registration and a Google OAuth login. Verify callback succeeds.
- [ ] **Onboarding & Location:** Onboard as a tradie, search for "Officer" or "Salisbury" in suburb, select, and save profile.
- [ ] **Document Upload:** Upload a fake driver license to the profile verification portal. Verify success state.
- [ ] **Post a Job:** Log in as customer, post a job in a South East Melbourne suburb.
- [ ] **Bidding/Quoting:** Log in as tradie, find the posted job on the browse board, submit an itemized quote.
- [ ] **Fund simulated Payment:** Accept quote, click "Fund Payment" to simulate funding ledger generation.
- [ ] **Realtime Messaging:** Send chat messages inside the active job workspace. Verify instant sync in sidebar.
- [ ] **Evidence Submission & Release:** Submit completion proof photos, review from customer account, click "Release Payment".

---

## 4. Rollback & Contingency Guidelines

### Case A: Frontend Build or Bundle Failures
If the live site displays a white screen, routing crashes, or console build errors:
1.  Open the Render/Cloudflare hosting dashboard.
2.  Locate the last successful build deployment.
3.  Click **Rollback / Redeploy** to restore the previous stable commit instantly.
4.  Revert the buggy commit locally and debug using `npm run build` before pushing again.

### Case B: Database Migration Errors
If a manual SQL migration fails to apply or corrupts views:
*   **DO NOT run `DROP CASCADE`:** Dropping tables or views with CASCADE will silently erase related columns, policies, triggers, and data.
*   **Manual Reversion:**
    *   To revert a trigger: `DROP TRIGGER [name] ON [table];`
    *   To revert a function: `DROP FUNCTION [name]([argtypes]);`
    *   To revert a view: `DROP VIEW [name];`
*   **Database Restore:** If a critical error occurs on live data, restore the database from the last nightly backup via the Supabase Dashboard: **Database** > **Backups** > **Restore**.

---

## 5. Known Not-Ready Items (Beta Scope Boundary)
The following features are **not** production-ready and remain stubs or deferred for subsequent launches:
*   **Real Payments:** Payment processor API (Stripe Connect) is not integrated. All money actions are simulated ledger logs.
*   **GST & Invoicing:** Tax reporting and financial exports are stubs. Do not use for tax filings before accountant audit.
*   **Address Autocomplete:** Google Places street autocomplete is hidden. Suburb selection is local only.
*   **My Tradies:** Bookmark list is parked.
