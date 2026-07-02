# TradieHubAU Beta Readiness Checklist

This document details the checklist of completed tasks, database migrations, security rules, and steps required before launching the public local beta (`v0.1.0`).

---

## 1. Core Modules Readiness

| Feature Area | Status | Verification Check |
| --- | --- | --- |
| **Authentication & Profile** | Ready | Identity and Tradie profile editing verified. |
| **Job Posting & Lifecycle** | Ready | Post job, quote submission, acceptance, funding simulation, and completion proof workflows implemented. |
| **Messaging** | Ready | Realtime chat updates, paginate limits, pre-funding contact detail gating, and switch-thread caching implemented. |
| **Notifications** | Ready | In-app notification table (RLS/indices), header bell UI, realtime subscriptions, message alerts, quote changes, payment/proof statuses, and verifications trigger scripts completed. |
| **Admin Operations** | Ready | Verification reviews, manual whitelisting, enforcement actions, dispute case handling, and risk signals verified. |

---

## 2. Database Migrations Status
All database modifications are codified in `supabase/migrations/`:
* [x] **081** — Notifications table, indexes, RLS, and RPC helpers
* [x] **082** — New message realtime notification trigger
* [x] **083** — Quote application lifecycle triggers
* [x] **084** — Payments status and completion proof triggers
* [x] **085** — Dispute opening and resolution triggers
* [x] **086** — Document verification status triggers
* [x] **087** — Google Places and address mapping fields
* [x] **088** — National Australian location database structures and fallback seeds
* [x] **089** — Corrective location database permission hardening
* [x] **090** — Messaging safety, profanity filter, and audit logs trigger
* [x] **091** — Supabase security/lint views and search paths hardening
* [x] **092** — Safe public identity masking view and contact-bypass filters (corrected)

> [!IMPORTANT]
> The database migration files `081_create_notifications_table.sql` through `092_public_profile_identity_safety.sql` are created and pushed to GitHub main. Live deployment to the Supabase Studio hosting environment is manual and must be executed by Jay.

---

## 3. Storage Buckets Check
Verify that the following buckets exist in the Supabase instance and have correct public/private access policy controls:
1. **`completion_proofs`**: Private bucket for evidence pictures. Only job owners, payees, and admin users can generate signed download URLs.
2. **`verifications`**: Private bucket for ID selfie and license documents. Only document owners and admin users can retrieve files.
3. **`job_workspace_images`**: Public/Private bucket for jobs description images.

---

## 4. Manual QA Action Items
Jay to manually test:
- [ ] **Beta Scenario Setup**: Run the account seed tool `scripts/create-beta-test-accounts.mjs --dry-run` (and optionally `--apply` with connection credentials) to prepare customer, tradie, and admin scenarios in South East Melbourne, as detailed in [BETA_TESTING_RUNBOOK.md](file:///f:/TradieHubAU/docs/BETA_TESTING_RUNBOOK.md).
- [ ] Signup a Customer and a Tradie account (verify the generated business name lacks `[BETA]` labels).
- [ ] Customer posts a job.
- [ ] Tradie submits a quote (verify Customer receives header bell notification).
- [ ] Customer accepts the quote (verify Tradie receives quote accepted notification).
- [ ] Simulate payment funding (verify Tradie receives payment funded notification).
- [ ] Chat in the workspace chat thread (verify thread switching is instant without refresh, and new messages pop up realtime with notification badges).
- [ ] Verify message composer sends optimistically, immediately clears state, and sidebar updates details without lag.
- [ ] Verify that changing active conversation loads cached messages instantly, with a background sync indicating active status in the sidebar.
- [ ] Verify that Google Places address autocompletion loads on Profile and Post Job, auto-fills State/Suburb/Postcode, and degrades gracefully to standard inputs when keyless.
- [ ] Verify background sync updates details silently without showing full-page loading indicators on Jobs and Admin views when realtime events trigger.
- [ ] Tradie submits completion proof.
- [ ] Customer approves completion proof (verify invoice receipt generation).

---

## 5. Security & Dashboard Configurations
These items are manual setup steps in the Supabase Dashboard and do not involve code migrations:
- [ ] **Leaked Password Protection**: Enable "Prevent use of leaked passwords" in Authentication > Auth Settings > Password Policy.
- [ ] **Supabase Advisor Pass**: Run the Supabase Security Advisor and resolve any flagged auth/RLS config recommendations.
- [ ] **Deployment & Rollback Checklist**: Review and verify the deployment variables, buckets, and rollback procedures in [DEPLOYMENT_READINESS_CHECKLIST.md](file:///f:/TradieHubAU/docs/DEPLOYMENT_READINESS_CHECKLIST.md).
