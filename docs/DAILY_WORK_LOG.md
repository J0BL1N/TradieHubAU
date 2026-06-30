# TradieHubAU Daily Work Log

Single ongoing project-history log. Entries are based on committed git history, file timestamps, and docs present in this repo.

## 2026-06-30

### In-Progress Job Details UI Polish

| Item | Notes |
| --- | --- |
| Area | In-Progress Job Details UI Polish |
| Summary | Simplified accepted/in-progress job details into a clearer customer-first layout, reduced duplicate payment/status sections, moved technical details into secondary/collapsible areas, and improved mobile readability. |
| Migrations required | None. |
| Manual QA status | Manual QA still required; not approved until Jay confirms. |

### Job Details Sub-Nav Polish

| Item | Notes |
| --- | --- |
| Area | Job Details Sub-Nav Polish |
| Summary | Moved accepted/in-progress job detail sections into a cleaner sub-nav/tab layout with Overview, Quote, Payment, Requests, Evidence, and History, reducing stacked technical clutter while preserving all actions. |
| Migrations required | None. |
| Manual QA status | Manual QA still required; not approved until Jay confirms. |

## 2026-06-24

### Completed

* 00:08:54 - v0.0.13 - commit `0aed1b9` - admin dashboard polish: toast/confirm modals, dispute layout fix, evidence images, stats tile; docs/ROADMAP.md and README.md updated.
* 00:22:03 - v0.0.13 - commit `30f900e` - replaced dispute slider with resolution console; docs/ROADMAP.md updated.
* 00:54:40 - v0.0.14 - commit `28f317e` - added admin dispute case management pages; docs/ROADMAP.md updated.
* 01:01:38 - v0.0.14 - commit `46b73c1` - improved global text readability.
* 01:16:05 - v0.0.14 - commit `e94c425` - reduced unnecessary Supabase refetching; docs/ROADMAP.md updated.
* 01:21:55 - v0.0.13 - commit `b9ceb32` - admin/payment/disputes fixes.
* 01:27:05 - docs - commit `4874000` - added real payment QA backburner tests; docs/ROADMAP.md updated.
* 01:29:37 - docs - commit `4f5ca26` - added v0.0.15 manual QA checklist; docs/ROADMAP.md updated.
* 01:34:16 - docs - commit `7d36b57` - updated v0.0.15 QA checklist with known passes.
* 01:46:05 - v0.0.16 - commit `cdac94d` - added security/RLS/storage/privacy audit; docs/SECURITY_AUDIT_v0.0.16.md and docs/ROADMAP.md updated.
* 01:59:39 - v0.0.16 C-01 - commit `fafb95b` - protected privileged user profile fields; migration `019_protect_user_fields_trigger.sql`; docs updated.
* 02:10:07 - v0.0.16 C-02 - commit `60b0fe5` - corrected proof/dispute RLS correlation; migration `020_fix_proof_dispute_rls_shadowing.sql`; docs updated.
* 02:14:18 - v0.0.16 C-03 - commit `e31134f` - secured simulated payment funding RPC; migration `021_secure_simulate_payment_funding_rpc.sql`; docs updated.
* 02:17:26 - v0.0.16 C-04 - commit `2c4cac6` - blocked direct client payment inserts; migration `022_block_direct_client_payment_inserts.sql`; docs updated.
* 02:21:49 - v0.0.16 C-05 - commit `ea909d0` - secured release payout Edge Function; docs updated.
* 02:32:54 - v0.0.16 H-01 - commit `863b529` - added safe public profile boundary; migration `023_add_public_profile_boundary.sql`; docs updated.
* 14:42:40 - v0.0.16 H-02 - commit `6274953` - locked application update transitions; migration `024_lock_application_updates.sql`; docs updated.
* 16:41:51 - v0.0.16 H-03 - commit `4efe5eb` - locked job lifecycle updates; migration `025_lock_job_lifecycle_updates.sql`; docs updated.
* 16:56:03 - v0.0.16 H-04 - commit `a86f56c` - blocked completion approval during disputes; migration `026_block_completion_approval_during_disputes.sql`; docs updated.
* 18:15:52 - v0.0.16 H-05 - commit `d3b6d9b` - added admin dispute read policies; migration `027_add_admin_dispute_read_policies.sql`; docs updated.
* 18:25:29 - v0.0.16 hotfix - commit `d7ba126` - fixed public profile lookups for jobs; docs updated.
* 18:39:48 - v0.0.16 H-06 - commit `a0a6527` - secured send-email Edge Function; docs updated.
* 18:43:31 - v0.0.16 H-07 - commit `d99654b` - secured legacy webhook handlers; docs updated.
* 19:09:11 - v0.0.16 H-08 - commit `c516304` - disabled legacy payment Edge Functions; docs updated.
* 19:21:04 - v0.0.16 review - commit `064600d` - verified critical/high security fixes; migration `028_finalize_critical_high_security_guards.sql`; docs updated.
* 19:59:38 - docs - commit `0c331d1` - approved v0.0.16 critical/high security pass in docs.
* 20:23:16 - v0.0.17 M-01 - commit `e3cce58` - hardened proof/dispute inserts; migration `029_harden_proof_dispute_inserts.sql`; docs updated.
* 21:24:03 - v0.0.17 M-02 - commit `6f4afd4` - locked variation writes; migration `030_lock_variation_writes.sql`; docs updated.
* 22:06:38 - v0.0.17 M-03 - commit `c7fa187` - hardened completion/dispute storage upload paths; migration `031_harden_completion_dispute_storage_paths.sql`; docs updated.
* 22:11:22 - v0.0.17 M-04 - commit `c8351e0` - hardened verification document URL ownership; migration `032_harden_verification_document_urls.sql`.
* 22:19:14 - v0.0.17 M-05 - commit `25f0fc5` - locked message and conversation updates; migration `033_lock_message_conversation_updates.sql`.
* 22:41:58 - v0.0.17 M-06 - commit `a2ad657` - hardened review creation; migration `034_harden_review_creation.sql`; docs/ROADMAP.md updated.
* 22:44:48 - v0.0.17 L-01 - commit `2e0b6d1` - narrowed admin helper checks; migration `035_narrow_is_admin_checks.sql`; docs/ROADMAP.md updated.

### Migrations / Deployments

* `019_protect_user_fields_trigger.sql` through `028_finalize_critical_high_security_guards.sql` - created/modified on 2026-06-24; docs/SECURITY_AUDIT_v0.0.16.md and docs/ROADMAP.md say these were applied/verified on hosted Supabase.
* `029_harden_proof_dispute_inserts.sql` - created 20:21:58; docs/ROADMAP.md says hosted and manually confirmed, but docs/SECURITY_AUDIT_v0.0.16.md still says pending live/manual verification.
* `030_lock_variation_writes.sql` - created 21:09:46; docs/ROADMAP.md says hosted and manually confirmed, but docs/SECURITY_AUDIT_v0.0.16.md still says pending live/manual verification.
* `031_harden_completion_dispute_storage_paths.sql` - created 22:05:53; docs/ROADMAP.md says hosted and manually confirmed, but docs/SECURITY_AUDIT_v0.0.16.md still says pending live/manual verification.
* `032_harden_verification_document_urls.sql` - created 22:10:50; docs/ROADMAP.md says hosted and manually confirmed; docs/SECURITY_AUDIT_v0.0.16.md still says M-04 deferred.
* `033_lock_message_conversation_updates.sql` - created 22:18:36; docs/ROADMAP.md says hosted and manually confirmed; docs/SECURITY_AUDIT_v0.0.16.md still says M-05 deferred.
* `034_harden_review_creation.sql` - created 22:40:53; docs/ROADMAP.md says hosted and manually confirmed; docs/SECURITY_AUDIT_v0.0.16.md still says M-06 deferred.
* `035_narrow_is_admin_checks.sql` - created 22:43:59; docs/ROADMAP.md says hosted, anonymously probed, and manually confirmed.

### Validation

* v0.0.16 Critical/High security pass - docs/SECURITY_AUDIT_v0.0.16.md says source remediation, hosted verification, and user core browser regression passed.
* v0.0.17 Medium/Low security pass - docs/ROADMAP.md says approved/passed, hosted where applicable, manually confirmed, frontend production build passed, and hosted migrations `001`-`036` aligned.
* Direct evidence from local commands for Supabase db push/function deploy was not found in repo logs; deployment status above is from committed docs, not command output.
* Current git status before creating this log was clean.

### Remaining / Next

