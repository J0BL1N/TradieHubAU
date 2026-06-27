# Supabase Security Definer RPC Audit

Date: 2026-06-28

Scope: pass 2 review of remaining Supabase Advisor `SECURITY DEFINER` RPC warnings after migration `044_harden_security_lint_findings_pass1.sql`.

Summary:
- The prior `is_admin(user_id uuid)` anonymous execute finding is fixed in code by migration `044`; `anon` execute is revoked.
- The search path warnings are fixed in code by explicit `SET search_path = pg_catalog, public` or a function-specific safe equivalent.
- The remaining Advisor warnings are expected for functions that are intentionally executable by the `authenticated` database role. Supabase/PostgREST cannot grant EXECUTE to only application admins without a separate database role, so admin RPCs keep `authenticated` EXECUTE and enforce admin status inside the function before doing work.
- No additional migration is required in this pass.
- Supabase Dashboard warning `auth_leaked_password_protection` is not code-controlled; it must be fixed in the Supabase Dashboard by enabling leaked password protection.

## Findings

| Function | Intended caller | Authenticated EXECUTE acceptable? | Internal authorization guard | Migration change needed |
| --- | --- | --- | --- | --- |
| `accept_quote(p_job_id uuid, p_application_id uuid)` | Customer/job owner | Yes | Selects job owner and requires `v_customer_id = auth.uid()`; validates quote belongs to job; requires job status `open`; creates canonical payment/conversation state. | No |
| `approve_identity_verification(v_id uuid)` | Admin | Yes, with in-function admin gate | Migration `044` requires `auth.uid() IS NOT NULL` and `public.is_admin(auth.uid())` before reading/updating verification/user rows. Non-admin authenticated callers fail before mutation. | No |
| `approve_job_completion(p_job_id uuid)` | Customer/job owner | Yes | Requires `auth.uid()` to equal job `customer_id`; locks job; requires `completed_pending_review`; rejects disputed jobs/open issues; requires held unsettled payment. Not admin-only. | No |
| `approve_tradie_profile(target_user_id uuid)` | Admin | Yes, with in-function admin gate | Migration `044` requires `auth.uid() IS NOT NULL` and `public.is_admin(auth.uid())`; also checks identity verified, ABN, license, approved contractor license doc, and insurance doc. | No |
| `approve_variation(p_variation_id uuid)` | Customer/job owner | Yes | Loads variation job owner and requires `v_customer_id = auth.uid()`; requires variation status `pending`. | No |
| `can_admin_read_dispute_case(p_job_id uuid)` | RLS helper for authenticated admins | Yes | Returns true only when `public.is_admin(auth.uid())` and a dispute case exists for the job. Used by authenticated-only admin dispute read policies. | No |
| `can_submit_review(p_job_id uuid, p_reviewer_id uuid, p_reviewee_id uuid)` | RLS/helper for customer or accepted tradie | Yes | Requires `auth.uid()` present, reviewer equals `auth.uid()`, reviewer and reviewee differ, completed job, released payment, and exact customer/tradie counterparty linkage. | No |
| `is_admin(user_id uuid)` | RLS/helper for authenticated sessions | Yes | Migration `044` returns true only when supplied UUID equals `auth.uid()` and that same profile row has `is_admin IS TRUE`; anonymous execute is revoked. | No |
| `list_job_conversations()` | Customer or accepted tradie participant | Yes | Requires `auth.uid()` and filters rows to conversations where the caller is `user1_id` or `user2_id`; verifies canonical customer/payee/payment linkage and allowed job statuses. | No |
| `open_job_conversation(p_job_id uuid)` | Customer or accepted tradie participant | Yes | Requires `auth.uid()`; loads canonical job customer and payment payee; requires caller to be one of those participants; requires messageable job status. | No |
| `raise_job_issue(p_job_id uuid, p_description text)` | Customer/job owner | Yes | Wrapper calls the three-argument overload, which enforces job owner and lifecycle checks. | No |
| `raise_job_issue(p_job_id uuid, p_description text, p_attachments text[])` | Customer/job owner | Yes | Requires `auth.uid()` to equal job `customer_id`; locks job; requires `completed_pending_review`; inserts dispute issue and transitions job to disputed. | No |
| `record_admin_dispute_action(p_job_id uuid, p_action text, p_admin_notes text)` | Admin | Yes, with in-function admin gate | Migration `044` requires `auth.uid() IS NOT NULL` and `public.is_admin(auth.uid())`; validates supported action, non-empty notes, disputed job, and open issue before update/system message. | No |
| `reject_variation(p_variation_id uuid, p_reason text)` | Customer/job owner | Yes | Loads variation job owner and requires `v_customer_id = auth.uid()`; requires variation status `pending`. | No |
| `resolve_dispute(p_job_id uuid, p_resolution text, p_split_percentage integer)` | Admin | Yes, with in-function admin gate | Migration `044` requires `auth.uid() IS NOT NULL` and `public.is_admin(auth.uid())`; validates disputed job, split range, funded ledger, and records settlement. | No |
| `send_job_message(p_conversation_id uuid, p_text text)` | Customer or accepted tradie participant | Yes | Requires `auth.uid()`; validates canonical conversation/job/payment linkage; requires caller to be customer or payee; requires messageable status; blocks obvious pre-funding phone/email sharing; enforces beta message cap. | No |
| `send_job_message_with_attachments(p_message_id uuid, p_conversation_id uuid, p_text text, p_attachments jsonb)` | Customer or accepted tradie participant | Yes | Same participant/conversation/payment/status/contact-gating checks as text message RPC; additionally validates attachment count, MIME, size, storage object existence, and path bound to job/conversation/message/uploader. | No |
| `simulate_payment_funding(p_job_id uuid)` | Admin or trusted service role only | Yes, but only succeeds for admin/service role | Migration `044` requires `auth.role() = 'service_role'` or `public.is_admin(auth.uid())`; regular authenticated users can execute the RPC at the grant layer but fail before mutation. | No |
| `simulate_variation_funding(p_variation_id uuid)` | Admin or trusted service role only | Yes, but only succeeds for admin/service role | Migration `044` requires `auth.role() = 'service_role'` or `public.is_admin(auth.uid())`; regular authenticated users can execute the RPC at the grant layer but fail before mutation. | No |
| `submit_completion_proof(p_job_id uuid, p_description text, p_attachments text[])` | Accepted tradie/contractor | Yes | Loads payment payee and requires `v_tradie_id = auth.uid()`; requires job status `payment_held`; prevents duplicate proof; transitions to customer review. | No |
| `submit_variation_request(p_job_id uuid, p_description text, p_amount_cents integer)` | Accepted tradie/contractor | Yes | Loads payment payee and requires `v_tradie_id = auth.uid()`; requires active in-progress/review status; requires accepted application for caller. | No |
| `suspend_identity_verification(target_user_id uuid)` | Admin | Yes, with in-function admin gate | Migration `044` requires `auth.uid() IS NOT NULL` and `public.is_admin(auth.uid())`; verifies target user exists before clearing identity flags. | No |
| `suspend_tradie_profile(target_user_id uuid)` | Admin | Yes, with in-function admin gate | Migration `044` requires `auth.uid() IS NOT NULL` and `public.is_admin(auth.uid())`; verifies target user exists before clearing tradie verification and downgrading plain tradie role. | No |

