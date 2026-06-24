# TradieHubAU v0.0.16 Security, RLS, Storage, and Privacy Audit

Date: 2026-06-24

Status: Critical/High security pass approved — source remediation, hosted verification, and user manual core regression complete. Medium/Low findings remain deferred.

Approval: The user approved the v0.0.16 Critical/High remediation pass on 2026-06-24. This does not approve v0.0.15, Medium/Low remediation, v0.1.0 beta readiness, production launch, or real payment processing.

## Scope and method

This audit reviewed the committed frontend, Supabase migrations, Edge Functions, storage policies, auth/profile logic, and frontend Supabase calls. The final Critical/High review also checked linked migration state and exercised public REST and disabled-function boundaries against hosted project `phiurjqqfgbtauztqtxx` on 2026-06-24. Migrations 019–028 were present remotely, `public.public_profiles` resolved through the hosted schema cache, and all six disabled Edge Functions returned fail-closed HTTP 403 responses.

The user subsequently completed a browser-level core regression covering signup/login, Browse Jobs, public profiles/directories, customer job creation, tradie applications/quotes, quote acceptance, simulated funding, post-funding contact unlock, completion proof and approval, dispute creation, admin dispute case visibility, and wrong/public access checks. The user reported this core regression passed.

This approval is limited to the Critical/High remediation pass. Medium/Low findings remain deferred, and this approval does not represent full production security certification, beta readiness, or approval of real provider payments.

## Summary

| Severity | Count | State |
| --- | ---: | --- |
| Critical | 5 | Source-remediated and verified on hosted Supabase |
| High | 8 | Source-remediated and verified on hosted Supabase |
| Medium | 6 | Deferred |
| Low | 4 | Deferred or accepted for local development |

