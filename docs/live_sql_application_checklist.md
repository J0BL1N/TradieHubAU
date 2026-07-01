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

> [!IMPORTANT]
> **Corrective Migration Note (089)**:
> If migration `088_national_location_database.sql` was already applied to the live database *prior* to commit `6e25ca7` (without the standard explicit EXECUTE grants), do **not** re-run 088. Instead, immediately run `089_harden_live_location_database.sql` to cleanly apply the correct permission state, secure RLS, and verify fallback seeds.

---

## 2. SQL Verification Queries for Migration 089
Jay can run the following SQL select queries in the Supabase SQL editor to verify that migration 089 applied security and constraints correctly:

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

---

## 3. Post-Migration 088 & 089 Manual Smoke Checks

Once migrations are applied, run the following manual checks on the frontend to confirm successful integration:

- [ ] **State & Region Dropdowns**: Navigate to "Post a Job", select SA or VIC, and check that regions (e.g. City of Salisbury, Cardinia Shire) load alphabetically.
- [ ] **Keyless Autocomplete**: Verify the suburb selector autocomplete does not crash and works without a Google Maps API Key.
- [ ] **Search "Ingle Farm"**: Type `Ingle` into Suburb and verify `Ingle Farm, SA 5098` appears.
- [ ] **Search "Salisbury"**: Type `Salis` and verify `Salisbury SA 5108`, `Salisbury Downs SA 5108`, and `Salisbury East SA 5109` appear.
- [ ] **Postcode Auto-fill**: Select a suggested suburb, and verify the Postcode field auto-populates correctly.
- [ ] **Postcode Manual Edit**: Click into the Postcode input and edit/type numbers manually.
- [ ] **Offline Dropdown Fallback**: Simulating a database failure (or calling with an incorrect RPC name), verify the input reverts to manual text entry allowing custom text without crashing.
- [ ] **Profile Settings**: Open Profile page, type a suburb, verify suggestion selection works, and click Save Profile to ensure it commits successfully.
