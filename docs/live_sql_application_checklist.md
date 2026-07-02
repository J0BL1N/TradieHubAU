# Live SQL Application Checklist

This checklist defines the sequence and verification steps for applying database migrations to the live production database for the public beta launch.

> [!WARNING]
> **Important Directive**:
> - **Jay** performs all live database SQL execution and manual testing.
> - **The AI Agent** must NOT connect to or execute SQL against the live production database.

---

## 1. Sequence of Pending Migrations

Apply the following migrations sequentially (lowest numbers first) in the Supabase Dashboard SQL Editor or via CLI:

| Sequence | Migration File Name | Purpose / What it Does | Dependent Features (Will Fail if Missing) |
| :--- | :--- | :--- | :--- |
| **1** | `081_create_notifications_table.sql` | Creates notifications schema, RLS, and read status markers. | All notification delivery and count badges. |
| **2** | `082_new_message_notifications.sql` | Adds trigger/function generating notifications on new chat messages. | Chat inbox notification bells. |
| **3** | `083_quote_lifecycle_notifications.sql` | Adds triggers generating notifications on quotes submitted, accepted, or rejected. | Customer quote alert badge. |
| **4** | `084_payment_status_notifications.sql` | Adds triggers generating notifications on variation funding, completion approvals, or payment releases. | Payments status update tracking. |
| **5** | `085_dispute_notifications.sql` | Adds triggers generating notifications on new dispute cases and resolutions. | Disputes/Admin action alerts. |
| **6** | `086_verification_notifications.sql` | Adds triggers generating notifications on document approval/suspension status updates. | Tradie credentials approval alerts. |
| **7** | `087_add_google_places_location_fields.sql` | Adds formatted_address, place_id, lat, lng to jobs/users, and updates client edit allowlist trigger. | Geolocation coordinates and optional address search. |
| **8** | `088_national_location_database.sql` | Creates location_regions and location_suburbs tables, security, RPC helpers, and seeds fallback SA/VIC suburbs. | Suburb autocomplete list search and post-job region dropdowns. |
| **9** | `089_harden_live_location_database.sql` | Safely enforces permissions, RLS policies, explicit execution grants, and fallback seeds on live servers. | Hardened access control and secure, public-safe location querying. |
| **10** | `090_messaging_safety_moderation.sql` | Implements messaging moderation triggers, profane word filtering, and communication audits. | Safety and communication moderation filters. |
| **11** | `091_supabase_lint_hardening.sql` | Resolves security lints by converting views to security invokers, adding search paths, and hardening triggers. | Safe database views, search path compliance, and trigger privilege control. |
| **12** | `092_public_profile_identity_safety.sql` | Implements safe public display name middle ground and write filters to reject contact details bypasses on users/portfolio tables. | Safe public display names and data write filters. |

> [!IMPORTANT]
> **Corrective Migration Note (089)**:
> If migration `088_national_location_database.sql` was already applied to the live database *prior* to commit `6e25ca7` (without the standard explicit EXECUTE grants), do **not** re-run 088. Instead, immediately run `089_harden_live_location_database.sql` to cleanly apply the correct permission state, secure RLS, and verify fallback seeds.

---

## 2. SQL Verification Queries for Migration 089 & 091
Jay can run the following SQL select queries in the Supabase SQL editor to verify that migrations 089 and 091 applied security and constraints correctly:

### Migration 089 Checks
```sql
-- 1. Verify RLS is enabled on location tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('location_regions', 'location_suburbs');
-- Expected: rowsecurity should be true for both.

-- 2. Verify fallback seed rows exist and are correctly resolved
SELECT count(*) FROM public.location_regions WHERE source = 'verified_fallback_seed';
-- Expected: 6 regions.

SELECT count(*) FROM public.location_suburbs WHERE source = 'verified_fallback_seed';
-- Expected: 14 suburbs.

-- 3. Verify RPC function execution is working for standard roles
SELECT * FROM public.get_location_regions('SA');
-- Expected: 2 regions (City of Salisbury, City of Adelaide).

SELECT * FROM public.search_location_suburbs('SA', null, null, 'Salis', 5);
-- Expected: 3 matching Salisbury suburbs (Salisbury, Salisbury Downs, Salisbury East).
```

### Migration 091 Checks
```sql
-- 1. Verify view security invoker configuration
SELECT
  c.relname AS view_name,
  (regexp_split_to_array(array_to_string(c.reloptions, ','), '='))[2] AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('public_profiles', 'public_open_jobs');
-- Expected: security_invoker should be 'true' for both views.

-- 2. Verify public_profiles view runs successfully under standard roles
SELECT count(*) FROM public.public_profiles LIMIT 5;

-- 3. Verify public_open_jobs view runs successfully under standard roles
SELECT count(*) FROM public.public_open_jobs LIMIT 5;
```

