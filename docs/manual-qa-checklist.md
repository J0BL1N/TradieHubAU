# TradieHubAU Manual QA Test Checklist

This document provides a comprehensive, step-by-step manual QA checklist for validating the **TradieHubAU** application. Manual testing should be performed in the browser using a local or development Supabase instance.

---

## General Testing Context & Credentials

For local manual testing, use the following test account parameters. 
*(Ensure no real email addresses are entered into forms during testing).*

*   **Payer/Customer Test Account (Jay)**:
    *   **Email**: `customer.test@tradiehub.au`
    *   **Role**: Homeowner / Customer (starts as `customer` in `users` table)
*   **Whitelisted Tradie Test Account (Lingo)**:
    *   **Email**: `tradie.test@tradiehub.au`
    *   **Role**: Approved Tradie (starts as `customer`, requests verification, whitelisted by admin)
*   **Staff Admin Test Account (Jay/Admin)**:
    *   **Email**: `admin.test@tradiehub.au`
    *   **Role**: Staff Admin (`is_admin = true` on `users` table)

---

## Test Checklist Sections

### A. Visitor / Public Pages

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **A-1** | Homepage Load & Copy | Visitor (Logged Out) | `/` | 1. Load the homepage.<br>2. Inspect headings, stats, and testimonials.<br>3. Verify that no references to "escrow" exist in the copy. | Homepage loads with rich styles, dark/teal palette. No occurrences of "escrow" found (replaced by "secure payment" or "protected payment"). | [ ] | Check all FAQs and footer links. |
| **A-2** | Search Redirection | Visitor (Logged Out) | `/` | 1. Type "Electrical" in "What do you need done?".<br>2. Type "Richmond" in "Suburb or Postcode".<br>3. Click "Search Tradies" button. | Browser redirects to `/browse-tradies` search directory. | [ ] | Note: Homepage form redirects to `/browse-tradies` but does not carry query params to input fields yet. |
| **A-3** | Category Navigation | Visitor (Logged Out) | `/` | 1. Click on "Plumbing" category card. | Browser redirects to `/jobs?category=Plumbing` (handled as `category=Plumbing` query parameter). | [ ] | Redirect should automatically filter the Jobs board. |
| **A-4** | Navigation Bar Links | Visitor (Logged Out) | `/` | 1. Click "Browse Jobs" link in header.<br>2. Click "Browse Tradies" link in header. | Redirects to `/jobs` and `/browse-tradies` respectively. Join / Sign In buttons are visible. | [ ] | Layout header and footer are sticky/responsive. |
| **A-5** | Hidden Directories Check | Visitor (Logged Out) | Direct URL | 1. Navigate directly to `/browse-customers`. | Page loads customer directory. | [ ] | **UX Issue**: `/browse-customers` is a live route but has no header/footer links navigating to it. |

---

### B. Auth / Account Switching

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **B-1** | Join / Registration | New User | `/login` | 1. Click "Join Now" tab.<br>2. Enter display name, email, and password (min 6 chars).<br>3. Submit. | Account created. Minimal customer profile is automatically seeded in `users` table. User is signed in and redirected to home. | [ ] | Real email confirmation depends on local SMTP emulator (Mailpit). |
| **B-2** | Login Gating Redirect | Visitor | `/post-job` | 1. Navigate directly to `/post-job` while logged out. | Gated lock screen displays asking to Sign In / Register. | [ ] | The "Sign In" button includes `state={{ from: location }}` to return user back post-login. |
| **B-3** | Login & Profile Sync | Existing User | `/login` | 1. Sign in with customer credentials. | User logs in successfully and display name initializes correctly in header dropdown. | [ ] | Sync checked by `AuthProvider`. |
| **B-4** | Sign Out | Logged In | Header Dropdown | 1. Click profile avatar dropdown.<br>2. Click "Sign Out". | User logs out. Redirects to `/` index page. Profile settings are flushed from cache. | [ ] | Dropdown closes on click outside. |

---

