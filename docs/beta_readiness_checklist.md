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

> [!IMPORTANT]
> The database migration files `081_create_notifications_table.sql` through `086_verification_notifications.sql` are created and pushed to GitHub main. Live deployment to the Supabase Studio hosting environment is manual and must be executed by Jay.

---

## 3. Storage Buckets Check
Verify that the following buckets exist in the Supabase instance and have correct public/private access policy controls:
1. **`completion_proofs`**: Private bucket for evidence pictures. Only job owners, payees, and admin users can generate signed download URLs.
2. **`verifications`**: Private bucket for ID selfie and license documents. Only document owners and admin users can retrieve files.
3. **`job_workspace_images`**: Public/Private bucket for jobs description images.

---

## 4. Manual QA Action Items
Jay to manually test:
- [ ] Signup a Customer and a Tradie account (verify the generated business name lacks `[BETA]` labels).
- [ ] Customer posts a job.
- [ ] Tradie submits a quote (verify Customer receives header bell notification).
- [ ] Customer accepts the quote (verify Tradie receives quote accepted notification).
- [ ] Simulate payment funding (verify Tradie receives payment funded notification).
- [ ] Chat in the workspace chat thread (verify thread switching is instant without refresh, and new messages pop up realtime with notification badges).
- [ ] Tradie submits completion proof.
- [ ] Customer approves completion proof (verify invoice receipt generation).
