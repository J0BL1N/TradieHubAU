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

### Migrations / Deployments

* `036_explicit_rpc_execute_grants.sql` - created 00:07:01, modified 00:07:29; docs/ROADMAP.md says hosted and manually confirmed.
* `037_job_messaging_foundation.sql` - created 00:44:41; docs/ROADMAP.md records the migration and foundation work, but hosted db push/deploy status was not confirmed from local git/files.

### Validation

* v0.0.17 closeout - docs/ROADMAP.md says hosted migrations `001`-`036` aligned and production build passed.
* v0.0.18 job messaging foundation - build/db push/manual QA status not confirmed from local git/files.

### Remaining / Next

* v0.0.18 - in progress/unapproved; docs/ROADMAP.md says this pass adds informational foundations only and v0.1.0 remains not ready.
* v0.1.0 Controlled Local Beta Prep remains next confirmed roadmap phase; not approved.