* M-01 through M-06 - confirmed done in docs/ROADMAP.md; docs/SECURITY_AUDIT_v0.0.16.md is stale for these items and should be reconciled if that audit remains a status source.
* v0.0.18 - in progress/unapproved foundation work appears next in docs/ROADMAP.md.
* v0.1.0 Controlled Local Beta Prep - not ready; remains the next confirmed roadmap phase after remaining prep/foundation work and separate approval.
* Real payments, GST/accounting, production launch, and notification automation remain deferred/not approved.

## 2026-06-25

### Completed

* 00:00:05 - v0.0.17 L-02 - commit `8c12d58` - frontend fails closed on missing Supabase env; docs/ROADMAP.md updated.
* 00:03:45 - v0.0.17 L-03 - commit `99b2265` - documented production auth settings checklist; docs/ROADMAP.md and docs/SECURITY/PRODUCTION_AUTH_CHECKLIST.md updated.
* 00:08:50 - v0.0.17 L-04 - commit `ca5399e` - made RPC execute grants explicit; migration `036_explicit_rpc_execute_grants.sql`; docs/ROADMAP.md updated.
* 00:11:00 - v0.0.17 closeout - commit `0772de2` - closed out v0.0.17 security remediation; docs/ROADMAP.md updated.
* 00:24:54 - v0.0.18 foundation - commit `873b829` - added beta prep foundation pages; docs/ROADMAP.md updated.
* 00:46:22 - v0.0.18 messaging foundation - commit `55f40ab` - added job messaging foundation; migration `037_job_messaging_foundation.sql`; docs/ROADMAP.md updated.
* 20:42:18 - roadmap priority decision - set near-term feature sequence as v0.0.18 Job Messaging Foundation, v0.0.19 Invoicing Foundation, and v0.0.20 Website Analytics Foundation; v0.0.18 remains in progress/unapproved and v0.1.0 remains not ready.
* 21:00:15 - v0.0.18 messaging usability pass - added active-conversation Supabase Realtime handling and Enter-to-send with Shift+Enter newline behavior; v0.0.18 remains in progress/unapproved.
* 21:07:43 - v0.0.18 messaging usability pass 1B - added lightweight emoji composer palette with cursor-position insertion; v0.0.18 remains in progress/unapproved.
* 21:35:57 - v0.0.18 messaging attachments foundation - added private message attachment bucket/table/RLS/storage policies and `send_job_message_with_attachments` RPC; frontend upload/gallery remains pending.
* 21:53:14 - v0.0.18 messaging attachments frontend - added image picker validation, private bucket uploads, signed thumbnails, and per-message lightbox; v0.0.18 remains in progress/unapproved.
* 22:03:08 - v0.0.18 messaging attachments bugfix - guarded empty attachment storage path arrays and replaced raw signed URL failures with a friendly attachment refresh message.
* 22:21:07 - v0.0.18 messaging scroll/pagination - added latest-10 opening, older-message pagination, scroll preservation, new-message handling, and a temporary 1,000-message cap per conversation.
* 22:26:23 - beta testing account tooling - focused fake beta profile locations and scenarios on South East Melbourne suburbs; dry-run only, no hosted users created.

### Migrations / Deployments

* `036_explicit_rpc_execute_grants.sql` - created 00:07:01, modified 00:07:29; docs/ROADMAP.md says hosted and manually confirmed.
* `037_job_messaging_foundation.sql` - created 00:44:41; linked hosted migration list on 2026-06-25 shows remote `037` applied. No db push was needed.
* `039_enable_message_realtime.sql` - created/applied on 2026-06-25; adds `public.messages` to `supabase_realtime` for live active-conversation updates.
* `040_message_attachments_foundation.sql` - created/applied on 2026-06-25; adds private `message_attachments` storage, `public.message_attachments`, participant-only RLS/storage policies, and trusted attachment message RPC.
* `041_message_pagination_cap.sql` - created/applied on 2026-06-25; enforces the temporary beta 1,000-message cap per conversation in message send RPCs.

### Validation

* v0.0.17 closeout - docs/ROADMAP.md says hosted migrations `001`-`036` aligned and production build passed.
* v0.0.18 job messaging foundation - hosted migration `037` confirmed applied on 2026-06-25 via `supabase migration list --linked`; linked catalog query confirmed `conversations_unique_job_pair`, the job participant message/conversation policies, and `list_job_conversations`, `open_job_conversation`, and `send_job_message`. Manual browser QA remains not confirmed.

### Remaining / Next

* v0.0.18 - in progress/unapproved; docs/ROADMAP.md prioritizes job messaging foundation and says v0.1.0 remains not ready.
* v0.1.0 Controlled Local Beta Prep remains next confirmed roadmap phase; not approved.

## 2026-06-27

### Completed

* v0.0.18 messaging scroll fix - commit `8fd7169` - made active message threads force bottom scroll after initial load/conversation switch/refetch/sends and after attachment images load, while preserving older-message pagination position; v0.0.18 remained in progress/unapproved.
* v0.0.18 lifecycle system messages - commit `8ce8818` - added trusted immutable job conversation system messages for quote acceptance, payment funding, completion proof, approval/release, dispute opening, and admin dispute actions; removed stale direct-user message links; v0.0.18 is implementation-complete and awaiting manual review, not approved.
* 19:40:32 - v0.0.18 message-load resilience - made read-status update failures non-blocking after messages load and kept null-sender system messages safe in the thread; v0.0.18 remains awaiting manual review, not approved.
* 19:54:26 - v0.0.18 messaging job details UX - added a read-only in-page Job Details panel to the active message thread header, loading job/payment/public participant details without exposing locked contact fields; v0.0.18 remains awaiting manual review, not approved.
* 20:01:35 - v0.0.18 job detail deep links - added dynamic `/jobs/:jobId` route and wired Messages `Open Full Job` to the active conversation job; v0.0.18 remains awaiting manual review, not approved.
* 21:40:30 - public jobs guest loading fix - added migration `043_allow_anon_is_admin_policy_evaluation.sql` so guest `public_profiles` RLS checks can evaluate `is_admin(auth.uid())` as false, and replaced raw jobs-board load errors with a friendly message.

### Migrations / Deployments

* `042_lifecycle_system_messages.sql` - created on 2026-06-27 in commit `8ce8818`; adds immutable system message fields/helper and wires lifecycle/admin RPCs for trusted system timeline messages. Applied/verified on the linked Supabase database on 2026-06-27 with `npx supabase db push` and `npx supabase migration list` showing `042 | 042 | 042`; local Docker-backed Supabase was not running, so local DB verification was unavailable.
* `043_allow_anon_is_admin_policy_evaluation.sql` - created/applied on 2026-06-27; linked Supabase migration list shows `043 | 043 | 043`.

### Validation

* Messaging scroll fix - frontend production build passed; lint still had known pre-existing app-wide debt.
* Lifecycle system messages - frontend production build passed; lint still had known pre-existing app-wide debt. Supabase CLI was not available in the shell, so migration parser/lint validation was unavailable.
* Message-load resilience - frontend production build passed; lint still had known pre-existing app-wide debt.
* Messaging job details UX - frontend production build passed; `git diff --check` passed with line-ending warnings only.
* Job detail deep links - frontend production build passed; `git diff --check` passed with line-ending warnings only; lint still had known pre-existing app-wide debt.
* Public jobs guest loading fix - anonymous REST probe for open jobs passed without `is_admin` permission errors; frontend production build passed; `git diff --check` passed with line-ending warnings only; lint still had known pre-existing app-wide debt.

### Remaining / Next

* v0.0.18 - implementation complete / awaiting manual review; docs/ROADMAP.md says v0.1.0 remains not ready.
* Manual browser QA still needs to confirm message threads load against the target environment after migration `042` and that read-status warning behavior is non-blocking.

## 2026-06-28

### Completed

