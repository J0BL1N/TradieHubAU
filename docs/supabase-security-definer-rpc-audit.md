# Supabase Security Definer RPC & View Audit

Date: 2026-06-29

## Executive Summary
This audit reviews all database views and functions using `SECURITY DEFINER` settings, confirming access rights, internal validations, and intentional exceptions.

In Migration `078_revoke_public_execute_on_definers.sql`, we performed a cleanup sweep:
1. **Revoked anonymous execute** from all admin-only RPCs, developer simulation scripts, and authenticated-only user flows.
2. **Revoked all direct execution** (for PUBLIC, anon, and authenticated roles) from internal database trigger functions and background validation helpers. Trigger functions run as the system role and do not require direct API invocation permissions.

---

## 1. Security Definer View Exception

### `public.public_profiles` View
* **Access Type:** `security_invoker = false` (standard security definer behavior).
* **Rationale:** The underlying table `public.users` contains private identifiers, email, phone numbers, stripe credentials, and identity verification document files. RLS policies on the base table strictly block read access to everyone except the user themselves and admins to prevent data leaks.
* **Security Guard:** The `public_profiles` view acts as a sanitized, safe projection. It explicitly selects only public fields (`display_name`, `business_name`, `avatar_url`, `suburb`, `state`, `trades`, `years_experience`, `service_areas`, `website_url`, and verified flags). By running as a security definer, it allows guests and customers to search the tradie directory without encountering base table RLS access failures. Since no private fields are mapped, this is safe and correct.

---

## 2. Trigger & Helper Functions (Direct Execute Revoked)
All direct execution grants have been completely revoked (`PUBLIC`, `anon`, `authenticated`) for the following trigger and validation helper functions:
* `public.protect_user_fields()`
* `public.check_and_auto_whitelist_tradie(uuid)`
* `public.trg_auto_whitelist_tradie()`
* `public.protect_quote_line_items()`
* `public.handle_accepted_application_snapshot()`
* `public.validate_early_release_request()`
* `public.validate_early_release_request_update()`
* `public.check_early_release_caps(uuid, uuid, uuid, uuid, uuid, uuid, numeric)`
* `public.prevent_itemised_variation_line_mutation()`
* `public.validate_itemised_variation_request_update()`
* `public.prevent_approved_variation_line_mutation()`
* `public.ensure_job_invoice_line_items(uuid)`
* `public.ensure_job_invoices(uuid)`
* `public.trg_generate_invoices_on_payment_release()`
* `public.trg_ensure_invoices_on_job_completed()`
* `public.protect_review_insert()`

---

## 3. Remaining Authenticated SECURITY DEFINER Functions

These functions are intentionally executable by the `authenticated` database role to allow browser client interactions. Because Supabase maps browser clients to the `authenticated` role, access control is enforced **inside the SQL function** using explicit validations before any query or mutation is performed.

### Category A: Admin-Only RPCs
*Guarded internally by verifying `public.is_admin(auth.uid())` is true.*
* `approve_identity_verification(uuid)`
* `approve_tradie_profile(uuid)`
* `suspend_identity_verification(uuid)`
* `suspend_tradie_profile(uuid)`
* `record_admin_dispute_action(uuid, text, text)`
* `resolve_dispute(uuid, text, integer)`
* `get_admin_job_evidence_pack(uuid)`
* `create_admin_enforcement_action(...)`
* `resolve_admin_enforcement_action(uuid, text)`
* `get_admin_user_enforcement_history(uuid)`
* `get_admin_tradie_risk_summary(uuid)`
* `get_admin_analytics(text)`

### Category B: Authenticated User Workflow RPCs
*Guarded internally by matching the caller (`auth.uid()`) to the job customer_id, application tradie_id, or message conversation participants.*
* `accept_quote(p_job_id uuid, p_application_id uuid)`: Enforces caller is job owner; validates quote.
* `approve_job_completion(p_job_id uuid)`: Enforces caller is job owner.
* `approve_variation(p_variation_id uuid)`: Enforces caller is job owner.
* `reject_variation(p_variation_id uuid, p_reason text)`: Enforces caller is job owner.
* `raise_job_issue(p_job_id uuid, p_description text, ...)`: Enforces caller is job owner.
* `submit_completion_proof(...)`: Enforces caller is the accepted contractor.
* `submit_variation_request(...)`: Enforces caller is the accepted contractor.
* `create_itemised_variation_request(...)`: Enforces caller is the accepted contractor.
* `cancel_itemised_variation_request(...)`: Enforces caller is the creator.
* `review_job_variation_request(...)`: Enforces caller is job owner.
* `review_early_release_request(...)`: Enforces caller is job owner.
* `get_early_release_cap_summary(p_job_id uuid)`: Enforces caller is customer or accepted tradie.
* `get_my_job_invoice(p_job_id uuid, p_invoice_type text)`: Enforces caller is customer or accepted contractor.
* `get_job_evidence_timeline(p_job_id uuid)`: Enforces caller is customer, accepted contractor, or admin.
* `list_job_conversations()`: Filters list to conversations where the caller is a participant.
* `open_job_conversation(...)`: Enforces caller is customer or accepted contractor.
* `send_job_message(...)` & `send_job_message_with_attachments(...)`: Enforces participant boundaries and messaging caps.
* `list_my_portfolio_completion_proofs()`: Enforces caller is the owner of portfolio proofs.
* `update_completion_proof_portfolio_publication(...)`: Enforces caller is the owner of portfolio proof.

### Category C: Public-Safe Marketplace Read Functions
*These support guest/directory browsing of reviews and portfolios, and do not expose sensitive files or user data. Granted to both `anon` and `authenticated`.*
* `list_public_tradie_reviews(p_tradie_id uuid)`
* `list_public_tradie_review_summaries(p_tradie_ids uuid[])`
* `list_public_tradie_completion_proof_gallery(p_tradie_id uuid)`
* `list_public_tradie_gallery(p_tradie_id uuid)`
* `can_read_public_completion_proof_image(p_name text)`

### Category D: Policy Predicate Helpers
*Parameterless or low-risk boolean helpers used inside RLS definitions. Changing them to security invoker would trigger recursive RLS validation loops.*
* `is_admin(user_id uuid)`: Returns true if user has the admin flag set (guarded internally by `auth.uid() = user_id`).
* `can_admin_read_dispute_case(p_job_id uuid)`: Returns true if caller is admin.
* `can_submit_review(p_job_id, p_reviewer_id, p_reviewee_id)`: Evaluates review policy.

---

## 4. Supabase Dashboard Leaked Password Protection
The warning `auth_leaked_password_protection` is configuration-only and cannot be fixed in database migrations:
1. Navigate to the **Supabase Dashboard** -> **Authentication** settings.
2. Enable the **Leaked Password Protection** setting.
