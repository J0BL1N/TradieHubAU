# TradieHubAU Roadmap

Last updated: 2026-06-24

## Progress Snapshot

TradieHubAU is currently in the local MVP build stage.

Approved/completed:

* v0.0.11 Jobs UX final polish
* Admin UUID display hotfix
* Job modal overlay hotfix

Current focus:

* v0.0.16 Security, RLS, Storage, and Privacy Audit (in progress — remediation and live Supabase verification outstanding)
* v0.0.12 Completion, review, dispute, contact gating, and protected payment workflow (awaiting manual review)
* v0.0.13 Admin dashboard polish
* v0.0.14 Admin Dispute Case Management (implementation complete, awaiting manual review)
* v0.0.15 Full manual customer/tradie/admin test run (in progress — awaiting manual testing)

Next major focus:

* v0.0.13 Admin dashboard polish
* v0.1.0 Controlled Local Beta Prep, after security findings are remediated and manually verified

Later:

* Real payment provider integration
* Finance/accounting dashboard
* GST/accountant export readiness
* Controlled beta launch

---

# v0.0.x — Local MVP Foundation

## Completed / Approved

* [x] v0.0.10 — Project structure cleanup

  * Active app confirmed under `F:\TradieHubAU\frontend`
  * Active Supabase folder confirmed under `F:\TradieHubAU\supabase`
  * Old/static folders should not be used for active development
  * VS Code Go Live should not be used for the active React/Vite app

* [x] v0.0.11 — Jobs UX final polish

  * Cleaned up job status wording
  * Improved job status badges
  * Improved job list action gating
  * Customers cannot apply to jobs
  * Tradies can only apply to open jobs
  * Accepted/funded/completed/disputed states display more clearly
  * Removed user-facing “escrow” wording
  * Added safer wording such as protected payment, secure job payment, payment funded, payment held until completion
  * Added safer wording such as protected payment, secure job payment, payment funded, payment held until completion, or payment release

* [x] Hotfix — Admin UUID display

  * Active Whitelisted Tradies table displays each tradie’s user UUID
  * UUID appears under email address as `UUID: <uuid>`
  * Confirmed UUID matches Supabase `public.users.id`

* [x] Hotfix — Job Details modal overlay behavior

  * Modal overlay now intentionally starts below the header/nav
  * Header/nav remains visible
  * Page content below header is dimmed/blurred
  * Clicking outside modal closes it
  * Escape closes modal
  * Body scroll lock works

---

## In Progress / Awaiting Manual Review

* [ ] v0.0.12 — Completion + dispute flow polish

  * Status: implementation mostly complete, still awaiting final manual approval
  * Do not mark approved until the user confirms final review passes

### v0.0.12 Completed Implementation Items

* [x] Completion proof form moved out of Job Details modal
* [x] Dedicated `Submit Completion` action added for accepted tradie
* [x] `Submit Completion` button visible only on funded/contract-active jobs
* [x] Completion proof modal supports notes/details
* [x] Completion proof modal supports image uploads
* [x] Image uploads support JPEG, JPG, PNG, WEBP
* [x] File size validation added
* [x] Image previews/filenames shown
* [x] Supabase Storage bucket `completion_proofs` added
* [x] Completion proof images upload successfully to storage
* [x] Signed proof preview URLs added where needed
* [x] Ambiguous SQL `status` reference fixed in completion/variation functions
* [x] Contact details gated until protected payment is funded
* [x] Accepted-but-unfunded jobs show locked contact details
* [x] Accepted-but-unfunded jobs warn tradies not to start work yet
* [x] Payment funded jobs unlock contact details for job owner and accepted tradie only
* [x] Private contact details hidden from guests, unrelated customers, and wrong tradies
* [x] Platform fee and tradie payout breakdown added
* [x] Ledger labels improved: Deposit Charge, Platform Fee, Tradie Payout, Customer Refund
* [x] Customer review timer changed from 7 days to 72 hours
* [x] 72-hour review countdown component added
* [x] Under Review badge shortened to `Under Review`
* [x] Guest Open Jobs browsing fixed
* [x] Guests no longer see full-page “Not authenticated” error on Open Jobs
* [x] My Jobs has friendlier sign-in prompt for guests
* [x] My Jobs status filtering added
* [x] Sort dropdown kept for Open Jobs and hidden/less prominent on My Jobs
* [x] GST was not added to payment math
* [x] GST/accounting TODO comment added for future review
* [x] Dev documentation added for second tradie test account