| Time | Area | Commit | Summary |
| --- | --- | --- | --- |
| 00:46:40 | Branding | `3baecf4` | Updated TradieHubAU logo/header branding and favicon assets. |
| 01:06:39 | Branding | `25a9cb1` | Replaced the browser tab favicon/icon with the final provided icon. |
| 01:18:20 | Auth | `1cf0e20` | Added Google OAuth sign-in/sign-up UI, `/auth/callback`, and setup notes. |
| 01:30:45 | Auth | `d6d26fd` | Redirected users to `/login` after successful logout from desktop and mobile nav. |
| 01:38:42 | Supabase security | `cc658b7` | Added pass 1 security lint hardening migration for `is_admin`, admin RPCs, simulation RPCs, and function search paths. |
| 02:02:02 | Supabase security | `6b707b1` | Added pass 2 audit doc classifying remaining `SECURITY DEFINER` RPC Advisor warnings. |
| 02:31:06 | Profile trust | `8234397` | Added profile trust foundation: avatar upload, public tradie fields, previous work portfolio, safe public tradie route, real reviews, and opt-in completed work gallery foundation. |
| 02:48:18 | Profile trust | `d1bca28` | Added public completion proof publishing for eligible completed/released job proof images with public-safe metadata and profile gallery controls. |
| 03:15:43 | Profile trust hotfix | `3e888ea` | Added idempotent live schema/storage repair migration for profile media, portfolio items, public profile fields, and completion proof gallery RPCs. |
| In progress | Profile trust deploy | this commit | Added copy-paste Supabase SQL Editor deployment pack for the live profile trust repair migration and verification checks. |
| In progress | Profile avatar polish | this commit | Refresh profile and header avatar state immediately after successful profile photo upload. |
| In progress | Job posting polish | this commit | Added post-job review confirmation and database quote-lock rule for core job edits after tradie quotes exist. |
| In progress | Job posting media | this commit | Added private workspace/problem photos for posted jobs and simplified customer budget input to estimated budget plus budget type. |
| In progress | Job location structure | this commit | Added structured suburb/state/postcode job fields, local suburb autocomplete foundation, compatibility writes, and suburb/state-only public displays. |
| In progress | Job location selector | this commit | Replaced suburb-first job posting with Australia-wide state, region/council area, suburb, and postcode selector backed by a generated public postcode dataset. |
| In progress | Verification storage hotfix | this commit | Added private `verifications` storage bucket repair migration for identity and tradie credential uploads. |
| In progress | Admin verification | this commit | Grouped identity and tradie proof review into one tradie approval case and kept approved credential rows visible until final tradie whitelisting. |
| In progress | Verification UI polish | this commit | Replaced applicant document-type dropdowns with explicit upload cards and converted tradie admin approval cases from a table to case review cards. |
| In progress | Application guard | this commit | Blocked job owners from quoting/applying on their own jobs in the UI and applications insert policy. |
| 00:10:00 | Completed work portfolio | this commit | Switched tradie profile completed work to real completed/released TradieHubAU jobs with opt-in proof images, safe public job metadata, and no manual portfolio upload UI. Changed files: Profile.tsx, profileTrust.ts. No new migration added; build passed; no live Supabase action required. |
| In progress | Migration cleanup | this commit | Renamed `054_completed_work_portfolio_foundation.sql` to `058_completed_work_portfolio_foundation.sql` with no schema logic change; frontend build passed; live Supabase should run `058_completed_work_portfolio_foundation.sql`, not the old duplicate `054`. |
| In progress | Real job reviews | this commit | Added customer-to-tradie reviews for completed/released jobs only; changed files include `Jobs.tsx`, `PublicTradieProfile.tsx`, `Profile.tsx`, `BrowseTradies.tsx`, `reviews.ts`, and migration `059_real_job_reviews.sql`; frontend build passed. |
| In progress | Review privacy rules | this commit | Public review RPCs expose rating, optional text, safe customer display/avatar, submitted date, job category, suburb, and state only; customer contact details, street addresses, payment details, private messages, dispute evidence, and admin notes remain excluded. Known limitation: review UI/RPCs require live Supabase migration `059_real_job_reviews.sql`. |
| In progress | Review completion prompt | this commit | Review modal now opens automatically after customer accepts job completion, while keeping the manual review button as fallback; changed files: `Jobs.tsx`, `DAILY_WORK_LOG.md`; no migration added and no live Supabase action required. |
| In progress | Beta customer job seed | this commit | Created `private/beta/seed_jobs_customer_75eb01aa.sql` to insert 10 idempotent open beta jobs for customer `75eb01aa-fb92-410e-89ba-f0bb37e7efa8`; no migration added; frontend build passed; live Supabase action required is manual SQL Editor execution only. |
| In progress | Jobs page completed split | this commit | Added one user-facing `Completed Jobs` tab using existing `completed` job plus `released` payment criteria, removed completed/released work from active My Jobs, compacted My Jobs/Completed cards, kept Open Jobs layout mostly unchanged; changed files: `Jobs.tsx`, `DAILY_WORK_LOG.md`; no migration or live Supabase action required. |
| 20:31:21 | Job Location & Schedule | 7c2579d | Polish post job schedule fields: Renamed 'Region / Council Area' to 'Region', improved desktop grid columns layout to 4 columns, set preferred start date & time to datetime-local input with 15-minute increments (step=900), and updated region validation error message. |
| 20:38:00 | Location Filters | this commit | Updated browse/search location filters in Jobs.tsx to support State, Region, and Suburb cascading selects. Deferred Browse Tradies due to lacking reliable region/suburb profile fields. |
| 20:50:00 | Tradie Directory Access | this commit | Restored public tradie directory access by resetting public.public_profiles to security definer mode (security_invoker = false), enabling guests and customers to view safe sanitized profiles. |
| 00:20:00 | Website Analytics Foundation | this commit | Implemented website analytics foundation for admin users. Created get_admin_analytics RPC, added tab-switching logic to Admin.tsx, and displayed Marketplace Snapshot, Job Funnel, and Beta Activity indicators with All-time/30-day/7-day windows. |
| 00:30:00 | Admin Analytics Polish | this commit | Polished admin marketplace analytics with 30s silent background auto-refresh interval, a Last Updated timestamp, a manual Refresh button, live activity strip (pulsating indicator), Donut charts for breakdown data (User breakdown, Job Status, and Verification status), and a sorted Category horizontal bar chart. |
| 00:40:00 | Invoicing Foundation | this commit | Added safe invoicing foundation based on real completed/released platform jobs and payments. Created job_invoices table, select RLS policies, automatic trigger-based invoice generation on payment release, idempotent numbering, existing job backfills, invoices.ts helper, "View Receipt" (customer) & "View Payout Statement" (tradie) buttons on Jobs.tsx, interactive modal preview, and print stylesheets. |
| 00:20:00 | Fix Invoices Generation | this commit | Fixed trigger race condition during completion approval/payment release by moving to dual status triggers on both jobs and payments, creating ensure_job_invoices self-healing function, secure get_my_job_invoice RPC, error message overrides in Jobs.tsx, and backfill. |
| 00:20:00 | Invoice Layout Polish | this commit | Polished invoicing document layouts into a professional tax-ready preview; resolved ABN display for verified contractors, clean From/To party grids, itemized Line Item subtotal breakdowns (with net payout fee splits), and clear tax disclaimers. |
| 00:30:00 | Liveness Selfie Verification Foundation | this commit | Implemented liveness selfie verification step to strengthen identity checks. Added check constraint and approve_identity_verification updates in migration 064, updated Profile.tsx to show upload card and handle image-only files, and updated Admin.tsx to display expected challenge instructions in review queues. |
| 00:30:00 | Verification Status Upgrade | this commit | Upgraded verification status displays. Added centralized Verification Status Overview progress checklist card to user settings, updated Admin applications card to require approved liveness selfie for new whitelist applications, and maintained backwards-compatibility for existing whitelisted users. |
| In progress | Verification Expiry / Recheck Later | this commit | Added admin recheck controls for verification documents, user-facing Recheck Requested and Expired statuses for ID/liveness/tradie credentials, and migration `065_add_verification_recheck_and_expiry_fields.sql`. Changed files: `Admin.tsx`, `Profile.tsx`, `users.ts`, migration 065, `ROADMAP.md`, and this log. Privacy note: verification/liveness files remain private and no public profile, job, message, invoice, analytics, or gallery data was exposed. Existing approved tradies are not retroactively unapproved; recheck/expired documents are excluded from new whitelist readiness. Validation: `npm run build` passed; `git diff --check` passed. Live Supabase action required: run migration 065. |











### Migrations / Deployments