### C. Customer Flow

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **C-1** | Profile Info Update | Customer | `/profile` | 1. Change display name, phone, suburb, state, postcode.<br>2. Change address visibility rule.<br>3. Click "Save Changes". | "Saved successfully" toast displays. Values are persisted to database. | [ ] | Verify database row update in users table. |
| **C-2** | Post a Job Flow | Customer | `/post-job` | 1. Fill out Title (min 5 chars), Category, Urgency, Job Type, Suburb, State, Budget Min/Max, and Description (min 20 chars).<br>2. Click "Post Job Request". | Success modal displays. Redirects to Jobs board. | [ ] | Validates character limits and budget bounds. |
| **C-3** | My Posted Jobs View | Customer | `/jobs` | 1. Click "My Jobs" tab.<br>2. Verify that your recently posted job is visible. | Job displays under "My Jobs" tab in "open" status. | [ ] | Customer-posted jobs are listed in memory. |

---

### D. Tradie Verification Flow

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **D-1** | Identity Document Upload | Customer (unverified) | `/profile` | 1. Scroll to Identity Verification.<br>2. Select Document Type.<br>3. Select a mock photo ID image file.<br>4. Click "Submit ID". | File is uploaded to `verifications` storage bucket. Row is added to `verifications` table in `pending` status. | [ ] | Verification status changes to "ID Verification Pending Review" client-side. |
| **D-2** | Tradie Whitelist Application | Customer (unverified) | `/profile` | 1. Scroll to "Apply for Tradie Approval".<br>2. Enter ABN (11-digit), license number, and select trade categories.<br>3. Select a mock license PDF/image file.<br>4. Click "Submit Document". | File is uploaded. Profile ABN/License details are updated. A `pending` verification record is created. | [ ] | Application status changes to "Tradie Approval Request Pending Review". |
| **D-3** | Locked Profile Inputs | Tradie (pending) | `/profile` | 1. Attempt to change ABN, license number, or trades list while verification is pending. | Inputs are disabled or database throws trigger exception on update. | [ ] | **Critical DB Rule**: ABN/License/Trades are locked while verification is pending/approved to prevent cheating. |

---

### E. Admin Verification Flow

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **E-1** | Admin Access Gate | Staff Admin | `/admin` | 1. Log in with admin account.<br>2. Navigate to `/admin`. | Dashboard displays stats (Pending Approvals, Total Tradies, Whitelisted Tradies) and verification queues. | [ ] | Check that a non-admin gets "Access Denied" screen. |
| **E-2** | Verification Queues Hydration | Staff Admin | `/admin` | 1. Inspect the "Pending Customer Identity Verifications" and "Pending Tradie Whitelist Applications" tables. | Pending submissions are hydrated. | [ ] | **Critical Blocker Found**: Due to missing select policy on `verifications` table, this list hydrates as **EMPTY** for admins. |
| **E-3** | Signed Storage Download Links | Staff Admin | `/admin` | 1. Click "View File" or "View Upload" link next to a document submission. | Link opens in new tab generating a secure 60s signed download URL. | [ ] | Check browser logs for signed URL exceptions. |
| **E-4** | Identity Approval | Staff Admin | `/admin` | 1. Click "Approve ID" button. | Identity is approved. In database, `identity_verified` on users table changes to `true`. | [ ] | Triggers `approve_identity_verification` RPC. |
| **E-5** | Whitelist Tradie Approval | Staff Admin | `/admin` | 1. Click "Whitelist Tradie" button. | Profile is whitelisted. In database, `tradie_verified` changes to `true` and role changes to `'tradie'`. | [ ] | **DB Safety Gate**: Will throw exception if identity is not verified first, or if license/insurance files aren't approved. |
| **E-6** | Reject Document Submission | Staff Admin | `/admin` | 1. Click "Reject Doc" or "Reject".<br>2. Enter rejection reason.<br>3. Submit rejection. | Status changes to `'rejected'`. Admin notes are saved. Tradie/Customer sees rejection reason and re-submit options. | [ ] | Triggers `reject_verification` RPC. |
| **E-7** | Revoke / Suspend Admin Action | Staff Admin | `/admin` | 1. Find whitelisted tradie under "Active Whitelisted Tradies" table.<br>2. Click "Suspend Tradie" or "Revoke ID". | Account status updates. Whitelist is revoked and role is downgraded back to customer. | [ ] | Triggers `suspend_tradie_profile` / `suspend_identity_verification` RPCs. |