### Migration 092 Checks
```sql
-- 1. Verify public_profiles view exists
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'public_profiles';
-- Expected: public_profiles | VIEW

-- 2. Verify view columns list (Check only public-safe fields are present)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'public_profiles'
ORDER BY ordinal_position;
-- Expected: id, role, display_name, avatar_url, public_avatar_url, suburb, state, trades, abn, license_number, verified, identity_verified, tradie_verified, show_location, business_name, headline, bio, years_experience, service_areas, website_url, created_at, updated_at

-- 3. Confirm private contact fields (email, phone, etc.) are NOT present in the view columns
SELECT count(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'public_profiles'
  AND column_name IN ('email', 'phone', 'phone_number');
-- Expected: 0

-- 4. Verify SELECT access is granted to anon and authenticated roles
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'public_profiles' AND privilege_type = 'SELECT';
-- Expected: anon and authenticated must have SELECT privilege.

-- 5. Check relevant RPCs and functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'contains_contact_bypass_text',
    'safe_public_display_name',
    'safe_public_profile_text',
    'get_public_profiles',
    'validate_user_profile_fields',
    'validate_portfolio_item_fields',
    'validate_completion_proof_portfolio_fields',
    'list_public_tradie_completion_proof_gallery'
  );
-- Expected: All 8 routines should appear.

-- 6. Test contains_contact_bypass_text function
SELECT public.contains_contact_bypass_text('Call me on 0423 339 442') AS has_phone,
       public.contains_contact_bypass_text('Email at test@example.com') AS has_email,
       public.contains_contact_bypass_text('Safe text description') AS is_safe,
       -- Website URL validation bypass test (should return false if p_allow_url is true)
       public.contains_contact_bypass_text('https://mywebsite.com.au', true) AS allowed_website,
       public.contains_contact_bypass_text('https://mywebsite.com.au', false) AS blocked_website;
-- Expected: true, true, false, false, true.

-- 7. Test safe_public_display_name function
SELECT public.safe_public_display_name('John Smith', 'Smith Plumbing') AS name_1,
       -- fallback to business name if display name is null or empty
       public.safe_public_display_name(NULL, 'Lingo Plumbers') AS name_2,
       -- beta string stripping
       public.safe_public_display_name('[BETA] Sarah Mitchell', '') AS name_3;
-- Expected: 'John S.', 'Lingo P.', 'Sarah M.'

-- 8. Verify get_public_profiles output masking for guests (Simulate query as guest/anonymous)
SELECT id, display_name, business_name, website_url, headline, bio, service_areas, abn, license_number
FROM public.public_profiles LIMIT 5;
-- Expected for records where auth.uid() != id and no active funded contract:
-- - display_name: formatted with first name + last initial (or 'Verified tradie')
-- - business_name: NULL
-- - website_url: NULL
-- - abn: NULL
-- - license_number: NULL
-- - headline/bio/service_areas: visible (if clean) or NULL (if containing contact bypasses)
```

---

## 3. Post-Migration Manual Smoke Checks

Once migrations are applied, run the following manual checks on the frontend to confirm successful integration:

- [ ] **State & Region Dropdowns**: Navigate to "Post a Job", select SA or VIC, and check that regions (e.g. City of Salisbury, Cardinia Shire) load alphabetically.
- [ ] **Keyless Autocomplete**: Verify the suburb selector autocomplete does not crash and works without a Google Maps API Key.
- [ ] **Search "Ingle Farm"**: Type `Ingle` into Suburb and verify `Ingle Farm, SA 5098` appears.
- [ ] **Search "Salisbury"**: Type `Salis` and verify `Salisbury SA 5108`, `Salisbury Downs SA 5108`, and `Salisbury East SA 5109` appear.
- [ ] **Postcode Auto-fill**: Select a suggested suburb, and verify the Postcode field auto-populates correctly.
- [ ] **Postcode Manual Edit**: Click into the Postcode input and edit/type numbers manually.
- [ ] **Offline Dropdown Fallback**: Simulating a database failure (or calling with an incorrect RPC name), verify the input reverts to manual text entry allowing custom text without crashing.
- [ ] **Profile Settings**: Open Profile page, type a suburb, verify suggestion selection works, and click Save Profile to ensure it commits successfully.
- [ ] **Profile Directory Read**: Verify the main tradie browse list and individual public tradie profile pages load portfolio images and reviews successfully for guest visitors.