| Item | Status | Notes |
| --- | --- | --- |
| `044_harden_security_lint_findings_pass1.sql` | Created | Revokes anon execute on `is_admin`, keeps authenticated-only helper access, hardens admin-only RPCs, admin-gates simulation RPCs, and adds safe `search_path` on edited functions. |
| `045_profile_trust_foundation.sql` | Created | Adds public-safe tradie profile fields, portfolio table/RLS, avatar and portfolio storage buckets/policies, and default-private public completion proof gallery flag. |
| `046_public_completion_proof_publishing.sql` | Created | Adds public-safe completion proof gallery metadata, owner-only publish/unpublish RPCs, eligible-proof listing, and tighter public proof/portfolio storage policies. |
| `047_repair_profile_trust_live_schema.sql` | Created | Idempotently repairs missing live profile trust columns, public profile view fields, portfolio table/RLS, storage buckets/policies, and gallery RPC aliases after partial 045/046 application. |
| `048_lock_job_edits_after_quotes.sql` | Created | Updates the open-job edit protection trigger so owners can edit core job details only before any quote/application exists. |
| `049_job_workspace_images_and_budget_type.sql` | Created | Adds private `job_workspace_images` bucket/table/RLS, public-safe workspace image counts, and simple budget metadata while preserving `budget_min`/`budget_max`. |
| `050_structured_job_location_fields.sql` | Created | Adds structured job suburb/postcode/location label columns, indexes, validation checks, legacy backfill, and quote-lock allowlist compatibility. |
| `051_add_job_region.sql` | Created | Adds `jobs.region`, indexes it with state, and keeps the quote-lock trigger compatible with pre-quote location edits. |
| `052_fix_verification_storage_bucket.sql` | Created | Creates private `verifications` bucket and refreshes owner-upload/owner-read/admin-read verification document storage policies. |
| `053_block_self_quote_applications.sql` | Created | Recreates the verified-tradie application insert policy with an added guard that the target job owner is not the authenticated applicant. |
| `058_completed_work_portfolio_foundation.sql` | Created | Renamed from `054_completed_work_portfolio_foundation.sql` to avoid a duplicate migration number with no schema logic change; extends completed-work gallery RPCs to return safe job title/category/suburb/state/completion date, require completed/released jobs, and exclude open disputes. |
| `frontend/public/data/au-postcode-localities.json` | Created | Generated Australia-wide location selector dataset from the Matthew Proctor Australian Postcodes public-domain CSV. |
| `docs/profile-trust-live-supabase-deploy.md` | Created | Provides copy-paste SQL Editor deployment instructions, full `047` SQL, verification SQL, and expected results for live repair when CLI deployment is unavailable. |
| Supabase Advisor pass 2 | Documented | `docs/supabase-security-definer-rpc-audit.md` records why remaining authenticated `SECURITY DEFINER` warnings are expected/guarded. |
| Leaked password protection | Dashboard action required | Remaining `auth_leaked_password_protection` warning must be fixed in Supabase Dashboard, not code. |
| Post Job Polish | No migration | No database migration was added; changes are purely frontend layout, labels, and inputs. |
| Browse Location Filters | No migration | No database migration was added; filtering is executed on the client side using in-memory dataset search. |
| `057_restore_public_profiles_directory_access.sql` | Created | Resets security_invoker on public.public_profiles view and grants SELECT to anon and authenticated. |
| `059_real_job_reviews.sql` | Created | Hardens review eligibility to the original customer reviewing the contracted tradie only after job `completed`, payment `released`, and no open dispute; adds safe public review/detail and summary RPCs. Live Supabase must run this migration before the review UI/RPCs work. |
| `060_admin_analytics_rpc.sql` | Created | Adds public.get_admin_analytics RPC, checking admin role and compiling aggregate marketplace snapshot, job funnel, and beta activity metrics. |
| `061_admin_analytics_polish.sql` | Created | Extends public.get_admin_analytics RPC to support active user counters, today's logs, and user, job, verification, and category breakdowns. |
| `062_invoicing_foundation.sql` | Created | Creates job_invoices table, RLS, trigger-based invoice generation on payments release, idempotent number generation, and idempotent backfills. |
| `063_fix_invoice_generation_for_completed_jobs.sql` | Created | Replaces payment release trigger with secure ensure_job_invoices function, triggers on both jobs and payments status updates, secure get_my_job_invoice RPC, and backfills missing invoices. |
| `064_add_liveness_selfie_verification_document_type.sql` | Created | Adds liveness_selfie to verification document types check constraint and redefines approve_identity_verification function. |
| `065_add_verification_recheck_and_expiry_fields.sql` | Created | Adds nullable verification expiry/recheck metadata and tightens future auto-whitelist checks so expired or admin recheck-requested verification documents do not count for new tradie approvals. Live Supabase must run this migration. |
| Verification Status Upgrade | No migration | No database migration was added; changes are purely frontend layout, logic derivation, and checklist integration. |







### Validation