## Admin-Only RPC Approach

Admin-only functions remain granted to the `authenticated` Postgres role because browser sessions all use that role. Each admin RPC performs an immediate `auth.uid()` plus `public.is_admin(auth.uid())` check before sensitive reads or writes.

Functions using this approach:
- `approve_identity_verification`
- `approve_tradie_profile`
- `suspend_identity_verification`
- `suspend_tradie_profile`
- `resolve_dispute`
- `record_admin_dispute_action`

This is the correct approach for the current Supabase client architecture unless the project introduces a separate backend/API or custom database roles for admins.

## Simulation RPCs

`simulate_payment_funding` and `simulate_variation_funding` are beta/dev helpers, not production payment capture APIs. Migration `044` changed them so regular authenticated users cannot run them successfully. They only proceed for:

- a service-role JWT, or
- an authenticated user whose own profile passes `public.is_admin(auth.uid())`.

They still show as authenticated executable in Advisor because the grant is present, but a non-admin caller fails before mutation.

## SECURITY INVOKER Review

No function was switched to `SECURITY INVOKER` in this pass.

Reasons:
- Workflow RPCs intentionally bypass direct table RLS only after validating ownership, participant, lifecycle, and state-transition rules.
- Helper predicates such as `can_admin_read_dispute_case`, `can_submit_review`, and `is_admin` are used inside RLS-sensitive paths; changing them to invoker could break policy evaluation or reintroduce recursive policy dependencies without stronger database regression coverage.
- Messaging and attachment RPCs need controlled inserts across messages, conversations, and attachment metadata after checking participant boundaries.

## Dashboard-Only Warning

The remaining `auth_leaked_password_protection` warning must be fixed in the Supabase Dashboard:

1. Open Supabase Dashboard.
2. Go to Authentication settings.
3. Enable leaked password protection.
4. Re-run Supabase Advisor.

This is not controlled by migrations in this repo.

## Files Inspected

- `supabase/migrations/009_quote_and_payment_lifecycle.sql`
- `supabase/migrations/011_variation_funding_safety.sql`
- `supabase/migrations/027_add_admin_dispute_read_policies.sql`
- `supabase/migrations/030_lock_variation_writes.sql`
- `supabase/migrations/034_harden_review_creation.sql`
- `supabase/migrations/036_explicit_rpc_execute_grants.sql`
- `supabase/migrations/037_job_messaging_foundation.sql`
- `supabase/migrations/040_message_attachments_foundation.sql`
- `supabase/migrations/041_message_pagination_cap.sql`
- `supabase/migrations/042_lifecycle_system_messages.sql`
- `supabase/migrations/044_harden_security_lint_findings_pass1.sql`
