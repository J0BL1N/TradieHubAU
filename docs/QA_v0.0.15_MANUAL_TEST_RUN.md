# v0.0.15 Manual Customer / Tradie / Admin Test Run

Status: **In progress — awaiting manual testing**

## How to use this checklist

* The user manually runs each test in the browser and updates its status to `Pass`, `Fail`, or `Blocked`.
* Leave unrun tests as `Not tested`. Record useful evidence in Tester notes and create a clear Bug/follow-up entry for failures.
* Do not mark v0.0.15 or related roadmap work approved until the user confirms the required manual review has passed.
* Local simulated protected-payment flows can be tested now.
* Real-money charges, provider/webhook settlement, payouts, refunds, split settlement, and reconciliation remain deferred to v0.2.x Real Payments Foundation.
* Do not record passwords, access tokens, API keys, private document contents, or other secrets in this document.

## Test run details

| Field | Value |
|---|---|
| Tester |  |
| Test date |  |
| Browser/version |  |
| Desktop viewport |  |
| Mobile viewport/device |  |
| Frontend commit |  |
| Supabase environment | Local / other: |

Allowed statuses: `Not tested` / `Pass` / `Fail` / `Blocked`

## Test accounts setup

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| ACC-01 | Create the primary customer test account. | Customer 1 | Not tested |  |  |
| ACC-02 | Create a second customer account for access-boundary checks. | Customer 2 | Not tested |  |  |
| ACC-03 | Create the primary tradie test account. | Tradie 1 | Not tested |  |  |
| ACC-04 | Create a second tradie account for wrong-tradie checks. | Tradie 2 | Not tested |  |  |
| ACC-05 | Create or confirm an administrator account with `is_admin` access. | Admin | Not tested |  |  |
| ACC-06 | Confirm test roles and verification states are distinct and suitable for the scenarios below. | All test accounts | Not tested |  |  |

## Auth/signup/login

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| AUTH-01 | Sign up, sign out, and sign back in as a customer. | Customer 1 | Not tested |  |  |
| AUTH-02 | Sign up, sign out, and sign back in as a tradie. | Tradie 1 | Not tested |  |  |
| AUTH-03 | Sign in as admin and confirm `/admin` is available. | Admin | Not tested |  |  |
| AUTH-04 | Confirm a non-admin cannot access `/admin`, `/admin/disputes`, or a direct dispute case URL. | Customer 1 / Tradie 1 | Not tested |  |  |
| AUTH-05 | Return to the app after switching tabs and confirm the same signed-in account remains usable without a full auth loading interruption. | Customer 1 / Admin | Not tested |  |  |
| AUTH-06 | Switch between test accounts and confirm the new account profile/permissions replace the previous account. | Customer 1 / Tradie 1 / Admin | Not tested |  |  |

## Customer job creation flow

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| JOB-01 | Create a job with required title, details, category, location, budget, and timing fields. | Customer 1 | Not tested |  |  |
| JOB-02 | Confirm the new job appears under My Jobs with the correct open status and job details. | Customer 1 | Not tested |  |  |
| JOB-03 | Confirm the open job is visible in public job browsing without exposing private contact details. | Customer 1 / Guest | Not tested |  |  |
| JOB-04 | Confirm another customer cannot apply to the job. | Customer 2 | Not tested |  |  |

## Tradie quote/apply flow

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| QUOTE-01 | Submit a quote/application to the open job as an approved tradie. | Tradie 1 | Not tested |  |  |
| QUOTE-02 | Confirm the submitted quote is visible to the tradie and job owner with the correct amount/details. | Tradie 1 / Customer 1 | Not tested |  |  |
| QUOTE-03 | Accept the quote and confirm the accepted-but-unfunded job state. | Customer 1 | Not tested |  |  |
| QUOTE-04 | Confirm an unverified tradie cannot quote/apply. | Tradie 2 unverified | Not tested |  |  |
| QUOTE-05 | Suspend a tradie and confirm the suspended tradie cannot quote/apply. | Admin / Tradie 2 | Not tested |  |  |
| QUOTE-06 | Confirm a tradie cannot apply to a non-open job. | Tradie 2 | Not tested |  |  |