---

### F. Quote / Application Flow

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **F-1** | Unverified Tradie Block | Unverified Tradie | `/jobs` | 1. Click "Apply" on an active job card. | Button displays disabled status or toast warning: "Verification Required: Only verified tradies can quote...". | [ ] | Evaluated via `isVerifiedTradie` client gate + database INSERT RLS check. |
| **F-2** | Submit Quote | Verified Tradie | `/jobs` | 1. Click "Apply" on an active job card.<br>2. Enter cover message (min 20 chars), quote estimate ($), and availability.<br>3. Submit. | Modal success screen displays. In database, application row is created under `pending` status. | [ ] | Verified tradie must have both `identity_verified` and `tradie_verified` true. |
| **F-3** | Duplicate Bid Block | Verified Tradie | `/jobs` | 1. Attempt to apply to the same job again. | UI displays "Applied ✓" disabled button, preventing duplicate submissions. DB duplicate constraint enforced. | [ ] | Handled via `unique_application` DB index. |
| **F-4** | View Quotes | Customer (Job Owner) | `/jobs` (My Jobs) | 1. Open the posted job details modal.<br>2. Verify quotes list. | All submitted bids display with tradie details, cover message, and quote values. | [ ] | Hydrates from `getApplicationsForJob` query. |
| **F-5** | Accept Quote | Customer (Job Owner) | `/jobs` (My Jobs) | 1. Open posted job details modal.<br>2. Click "Accept Quote" next to a bid. | Quote status changes to `'accepted'`. Other bids change to `'declined'`. Job status changes to `'accepted'`. | [ ] | Triggers `accept_quote` RPC. Creates a pending payment record. |

---

### G. Protected Payment Simulation Flow

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **G-1** | Awaiting Payment State | Customer / Tradie | `/jobs` (My Jobs) | 1. Filter by status "Awaiting Payment" or open accepted job modal. | Interface displays "Secure Payment Required — Fund Contract" simulation alert box. | [ ] | Payment status in DB is `'pending'`, job status is `'accepted'`. |
| **G-2** | Fund Contract Simulation | Customer (Job Owner) | `/jobs` (My Jobs) | 1. Open accepted job details.<br>2. Click "Simulate Secure Payment Funding". | Job status changes to `'payment_held'` (Payment Funded / Contract Active). Payment status changes to `'held'`. Ledger charge is recorded. | [ ] | Triggers `simulate_payment_funding` RPC. |
| **G-3** | Submit Price Variation | Tradie (Assigned) | `/jobs` (My Jobs) | 1. Open active job modal.<br>2. Enter description and dollar amount in "Submit Price Variation".<br>3. Submit. | Variation request row created in database under `'pending'` status. | [ ] | Triggers `submit_variation_request` RPC. |
| **G-4** | Approve Variation | Customer (Job Owner) | `/jobs` (My Jobs) | 1. Open active job modal.<br>2. Locate pending variation request.<br>3. Click "Approve Variation". | Variation status moves to `'approved_awaiting_payment'`. | [ ] | Triggers `approve_variation` RPC. |
| **G-5** | Fund Variation Simulation | Customer (Job Owner) | `/jobs` (My Jobs) | 1. Click "Fund Variation" button next to approved variation. | Variation status moves to `'approved'`. Payment total amount is increased. Ledger charge is recorded. | [ ] | Triggers `simulate_variation_funding` RPC. |
| **G-6** | Submit Completion Proof | Tradie (Assigned) | `/jobs` (My Jobs) | 1. Open in-progress job details modal.<br>2. Write description of completed work.<br>3. Click "Submit Completion". | Job status changes to `'completed_pending_review'`. Completion proof row created. | [ ] | **Mock Notice**: Hardcodes file attachment paths instead of uploading new files. |
| **G-7** | Release Payout | Customer (Job Owner) | `/jobs` (My Jobs) | 1. Open job details.<br>2. Review proof details.<br>3. Click "Approve Completion". | Payment status changes to `'released'`. Job status changes to `'completed'`. Ledger transaction entries created (Payout + Fee). | [ ] | Triggers `approve_job_completion` RPC. |
| **G-8** | Raise Dispute | Customer (Job Owner) | `/jobs` (My Jobs) | 1. Open job in review status.<br>2. Click "Raise an Issue / Dispute".<br>3. Enter details and submit. | Job status changes to `'disputed'`. Dispute row created in `job_issues` table. | [ ] | Triggers `raise_job_issue` RPC. |
| **G-9** | Admin Payout Split Dispute Resolution | Staff Admin | `/admin` | 1. Scroll to "Active Job Disputes".<br>2. Click "Resolve Dispute".<br>3. Select split payout (e.g. 70% tradie / 30% customer).<br>4. Enter findings & submit. | Job status changes to `'completed'`. Payment status changes to `'released'`. Split payouts, platform fees, and refund ledger entries recorded. | [ ] | Triggers `resolve_dispute` RPC. |

