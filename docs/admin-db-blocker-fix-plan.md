# TradieHubAU Admin/Database Blocker Fix Plan

## 1. Purpose

This document verifies the database schema, security policy, and helper function blocker issues identified during manual QA preparation for **TradieHubAU**. It details the evidence compiled from static inspection of Supabase migrations and the React frontend codebase, evaluates their impact, and proposes a safe, non-destructive database fix plan to resolve these blockers before local manual testing begins.

---

## 2. Inspection Summary

A comprehensive check of the migrations and frontend code confirmed that the issues are real. The following table summarizes the findings:

| Issue ID | Issue | Confirmed? | Evidence | Impact | Recommended Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DB-001** | Missing `is_admin(uuid)` helper function | **Yes** | References exist in `005`, `006`, `008`, `009`, `011`, and `013` migrations, but the SQL function `CREATE FUNCTION is_admin` is never defined. | Any trigger execution or admin-gated policy evaluation (e.g. whitelisting, resolving disputes) will throw database exceptions on execution. | Create a secure PostgreSQL helper function `public.is_admin(user_id uuid)` returning `boolean` via a subquery on the `users` table. |
| **DB-002** | Missing `is_admin` column on `users` table | **Yes** | Not defined in the initial table schema in `001_initial_schema.sql` nor added in any subsequent `ALTER TABLE` statement. | Database triggers checking `NEW.is_admin` or `OLD.is_admin` fail to compile/run. The frontend's check of `profile.is_admin` is always `undefined`. | Add `is_admin BOOLEAN NOT NULL DEFAULT FALSE` to the `public.users` table using a non-destructive migration. |
| **DB-003** | Missing admin SELECT policy on `verifications` table | **Yes** | `003_phase3_trust_money.sql` contains only a policy allowing users to select their own verification documents (`auth.uid() = user_id`). | Even with an admin session, the Direct SQL query to fetch pending verifications returns nothing for other users. | Create a new policy `CREATE POLICY "Admins can view all verifications"` on the `verifications` table using `is_admin(auth.uid())`. |
| **ADMIN-001** | Admin verification queue may hydrate empty | **Yes** | Combined effect of **DB-003** and the frontend query in `users.ts` (`supabase.from('verifications').select(...)`). | When logged in as an administrator on `/admin`, all verification queues appear empty. | Apply the SELECT RLS policy defined in **DB-003** to permit reads. |
| **FRONTEND-001**| Frontend admin guard depends on `profile.is_admin` | **Yes** | Checked in `Layout.tsx` (lines 129, 253) and `Admin.tsx` (lines 31, 220) to restrict interface elements and block direct path access. | If the `is_admin` column is missing, the dashboard is completely unreachable for all users. | Define the `is_admin` field on the backend and ensure the UserProfile interface maps it correctly. |

---

## 3. Migration Evidence

We inspected all 14 schema migration files in the `supabase/migrations/` directory:

