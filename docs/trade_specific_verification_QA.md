# Trade-Specific Licence, Experience, and Credential Verification System (QA & Security Manual)

This manual provides verification protocols, security design constraints, edge cases, and manual test checklists for the Trade-Specific Licence and Experience verification subsystem of TradieHubAU.

> [!WARNING]
> **Live DB Migration Application Instructions:**
> * Jay has already applied the original `093_trade_specific_verification.sql` live.
> * **DO NOT rerun 093 live** on the database; doing so will fail with relations already exists errors.
> * **Apply 094_trade_verification_live_patch.sql live instead** using Supabase SQL Studio. This patch adds the missing security check function and RLS policy updates without modifying tables or deleting existing trade credentials.
> * If Supabase reports another already-exists error in `094`, stop and report the exact error.

---

## 1. Security Architecture & Privacy Boundaries

To prevent leaking sensitive documents or private information publicly, the subsystem is built with strict privacy-first constraints:

### A. Document Storage & Path Redaction
*   **Bucket Rules:** Private files (licence images, qualification PDFs) are uploaded to the private `verifications` bucket.
*   **Path Redaction:** Direct storage paths (`document_storage_path` / `file_storage_path`) are restricted. Only owner users and platform administrators can query the underlying tables (`user_trade_credentials` and `user_experience_evidence`).
*   **Public Views:** Public profiles retrieve verification status from sanitized public views:
    *   `public_user_credentials`
    *   `public_user_experience_evidence`
    These views select only safe fields (`status`, `licence_type_id`, `expiry_date`, `created_at`) and exclude storage paths.

### B. Row-Level Security (RLS)
*   **Select/Insert/Delete:** Handled by strict RLS policies on `user_trade_credentials` and `user_experience_evidence`:
    *   Only the owning user (`auth.uid() = user_id`) or staff administrators (`public.is_admin()`) can query or mutate their records.
    *   Delete is restricted to records in `pending` status to prevent deleting audit-critical approved/historical records.
*   **Admin Override:** Admin controls bypass standard user blocks to permit reviewing, approving, rejecting, or requesting rechecks.

### C. Database-Level Gating (RLS & Check Functions)
*   **Insert Gating on Applications:** Quote submission gating is enforced directly at the database layer via a custom RLS policy check on the `public.applications` table insertion.
*   **`check_user_has_required_licences(uuid, uuid)` Function:** A `SECURITY DEFINER` function with safe `SET search_path = pg_catalog, public` checks the user's state, matches the job categories to the seeded state-specific requirement rules, and ensures the user has a matching, approved, unexpired licence. If a handyman attempts to quote on a regulated category, or if the licence is missing/expired, the database rejects the row insertion.

---

## 2. Risk Boundaries & Disclaimer Disclosures

### A. Non-Legal Certification Disclaimer
The platform does not guarantee legal compliance or verify statutory licensing validity. All user interfaces and admin surfaces must explicitly display caution disclaimers:
> **Caution:** Licence requirement checks support platform trust ratings but do not constitute formal legal advice or certification. State-by-state rules and scopes of work vary.

### B. Handyman Gating Workarounds
To prevent users registered as general handymen from quoting on high-risk or regulated trades:
*   Any contractor quoting on jobs tagged as `electrical`, `plumbing`, `gasfitting`, `roof_plumbing`, `building`, `hvac`, `pest_control`, `asbestos_removal`, `demolition`, `solar_installer`, or `security_installer` must possess a verified A-grade licence matching the state's requirement rules.
*   Handymen profiles are prohibited from quoting on these regulated categories, regardless of experience claims.

---

## 3. QA Testing Checklists & Edge Cases

Use this checklist during staging/production validation:

### Test Case 1: Customer Gating Check
1.  Log in as a user with the role `customer`.
2.  Navigate to `/jobs` and open a job details modal.
3.  Click the "Apply / Quote" button.
4.  **Expected Result:** The quote form is blocked, displaying: *"Only contractors can quote on jobs."*

### Test Case 2: Unverified Contractor Gating Check
1.  Log in as a contractor user whose `tradie_verified` status is `false` (pending base ID check).
2.  Try to quote on any job.
3.  **Expected Result:** The submission is blocked, displaying: *"Your contractor profile must be verified by admin before you can quote."*

### Test Case 3: Missing Trade-Specific Licence Check
1.  Log in as a verified contractor in Victoria (VIC) without a registered electrical licence.
2.  Open a job with category `electrical`.
3.  Click the "Apply" button.
4.  **Expected Result:** The quote submission is blocked, showing: *"This job requires a verified 'A-Grade Electrician Licence' for VIC. Please upload your licence in your Profile."*

### Test Case 4: Expired Licence Gating Check
1.  Log in as a verified contractor with an approved electrical licence in VIC, but modify the licence expiry to a past date.
2.  Attempt to apply for an `electrical` job.
3.  **Expected Result:** Bidding is blocked as the licence is marked expired.

### Test Case 5: Admin Review Actions
1.  Log in as an Administrator.
2.  Go to the Admin Dashboard under the "Queues" tab.
3.  Locate "Pending Trade-Specific Licence Verifications" and "Pending Experience Evidence reviews".
4.  Action a pending item:
    *   **Approve:** Verification status changes to `approved`, trust badge is rendered on the tradie's public profile.
    *   **Reject:** Prompts for rejection reason. Moves status to `rejected`.
    *   **Recheck:** Prompts for recheck notes. Status updates to `recheck`, notifying the user.

---

## 4. Maintenance & Rule Evolution

Trade requirement guidelines seeded during the beta are **starter rules only**. They must be audited and verified before moving beyond the Melbourne/Victorian beta launch phase.