## Admin verification/whitelist flow

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| VER-01 | Submit an identity verification document and confirm it enters the pending admin queue. | Customer 1 | Not tested |  |  |
| VER-02 | Submit tradie credentials and confirm they enter the pending whitelist queue. | Tradie 1 | Not tested |  |  |
| VER-03 | Approve identity verification and confirm the account status updates. | Admin / Customer 1 | Not tested |  |  |
| VER-04 | Approve the tradie credential and whitelist the tradie. | Admin / Tradie 1 | Not tested |  |  |
| VER-05 | Reject a verification with notes and confirm the result is shown correctly. | Admin / test account | Not tested |  |  |
| VER-06 | Confirm whitelisted tradie UUID text is present and readable in the admin directory. | Admin | Not tested |  |  |

## Protected payment simulation/contact gating

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| PAY-01 | Confirm contact details stay locked after quote acceptance and before simulated funding. | Customer 1 / Tradie 1 | Not tested |  |  |
| PAY-02 | Run the protected-payment funding simulation. | Customer 1 | Not tested |  |  |
| PAY-03 | Confirm the funded/payment-held state appears correctly for both parties. | Customer 1 / Tradie 1 | Not tested |  |  |
| PAY-04 | Confirm contact details unlock only for the job owner and accepted tradie after funding. | Customer 1 / Tradie 1 | Not tested |  |  |
| PAY-05 | Confirm Customer 2 and Tradie 2 cannot see the funded job's private contact details. | Customer 2 / Tradie 2 | Not tested |  |  |
| PAY-06 | Confirm the platform fee and contractor payout breakdown use the simulated funded amount correctly. | Customer 1 / Tradie 1 | Not tested |  |  |

## Completion proof flow

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| PROOF-01 | Submit completion notes and supported proof images as the accepted tradie. | Tradie 1 | Not tested |  |  |
| PROOF-02 | Confirm the job moves to `completed_pending_review` / Under Review. | Customer 1 / Tradie 1 | Not tested |  |  |
| PROOF-03 | Confirm completion notes and signed image previews load for authorised users. | Customer 1 / Tradie 1 | Not tested |  |  |
| PROOF-04 | Confirm the wrong tradie cannot submit completion proof. | Tradie 2 | Not tested |  |  |
| PROOF-05 | Confirm unsupported or oversized proof uploads are rejected safely. | Tradie 1 | Not tested |  |  |

## Customer review flow

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| REVIEW-01 | Open the dedicated Review Completion workflow and inspect proof notes/images. | Customer 1 | Not tested |  |  |
| REVIEW-02 | Confirm the 72-hour review countdown appears for the customer and accepted tradie. | Customer 1 / Tradie 1 | Not tested |  |  |
| REVIEW-03 | Approve completed work and confirm simulated payment release/completed job state. | Customer 1 | Not tested |  |  |
| REVIEW-04 | Confirm unrelated users cannot approve or review the completion. | Customer 2 / Tradie 2 | Not tested |  |  |

## Dispute flow

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| DSP-01 | Raise a dispute from the customer review flow with a required complaint. | Customer 1 | Not tested |  |  |
| DSP-02 | Upload dispute evidence images and confirm authorised previews load. | Customer 1 / Admin | Not tested |  |  |
| DSP-03 | Confirm the job remains disputed and the simulated protected payment remains held for review. | Customer 1 / Tradie 1 | Not tested |  |  |
| DSP-04 | Confirm unrelated users cannot access private complaint/evidence details. | Customer 2 / Tradie 2 | Not tested |  |  |
| DSP-05 | If supported locally, resolve separate cases through full contractor release, full customer refund, and manual split; verify resulting completed/cancelled states. | Admin / Customer 1 / Tradie 1 | Not tested |  |  |

