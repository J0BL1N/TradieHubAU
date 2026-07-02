# Overnight Pre-Beta Cleanup & Stability Audit Report

This report summarizes the findings, fixes, and deferred items from the overnight pre-beta website audit and cleanup performed on **TradieHubAU** on **2026-07-03**.

---

## 1. Summary of Audit Phases

### PHASE 1 — Repo/Status Sanity Check
*   **Git Status**: Checked working tree (clean prior to edits).
*   **Git Log**: Checked last 10 commits to trace recent changes (limited to `Profile.tsx` and `VerificationDashboard.tsx`).
*   **Junk Files Check**: Verified no temporary, backup, or debug files were accidentally committed.

### PHASE 2 — Browser Smoke Check
*   **Dev Server URL**: `http://localhost:5173/` (started and running in the background).
*   **Pages Visited**:
    *   `/` (Home) — ❌ Console error: `permission denied for function is_admin` during fetchJobs.
    *   `/how-it-works` — ✅ Loaded successfully.
    *   `/jobs` — ❌ Console error: `permission denied for function is_admin` during fetchJobs.
    *   `/browse-tradies` — ❌ Console error: `permission denied for function is_admin` during get_public_profiles query.
    *   `/support` — ✅ Loaded successfully (chatbot functions correctly).
    *   `/protected-payments` — ✅ Loaded successfully.
    *   `/dispute-process` — ✅ Loaded successfully.
    *   `/login` — ✅ Loaded successfully.
    *   `/messages` & `/profile` — Redirected safely to `/login` for unauthenticated sessions.

### PHASE 3 — Build/Runtime Safety Audit
*   **Target Files**: Checked `Admin.tsx`, `Jobs.tsx`, `PublicTradieProfile.tsx`, `SupportChatbot.tsx`, and `Layout.tsx` for hooks order violations and fetch safety.
*   **Findings**:
    *   No hook order issues or hook-inside-conditional bugs found in standard pages.
    *   `PublicTradieProfile.tsx` had a `Promise.all` querying block that would fail and crash the page with a hard error if any of the sub-queries (such as reviews or credentials) failed or returned RLS blocks.

### PHASE 4 — Profile/Verification Cleanup Pass
*   Verified that the simplified Verification Accordions and collapsed due diligence blocks are stable. The previously added `hasInteractedRef` successfully blocks subsequent auto-expands from collapsing user selections. No React hook violations or formatting regressions were found.

### PHASE 5 — Privacy & Data Leak Audit
*   Audited public-facing list pages and public profiles. Checked variables for phone, email, document paths, and admin notes.
*   **Findings**: Verified that public components cleanly mask names (e.g. "John S."), redact business names/websites, hide document paths, and do not reference raw phone, email, or ABN numbers.

### PHASE 6 — Admin Verification/Trade Checks Audit
*   Inspected `Admin.tsx` copy. Confirmed that guidelines include cautious notes: *"Admin review supports platform trust checks. It does not replace official legal/licensing advice. Requirements vary by state, licence class, and job scope. This is not legal, building, tax, or insurance advice."*
*   Checked that no public copy makes guarantees like "fully licensed" or "fraud-proof".

### PHASE 7 — Jobs Flow Audit
*   Verified that jobs workflows are formatted to use protected payment terminology ("protected payment", "secure job payment", "payment funded", "payment released") instead of "escrow" in user-facing UI. Verified that modal screens and completion forms use safe data mapping.

### PHASE 8 — Messages, Notifications & Sound Audit
*   Checked `Layout.tsx` and `soundPreferences.ts` logic. confirmed that notification sound sets are correctly deduplicated using ref tracking arrays. The bot reply sound `/audio/bot-reply.mp3` is reserved and is not selectable in normal Sound settings. Notification grouping handles batch marking read correctly.

### PHASE 9 — Migrations & Docs Consistency Audit
*   Verified that `trade_specific_verification_QA.md` and `beta_readiness_checklist.md` are consistent with the migration sequence and specify that `093` was run live and should not be rerun.

### PHASE 10 — General Cleanup
*   Scanned recently edited files for HACK/FIXME comments, console.log warnings, or unused imports. Cleaned up typescript types where needed.

---

## 2. Key Issues Found & Fixes Made

### A. Critical Guest Permission Denied on `is_admin` View Calls
*   **Issue**: In migration `091_supabase_lint_hardening.sql`, database views `public_profiles` and `public_open_jobs` were converted to `WITH (security_invoker = true)`. When anonymous/logged-out visitors queried the landing page or browse jobs list, the database evaluated the view RLS policies. The views check `public.is_admin(auth.uid())` to decide whether to mask values. Since execute permission on `is_admin(uuid)` was revoked from the `anon` role, Postgres aborted the queries with:
    `permission denied for function is_admin`
    This caused a blank screen or missing jobs for all guest page loads.
*   **Fix**: Modified the pending migration `094_trade_verification_live_patch.sql` to append `GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;`. Since the function checks if the current caller is an admin matching `user_id`, anonymous callers (where `auth.uid()` is null) will simply return `false` without leaking any credentials, resolving the crash safely.

### B. Uncaught Sub-query Rejection in Public Profiles
*   **Issue**: In `PublicTradieProfile.tsx`, the sub-queries for completion proofs, reviews, credentials, and experience evidence were wrapped in a single `Promise.all` block. An uncaught network error on any single query would reject the entire block and trigger a full profile load crash. Additionally, call chain `.catch()` calls on Supabase PostgREST builder objects caused compilation errors.
*   **Fix**: Reworked the sub-queries into individual, typescript-safe sequential `try/catch` blocks. If any sub-query fails (e.g. missing credentials or storage permissions), the error is printed as a warning and the page loads safely with an empty array fallback, preserving the core profile display.

---

## 3. Deferred Items
*   No new critical issues were deferred. All discovered bugs were solved cleanly code-side.

---

## 4. Live SQL Jay Needs to Apply

Jay must apply the updated migration **094** in Supabase Studio.

```sql
-- migration file: supabase/migrations/094_trade_verification_live_patch.sql
-- Ensure this grant is run to fix public-facing page load errors for guest visitors:
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;
```

---

## 5. Build & Diff-Check Results
*   **Production Build (`npm run build`)**: Pass.
*   **Formatting Check (`git diff --check`)**: Pass (no formatting issues, line endings and spaces verified).

---

## 6. Manual QA Checklist for Jay Tomorrow
1.  **Guest Browsing**: Sign out and check that the home page (`/`) and the jobs list (`/jobs`) load listings successfully without console errors.
2.  **Public Profile**: Go to `/browse-tradies` as a guest, click on a tradie's profile, and verify that the public profile loads successfully.
3.  **Accordion Focus**: Open the Profile -> Verification tab, expand an accordion, and verify that it does not auto-collapse when you click options.