### v0.0.12 Still Awaiting / Current Final Adjustment

* [ ] Move customer `Review Completion Proof` workflow out of the Job Details modal (Implementation complete, awaiting manual review)

  * Add separate `Review Completion` button near `Details`
  * Only visible to job owner/customer when status is `completed_pending_review`
  * Dedicated Review Completion modal should contain:

    * proof notes/details
    * proof image previews
    * 72-hour countdown
    * approve work and release payment action
    * dispute work completion action
    * dispute details textarea
    * initiate official dispute action
  * Job Details modal should show only a lightweight summary for under-review jobs

### v0.0.12 Manual Review Items Still Needed

* [ ] Confirm `Review Completion` modal opens correctly
* [ ] Confirm approval still releases payment correctly
* [ ] Confirm dispute still moves job to disputed/admin review correctly
* [ ] Confirm countdown appears for both customer and accepted tradie
* [ ] Confirm wrong tradie cannot see `Submit Completion`
* [ ] Confirm wrong tradie cannot upload completion proof
* [ ] Confirm wrong tradie cannot see private contact details
* [ ] Confirm no user-facing “escrow” wording remains
* [ ] Confirm no GST is added to payment math
* [ ] Confirm completed jobs appear correctly in past/completed areas

---

# v0.0.13 — Admin Dashboard Polish

## In Progress / Implementation Complete — Awaiting Manual Review

* [ ] v0.0.13 — Admin dashboard polish

  * Status: implementation complete, awaiting manual review

### v0.0.13 Completed Implementation Items

* [x] Replaced all native `alert()` and `confirm()` dialogs with in-page toast notifications and confirmation modals
* [x] Fixed structural bug — Disputes queue moved out of Whitelisted Tradies card to its own top-level section
* [x] Added 4th stats tile — Active Disputes count (red highlight when > 0)
* [x] Stats grid updated from 3 columns to 4
* [x] Customer dispute evidence photos (uploaded to Supabase Storage) now display as thumbnails in dispute cards
* [x] Dispute cards improved — show Job Ref ID, dispute date, payment held chip, status badge
* [x] Document type labels now format all underscores correctly (e.g. "Contractor License" not "contractor_license")
* [x] Role column added to Identity Verifications queue
* [x] Empty states improved with icons and clearer descriptions across all 4 sections
* [x] `getDisputedJobs()` updated to include `attachments` in job_issues select
* [x] Pending approval count badges added to each queue header
* [x] Locale-aware date formatting (en-AU) for all timestamps
* [x] **Replaced slider-style dispute resolution with professional case-file resolution console**
  * Slider UI removed entirely
  * 5 clear resolution actions: Release to Contractor, Refund Customer, Manual Split, Request More Evidence, Escalate
  * Manual split uses dollar-amount input fields — no slider
  * Resolution preview shows Customer receives / Contractor receives / Platform keeps + Final status
  * Required admin notes / findings textarea before confirming
  * Confirmation modal before applying any financial resolution
  * "Request More Evidence" and "Escalate" are soft actions — save admin notes to job_issues without changing job/payment status
* [x] Fixed blank Contractor display — expanded `getDisputedJobs()` payee join to include full profile fields (phone, ABN, licence, whitelist/identity status)
* [x] Dispute case file shows: Job Summary, Customer Details, Contractor Details, Customer Complaint, Completion Proof (notes + images), Customer Evidence Photos, Payment Breakdown, Resolution Console
* [x] Dispute case file is collapsible (click header to expand/collapse)
* [x] Completion proofs fetched alongside disputes in one query

### v0.0.13 Manual Review Items