1.  **[001_initial_schema.sql](file:///F:/TradieHubAU/supabase/migrations/001_initial_schema.sql)**
    *   *Creates:* Initial `users`, `trades`, `jobs`, and `reviews` tables.
    *   *is_admin references:* None.
    *   *is_admin helper function:* Not created.
    *   *users.is_admin column:* Not created.
    *   *verifications read access:* Not created (table doesn't exist yet).
2.  **[002_rls_policies.sql](file:///F:/TradieHubAU/supabase/migrations/002_rls_policies.sql)**
    *   *Creates:* Initial RLS policies for `users`, `jobs`, and `reviews`.
    *   *is_admin references:* None.
    *   *is_admin helper function:* Not created.
    *   *users.is_admin column:* Not created.
    *   *verifications read access:* Not created.
3.  **[003_phase3_trust_money.sql](file:///F:/TradieHubAU/supabase/migrations/003_phase3_trust_money.sql)**
    *   *Creates:* `payments` and `verifications` tables.
    *   *is_admin references:* None.
    *   *is_admin helper function:* Not created.
    *   *users.is_admin column:* Not created.
    *   *verifications read access:* Adds `"Users view own verifications"` using `auth.uid() = user_id`. No admin policies are created.
4.  **[004_applications_saved_items.sql](file:///F:/TradieHubAU/supabase/migrations/004_applications_saved_items.sql)**
    *   *Creates:* `applications` and `saved_jobs` tables.
    *   *is_admin references:* None.
    *   *is_admin helper function / users.is_admin column / verifications read access:* Not created.
5.  **[005_verified_tradie_approval.sql](file:///F:/TradieHubAU/supabase/migrations/005_verified_tradie_approval.sql)**
    *   *Creates:* `protect_user_fields` trigger and `approve_verification` RPC.
    *   *is_admin references:* References `is_admin(auth.uid())` on line 14 and line 54, and checks `NEW.is_admin` on line 17.
    *   *is_admin helper function / users.is_admin column / verifications read access:* Not created.
6.  **[006_separate_id_and_tradie_verification.sql](file:///F:/TradieHubAU/supabase/migrations/006_separate_id_and_tradie_verification.sql)**
    *   *Creates:* `identity_verified` and `tradie_verified` columns, and upgraded verification RPCs.
    *   *is_admin references:* References `is_admin(auth.uid())` on lines 23, 61, 97, and checks `NEW.is_admin` on line 26.
    *   *is_admin helper function / users.is_admin column / verifications read access:* Not created.
7.  **[007_cleanup_and_secure_storage.sql](file:///F:/TradieHubAU/supabase/migrations/007_cleanup_and_secure_storage.sql)**
    *   *Creates:* Drops obsolete verification RPC functions.
    *   *is_admin references:* None.
8.  **[008_harden_verification_safety.sql](file:///F:/TradieHubAU/supabase/migrations/008_harden_verification_safety.sql)**
    *   *Creates:* Upgraded RPCs (`approve_identity_verification`, `approve_tradie_profile`, `suspend_tradie_profile`), and storage policies.
    *   *is_admin references:* References `is_admin(auth.uid())` on lines 29, 77, 142, 169, 198, 280, and `NEW.is_admin` on lines 201, 212.
    *   *is_admin helper function / users.is_admin column / verifications read access:* Not created. (Creates storage read access policy for admins using `is_admin(auth.uid())` on line 280, but database RLS policy is missing).
9.  **[009_quote_and_payment_lifecycle.sql](file:///F:/TradieHubAU/supabase/migrations/009_quote_and_payment_lifecycle.sql)**
    *   *Creates:* Core payment flows, disputes, variations, and admin bypass policies.
    *   *is_admin references:* References `is_admin(auth.uid())` on lines 36, 530, 739, 742, 745, 748, 751, 786.
    *   *is_admin helper function / users.is_admin column / verifications read access:* Not created.
10. **[010_payment_funding_ledger_fix.sql](file:///F:/TradieHubAU/supabase/migrations/010_payment_funding_ledger_fix.sql)**
    *   *Creates:* Adjusted RPC parameters.
    *   *is_admin references:* None.
11. **[011_variation_funding_safety.sql](file:///F:/TradieHubAU/supabase/migrations/011_variation_funding_safety.sql)**
    *   *Creates:* Escrow and dispute security validations.
    *   *is_admin references:* References `is_admin(auth.uid())` on line 80 and line 204.
12. **[012_contracted_tradie_view_job.sql](file:///F:/TradieHubAU/supabase/migrations/012_contracted_tradie_view_job.sql)** / **[014_fix_contracted_tradie_view_job.sql](file:///F:/TradieHubAU/supabase/migrations/014_fix_contracted_tradie_view_job.sql)**
    *   *Creates:* Read policies for contracted tradies.
    *   *is_admin references:* None.
13. **[013_restore_payment_ledger_if_missing.sql](file:///F:/TradieHubAU/supabase/migrations/013_restore_payment_ledger_if_missing.sql)**
    *   *Creates:* Ledger RLS policies.
    *   *is_admin references:* References `is_admin(auth.uid())` on line 30.

---

## 4. Frontend Evidence

We inspected the React/TypeScript codebase for `profile.is_admin` usage:

1.  **[Layout.tsx](file:///F:/TradieHubAU/frontend/src/components/Layout.tsx)**
    *   **Line 129 (Desktop Nav):**
        ```typescript
        {profile?.is_admin && (
          <Link to="/admin" ...>Admin Dashboard</Link>
        )}
        ```
    *   **Line 253 (Mobile Nav):**
        ```typescript
        {profile?.is_admin && (
          <Link to="/admin" ...>Admin Dashboard</Link>
        )}
        ```
2.  **[Admin.tsx](file:///F:/TradieHubAU/frontend/src/pages/Admin.tsx)**
    *   **Line 31 (Data Fetch Gating):**
        ```typescript
        const loadData = useCallback(async () => {
          if (!profile?.is_admin) return;
          ...
        ```
    *   **Line 220 (UI Gating):**
        ```typescript
        if (!user || !profile?.is_admin) {
          return (
            // Access Denied
          );
        }
        ```
3.  **[users.ts](file:///F:/TradieHubAU/frontend/src/lib/users.ts)**
    *   **Lines 168-185 (`getPendingVerifications`):**
        ```typescript
        export async function getPendingVerifications() {
          const { data, error } = await supabase
            .from('verifications')
            .select(`*, user:users!user_id(...)`)
            .eq('status', 'pending');
          ...
        ```
        This client-side query is sent under the authenticated session of the admin user. Since the database lacks an administrative read policy on the `verifications` table, PostgreSQL enforces the default `auth.uid() = user_id` policy, filtering out all pending verifications from other users.

---

## 5. Proposed Fix Plan

We propose creating a new migration file `015_resolve_admin_blockers.sql` in `supabase/migrations/` that implements the following fixes safely:

1.  **Safely Add `is_admin` Column to `public.users`:**
    ```sql
    ALTER TABLE public.users 
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
    ```
2.  **Create the `is_admin(user_id uuid)` PostgreSQL Helper Function:**
    *   The function must run as `SECURITY DEFINER` so it can bypass RLS checks on the `users` table while executing, but it should restrict the lookup logic securely.
    ```sql
    CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
    RETURNS boolean
    SECURITY DEFINER
    SET search_path = public
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_is_admin boolean;
    BEGIN
      IF user_id IS NULL THEN
        RETURN FALSE;
      END IF;
      
      SELECT is_admin INTO v_is_admin
      FROM public.users
      WHERE id = user_id;
      
      RETURN COALESCE(v_is_admin, FALSE);
    END;
    $$;
    ```
3.  **Add SELECT/READ policies for Admins on the `verifications` Table:**
    ```sql
    DROP POLICY IF EXISTS "Admins view all verifications" ON public.verifications;
    CREATE POLICY "Admins view all verifications" ON public.verifications
      FOR SELECT USING (is_admin(auth.uid()));
    ```
4.  **Confirm trigger compliance:**
    *   The existing triggers `protect_user_fields` will compile and execute correctly once the `is_admin` column exists and the `is_admin(uuid)` function returns correct values.

---

## 6. Risk Notes

*   **Privilege Escalation:** By default, new columns are set to `DEFAULT FALSE`. The `is_admin` column update trigger (`protect_user_fields`) prevents client-side requests from modifying this column. The SQL function uses `SECURITY DEFINER` to read users, but it has a local search path set to `public` to prevent path-traversal injection.
*   **Seeding Admin Users:** When resetting the database locally (`npx supabase db reset`), the seeded user passwords must be updated. We should modify `supabase/seed.sql` to explicitly flag `admin.test@tradiehub.au` (or a dedicated admin account) as `is_admin = true` so the manual tester can immediately access the portal post-reset.
*   **RLS Intent Preservation:** All existing user-level security logic (where users read their own details) is preserved. Admin read capabilities are strictly added as additional `OR` permissions or separate `SELECT` policies.

---

## 7. Recommended Manual Test Order After Fix

Once the fix is applied, we recommend validating in this exact order:

1.  Apply the migration locally using `npx supabase db reset` or `npx supabase db push`.
2.  Ensure frontend compiles cleanly by running `npm run build`.
3.  Log in with the Admin Account (`admin.test@tradiehub.au`) and verify the `/admin` path loads without rendering the "Access Denied" screen.
4.  Open a second browser session (or private browsing tab) and log in with a customer account (e.g. `customer.test@tradiehub.au`).
5.  On the customer profile page, upload a mock driver's license image for identity check.
6.  Switch to the Admin dashboard browser tab, refresh, and confirm the pending driver's license displays in the "Pending Customer Identity Verifications" queue.
7.  In the customer session, submit a mock insurance or contractor license document and enter ABN/License fields to apply for tradie approval.
8.  Confirm the admin dashboard queue now lists this under "Pending Tradie Whitelist Applications".
9.  As the admin, click "Approve ID" on the identity document.
10. As the admin, click "Approve Doc" on the trade documents, then click "Whitelist Tradie".
11. Log in as the whitelisted tradie and confirm you can successfully submit quotes on active job listings.
12. Log in as a non-verified customer and confirm the "Apply/Quote" buttons are disabled or display a warning.

---

## 8. Do Not Do Yet

To keep our launch prep clean and focused:
*   **Do not** integrate a real payment processor (e.g., Stripe Live Keys) yet.
*   **Do not** write real database tables or integrate live messaging channels yet.
*   **Do not** add invoice templates or invoice PDF generation yet.
*   **Do not** create mobile app wrapper configurations.
*   **Do not** deploy the application to a public server or staging cloud until these admin verification blockers are resolved locally.

---

## 9. Implementation Update

The blocker issues have been successfully addressed through the implementation of a new database migration:

*   **Migration File Created:** [015_fix_admin_access_blockers.sql](file:///F:/TradieHubAU/supabase/migrations/015_fix_admin_access_blockers.sql)
*   **What was fixed:**
    *   Added the `is_admin` boolean column to the `public.users` table with `DEFAULT FALSE` and a `NOT NULL` constraint.
    *   Created the `public.is_admin(user_uuid uuid)` security-definer helper function to securely check user administrative permissions.
    *   Added an admin `SELECT` RLS policy to `public.verifications` allowing admins to view all verification documents.
    *   Added an admin `UPDATE` RLS policy to `public.verifications` to allow admins to approve/reject documents directly.
*   **Frontend Files Changed:** None. All current frontend components (`Admin.tsx`, `Layout.tsx`, and services in `users.ts`) rely on standard API mappings that are now supported by the new database schema.
*   **Seed Configuration Changed:** None. Seed changes can be handled separately as noted below.
*   **What still requires manual testing:**
    *   Applying the migration locally and resetting the database stack (once Docker is active).
    *   Registering new test profiles and verifying document queue display and whitelist action functionality.
*   **Remaining Risk Notes:**
    *   Applying roles manually requires the tester to set `is_admin = true` on the target profile directly in the database, as there is no user-facing admin promotion form.