## Admin dispute case management

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| ADM-DSP-01 | Confirm Active Disputes count/summary and Manage Disputes link work on `/admin`. | Admin | Not tested |  |  |
| ADM-DSP-02 | Confirm `/admin/disputes` separates ongoing and completed/resolved cases correctly. | Admin | Not tested |  |  |
| ADM-DSP-03 | Confirm each list entry shows job title/ref, customer, contractor, disputed date, amount, status, and correct Open Case link. | Admin | Not tested |  |  |
| ADM-DSP-04 | Confirm `/admin/disputes/:jobId` shows the complete case file, complaint, proof, evidence, payment details, and current internal note. | Admin | Not tested |  |  |
| ADM-DSP-05 | Save Request More Evidence and confirm only the internal note changes; the case stays open and no notification is claimed. | Admin | Not tested |  |  |
| ADM-DSP-06 | Save Escalate / Keep Under Review and confirm the case remains open. | Admin | Not tested |  |  |
| ADM-DSP-07 | Confirm resolved cases show their resolution status and cannot reopen the resolution console. | Admin | Not tested |  |  |
| ADM-DSP-08 | Open a missing/invalid case URL and confirm the not-found state is safe. | Admin | Not tested |  |  |

## Guest browsing/gating

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| GST-01 | Browse open jobs while signed out without a full-page authentication error. | Guest | Not tested |  |  |
| GST-02 | Browse public tradie/customer directory information while signed out. | Guest | Not tested |  |  |
| GST-03 | Confirm guest save, apply, post-job, My Jobs, and protected actions are gated appropriately. | Guest | Not tested |  |  |
| GST-04 | Confirm guests cannot access private contacts, proof/evidence, admin pages, or account-only data. | Guest | Not tested |  |  |

## Mobile/responsive manual review

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| MOB-01 | Review navigation, filters, job cards, forms, and primary actions at a mobile viewport. | Guest / Customer / Tradie | Not tested |  |  |
| MOB-02 | Review Job Details, Submit Completion, and Review Completion modal sizing, scrolling, and close controls. | Customer 1 / Tradie 1 | Not tested |  |  |
| MOB-03 | Review Admin dashboard tables/cards and dispute list/case pages at narrow widths. | Admin | Not tested |  |  |
| MOB-04 | Confirm enlarged helper text, labels, badges, UUIDs, and metadata do not obviously overlap or clip. | All roles | Not tested |  |  |

## Wording/content checks

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| WORD-01 | Confirm no user-facing `escrow` wording remains; use protected/secure payment wording. | All roles | Not tested |  |  |
| WORD-02 | Confirm admin UI uses Contractor while internal role behavior remains tradie. | Admin | Not tested |  |  |
| WORD-03 | Confirm Request More Evidence/Escalate does not claim either party was notified. | Admin | Not tested |  |  |
| WORD-04 | Confirm simulated payment wording does not imply a real provider charge, payout, or settlement occurred. | Customer / Tradie / Admin | Not tested |  |  |

## Regression checks from v0.0.12–v0.0.14

| ID | Test item | Related account/role | Status | Tester notes | Bug/follow-up task |
|---|---|---|---|---|---|
| REG-01 | Confirm My Jobs tab/status filtering and Open Jobs sorting/filtering still work. | Customer 1 / Tradie 1 | Not tested |  |  |
| REG-02 | Confirm Job Details overlay starts below the visible header, closes outside/Escape, and restores body scrolling. | Customer 1 / Tradie 1 | Not tested |  |  |
| REG-03 | Confirm admin toast/confirmation UI replaces native browser alert/confirm dialogs. | Admin | Not tested |  |  |
| REG-04 | Confirm the Admin dashboard four stats tiles and verification/whitelist queues still load after returning to the tab. | Admin | Not tested |  |  |
| REG-05 | Confirm the dispute resolution console has five actions, dollar-based manual split fields, and a correct preview. | Admin | Not tested |  |  |
| REG-06 | Confirm customer/contractor identity, contact, UUID, metadata, badge, and helper text remain readable without obvious clipping. | All roles | Not tested |  |  |
| REG-07 | Confirm same-user session recovery does not blank the app, sign-out clears access, and account switching changes permissions. | Customer 1 / Tradie 1 / Admin | Not tested |  |  |
| REG-08 | Confirm Jobs loads once normally on first navigation and manual refresh still works. | Guest / Customer / Tradie | Not tested |  |  |
| REG-09 | Confirm completed jobs appear in completed/past areas and cancelled jobs display correctly where supported. | Customer 1 / Tradie 1 | Not tested |  |  |

## Test run outcome

| Outcome field | Result |
|---|---|
| Overall status | Not tested |
| Blocking bugs |  |
| Follow-up tasks created |  |
| User approval decision | Awaiting manual testing — not approved |