| Check | Result |
| --- | --- |
| Branding asset updates | Frontend production build passed during the branding work. |
| Google OAuth | `npm run build` passed. Manual Supabase/Google dashboard provider setup still required. |
| Logout redirect | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Supabase security pass 1 | `git diff --check` passed. SQL validation unavailable because `supabase`/`psql` were not installed and Docker daemon was not running. |
| Supabase security pass 2 | `git diff --check` passed. SQL validation unavailable for the same local tooling reason. Frontend build was not run because no frontend files changed. |
| Profile trust foundation | `npm run build` passed. SQL validation pending local tooling availability. |
| Public completion proof publishing | `npm run build` passed; `git diff --check` passed with line-ending warnings only. SQL validation unavailable because `supabase`/`psql` were not installed and Docker daemon was not running. |
| Profile trust live schema hotfix | `npm run build` passed; `git diff --check` passed with line-ending warnings only. SQL validation unavailable because `supabase`/`psql` were not installed and Docker daemon was not running. |
| Profile trust SQL deployment pack | Embedded SQL matched `047_repair_profile_trust_live_schema.sql`; `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Real job reviews | `npm run build` passed; `git diff --check` passed with line-ending warnings only. SQL validation pending local Supabase/psql availability. |
| Profile avatar refresh polish | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Post-job confirmation and quote edit lock | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Workspace images and simplified budget | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Structured job location fields | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Australia-wide location selector | `npm run build` passed; `git diff --check` passed with line-ending warnings only. Manual example locations were found in the generated selector dataset. |
| Job location & schedule polish | `npm run build` passed; layout and 15-minute step input verified. |
| Structured location browse filters | `npm run build` passed. Cascading dropdown behavior and filtering on state/region/suburb verified on client side. Deferred Browse Tradies (documented limitation). |
| Public tradie directory access | `npm run build` passed. Verified public_profiles view does not contain private fields like email/phone, ensuring safety. |
| Completed work portfolio | `npm run build` passed; verified real completed platform job visibility toggles and safe public directory details. |
| Website analytics foundation | `npm run build` passed. Verified aggregate statistics generation, time-window support, and tab-selector interface. |
| Website analytics polish | `npm run build` passed. Verified aggregate statistics generation, 30s background refresh, manual refresh, and visual SVG donut/bar breakdowns. |
| Invoicing foundation | `npm run build` passed. Verified automatic trigger-based generation, customer/tradie RLS SELECT security checks, modal document preview, and custom `@media print` layout formatting. |
| Invoice generation fix | `npm run build` passed. Verified get_my_job_invoice RPC returns correct role-filtered data, auto-heals missing invoices, and triggers on both jobs & payments table status updates. |
| Invoice layout polish | `npm run build` passed. Verified ABN and business name fields rendered from public_profiles view, subtotal / net payout divisions, and GST disclaimer. |
| Liveness selfie verification | `npm run build` passed. Verified document type check relaxes DB validations, Profile.tsx restricts inputs to JPEG/PNG/WEBP files, and Admin.tsx renders queues with instructions. |
| Verification status upgrade | `npm run build` passed. Centralized verification card added, whitelist requirements checked for new applicants, and existing whitelisted tradies remain valid. |
| Verification expiry / recheck later | `npm run build` passed; `git diff --check` passed. Admin can request document rechecks with a reason and optional expiry date; users can see and resubmit recheck-requested or expired ID/liveness/tradie credential documents. SQL validation pending local Supabase/psql availability. |








### Remaining / Next

| Item | Status |
| --- | --- |
| Google OAuth provider | Needs dashboard setup: enable Google provider, add client ID/secret, configure Supabase redirect URLs, and configure Google Cloud callback to Supabase `/auth/v1/callback`. |
| Supabase leaked password protection | Needs dashboard enablement and Advisor re-run. |
| Remaining `SECURITY DEFINER` warnings | Documented as guarded/expected in `docs/supabase-security-definer-rpc-audit.md`; no code migration needed in pass 2. |


## 2026-06-29

### Completed

| Time | Area | Commit | Summary |
| --- | --- | --- | --- |
| 15:30:00 | Phase 2 / Chunk D — Itemised Quote Lines | `391fbdb` | Added itemised quote lines database schema, constraints, RLS policies, frontend APIs, dynamic quote list builder, customer review dashboard, and legacy fallbacks. |
| 16:15:00 | Homepage Polish | `bc9a960` | Polished the hero area, improved category icon contrast, loaded real verified tradies (weekly seeded randomization), and loaded real open jobs with deep linking. |
| 17:45:00 | Homepage Category Icon Polish | `6ccb00c` | Refined the Popular Categories icon styling and colors to alternate between crisp navy and orange accents, resolving mud/low-contrast badge issues. |
| 18:30:00 | Phase 2 / Chunk E — Lock Accepted Quote Lines | `0b5f9f6` | Snapshotted accepted quote line items into an immutable table upon acceptance, locked original quote lines from edit/delete after pending status, and rendered breakdowns. |
| 19:15:00 | Phase 3 / Chunk F — Early Release Request Foundation | `1d8cf68` | Created the early release request database schema, RLS policies, context-matching insert triggers, resolved update locks, and implemented tradie request forms and customer tracking displays. |
| 20:10:00 | Phase 3 / Chunk G — Early Release Caps | `a8c2305` | Added DB-enforced early release caps, a permission-checked cap summary RPC, and UI guidance for remaining job and accepted quote line caps. |
| 20:45:00 | Phase 3 / Chunk H — Customer Approval Modal | `c9e385d` | Added customer/admin early release review RPC, hardened review field updates, and built the customer approval/rejection modal with cap context. |
| 21:30:00 | Phase 4 / Chunk I — Itemised Variation Requests | `07e9399` | Added itemised variation request tables/RPCs, typed frontend helpers, and an itemised contract variation UI without funding or invoice changes. |
| 22:05:00 | Phase 4 / Chunk J — Variation Approval + Funding Groundwork | `8a51d25` | Added customer/admin variation review RPC, immutable approved variation line snapshots, and customer variation review UI without payment movement. |
| 22:45:00 | Phase 5 / Chunk K — Final Invoice Itemisation | `61520a1` | Added trusted final document line itemisation from accepted quote snapshots and approved variation snapshots, with legacy fallback and no payment movement. |
| 23:30:00 | Phase 6 / Chunk L — Job Evidence Timeline | `d4fc10c` | Created read-only job evidence timeline RPC function, added authorization verification checks, and rendered compact bullet-style timeline card. |
| 23:45:00 | Phase 6 / Chunk M — Admin Evidence Pack | `9bc7e5b` | Created read-only get_admin_job_evidence_pack RPC function compiling full job evidence history, frontend helper, and admin panel with markdown export. |
| 23:59:00 | Phase 6 / Chunk N — Enforcement Actions | `3f25006` | Created admin enforcement actions table, user restriction columns, creation/resolution RPCs, and admin safety panel UI. |
| 23:59:59 | Phase 7 / Chunk O — Tradie Risk Controls | `511f260` | Created tradie_risk_signals table, risk score calculator RPC, and admin-only risk panel UI. |
| 23:59:59 | Security Lint Cleanup Pass | `d07a665` | Revoked PUBLIC and anon execution grants from security definer admin RPCs, internal triggers, and validations. |
| 2026-06-30 | Profile Verification Tab Polish | `52093da` | Reworked Verification tab into a compact dashboard with status overview, next action, and verification cards. |
| 2026-06-30 | Compact Completed Work Manager | `7b3a2e2` | Reworked Completed Work tab into compact gallery manager with filters, counts, compact cards, and one-card edit expansion. |
| 2026-06-30 | Fix Profile Verification Card Layout | `25c32ea` | Replaced cramped skinny verification columns with readable wide stacked cards. |
| 2026-06-30 | Polish Completed Work Controls | `2cacf93` | Wired Publish/Hide to autosave immediately, removed redundant Save, and made summary and preview controls more compact. |
| 2026-06-30 | Profile Verification Tab Redesign | `fcd3d39` | Redesigned the Verification tab into wider sectioned cards/rows for identity and tradie credentials, fixing cramped credential layout while preserving upload/recheck behavior. |
| 2026-06-30 | Profile Verification Checklist Polish | `7e81d9f` | Replaced bulky verification document cards with compact checklist rows, fixed text overlap/overflow, and expanded upload controls only for documents needing action. |
| 2026-06-30 | Profile Verification Summary Polish | `cd986ed` | Replaced the two-card verification summary with one compact status banner connected to the checklist rows. |
| 2026-06-30 | Profile Verification Summary Layout Hotfix | `f462e9f` | Fixed top verification summary text collapsing vertically by correcting flex/grid sizing and chip wrapping. |
| 2026-06-30 | Admin Credential Recheck Controls | `fda4e11` | Audited/fixed admin recheck controls so licence, insurance, and trade certificate credentials can be individually requested for recheck/resubmission. |
| 2026-06-30 | Profile Verification Summary Emergency Hotfix | `a1a41d8` | Fixed summary banner text collapse by replacing fragile layout with stable block/grid structure. |

### Migrations / Deployments

| Item | Status | Notes |
| --- | --- | --- |
| `066_add_quote_line_items.sql` | Created | Creates the quote_line_items table, CHECK constraints for positive quantities and non-negative prices, and RLS policies for tradies/customers/admins. |
| `067_lock_accepted_quote_lines.sql` | Created | Creates the accepted_quote_line_items table, trigger to copy snapshots upon status='accepted', and validation trigger to prevent modifying lines once status is not 'pending'. |
| `068_early_release_requests.sql` | Created | Creates early_release_requests table, validation triggers, and RLS policies to allow tradie requests and customer/admin views on active jobs. |
| `069_early_release_caps.sql` | Created | Enforces early release caps on insert and approval updates, adds accepted quote line linking rules, and exposes a permission-checked cap summary RPC. |
| `070_early_release_review_rpc.sql` | Created | Adds the review_early_release_request RPC and hardens early release review field/status update rules. |
| `071_itemised_variation_requests.sql` | Created | Creates itemised variation request and line-item tables, RLS, immutable line handling, and create/cancel RPCs. |
| `072_variation_approval_review.sql` | Created | Adds approved variation line snapshots, review RPC, review status rules, and RLS for approved variation lines. |
| `073_itemise_final_invoice_documents.sql` | Created | Adds trusted job invoice line items sourced from accepted quote snapshots and approved variation snapshots, updates invoice generation/RPC self-healing, and preserves legacy accepted quote fallback. |
| `074_job_evidence_timeline.sql` | Created | Creates read-only public.get_job_evidence_timeline function with secure user/admin checks and revokes public execute grants. |
| `075_admin_job_evidence_pack.sql` | Created | Creates read-only public.get_admin_job_evidence_pack function compiling job, parties, quotes, variations, early releases, payments, invoices, completion proofs, and timeline details with strict admin checks. |
| `076_admin_enforcement_actions.sql` | Created | Creates admin enforcement actions tables, user restriction columns, RPC creation/resolution helpers, and hardens application and quote RLS policies. |
| `077_tradie_risk_signals.sql` | Created | Creates the tradie_risk_signals table, RLS policies, and get_admin_tradie_risk_summary calculator RPC. |
| `078_revoke_public_execute_on_definers.sql` | Created | Revokes anon and PUBLIC execution permissions from security definer admin functions, developer simulation scripts, and trigger validations. |

## 2026-06-30

### Recent QA Hotfixes And Polish Catch-Up

| Area | Commit | Summary |
| --- | --- | --- |
| Guest jobs | `e998a77` | Fixed logged-out `/jobs` anon loading by avoiding unsafe public profile hydration. |
| Verification profile state | `e1b0eb2` | Revoked/recheck/rejected ID now shows action required and allows replacement upload. |
| Info hub navigation | `185e508` | Simplified the footer and moved help/explainer links into info hub tabs. |
| README status | `9998fff` | Updated README with current project status. |
| Info hub layout | `aab63dd` | Added a shared info hub shell so tabs/header layout stay consistent between pages. |
| Public README rewrite | `391fa99` | Rewrote README as a public/product-facing overview with internal details removed. |

### Validation / Status Notes

* Build passed for code changes where reported.
* `git diff --check` passed with CRLF warnings only.
* No Supabase migrations were required for these changes.
* Manual QA/polish is ongoing.
* These items are not marked fully approved unless Jay separately confirms browser/manual QA.

### Phase 3 / Chunk G — Early Release Caps

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/069_early_release_caps.sql`, `frontend/src/lib/earlyReleases.ts`, `frontend/src/pages/Jobs.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Cap rules implemented | Amount must be greater than $0. Accepted quote line snapshots are the source of truth where present. Modern accepted jobs with snapshots require a linked accepted quote line. Each linked request must be within that line total, and pending + approved requests for the same line cannot exceed the line total. Pending + approved job requests cannot exceed 30% of accepted contract value. Rejected and cancelled requests do not count. |
| Legacy behavior | If no accepted quote line snapshots exist, unlinked requests can use the accepted application estimate as the conservative contract source. If that estimate is missing or non-positive, early release requests are blocked with a helpful message. |
| DB validation summary | `check_early_release_caps` is called by insert validation and again when a pending request is approved. It rejects cross-job quote line links, over-line amounts, over-line pending/approved totals, and over-job-cap pending/approved totals. No payment, invoice, or release logic was changed. |
| UI summary | The early release panel shows contract total, 30% job cap, remaining job cap, selected quote-line remaining amount, and blocks visibly over-cap submissions while still relying on DB validation. |
| Privacy/security notes | Cap summary RPC is `SECURITY DEFINER`, fixed `search_path`, and only returns data to the contracted tradie, job customer, admins, or service role. Public/anon and unrelated users cannot read request/cap information. |
| Non-goals | No money release, payment status changes, final invoice changes, customer approval controls, variation work, homepage, OAuth, analytics, reviews, messaging, or portfolio changes. |
| Build result | `npm run build` passed. Vite reported the existing large chunk warning. |
| `git diff --check` result | Passed with line-ending warnings only. |
| Live Supabase action required | Apply `supabase/migrations/069_early_release_caps.sql` to the live Supabase database. |
| Commit hash after commit | Recorded in final report after push. |

### Phase 3 / Chunk H — Customer Approval Modal

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/070_early_release_review_rpc.sql`, `frontend/src/lib/earlyReleases.ts`, `frontend/src/pages/Jobs.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `070_early_release_review_rpc.sql`. |
| RPC/status update summary | Added `review_early_release_request(p_request_id, p_decision, p_review_note)` for customer/admin approval or rejection. The RPC locks the request row, requires authenticated customer/admin access, blocks non-admin tradie self-review, requires pending status, normalizes the optional review note, and updates status through the existing update trigger. |
| Cap/race safety notes | Approval locks the request row, takes a same-job transaction advisory lock, and calls `check_early_release_caps`; the hardened update trigger also takes the same lock and reruns cap validation on approved status. Rejected and cancelled requests remain excluded from caps. |
| UI summary | Customer owners see pending request review actions. The modal shows request type, title, description, amount, linked accepted quote line, job/line cap context, optional review note, and clear copy that approval does not release funds. Approved/rejected requests are read-only afterward and show review status/date/note. |
| Privacy/security notes | Review details stay in authenticated early release request surfaces only. No public profile, Browse Tradies, homepage, messaging, invoice, public job card, analytics, review, or portfolio exposure was added. |
| Non-goals | No money release, payment status changes, partial release flags, payout records, invoice itemisation changes, variations, reviews, messaging, homepage, OAuth, analytics, or portfolio changes. |
| Build result | `npm run build` passed. Vite reported the existing large chunk warning. |
| `git diff --check` result | Passed with line-ending warnings only. |
| Live Supabase action required | Apply `supabase/migrations/070_early_release_review_rpc.sql` after migration `069_early_release_caps.sql`. |
| Commit hash after commit | Recorded in final report after push. |

### Phase 4 / Chunk I — Itemised Variation Requests

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/071_itemised_variation_requests.sql`, `frontend/src/lib/variations.ts`, `frontend/src/pages/Jobs.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `071_itemised_variation_requests.sql`. |
| Schema/RLS summary | Added `job_variation_requests` headers and immutable `job_variation_line_items` with generated `line_total`. Select RLS is limited to the contracted tradie, job customer, and admins. Direct client writes are not exposed; create/cancel use RPCs. |
| Validation summary | Creation requires authenticated contracted tradie, accepted application, job status `accepted` or `payment_held`, non-empty title, at least one valid line, quantity > 0, unit price >= 0, allowed line type, and total > $0. Completed, cancelled, disputed, and review-stage jobs are blocked. |
| UI summary | Active contract details now show itemised variation requests. Contracted tradies can create/cancel pending itemised requests. Customers can view request status and itemised line breakdown with a notice that approval/funding controls come later. |
| Privacy/security notes | Variation requests are not exposed through public profiles, Browse Tradies, public job cards, homepage, invoices, reviews, analytics, messaging, or Completed Work Portfolio. |
| Non-goals | No variation funding, release, payment status changes, payout records, invoice itemisation, accepted quote snapshot changes, early release changes, reviews, messaging, homepage, OAuth, analytics, or portfolio changes. |
| Build result | `npm run build` passed. Vite reported the existing large chunk warning. |
| `git diff --check` result | Passed with line-ending warnings only. |
| Live Supabase action required | Apply `supabase/migrations/071_itemised_variation_requests.sql` after migration `070_early_release_review_rpc.sql`. |
| Commit hash after commit | Recorded in final report after push. |

### Phase 4 / Chunk J — Variation Approval + Funding Groundwork

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/072_variation_approval_review.sql`, `frontend/src/lib/variations.ts`, `frontend/src/pages/Jobs.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `072_variation_approval_review.sql`. |
| RPC/status update summary | Added `review_job_variation_request(p_variation_request_id, p_decision, p_review_note)` for customer/admin approval or rejection. The RPC requires authenticated customer/admin access, blocks non-admin tradie self-review, requires pending status, normalizes review notes, and updates reviewed metadata through the hardened trigger. |
| Approved variation snapshot summary | Added immutable `approved_variation_line_items` copied from itemised variation request lines at approval time. Snapshots store copied label, description, quantity, unit price, line total, line type, sort order, and trace back to the original request line. |
| UI summary | Customer owners can review pending variation requests in a modal, see itemised lines and total, approve/reject with an optional note, and see approved variation breakdowns after approval. Tradies see statuses, review notes, and no approval controls. |
| Privacy/security notes | Variation review details and approved snapshots are only visible to the contracted tradie, job customer, and admins. No public profile, Browse Tradies, homepage, public job card, invoice, review, analytics, messaging, or Completed Work Portfolio exposure was added. |
| Non-goals | No funding, payment movement, payment status changes, release logic, partial release flags, payout records, invoice/receipt itemisation, accepted quote snapshot changes, reviews, messaging, homepage, OAuth, analytics, or portfolio changes. |
| Build result | `npm run build` passed. Vite reported the existing large chunk warning. |
| `git diff --check` result | Passed with line-ending warnings only. |
| Live Supabase action required | Apply `supabase/migrations/072_variation_approval_review.sql` after migration `071_itemised_variation_requests.sql`. |
| Commit hash after commit | Recorded in final report after push. |

### Phase 5 / Chunk K — Final Invoice Itemisation

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/073_itemise_final_invoice_documents.sql`, `frontend/src/lib/invoices.ts`, `frontend/src/pages/Jobs.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `073_itemise_final_invoice_documents.sql`. |
| Source-of-truth summary | Final Customer Receipt and Payout Statement line items are generated server-side into `job_invoice_line_items` only from `accepted_quote_line_items` and `approved_variation_line_items`. Clients have SELECT-only access through RLS and no arbitrary invoice line insert/update/delete path. |
| Accepted quote line summary | Accepted quote snapshot lines are copied into invoice line items for each final document. Legacy completed/released jobs without snapshots receive a single fallback line labelled `Accepted quote total` using the accepted application estimate or trusted released payment amount. |
| Approved variation line summary | Approved variation snapshot lines are copied into invoice line items and displayed in a separate Approved Variations section. Pending, rejected, cancelled, unapproved, and early release requests are not invoice charge lines. |
| Legacy fallback summary | Old jobs keep a clear one-line accepted quote total instead of fake detailed labour/material lines. |
| Privacy/security notes | Invoice line item details are not public and are not exposed through public profiles, Browse Tradies, public job cards, homepage, messaging, reviews, analytics, or Completed Work Portfolio. RLS limits reads to the customer receipt owner, contracted tradie payout statement owner, and admins for completed/released jobs only. |
| Non-goals | No manual invoice line entry, arbitrary additions, payment movement, release/payout changes, payment status changes, GST support, Tax Invoice naming, reviews, messaging, homepage, OAuth, analytics, or portfolio changes. |
| Build result | `npm run build` passed. Vite reported the existing large chunk warning. |
| `git diff --check` result | Passed with line-ending warnings only. |
| Live Supabase action required | Apply `supabase/migrations/073_itemise_final_invoice_documents.sql` after migration `072_variation_approval_review.sql`. |
| Commit hash after commit | Recorded in final report after push. |

### Phase 6 / Chunk L — Job Evidence Timeline

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/074_job_evidence_timeline.sql`, `frontend/src/lib/timeline.ts`, `frontend/src/pages/Jobs.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `074_job_evidence_timeline.sql`. |
| RPC/data source summary | Created `public.get_job_evidence_timeline(p_job_id)` read-only SECURITY DEFINER RPC. Collects chronological events: Job Posted, Quote Submitted, Quote Accepted, Payment Funded, Completion Proof Submitted, Payment Released, Dispute Raised, Dispute Resolved, Variation Submitted, Variation Resolved, Early Release Submitted, Early Release Resolved, Invoice Generated. |
| Access control summary | Restricted to contracted tradie, job customer, or admin users. Revoked public execute access. |
| UI summary | Displays compact bullet-style vertical chronological timeline in Job Detail modal. |

### Phase 6 / Chunk M — Admin Evidence Pack

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/075_admin_job_evidence_pack.sql`, `frontend/src/lib/payments.ts`, `frontend/src/pages/Admin.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `075_admin_job_evidence_pack.sql`. |
| RPC/data source summary | Created `public.get_admin_job_evidence_pack(p_job_id)` compiling job summary, customer/tradie identities, accepted quote lines, variations, early releases, payments, invoices, completion proofs, disputes, and timeline. |
| Access control summary | Admin-only security barrier via explicit `public.is_admin(auth.uid())` check. Revoked public execute access. |
| UI summary | Renders a "Compile Evidence Pack" button in DisputeCaseFile. Opens a modal detailing job info, parties, contract lines, variations, early releases, payments ledgers, invoices, completion proofs, disputes history, and timeline. Includes a "Copy Case Summary" button formatting details into structured Markdown. |
| Privacy/security notes | Admin-only. No public, guest, customer, or tradie access. All details are kept inside the admin dashboard. |
| Non-goals | No enforcement actions, no risk scoring, no payment moves, no public export links. |
| Build result | `npm run build` passed. |
| `git diff --check` result | Passed. |
| Live Supabase action required | Apply `supabase/migrations/075_admin_job_evidence_pack.sql` after migration `074_job_evidence_timeline.sql`. |
| Commit hash after commit | `9bc7e5b` |

### Phase 6 / Chunk N — Enforcement Actions

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/076_admin_enforcement_actions.sql`, `frontend/src/lib/payments.ts`, `frontend/src/components/AuthProvider.tsx`, `frontend/src/pages/Admin.tsx`, `frontend/src/pages/Jobs.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `076_admin_enforcement_actions.sql`. |
| RPC/action summary | Added columns to `public.users` table for restriction periods and status flags. Created `public.admin_enforcement_actions` table, and RPC functions `create_admin_enforcement_action`, `resolve_admin_enforcement_action`, and `get_admin_user_enforcement_history` to write, resolve, and trace actions safely under strict admin verification. |
| Access control summary | RLS restricts access to admins only. Direct writes are disabled; creation/resolution requires RPC validation. Public execute permissions are revoked. |
| Enforcement effects | warnings, manual review notes, escalation/preservation flags are record-only. Verification recheck flags documents and de-whitelists instantly. Quote/Application/Review Hold set restriction timestamps on profiles, blocking users via database RLS policies. |
| UI summary | Adds "Safety Actions" buttons in Dispute Case party details, opening a modal to create enforcements. Renders safety actions logs table inside DisputeCaseFile body. Allows resolving active enforcements with notes. |
| User warning messaging | Restricted tradies attempting to apply or quote receive a clear error: "Your account is under admin review and cannot submit new quotes right now." |
| Privacy/security notes | Enforcement logs and user restriction parameters are private and not exposed to normal users, public profiles, browse tradies, public job cards, homepage, invoices, completed portfolios, or public APIs. |
| Non-goals | No automated risk scoring (upcoming Chunk O). No money movement, payment state alterations, or invoice updates. |
| Build result | `npm run build` passed. |
| `git diff --check` result | Passed. |
| Live Supabase action required | Apply `supabase/migrations/076_admin_enforcement_actions.sql` after migration `075_admin_job_evidence_pack.sql`. |
| Commit hash after commit | `3f25006` |

### Phase 7 / Chunk O — Tradie Risk Controls

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/077_tradie_risk_signals.sql`, `frontend/src/lib/payments.ts`, `frontend/src/pages/Admin.tsx`, `docs/DAILY_WORK_LOG.md`, `docs/ROADMAP.md`. |
| Migration filename | `077_tradie_risk_signals.sql`. |
| RPC/action summary | Created `public.tradie_risk_signals` table to log manual and system risk indicators. Built `public.get_admin_tradie_risk_summary(p_tradie_id uuid)` RPC function which dynamically calculates numerical risk scores and categories based on disputes, enforcements, rechecks, and recent requests. |
| Access control summary | The table and RPC are restricted to administrators only. RLS is enabled, public execute grants are revoked, and callers must verify as admins inside the RPC. |
| Risk scoring rules | Low signal: +5, Medium: +15, High: +30, Critical: +50. Active Account Review Hold: +40. Active Quote/App Restrictions: +25. Open disputes: +20. Unresolved rechecks: +15. Recent requests: +10/+20. Level ranges: 0-19: Low, 20-49: Medium, 50-79: High, 80+: Critical. |
| UI summary | Displays color-coded risk badge and score in Contractor card of expanded dispute case file. Integrates collapsible factors breakdown and recent signals log. Permits admins to log manual risk signals and resolve/ignore active signals. |
| Public/privacy safety | All risk signals, scores, levels, and manual logs are kept internal and never exposed to customers, non-admin tradies, browse tradies, public profiles, homepage, or public APIs. |
| Non-goals | No automatic suspensions or restrictions based on score. No payment release, payout, or invoice changes. No money movement. |
| Build result | `npm run build` passed. |
| `git diff --check` result | Passed. |
| Live Supabase action required | Apply `supabase/migrations/077_tradie_risk_signals.sql` after migration `076_admin_enforcement_actions.sql`. |
| Commit hash after commit | `511f260` |