* [ ] Confirm admin dashboard loads at /admin for is_admin user
* [ ] Confirm 4 stats tiles display correctly
* [ ] Confirm Disputes section is its own card (not nested in Whitelisted Tradies)
* [ ] Confirm native browser alert/confirm dialogs no longer appear
* [ ] Confirm toast notifications appear for approve/reject/suspend actions
* [ ] Confirm in-page confirmation modal appears for Suspend Tradie and Revoke ID actions
* [ ] Confirm dispute case file shows customer and contractor details
* [ ] Confirm contractor name/email is NOT blank in dispute cards
* [ ] Confirm slider is gone — 5 action buttons appear instead
* [ ] Confirm manual split shows dollar input fields
* [ ] Confirm resolution preview shows correct amounts before confirming
* [ ] Confirm completion proof notes and images display in dispute case
* [ ] Confirm customer dispute evidence thumbnails display
* [ ] Confirm admin notes are required before confirming resolution
* [ ] Confirm confirmation modal appears before resolution is applied
* [ ] Confirm "Request More Evidence" and "Escalate" save notes but do not resolve the dispute
* [ ] Confirm document type labels display correctly
* [ ] Confirm no user-facing "escrow" wording

---

### v0.0.13 Items Still Pending (future)

* [ ] Improve customer/user management visibility
* [ ] Ensure admin-only sensitive data is not exposed elsewhere
* [ ] Keep private verification documents admin-only

---


# v0.0.14 — Admin Dispute Case Management

## Implementation Complete — Awaiting Manual Review

* [ ] v0.0.14 — Admin Dispute Case Management

  * Status: implementation complete, awaiting manual review; do not mark approved yet

### v0.0.14 Completed Implementation Items

* [x] Added `Manage Disputes` link from the Admin dashboard Active Job Disputes area
* [x] Added `/admin/disputes` with ongoing and completed/resolved sections
* [x] Added `/admin/disputes/:jobId` full dispute case page
* [x] Reused the full case-file and resolution console UI on the dedicated case page
* [x] Added visible internal case notes/history using the existing `job_issues.admin_notes` field
* [x] Clarified that soft actions save an internal note only and do not notify either party
* [x] Kept completed dispute case files read-only
* [x] No schema migration required

### v0.0.14 Manual Review Items

> v0.0.14 can only be approved for local MVP/simulated payment dispute management. Real payment settlement tests are deferred to v0.2.x Real Payments Foundation.

* [ ] Confirm ongoing and completed cases appear in the correct list sections
* [ ] Confirm each list entry shows job, parties, disputed date, amount, status, and Open Case action
* [ ] Confirm direct case URLs enforce the admin guard
* [ ] Confirm existing and newly saved admin notes appear on the case page
* [ ] Confirm completed cases cannot reopen the resolution console

---

# v0.0.15 — Full Manual Customer/Tradie/Admin Test Run

## In Progress — Awaiting Manual Testing

* [ ] v0.0.15 — Full manual customer/tradie/admin test run

  * Status: checklist prepared; manual browser testing has not been completed or approved
  * QA checklist: [`docs/QA_v0.0.15_MANUAL_TEST_RUN.md`](QA_v0.0.15_MANUAL_TEST_RUN.md)

* [ ] Create customer test account
* [ ] Create second customer test account
* [ ] Create primary tradie test account
* [ ] Create second tradie test account
* [ ] Create admin account
* [ ] Test customer signup/login
* [ ] Test tradie signup/login
* [ ] Test tradie verification/whitelist/admin approval
* [ ] Test unverified tradie cannot quote/apply
* [ ] Test suspended tradie cannot quote/apply
* [ ] Test customer creates job
* [ ] Test tradie submits quote
* [ ] Test customer accepts quote
* [ ] Test contact details stay locked before payment funding
* [ ] Test protected payment funding simulation
* [ ] Test contact details unlock after payment funding
* [ ] Test accepted tradie submits completion proof with images
* [ ] Test wrong tradie cannot submit proof
* [ ] Test customer reviews proof
* [ ] Test customer approves work and payment release
* [ ] Test dispute flow
* [ ] Test admin dispute visibility
* [ ] Test completed job state
* [ ] Test cancelled job state if supported
* [ ] Test guest browsing
* [ ] Test guest save/apply gating
* [ ] Test mobile/responsive layout manually
* [ ] Test no user-facing “escrow” wording remains

