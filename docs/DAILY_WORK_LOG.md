# TradieHubAU Daily Work Log

Single ongoing project-history log. Entries are based on committed git history, file timestamps, and docs present in this repo.

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
| 20:31:21 | Job Location & Schedule | 7c2579d | Polish post job schedule fields: Renamed 'Region / Council Area' to 'Region', improved desktop grid columns layout to 4 columns, set preferred start date & time to datetime-local input with 15-minute increments (step=900), and updated region validation error message. |
| 20:38:00 | Location Filters | this commit | Updated browse/search location filters in Jobs.tsx to support State, Region, and Suburb cascading selects. Deferred Browse Tradies due to lacking reliable region/suburb profile fields. |
| 20:50:00 | Tradie Directory Access | this commit | Restored public tradie directory access by resetting public.public_profiles to security definer mode (security_invoker = false), enabling guests and customers to view safe sanitized profiles. |




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
| `frontend/public/data/au-postcode-localities.json` | Created | Generated Australia-wide location selector dataset from the Matthew Proctor Australian Postcodes public-domain CSV. |
| `docs/profile-trust-live-supabase-deploy.md` | Created | Provides copy-paste SQL Editor deployment instructions, full `047` SQL, verification SQL, and expected results for live repair when CLI deployment is unavailable. |
| Supabase Advisor pass 2 | Documented | `docs/supabase-security-definer-rpc-audit.md` records why remaining authenticated `SECURITY DEFINER` warnings are expected/guarded. |
| Leaked password protection | Dashboard action required | Remaining `auth_leaked_password_protection` warning must be fixed in Supabase Dashboard, not code. |
| Post Job Polish | No migration | No database migration was added; changes are purely frontend layout, labels, and inputs. |
| Browse Location Filters | No migration | No database migration was added; filtering is executed on the client side using in-memory dataset search. |
| `057_restore_public_profiles_directory_access.sql` | Created | Resets security_invoker on public.public_profiles view and grants SELECT to anon and authenticated. |

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
| Profile avatar refresh polish | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Post-job confirmation and quote edit lock | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Workspace images and simplified budget | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Structured job location fields | `npm run build` passed; `git diff --check` passed with line-ending warnings only. |
| Australia-wide location selector | `npm run build` passed; `git diff --check` passed with line-ending warnings only. Manual example locations were found in the generated selector dataset. |
| Job location & schedule polish | `npm run build` passed; layout and 15-minute step input verified. |
| Structured location browse filters | `npm run build` passed. Cascading dropdown behavior and filtering on state/region/suburb verified on client side. Deferred Browse Tradies (documented limitation). |
| Public tradie directory access | `npm run build` passed. Verified public_profiles view does not contain private fields like email/phone, ensuring safety. |

### Remaining / Next

| Item | Status |
| --- | --- |
| Google OAuth provider | Needs dashboard setup: enable Google provider, add client ID/secret, configure Supabase redirect URLs, and configure Google Cloud callback to Supabase `/auth/v1/callback`. |
| Supabase leaked password protection | Needs dashboard enablement and Advisor re-run. |
| Remaining `SECURITY DEFINER` warnings | Documented as guarded/expected in `docs/supabase-security-definer-rpc-audit.md`; no code migration needed in pass 2. |
