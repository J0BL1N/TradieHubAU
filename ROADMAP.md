# Product Roadmap — TradieHubAU

## 1. Current Status Summary
*   **Project Structure**: Restructured and flattened successfully.
*   **Active App Location**: The active React/Vite web application resides in [frontend/](file:///F:/TradieHubAU/frontend).
*   **Database & Backend Location**: The local Supabase config and migration scripts reside in [supabase/](file:///F:/TradieHubAU/supabase).
*   **Legacy Site**: The old static prototype has been removed from git tracking and archived under `archive/legacy-static-aussietradiehub/`.
*   **Local Development**: Currently running locally via Vite. Run it with:
    ```bash
    cd F:\TradieHubAU\frontend
    npm run dev
    ```

---

## 2. Core Vision
TradieHubAU is an Australian tradie marketplace focused on building a secure, local, and trustworthy platform. Key core pillars include:
*   **Verified Tradies**: ID, licence, and ABN verification checked manually by administrators.
*   **Customer-Posted Jobs**: Straightforward posting of trade requirements by homeowners and businesses.
*   **Quotes & Applications**: Simple quoting workflow for verified tradespeople.
*   **Protected Payments**: Funding held securely in the platform and only released to the tradie upon successful job completion.
*   **Completion Review**: Structured completion workflow with built-in dispute capabilities.
*   **Local-First Operations**: Launched regionally first to build community trust and dense user clusters.

---

## 3. Current Completed Work
*   **React/Vite Frontend**: Modern, responsive interface with design tokens and styling systems.
*   **Supabase Integration**: Live connection for auth and DB operations.
*   **Authentication & Signups**: Email sign-in, onboarding, and role selection (Tradie/Customer).
*   **Admin Dashboard**: Dedicated guard and page for verification checks.
*   **Verification Splitting**: Separated governmental ID verification from trade licence/ABN verification.
*   **Quote Gating**: Only verified tradies can submit bids/quotes on active jobs.
*   **Jobs Board**: Completed Browse Jobs grid, detail modals, and Saved Jobs tracking.
*   **Saved Jobs Filter**: A toggle to show only saved jobs (without visible counters).
*   **Tabs Consolidation**: Reduced tabs down to "Open Jobs" (public marketplace) and "My Jobs" (user-connected dashboard).
*   **My Jobs Status Filter**: Context-aware dropdown to filter jobs by their current lifecycle state.
*   **Secure Payment Simulation**: Button simulating funding capture ("Payment Funded / Contract Active") and updating the payment ledger.
*   **Copy Cleanup**: Fully replaced user-facing "escrow" terminology with launch-ready terms like "protected payment" and "secure job payment".

---

## 4. Immediate Next Tasks
*   Commit and push the copy cleanup files after review.
*   Confirm git repository cleaning is complete (old legacy folders untracked and ignored).
*   Conduct a full end-to-end customer, tradie, and admin flow manual test.
*   Fix the Jobs stats card count mismatch (if present).
*   Improve Browse Tradies empty/sparse state with search previews.
*   Seed realistic demo jobs owned by a registered customer test account for development testing.
*   Prepare the security audit task checklist.
*   Document the Supabase production setup checklist.

---

## 5. Version Roadmap
*   **v0.0.1 Project Foundation**: Initial Vite configuration and setup.
*   **v0.0.2 Homepage & Brand Foundation**: Styling layout, theme definitions, and landing elements.
*   **v0.0.3 Auth & User Accounts**: Supabase Auth setup and user profile linking.
*   **v0.0.4 Job Board MVP**: Creating, editing, and listing jobs.
*   **v0.0.5 Tradie Verification MVP**: Upload flow and Admin check queues.
*   **v0.0.6 Quotes/Applications MVP**: Tradies quoting on customer listings.
*   **v0.0.7 Protected Payment Simulation**: Ledger records, escrow state simulation, and status bars.
*   **v0.0.8 Completion/Review/Dispute MVP**: Submitting work proof, 7-day review timer, and disputes.
*   **v0.0.9 Admin Operations MVP**: Admin approval, dispute resolution payouts, and user management.
*   **v0.0.10 Project Structure Cleanup**: Flattening folder hierarchy, moving `.git`, and cleaning legacy assets.
*   **v0.0.11 Public ID Foundation**: Mapping unique user and job hashes for secure URLs.
*   **v0.0.12 Private Analytics Foundation**: Back-office platform metrics dashboard.
*   **v0.1.0 Local Beta Ready**: Controlled local testing build with full responsive support.
*   **v0.1.1 Invoice Foundation**: Simple payment statements for completed work.
*   **v0.2.0 Paid Local Launch Ready**: Real payment integrations and legal compliance checks.
*   **v0.2.5 Mobile App Planning**: Scoping cross-platform wrapper details.
*   **v0.3.0 Mobile App MVP**: Native app layout checks.
*   **v0.3.1 Service Code / SKU System**: Standardized scope pricing indicators.
*   **v1.0.0 Serious Public Launch**: Production app release in target app stores and web.

---

## 6. Future Planned Systems (Post-Beta / Production Launch)
*   **Real Payment Provider Integration**: Integration with a secure payment processor (e.g. Stripe Connect) to replace the current simulated protected payment/ledger flow.
*   **Stripe Money Movement Lifecycle**: Handling real payout, release, refund, and dispute money movements programmatically.
*   **Platform Fee Reconciliation**: Automatic ledger tracking and reconciliation of the platform's service fee revenue.
*   **GST & Accountant Review**: Complete legal, tax, and accounting audit of the simulated invoicing/receipt generation code before real public money launch.
*   **Finance & Accounting Exports**: Generating standard financial export logs (CSV/XERO format) for reconciliation and accounting.
*   **Public Unique ID System**: Public profiles using secure hashes rather than internal UUIDs.
*   **Service Code / SKU System**: Fixed scope-of-work template options for faster quoting.
*   **Dispute Arbitration Queue**: Refined ticket flow for admin resolution.
*   **Completed Job Reviews**: Double-blind post-project feedback.
*   **Notification System**: Real-time push, in-app, and transactional email alerts.
*   **My Tradies (Future UX Feature)**: A saved list for customer convenience. Customers can bookmark/save favorite tradies, view previously hired contractors, and request quotes or rehire them easily. Access is fully guarded by public-safe identity controls to prevent direct contact bypass before quote acceptance.

---

## 7. Mobile App Note
*   A dedicated mobile app is planned before our full public launch.
*   For now, the priority remains polishing the responsive web application and ensuring local beta readiness.
*   Mobile app implementation will not begin until the web MVP, security audits, legal/payment planning, and the local beta flow are fully stabilized.

---

## 8. Payment Wording Rule
*   **Do not use the word "escrow" in user-facing copy.**
*   Always use approved terms:
    *   *Protected payment*
    *   *Secure job payment*
    *   *Payment funded*
    *   *Payment held until completion*
    *   *Payment released after completion*
    *   *Completion review period*

---

## 9. Launch Timeline
*   **Controlled Local Beta**: 4–8 weeks (testing core flows with select local users).
*   **Paid Local Launch**: 8–12+ weeks (integrating real payment processors and legal frameworks).
*   **Local Growth Stage**: 3–6 months post-beta (building user density in targeted launch areas).
*   **Serious Public Launch**: 6–12+ months (expanding target areas based on traction).

---

## 10. Local Launch Strategy
*   Although the website will be accessible Australia-wide, operations and marketing will launch locally first.
*   **Target Region**: South East Melbourne / outer south-east Melbourne.
*   Out-of-region signups will be waitlisted or categorized as registering interest to ensure high initial matching density.

---

## 11. Security Priorities
*   **RLS Audit**: Full review of Supabase Row-Level Security policies on all tables.
*   **Storage Buckets**: Restrict read/write permissions on uploads and verify private file access rules.
*   **Env/Service Keys**: Review client bundle exposure and prevent leaks of Supabase service role keys.
*   **Admin Dashboard Permissions**: Harden admin checks to prevent privilege escalation.
*   **Production Environment Setup**: Enable hosted platform security locks, database backups, and restore protocols.

---

## 12. Business/Legal Priorities
*   Review partner/business ownership structure.
*   Perform trademark search and registration.
*   Finalize Privacy Policy and Terms of Service.
*   Draft specialized Tradie and Customer Service Terms.
*   Formulate a payment dispute and refund policy.
*   Ensure full legal/accounting audits are executed prior to processing real transactions.

---

## 13. Metrics to Track
*   Active users (Tradies vs. Customers)
*   Manual document verification approval times
*   Total jobs posted & average budget
*   Total quotes submitted & quote acceptance rate
*   Gross Job Value (GJV)
*   Platform service fee revenue (5%)
*   Average job completion duration
*   Dispute/issue rates
*   Customer/Tradie retention (repeat usage)