### Security Lint Cleanup Pass

| Item | Notes |
| --- | --- |
| Files changed | `supabase/migrations/078_revoke_public_execute_on_definers.sql`, `docs/supabase-security-definer-rpc-audit.md`, `docs/DAILY_WORK_LOG.md`. |
| Migration filename | `078_revoke_public_execute_on_definers.sql`. |
| Revoked permissions summary | Revoked `anon` and `PUBLIC` execute access from all admin-only RPCs (identity/profile approval, dispute settlement, enforcement creation/resolution, risk summaries, admin analytics) and developer simulation scripts. |
| Trigger functions execute revoked | Revoked ALL direct execution privileges (`PUBLIC`, `anon`, `authenticated`) from trigger functions and internal verification/cap/mutation validators (e.g. `protect_user_fields`, `check_and_auto_whitelist_tradie`, `check_early_release_caps`, `protect_quote_line_items`, `validate_early_release_request`, `prevent_itemised_variation_line_mutation`). |
| Remaining warnings rationale | Documented in `docs/supabase-security-definer-rpc-audit.md`. Standard workflow functions (quote acceptance, completion approvals, messaging, variations) must remain executable by `authenticated` database sessions to process updates. They run in security definer mode to bypass direct table RLS write constraints only after validating caller identity and state transitions. |
| `public.public_profiles` view security | Retained as security definer view (documented as intentional exception). Exposes only sanitized public fields (display name, trades, experience, verified tags) to allow guest/customer search directory, while the base `public.users` table is strictly protected by RLS. |
| Dashboard-only settings | Added reminder that leaked password protection must be enabled in the Supabase Dashboard Authentication settings. |
| Build result | `npm run build` passed. |
| `git diff --check` result | Passed. |
| Live Supabase action required | Apply `supabase/migrations/078_revoke_public_execute_on_definers.sql` after migration `077_tradie_risk_signals.sql`. |
| Commit hash after commit | `d07a665` |