---

### H. My Jobs / Saved Jobs / Filter Flow

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **H-1** | Saved Jobs Toggle | Logged In | `/jobs` | 1. Bookmark a job card by clicking bookmark icon.<br>2. Check "Saved Jobs" filter checkbox. | Only the bookmarked/saved job is visible. | [ ] | Saved jobs set hydrates correctly on load. |
| **H-2** | Sidebar Filters | Any | `/jobs` | 1. Select State: "VIC".<br>2. Select Category: "Electrical".<br>3. Type search text. | List filters jobs matching selected criteria. | [ ] | Handled in client memory filter functions. |
| **H-3** | My Jobs Status Dropdown | Logged In | `/jobs` (My Jobs) | 1. Select status: "Quotes Received" or "Contract Active". | List displays only jobs matching both user context and status filters. | [ ] | Hydrates and filters dynamically. |

---

### I. Browse Tradies Flow

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **I-1** | Browse Tradies Directory | Any | `/browse-tradies` | 1. Load directory page.<br>2. Check list elements. | List hydrates with all whitelisted profiles. Non-whitelisted profiles are excluded. | [ ] | Fetches profiles with `'tradie'` or `'dual'` roles. |
| **I-2** | Tradie Search / Category Filter | Any | `/browse-tradies` | 1. Filter by State, Trade Category, or name search. | List filters in real-time. | [ ] | Verify category overlaps filter. |
| **I-3** | verified Checkbox | Any | `/browse-tradies` | 1. Click "Verified Tradies Only" checkbox. | List filters out any dual/tradie roles that do not have `tradie_verified` true. | [ ] | Handled via filter query. |

---

### J. Security / Permission Checks

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **J-1** | Client Admin Gate | Customer | `/admin` | 1. Navigate directly to `/admin`. | Access Denied view is rendered. No dashboard content loaded. | [ ] | gated by `!profile?.is_admin` block. |
| **J-2** | DB Admin RPC Bypass Block | Customer | Direct SQL/RPC API | 1. Call `approve_identity_verification` or `approve_tradie_profile` directly. | Database throws trigger / RPC exception: "Only administrators can...". | [ ] | Checked in DB trigger functions. |
| **J-3** | Self Verification Promotion Block | Customer | Direct SQL/API | 1. Try to directly insert or update profile setting `identity_verified = true` or `is_admin = true`. | Database transaction is rejected. Trigger throws exception. | [ ] | Handled via `protect_user_fields` DB trigger. |
| **J-4** | Bucket Policy isolation | Customer | Direct Storage API | 1. Attempt to download or list files from `users/<other_user_uuid>/` folder in storage bucket. | Storage server rejects request with access denied error. | [ ] | Handled by Storage bucket RLS policies. |