---

# v0.0.16 — Security, RLS, Storage, and Privacy Audit

Status: **In progress / unapproved.** Source audit findings are documented in [`docs/SECURITY_AUDIT_v0.0.16.md`](SECURITY_AUDIT_v0.0.16.md). Critical/high remediation and live Supabase verification remain outstanding.

### Completed Remediation Items

* [x] C-01: Redefined `protect_user_fields()` and attached it as `BEFORE INSERT OR UPDATE` trigger on `public.users` to block unauthorized client edits of privileged fields in migration `019_protect_user_fields_trigger.sql` (pending live Supabase verification).
* [x] C-02: Replaced SELECT policies on `public.job_completion_proofs` and `public.job_issues` to use explicit aliases and correct outer column references in migration `020_fix_proof_dispute_rls_shadowing.sql` (pending live Supabase verification).
* [x] C-03: Re-defined and secured `public.simulate_payment_funding` RPC to validate authentication, check customer/admin permissions, enforce expected state transitions, implement idempotent safety, and restrict execute permissions to authenticated users in migration `021_secure_simulate_payment_funding_rpc.sql` (pending live Supabase verification).
* [x] C-04: Dropped direct client INSERT policy on `public.payments` table in migration `022_block_direct_client_payment_inserts.sql` to prevent client-side payment forgery, forcing payment creation exclusively through trusted database RPC functions (pending live Supabase verification).
* [x] C-05: Disabled legacy, unused `release-payout` Edge Function by replacing Deno server handler with a secure fail-closed HTTP 403 response (pending live Supabase function deployment verification).
* [x] H-01: Added database-level safe public profiles boundary by removing wide public SELECT policy on `public.users` and creating allowlisted view `public.public_profiles` in migration `023_add_public_profile_boundary.sql`. Aligned frontend queries and contact-gating resolution to query from the view, and retrieve counterparty details via `jobPayment` participants model (pending live Supabase verification).

* [ ] Audit Supabase RLS policies for `users`
* [ ] Audit Supabase RLS policies for `jobs`
* [ ] Audit Supabase RLS policies for `quotes/applications`
* [ ] Audit Supabase RLS policies for `payments`
* [ ] Audit Supabase RLS policies for `completion_proofs`
* [ ] Audit Supabase Storage policies for `completion_proofs`
* [ ] Confirm guests only see public-safe job data
* [ ] Confirm customers only see their own private data
* [ ] Confirm tradies only see appropriate private data after payment funding
* [ ] Confirm wrong tradies cannot access private proof/contact data
* [ ] Confirm admin-only data is admin-only
* [ ] Confirm verification documents are protected
* [ ] Confirm no service-role keys exist in frontend
* [ ] Confirm no secrets are committed
* [ ] Confirm `.env` files are ignored
* [ ] Confirm protected payment actions cannot be spoofed client-side
* [ ] Confirm completion/dispute/approval RPCs enforce authorization server-side
* [ ] Confirm storage uploads are path-restricted
* [ ] Confirm signed URL access is controlled

---

# v0.1.0 — Controlled Local Beta Prep

* [ ] Finalize local beta user roles
* [ ] Finalize South East Melbourne / outer south-east Melbourne service area messaging
* [ ] Add region gate or waitlist if needed
* [ ] Add beta disclaimer copy
* [ ] Add basic Terms of Service placeholder
* [ ] Add Privacy Policy placeholder
* [ ] Add Contact Support page/details
* [ ] Add safer protected payment explanation page/section
* [ ] Add trust and safety explainer
* [ ] Add dispute process explainer
* [ ] Add tradie verification explainer
* [ ] Add customer verification explainer
* [ ] Add job reference IDs/public IDs
* [ ] Add simple invoice/reference foundation
* [ ] Prepare test data for beta demo
* [ ] Prepare deployment checklist
* [ ] Prepare manual QA checklist
* [ ] Prepare rollback checklist

---

# v0.1.x — Admin Dispute Operations