### Profile Page UX Polish (2026-06-30 Entries)

| Item | Notes |
| --- | --- |
| Commits included | `52093da` ("Compact profile verification tab"), `7b3a2e2` ("Compact completed work manager"), `25c32ea` ("Fix profile verification card layout"), and `2cacf93` ("Polish completed work controls"). |
| Files changed | `frontend/src/pages/Profile.tsx`, `docs/DAILY_WORK_LOG.md`. |
| Rationale & polish details | Reworked layout structures in both the Verification and Completed Work tabs on the profile page to eliminate cramped desktop displays, reduce visual bloat, and improve state change responsiveness. |
| Verification Tab updates | - Reworked layout from skinny vertical columns into wide, readable stacked cards utilizing a clean 2-column split (information on left, controls on right) on desktop. <br> - Preserved the top summary status overview, next action block, document upload/replace states, and mobile responsiveness. |
| Completed Work Tab updates | - Redesigned the gallery settings manager to allow immediate auto-saving upon clicking `Publish` or `Hide`. <br> - Removed the redundant outer `Save` button; kept the `Save Gallery Settings` action exclusively inside the **Edit details** expanded drawer. <br> - Condensed the top summary row from bulky grid blocks into a single horizontal bar showing inline published/hidden counts and a compact profile preview button. |
| Migrations required | None. |
| Build & diff checks | Both `npm run build` and `git diff --check` passed successfully for all modifications. |
| Manual QA status | Ongoing. Awaiting final user approval and confirmation before marking complete. |