The final review found and corrected two narrow guard regressions in [028_finalize_critical_high_security_guards.sql](file:///F:/TradieHubAU/supabase/migrations/028_finalize_critical_high_security_guards.sql): application update protection now executes as the invoking role, and simulated funding retries are serialized before idempotency checks. The migration was applied to the hosted project.

## Critical

### C-01 — Privileged profile fields are not protected by a trigger

* **Involved:** `002_rls_policies.sql` (`Users can update own profile`); `005_verified_tradie_approval.sql`, `006_separate_id_and_tradie_verification.sql`, and `008_harden_verification_safety.sql` (`protect_user_fields`); `015_fix_admin_access_blockers.sql` (`is_admin`).
* **Issue:** The migrations define `protect_user_fields()` but never create a trigger that invokes it. The self-update policy allows an authenticated user to update their own row without column restrictions.
* **Risk:** A user can attempt to set `is_admin`, `role`, verification flags, or Stripe/provider identifiers. Successful admin escalation compromises admin policies and security-definer admin RPCs.
* **Recommended fix:** Add a reviewed `BEFORE INSERT OR UPDATE` trigger protecting every privilege, verification, and provider-managed field. Restrict ordinary profile changes to an allowlist.
* **State:** Fixed in migration [019_protect_user_fields_trigger.sql](file:///F:/TradieHubAU/supabase/migrations/019_protect_user_fields_trigger.sql); applied to hosted Supabase and verified in linked migration status.

### C-02 — Proof/dispute RLS has an outer-column shadowing error

* **Involved:** `009_quote_and_payment_lifecycle.sql`, policies `Users view completion proofs for own jobs` and `Users view issues for own jobs`.
* **Issue:** Both contain `SELECT payee_id FROM public.payments WHERE job_id = job_id`. Both unqualified names resolve to the payment row, making the condition effectively true for every payment.
* **Risk:** A payee on any payment may be able to read proof and dispute rows for unrelated jobs, including complaint text, evidence paths, resolution data, and admin notes.
* **Recommended fix:** Replace the policies using aliases and explicit correlation to the outer proof/issue job ID. Add wrong-tradie SQL tests.
* **State:** Fixed in migration [020_fix_proof_dispute_rls_shadowing.sql](file:///F:/TradieHubAU/supabase/migrations/020_fix_proof_dispute_rls_shadowing.sql); applied to hosted Supabase and verified in linked migration status.

### C-03 — Simulated funding RPC has no caller authorization or idempotency guard

* **Involved:** Latest `public.simulate_payment_funding` in `010_payment_funding_ledger_fix.sql`.
* **Issue:** The security-definer RPC funds a supplied job without checking job ownership, admin status, or an approved local-test actor. No explicit revoke/grant or pending-state guard is committed.
* **Risk:** A caller with a job UUID can spoof funding, unlock lifecycle/contact behaviour, and create duplicate charge ledger entries. PostgreSQL functions are executable by `PUBLIC` unless privileges are tightened.
* **Recommended fix:** Revoke `PUBLIC`/`anon`, authorize only the required authenticated actor, require the expected pending state, and make ledger insertion idempotent. Disable simulation before production.
* **State:** Fixed in migration [021_secure_simulate_payment_funding_rpc.sql](file:///F:/TradieHubAU/supabase/migrations/021_secure_simulate_payment_funding_rpc.sql), with concurrent-retry serialization added by [028_finalize_critical_high_security_guards.sql](file:///F:/TradieHubAU/supabase/migrations/028_finalize_critical_high_security_guards.sql); both are applied to hosted Supabase.

### C-04 — Payment rows can be inserted directly by clients

* **Involved:** `003_phase3_trust_money.sql`, policy `Users initiate payments`; `009_quote_and_payment_lifecycle.sql` removes direct UPDATE but not INSERT.
* **Issue:** An authenticated payer can insert a payment while choosing job, payee, amount, status, and provider identifiers.
* **Risk:** A client can forge payment/contract relationships, reserve a job's unique payment row to block legitimate acceptance, or create records that grant downstream access.
* **Recommended fix:** Drop direct client INSERT and create payments only inside a validated quote-acceptance RPC or verified provider webhook.
* **State:** Fixed in migration [022_block_direct_client_payment_inserts.sql](file:///F:/TradieHubAU/supabase/migrations/022_block_direct_client_payment_inserts.sql); applied to hosted Supabase and verified in linked migration status.

### C-05 — Release payout Edge Function lacks actor authorization

* **Involved:** `supabase/functions/release-payout/index.ts`.
* **Issue:** It accepts any `jobId`, creates a service-role client, and updates job status without authenticating or authorizing the customer/admin actor.
* **Risk:** If deployed, an untrusted caller—or any authenticated caller if only gateway JWT verification is enabled—can attempt to complete another user's job and trigger future release logic.
* **Recommended fix:** Do not deploy as-is. Add explicit JWT validation, customer/admin authorization, current-state validation, idempotency, and provider-record verification.
* **State:** Fixed; the legacy Edge Function is deployed as a fail-closed handler and returned HTTP 403 during hosted verification.

## High

### H-01 — Public `users` policy exposes private columns

* **Involved:** `002_rls_policies.sql`, `Public can view user profiles`; `frontend/src/lib/users.ts`; `frontend/src/pages/Profile.tsx`.
* **Issue:** RLS is row-based. `USING (true)` permits anonymous reads of all selectable columns, including email, phone, postcode, admin status, last-seen data, address rules, and Stripe identifiers. Frontend code previously requested `*` and rendered email/phone publicly.
* **Risk:** Contact gating can be bypassed through direct REST queries; users/admins can be enumerated and provider identifiers disclosed.
* **Recommended fix:** Expose an allowlisted public-profile view/RPC and remove anonymous SELECT from the base table. Keep self/admin reads separately scoped.
* **State:** Fixed in migration [023_add_public_profile_boundary.sql](file:///F:/TradieHubAU/supabase/migrations/023_add_public_profile_boundary.sql) and frontend query/contact-gate alignment. Frontend job, application, and review hydration performs separate allowlisted `public_profiles` lookups because PostgREST cannot infer foreign-key relationships to the view. The migration is applied, and hosted anonymous REST checks resolved both `public_profiles` and open jobs without schema-cache errors.

### H-02 — Tradies can rewrite their applications, including status

* **Involved:** `004_applications_saved_items.sql`, `Tradies can update own applications`; later migrations replace only INSERT.
* **Issue:** UPDATE checks only `tradie_id = auth.uid()` and does not restrict columns or transitions.
* **Risk:** A tradie can attempt to accept their own application, alter linkage, or bypass customer-controlled acceptance.
* **Recommended fix:** Remove broad UPDATE and provide a narrow withdrawal RPC or immutable columns plus `pending -> withdrawn` enforcement.
* **State:** Fixed in migration [024_lock_application_updates.sql](file:///F:/TradieHubAU/supabase/migrations/024_lock_application_updates.sql), with the trigger execution-context bypass corrected in [028_finalize_critical_high_security_guards.sql](file:///F:/TradieHubAU/supabase/migrations/028_finalize_critical_high_security_guards.sql); both are applied to hosted Supabase.

### H-03 — Job owners can directly spoof lifecycle states

* **Involved:** `002_rls_policies.sql`, `Owner can update jobs`.
* **Issue:** Owners can update job rows without a column allowlist or status-transition enforcement.
* **Risk:** A client can set accepted/payment-held/completed/disputed states and unlock UI behaviour without matching financial/proof state.
* **Recommended fix:** Restrict ordinary edits to open-job content and move lifecycle transitions behind authorized RPCs and transition guards.
* **State:** Fixed in migration [025_lock_job_lifecycle_updates.sql](file:///F:/TradieHubAU/supabase/migrations/025_lock_job_lifecycle_updates.sql) by replacing the broad owner UPDATE policy with open-job-only editing and a content-field allowlist trigger; lifecycle and system fields remain available only to trusted RPC/service-role/admin operations. Applied to hosted Supabase.

### H-04 — Completion approval can bypass an open dispute

* **Involved:** Latest `public.approve_job_completion` in `011_variation_funding_safety.sql`.
* **Issue:** The RPC permits both `completed_pending_review` and `disputed` states.
* **Risk:** A customer can call it directly during a dispute and release the full amount, bypassing admin resolution.
* **Recommended fix:** Permit customer approval only from `completed_pending_review`; require admin resolution from `disputed`.
* **State:** Fixed in migration [026_block_completion_approval_during_disputes.sql](file:///F:/TradieHubAU/supabase/migrations/026_block_completion_approval_during_disputes.sql). Customer approval is restricted to `completed_pending_review`, active/open disputes fail closed, payment must still be held and unsettled, and approval/dispute creation share a job-row lock while admin resolution remains unchanged. Applied to hosted Supabase.

### H-05 — Admin dispute queries lack admin RLS on jobs/payments

* **Involved:** Admin policies in `009`/`015`; jobs/payment policies in `002`/`003`; admin dispute frontend.
* **Issue:** Admin policies exist for issues, proofs, ledger, and verifications, but no committed admin SELECT policies exist for `jobs` or `payments`.
* **Risk:** An admin who is not a participant can receive incomplete case data, encouraging unsafe workarounds.
* **Recommended fix:** After C-01, add narrowly scoped admin SELECT and test a dedicated non-participant admin.
* **State:** Fixed in migration [027_add_admin_dispute_read_policies.sql](file:///F:/TradieHubAU/supabase/migrations/027_add_admin_dispute_read_policies.sql). Authenticated platform admins receive SELECT-only access to `jobs` and `payments` rows anchored to an existing ongoing or resolved `job_issues` case; non-case rows, non-admin participant boundaries, and all mutation permissions remain unchanged. Applied to hosted Supabase.

### H-06 — Email Edge Function accepts arbitrary recipient and HTML

* **Involved:** `supabase/functions/send-email/index.ts`.
* **Issue:** It accepts caller-controlled `to`, `subject`, and `html` without application authorization, a trusted internal signature, or rate limiting.
* **Risk:** If deployed, permitted callers can abuse Resend for spam/phishing and consume quota.
* **Recommended fix:** Make it internal-only, use template/event identifiers, validate trusted origin/actor, and rate-limit.
* **State:** Fixed by disabling the legacy `send-email` function with a fail-closed HTTP 403 response. The deployed handler does not parse recipient/subject/HTML input, read provider secrets, or call an email provider; its hosted probe returned HTTP 403. Production notifications remain deferred to v0.7.x.

### H-07 — Webhook handlers trust caller-supplied records

* **Involved:** `handle-new-message/index.ts` and `handle-new-proposal/index.ts`.
* **Issue:** Both accept a supplied `record`, use service-role reads/actions, and do not validate webhook origin.
* **Risk:** Forged requests can trigger notifications, service-role reads, and resource consumption.
* **Recommended fix:** Authenticate webhook origin, re-read records by ID, and authorize the referenced event.
* **State:** Fixed by disabling both legacy handlers with fail-closed HTTP 403 responses. The deployed `handle-new-message` and `handle-new-proposal` handlers do not parse caller-supplied records, read service-role credentials/data, or invoke `send-email`; both hosted probes returned HTTP 403. Authenticated notification/webhook automation remains deferred to v0.7.x.

### H-08 — Payment Edge Functions use legacy schema/incomplete linkage checks

* **Involved:** `payment-sheet/index.ts` and `stripe-webhook/index.ts`.
* **Issue:** They refer to `proposals`, `assigned_tradie_id`, and `in_progress` while current migrations use applications/payments and different states. Payment sheet does not prove supplied `jobId` matches the proposal/owner; webhook ignores important database errors.
* **Risk:** A payment can be linked incorrectly in a compatible legacy schema, or current-schema operations can fail/inconsistently update financial state.
* **Recommended fix:** Keep disabled for simulated payments. Rebuild under v0.2.x with current schema, ownership/linkage checks, idempotency, and reconciliation.
* **State:** Fixed by disabling both legacy real-payment functions with fail-closed HTTP 403 responses. The deployed `payment-sheet` no longer reads provider/client values or creates payment intents, and the deployed `stripe-webhook` no longer reads secrets/events or mutates jobs/payments; both hosted probes returned HTTP 403. Real provider settlement, signed webhooks, chargebacks, reconciliation, receipts, and payouts remain deferred to v0.2.x Real Payments Foundation.

## Medium

### M-01 — Direct proof/dispute INSERT bypasses RPC lifecycle validation

* **Involved:** `009_quote_and_payment_lifecycle.sql` INSERT policies; latest RPCs in `017` and `018`.
* **Issue:** Direct inserts validate participant ownership but not all job-state, timing, attachment, and transition rules enforced by RPCs.
* **Risk:** Participants can create inconsistent or duplicate records by bypassing RPCs.
* **Recommended fix:** Make inserts RPC-only or enforce every invariant in constraints/triggers.
* **State:** Fixed in migration [029_harden_proof_dispute_inserts.sql](file:///F:/TradieHubAU/supabase/migrations/029_harden_proof_dispute_inserts.sql) — direct client INSERT policies dropped from both tables; `UNIQUE(job_id)` constraint added to `job_completion_proofs`; partial unique index `uq_open_issue_per_job` added to `job_issues`; `submit_completion_proof` RPC updated with explicit idempotency guard. Pending live/manual verification. v0.0.17 in progress / unapproved.

### M-02 — Variation policies allow direct workflow manipulation

* **Involved:** `009_quote_and_payment_lifecycle.sql`, variation INSERT/UPDATE policies.
* **Issue:** Direct access is broader than variation RPC rules and does not protect every amount, linkage, and status field.
* **Risk:** Participants can create or mutate unfunded/misleading variation state.
* **Recommended fix:** Make mutations RPC-only or enforce immutable fields/transitions in the database.
* **State:** Source-remediated in migration `030_lock_variation_writes.sql` — direct INSERT/UPDATE policies dropped; partial unique index `uq_pending_variation_per_contract` added. Pending live/manual verification.

### M-03 — Storage upload paths are insufficiently bound to uploader/lifecycle

* **Involved:** Storage INSERT policies in `009` and `018`.
* **Issue:** Completion uploads validate path segment 2 but not the `jobs/` prefix, uploader segment, or state. Dispute uploads validate customer/job but not uploader segment or review/dispute state.
* **Risk:** Authorized users can upload into misleading namespaces, weakening attribution/evidence integrity.
* **Recommended fix:** Enforce `jobs/<job>/<uid>/<uuid>` and `disputes/<job>/<uid>/<uuid>`, every path segment, and allowed state.
* **State:** Source-remediated in migration `031_harden_completion_dispute_storage_paths.sql` — completion/dispute uploads now require exact prefixes, four-segment paths, matching authenticated uploader IDs, authorised job actors, and eligible lifecycle/payment state. Pending live/manual verification.

### M-04 — Verification record URL is not tied to submitter prefix

* **Involved:** `003_phase3_trust_money.sql` verification INSERT; storage policies in `008`.
* **Issue:** Storage is scoped to `verifications/users/<auth.uid()>`, but the table policy does not require `document_url` to match that prefix.
* **Risk:** A known foreign object path could be submitted for admin review.
* **Recommended fix:** Derive and validate paths in a submission RPC.
* **State:** Deferred.

### M-05 — Message/conversation UPDATE policies are too broad

* **Involved:** `002_rls_policies.sql`, conversation/message UPDATE policies.
* **Issue:** Participants can update rows without column restrictions; message UPDATE is based on conversation membership, not authorship.
* **Risk:** A participant may alter other messages, sender metadata, or conversation linkage, undermining evidence integrity.
* **Recommended fix:** Restrict updates to explicit fields such as read state; preserve sender/content and participant linkage.
* **State:** Deferred.

### M-06 — Review creation does not prove completed participant relationship

* **Involved:** `002_rls_policies.sql`, `Users can create reviews`.
* **Issue:** It checks only `reviewer_id = auth.uid()`, not completed-job participation or counterparty linkage.
* **Risk:** Users can submit reviews for unrelated users/jobs if identifiers are known.
* **Recommended fix:** Enforce completed participation, counterparty, and uniqueness in an RPC/constraint.
* **State:** Deferred.

## Low

### L-01 — `is_admin(uuid)` supports arbitrary-user checks

* **Involved:** `015_fix_admin_access_blockers.sql`.
* **Issue:** Execute is granted to `public`/`authenticated`, and any UUID can be supplied.
* **Risk:** Admin enumeration when IDs are known. C-01 is the primary admin risk.
* **Recommended fix:** Prefer checking `auth.uid()` and narrow grants.
* **State:** Deferred.

### L-02 — Frontend falls back to a hosted project

* **Involved:** `frontend/src/lib/supabase.ts`.
* **Issue:** Missing environment variables cause a warning, then a committed hosted URL/publishable-key fallback.
* **Risk:** A misconfigured build can connect to the wrong project. The publishable key is not a service-role secret.
* **Recommended fix:** Fail closed outside an explicit local/demo mode.
* **State:** Deferred to avoid changing environment behaviour.

### L-03 — Local auth defaults are weak for production

* **Involved:** `supabase/config.toml`.
* **Issue:** Local settings include a six-character password minimum and development-oriented confirmation/captcha settings.
* **Risk:** Unsafe if copied unchanged to production.
* **Recommended fix:** Review hosted password, confirmation, recovery, rate-limit, and bot-protection settings before beta.
* **State:** Accepted locally; production check deferred.

### L-04 — Sensitive RPC EXECUTE grants are not explicit

* **Involved:** Security-definer functions in migrations `008`–`018`.
* **Issue:** Apart from `is_admin`, migrations do not consistently revoke default `PUBLIC` execution and grant intended roles.
* **Risk:** RPCs may be callable by broader roles than intended; internal checks protect some but not C-03.
* **Recommended fix:** Explicitly revoke/grant every RPC and test as `anon`, `authenticated`, and service role.
* **State:** Deferred; inspect live grants first.

## Pass / No issue found

* No literal service-role, Stripe secret, Resend secret, PEM, or private-key value was found in tracked source. Edge Functions read secrets from environment variables. The committed fallback is a publishable client key.
* Ignore rules cover `.env`, `.env.*`, `*.env`, and local variants. Only `frontend/.env.example` is tracked.
* Migration `016` creates `completion_proofs` as private with a 5 MB limit and image/PDF MIME allowlist.
* Verification storage policies in `008` scope user reads/uploads to `verifications/users/<auth.uid()>` and admins to `is_admin`; C-01's admin-field protection is now applied through migration `019`.
* Latest completion RPC (`017`) checks authenticated payment payee and payment-held state.
* Latest dispute RPC (`018`) checks authenticated job customer and completion-review state.
* Dispute resolution (`011`) checks admin, disputed state, held funds, resolution type, and split bounds; C-01's admin-field protection is now applied.
* Quote acceptance (`010`) checks job customer, open state, application/job linkage, and positive estimate. Migrations `022`, `024`, and `028` close the direct payment/application policy weaknesses identified by C-04/H-02.
* Frontend admin routes are guarded for navigation/UI, but are correctly not treated as the security boundary.

## Remaining deferred verification

* Run a dedicated direct SQL/REST/RPC role matrix beyond the completed browser regression, including anonymous, unrelated customer/tradie, participant, and dedicated-admin sessions.
* Confirm the `verifications` bucket exists and is private; no committed migration creates it.
* Confirm `completion_proofs` effective storage policies and signed URL behaviour against wrong-user sessions as part of the deferred storage findings.
* Inspect remaining RPC grants and policies while addressing Medium/Low findings, particularly variations, messages, reviews, and direct proof/dispute inserts.
* Verify clean-reset migration compatibility before beta preparation.

## Critical/High remediation record

Critical/High remediation was completed through migrations `019`–`028`, the safe public-profile frontend hydration changes, and deployment of the six fail-closed legacy Edge Functions. The linked hosted migration list, public schema-cache access, function probes, production frontend build, and user core browser regression passed.

Real provider settlement, webhook reconciliation, chargebacks, and real receipts remain deferred to v0.2.x Real Payments Foundation. Security changes for the simulated workflow should be delivered as separately approved focused migrations with role-based regression tests.