* [ ] Add an append-only dispute action/audit log with actor and action timestamps
* [ ] Preserve every admin note instead of overwriting the single `job_issues.admin_notes` value
* [ ] Add explicit case action types for evidence requests and internal escalation
* [ ] Add customer/contractor dispute notifications only after a real notification delivery system exists
* [ ] Show notification delivery state and failures in the admin case history

---

# v0.1.x — Frontend Data Performance and Caching

* [ ] Add memory-only frontend query caching for safe server-state reuse
* [ ] Cache signed image URLs only below their expiry time
* [ ] Add precise query invalidation after jobs, applications, payments, verification, and dispute mutations
* [ ] Clear all private cached data on sign-out or authenticated user change
* [ ] Do not persist private, admin, contact, verification, dispute, or signed-URL data to browser storage

---

# v0.2.x — Real Payments Foundation

* [ ] Choose payment provider
* [ ] Confirm legal/payment structure
* [ ] Confirm whether platform is agent/marketplace/principal
* [ ] Confirm protected payment language with legal/accounting advice
* [ ] Add real payment intent creation
* [ ] Add real payment status webhooks
* [ ] Add real payout tracking
* [ ] Add refunds support
* [ ] Add dispute/chargeback handling foundation
* [ ] Add payment provider fee tracking
* [ ] Add payment ledger hardening
* [ ] Add idempotency for payment operations
* [ ] Add payment audit logs
* [ ] Add production-safe webhook verification
* [ ] Add payment failure states
* [ ] Add retry/cancel flows
* [ ] Add user-facing payment receipts

## Backburner QA — Test Once Real Payments Work

* [ ] Test real customer charge / protected payment funding
* [ ] Test real payment held state from provider/webhook
* [ ] Test real payment release to contractor
* [ ] Test real contractor payout tracking
* [ ] Test real full customer refund
* [ ] Test real manual split settlement
* [ ] Test payment provider fee tracking
* [ ] Test exact ledger reconciliation after release/refund/split
* [ ] Test failed payment states
* [ ] Test webhook retry/idempotency handling
* [ ] Test dispute resolution against real payment provider records
* [ ] Test chargeback/payment provider dispute scenario if supported
* [ ] Test receipts/invoices after real payment actions

---

# v0.3.x — Admin → Finance & Accounting

* [ ] Add admin-only Finance & Accounting dashboard
* [ ] Add date range selector

  * This month
  * This quarter
  * Financial year
  * Calendar year
  * Custom range
* [ ] Track gross job volume
* [ ] Track platform fee revenue
* [ ] Track net platform income
* [ ] Track tradie payouts
* [ ] Track pending payouts
* [ ] Track released payouts
* [ ] Track held/protected payments
* [ ] Track refunds
* [ ] Track dispute reversals
* [ ] Track payment processor fees
* [ ] Add manual expense entry
* [ ] Add expense categories

  * hosting
  * domain
  * software
  * ads/marketing
  * accounting
  * legal
  * insurance
  * miscellaneous
* [ ] Add receipt/invoice upload for expenses
* [ ] Add monthly summary
* [ ] Add yearly summary
* [ ] Add financial year summary
* [ ] Add CSV export for accountant
* [ ] Add PDF summary export for accountant
* [ ] Add transaction ledger export
* [ ] Add platform fee report export
* [ ] Add tradie payout report export
* [ ] Add expenses report export
* [ ] Add tax-time summary pack

---

# v0.3.x — GST / Accountant Export Readiness

* [ ] Confirm GST registration requirements with accountant
* [ ] Confirm GST turnover tracking rules
* [ ] Confirm whether GST applies to platform fee only or full job supply
* [ ] Confirm invoice/tax invoice requirements
* [ ] Add GST-ready fields to payment ledger
* [ ] Add GST collected tracking if applicable
* [ ] Add GST payable estimate if applicable
* [ ] Add GST on platform fee support if required
* [ ] Add GST on full job payment support only if legally required
* [ ] Add BAS summary export if needed
* [ ] Add tax invoice generation if needed
* [ ] Add ABN/GST registration details to business settings
* [ ] Add accountant review checklist
* [ ] Do not enable GST charging until confirmed legally/accounting-wise

---

# v0.4.x — Messaging and Contact Controls