### Profile Verification Tab Redesign

| Item | Notes |
| --- | --- |
| Area | Profile Verification Tab Redesign |
| Files changed | `frontend/src/pages/Profile.tsx`, `docs/DAILY_WORK_LOG.md`. |
| Summary | Redesigned the Verification tab in Profile.tsx into wider sectioned cards/rows for identity and tradie credentials. This fixes the cramped credential layout while preserving upload and recheck behaviors. |
| Section headers | Added explicit headers: "Identity Verification" and "Tradie Credentials" (or "Apply as a Contractor" if customer). |
| Cards layout | Rendered each document card (Photo ID, Liveness Selfie, Contractor Licence, Public Liability Insurance, Trade Certificate / Other) as a full-width card with desktop 2-column split (details/status badge on the left, upload form/controls on the right). Stacks on mobile. |
| Migrations required | None. |
| Build & diff checks | Both `npm run build` and `git diff --check` passed successfully. |
| Manual QA status | Ongoing. Awaiting final user approval and confirmation before marking complete. |


### Profile Verification Checklist Polish

| Item | Notes |
| --- | --- |
| Area | Profile Verification Tab Polish & Checklist Redesign |
| Files changed | `frontend/src/pages/Profile.tsx`, `docs/DAILY_WORK_LOG.md`. |
| Summary | Replaced bulky verification document cards with compact checklist rows. We hide upload controls for approved and pending documents, fixed text overlap/overflow, and only expand upload fields and alerts for documents needing action. |
| Verification row layouts | - Approved and pending documents show check/status icons (green check or amber clock), document titles, and helpers in a neat row. <br> - Documents needing action (recheck, expired, revoked, rejected, none) display inline expanded forms with warning messages and choose-file/submit controls. <br> - Muted optional badges on Trade Certificates to distinguish them from required actions. |
| Overflow fixes | Utilized wrapping text structures (`break-words`), inline block alerts, and flexible layout parameters to prevent badge and label overlaps on smaller screens. |
| Migrations required | None. |
| Build & diff checks | Both `npm run build` and `git diff --check` passed successfully. |
| Manual QA status | Ongoing. Awaiting final user approval and confirmation before marking complete. |


### Profile Verification Summary Polish

| Item | Notes |
| --- | --- |
| Area | Profile Verification Tab Summary Polish |
| Files changed | `frontend/src/pages/Profile.tsx`, `docs/DAILY_WORK_LOG.md`. |
| Summary | Replaced the two separate verification summary cards with a single unified status banner. Connects the status overview and next action directly to the checklist sections using a clean responsive layout with progress chips. |
| Banner details | - Unified Title and body text inside a single card container with check/warning status icons. <br> - Includes an optional success helper line ("You're ready to quote...") when verification is complete. <br> - Renders compact progress chips for Photo ID, Liveness, and Credentials on the right-hand side. <br> - Adapts seamlessly to vertical stack on mobile viewports. |
| Migrations required | None. |
| Build & diff checks | Both `npm run build` and `git diff --check` passed successfully. |
| Manual QA status | Ongoing. Awaiting final user approval and confirmation before marking complete. |


### Profile Verification Summary Layout Hotfix

| Item | Notes |
| --- | --- |
| Area | Profile Verification Tab Summary Layout Hotfix |
| Files changed | `frontend/src/pages/Profile.tsx`, `docs/DAILY_WORK_LOG.md`. |
| Summary | Fixed a layout bug where the top verification summary text collapsed into a single character column by adding flex sizing properties (`flex-1 w-full min-w-0`) to the left text container. |
| Layout details | - Added `flex-1` and `w-full` to the left-hand text column in the summary banner card. <br> - Ensured the summary title and body text render horizontally left-to-right on all viewport resolutions. <br> - Kept status chips layout wrapping safely without squeezing the main text column. |
| Migrations required | None. |
| Build & diff checks | Both `npm run build` and `git diff --check` passed successfully. |
| Manual QA status | Ongoing. Awaiting final user approval and confirmation before marking complete. |


### Admin Credential Recheck Controls

| Item | Notes |
| --- | --- |
| Area | Admin Credential Recheck Controls |
| Files changed | `frontend/src/pages/Admin.tsx`, `frontend/src/pages/Profile.tsx`, `docs/DAILY_WORK_LOG.md`. |
| Summary | Audited and updated the admin dashboard and profile page so that Contractor Licence, Insurance, and Trade Certificate / Other credentials can be individually rechecked or revoked by admins. |
| Verification case logic | - Updated `tradieApprovalCases` queue query to include whitelisted tradies who have active/unresolved recheck requests on their latest documents, keeping their cases visible in the queue for tracing. <br> - Introduced `getLatestDocOfType` case validation helper to compute hasApprovedLicenceProof, hasApprovedInsuranceProof, and hasApprovedLiveness based on the latest submitted document of each type. <br> - Separated case documents list into `activeDocs` (current active documents mapped by type, which display action buttons like Approve, Reject, Request Recheck) and `historyDocs` (older outdated uploads, which are rendered as read-only references inside a collapsible "View Document History" container). |
| Profile tab alignment | - Refined `credentialsNeedAction` logic in `Profile.tsx` to include optional credentials, ensuring the top summary banner correctly triggers "Credentials action required" when any credential is marked for recheck. |
| Migrations required | None (the database schema and backend RPC `requestVerificationRecheck` already support per-document recheck updates). |
| Build & diff checks | Both `npm run build` and `git diff --check` passed successfully. |
| Manual QA status | Ongoing. Awaiting final user approval and confirmation before marking complete. |


### Profile Verification Summary Emergency Hotfix

| Item | Notes |
| --- | --- |
| Area | Profile Verification Tab Summary Emergency Hotfix |
| Files changed | `frontend/src/pages/Profile.tsx`, `docs/DAILY_WORK_LOG.md`. |
| Summary | Fixed a layout bug where the top verification summary text collapsed into a single character column by replacing the fragile side-by-side flex layout with a stable vertically stacked block structure. |
| Layout details | - Removed the horizontal flex relationship between the text header and the progress chips. <br> - Rendered the header text (icon + title/body) as a full-width block row on top. <br> - Rendered the progress chips as a full-width flex-wrap row below the text, separated by a light border, ensuring the text is never horizontally squeezed. |
| Migrations required | None. |
| Build & diff checks | Both `npm run build` and `git diff --check` passed successfully. |
| Manual QA status | Ongoing. Awaiting final user approval and confirmation before marking complete. |


### Privacy Notes
- **Verified Tradies**: The homepage utilizes only the public-safe database fields (`display_name`, `business_name`, `avatar_url`, `suburb`, `state`, `trades`, and verified indicators). No private contact information, documents, or personal records are exposed.
- **Local Jobs**: Only jobs with `status: 'open'` are loaded. Customer contact information and precise address details remain private.

### Validation

| Check | Result |
| --- | --- |
| `npm run build` | Passed. Checked for TypeScript compilation and bundle compliance. |
| `git diff --check` | Passed. No trailing whitespace or formatting issues. |

### Remaining / Next

| Item | Status |
| --- | --- |
| Phase 3 — Early Releases | Upcoming. |