---

### K. Mobile / Responsive Smoke Test

| Test ID | Test Name | Account Type Needed | Starting Page | Exact User Steps | Expected Result | Pass/Fail | Notes / Observations |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **K-1** | Mobile Menu Drawer | Any | `/` (Mobile Viewport) | 1. Resize browser to mobile (under 768px).<br>2. Click hamburger menu button.<br>3. Test navigation links. | Mobile menu overlay opens smoothly and redirect works. hamburger changes to "X" close icon. | [ ] | Menu links adapt to login state. |
| **K-2** | Mobile Filters Drawer | Any | `/jobs` (Mobile) | 1. Click mobile "Filters" button.<br>2. Change filters and click "Apply". | Filter drawer opens as a full-page overlay, allows edits, and updates feed correctly. | [ ] | Adapts on both `/jobs` and `/browse-tradies`. |
| **K-3** | Modal Dialog scaling | Any | `/jobs` (Mobile) | 1. Click job card to open details modal.<br>2. Verify scaling and actions. | Modals fit mobile screens without horizontal scroll. Action buttons wrap cleanly. | [ ] | Test on details modal, apply modal, and variations. |

---

## L. Known Issues Found During Code Inspection

These issues were identified during manual inspections of database migrations and frontend source codes:

### 1. Database Migrations Blockers (Critical)
*   **Missing `is_admin(uuid)` Database Helper Function**: The migrations (`005`, `006`, `008`, `009`, `011`, `013`) call the function `is_admin(auth.uid())` to authorize administrative actions (such as verification, disputes, and RLS bypasses). However, the definition of this function (`CREATE FUNCTION is_admin`) is **missing** from all migration files. Resetting the database from scratch via `npx supabase db reset` will **fail** because this function does not exist.
*   **Missing `is_admin` Column in `users` Table**: The migrations reference `NEW.is_admin` and `OLD.is_admin` inside trigger checks, and the frontend expects `profile.is_admin` to determine admin rights. However, the database schema migrations do not add the `is_admin` boolean column to the `users` table. This causes trigger compilation and client-side profile errors.
*   **Missing Admin Select Policy on `verifications` Table**: The RLS policy for reading rows on the `verifications` table only permits `auth.uid() = user_id`. No select policy exists allowing administrators to see all pending records. Therefore, when an administrator logs in, the pending verification queues on `/admin` will load as **empty**, preventing manual approvals.

### 2. Copy & Layout Inconsistencies (UX)
*   **Unlinked Customer Directory**: The `/browse-customers` route points to `BrowseCustomers.tsx` to search homeowners, but this route is not linked in the main header navigation or footer, making it a hidden page.
*   **Misleading Jobs Page Statistics Cards**: 
    *   The stats cards ("Active Jobs", "Total Job Value", "Urgent Requests") calculate counts over the unfiltered `jobs` list in memory. Changing state or trade categories on the sidebar does **not** update these totals.
    *   When switching to the "My Jobs" tab, the `jobs` array changes to the user's specific posted/applied items. The generic labels "Active Jobs" and "Total Job Value" remain unchanged but display counts belonging to the logged-in user rather than the platform, which is misleading.

### 3. Hardcoded Mock Data (UX / Flow)
*   **Static Chats Board**: The `/messages` page contains completely static mockup chat threads ("Dave Harrison" and "Rebecca Sterling") and mock conversation exchanges. It does not integrate with real database messages or fetch conversational logs from Supabase.
*   **Mock Completion Proof File Paths**: When a tradie submits completion proof in `Jobs.tsx`, the attachment parameter is hardcoded to a mock string (`const mockAttachments = ['users/' + user.id + '/completion_photo_1.png']`) rather than utilizing a file upload input.