* [ ] Improve in-platform messages
* [ ] Gate direct contact details until protected payment is funded
* [ ] Add customer/tradie message thread per job
* [ ] Add direct customer/tradie chat thread per job
* [ ] Add system messages for quote accepted/payment funded/completion submitted/dispute opened
* [ ] Add message moderation/audit hooks if needed
* [ ] Add report conversation feature if needed
* [ ] Keep emails/phone numbers hidden before funding
* [ ] Consider masked relay contact later

---

# v0.5.x — Trust, Verification, and Safety

* [ ] Improve tradie verification workflow
* [ ] Add ABN validation support
* [ ] Add licence validation support
* [ ] Add insurance document review support
* [ ] Add customer ID verification workflow
* [ ] Add admin verification queue improvements
* [ ] Add verification expiry reminders
* [ ] Add credential status flags (suspended, active, expired)
* [ ] Add audit history for admin verification actions
* [ ] Add fraud/risk flags
* [ ] Add safer onboarding copy

---

# v0.6.x — Reviews and Reputation

* [ ] Add post-completion customer review
* [ ] Add tradie rating
* [ ] Add customer rating if desired
* [ ] Add review moderation
* [ ] Add completed job count
* [ ] Add verified badge display
* [ ] Add profile reputation summary
* [ ] Prevent reviews before job completion
* [ ] Prevent reviews from unrelated users

---

# v0.7.x — Notifications

* [ ] Email notification foundation
* [ ] Quote received notification
* [ ] Quote accepted notification
* [ ] Payment funded notification
* [ ] Completion proof submitted notification
* [ ] Review window countdown reminder
* [ ] Dispute opened notification
* [ ] Payment released notification
* [ ] Admin dispute notification
* [ ] Notification preferences

---

# v0.8.x — Public Site / Marketing

* [ ] Landing page polish
* [ ] How it works page
* [ ] Customer explainer
* [ ] Tradie explainer
* [ ] Protected payment explainer
* [ ] Trust and safety page
* [ ] Region availability page
* [ ] FAQ
* [ ] Contact page
* [ ] SEO basics
* [ ] Mobile polish
* [ ] Performance pass

---

# 1.0 — Production Launch Readiness

* [ ] Legal review complete
* [ ] Accounting/GST review complete
* [ ] Payment provider production approved
* [ ] Privacy policy finalized
* [ ] Terms finalized
* [ ] Dispute policy finalized
* [ ] Refund policy finalized
* [ ] Verification policy finalized
* [ ] Security audit complete
* [ ] RLS audit complete
* [ ] Storage audit complete
* [ ] Backup/restore process documented
* [ ] Monitoring/logging added
* [ ] Error reporting added
* [ ] Production environment variables secured
* [ ] Production database migration plan confirmed
* [ ] Beta users tested successfully
* [ ] Admin operating procedures documented
* [ ] Launch checklist complete

---

# Development Rules

* Do not work on archived/static/old folders.
* Active frontend: `F:\TradieHubAU\frontend`
* Active Supabase folder: `F:\TradieHubAU\supabase`
* Do not use VS Code Go Live for this app.
* Use `npm run dev` for local frontend.
* Use Supabase CLI/local Supabase for local backend work.
* Do not perform subjective visual/manual browser approval as the IDE.
* The user manually approves visual/UX behavior.
* Avoid the word “escrow” in user-facing copy.
* Use safer wording:

  * protected payment
  * secure job payment
  * payment funded
  * payment held until completion
  * payment release
* Do not add real payment processing until the real payments foundation task.
* Do not add GST charging until accountant/legal structure is confirmed.
* Do not commit secrets.
* Do not commit `.env` files.
* Do not place service-role keys in frontend code.
* Do not mark implementation-complete work as approved unless the user explicitly approves it.

Git requirements:

* Update this roadmap before any GitHub push.
* Check off only user-approved work.
* Keep in-progress work unchecked or clearly marked as awaiting manual review.
* Run `npm run build` before final commit where frontend code changes exist.
* Include the roadmap update in the commit.
* In the final report, include:

  * roadmap file changed
  * which roadmap items were checked off
  * build result
  * commit message used or recommended
  * whether changes were committed/pushed or only prepared
