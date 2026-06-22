# Changelog — TradieHub


## v0.0298

- Customer profile header layout now matches tradie profiles: moved rating/trust into the left rail and placed the **Booked jobs** calendar under trust signals for a cleaner hierarchy.
- Added a Homeowner pill under the customer name for consistency with tradie trade chips.


## v0.0297

- Customer profiles now include a compact **Booked jobs** calendar under the name (shows jobs in **agreed** or **in_progress**).
- Clicking a booked day opens the existing **Job details** modal.
- Tradie profiles: moved **Verified** + **Rating** pills above the mini availability calendar for cleaner hierarchy.


## v0.0295

- Added a compact **mini availability calendar** on `profile-tradesman.html` directly under the tradie name.
- Calendar is **read-only** for other profiles; when viewing your own profile (`id=me`) you can **click dates to toggle availability**.
- Availability is persisted per tradie in `localStorage` under `athTradieAvailability:<tradieId>`.

## v0.0292

- Added **About Us** page explaining TradieHub’s purpose, trust model, and intended pricing tiers.
- Added an **About Us** footer link across the site.

## v0.0291

- Removed **Licensing / certification** and **Portfolio link** fields from the job application form (prevents off-platform routing).
- Added stricter off-platform contact blocking for **Messages** and **Job Applications** (phones, emails, and links), including common obfuscation patterns (e.g., "dot com", digit separators like `0x4x...`).

## v0.029

- Customer profile Active Jobs now include a **View details** button that opens the existing job details modal (read-only) on `profile-customer.html`.
- Job applications list now anonymises applicant names (stars + last 3 letters) and hides the price/estimate field.

## v0.027

- Messages are now scoped per signed-in account (local-only): conversations are stored under `athConversations:<authUserId>` so new accounts start with a clean inbox.
- Messages require sign-in: logged-out users are prompted to sign in and cannot send messages.
- Messages page layout updated so the conversations list scrolls independently (no full-page scrolling to reach a conversation).


All notable changes to this prototype are documented here.

## 2026-01-18 — Batch A: Core functionality
- Repaired `profile-customer.html` after corrupted/injected markup (page renders cleanly).
- Added customer dataset `window.CUSTOMERS` to `data.js`.
- Implemented customer profile loading by querystring (`profile-customer.html?id=<customer-id>`).
- Updated tradie and customer browse links to pass correct profile IDs.
- Standardized profile-to-messages routing by using `conversationId` fields in `data.js`.

## 2026-01-18 — Batch B: UI/layout stability
- Removed global overrides of Tailwind utility classnames in `style.css`.
- Added safe custom helper classes (prefixed `ath-`) for project-specific layout/styles.
- Removed duplicated "Job Details" block from `messages.html`.

## 2026-01-18 — Batch C: Navigation, pages, and filtering
- Created `post-job.html` (job posting form) and stored posted jobs in `localStorage`.
- Updated `jobs.html` to render jobs from `localStorage` so posted jobs are visible.
- Created footer pages matching existing site style:
  - `how-it-works.html`, `resources.html`, `trust-safety.html`, `terms-of-service.html`, `privacy-policy.html`, `cookie-policy.html`.
- Updated footer links across the site to point to real pages (removed placeholder `href="#"` links).
- Standardized external images to HTTPS (`https://static.photos/...`) to avoid mixed-content issues.
- Wired `components/search-filter.js` into `browse-trades.html` and `browse-customers.html` using `data.js` datasets.

## 2026-01-18 — Batch D: Messaging foundation
- Removed duplicate "Messages" nav item in `my-profile.html`.
- Introduced `window.CONVERSATIONS` in `data.js` as the canonical message dataset.
- Updated `messages.html` to load `data.js` before `script.js`.

## 2026-01-18 — Batch E: Messaging preview accuracy
- Removed hardcoded conversations in `messages.html` sidebar; sidebar is now rendered by JavaScript.
- Sidebar preview text now reflects the latest message in each conversation.
- Sidebar timestamp now reflects the latest message time.
- Sidebar refreshes after sending a message to keep previews/timestamps synced.

## 2026-01-18 — Batch F: Messaging navigation and search
- Default conversation selection now uses:
  1) URL `?conversation=` if present,
  2) last active conversation (stored in `localStorage`),
  3) otherwise the most recent conversation by message timestamp.
- Implemented conversation search filtering in the sidebar.

## 2026-01-18 — Batch G: Messaging state and edge cases
- Added empty and no-results states for the conversation list.
- Added a safe empty state for the chat panel when there are no conversations.
- Online/offline dot is now data-driven.
- Unread label is now computed from last-message timestamps vs last-read timestamps stored in `localStorage`.

## 2026-01-18 — Batch H: Job Board filtering + pagination
- Rebuilt `jobs.html` to use the same data-driven filtering approach as other browse pages.
- Added canonical `window.JOBS` dataset to `data.js` and merged it with jobs posted via `post-job.html` (`localStorage` key: `athPostedJobs`).
- Implemented Job Board filters: search, category (dynamic counts), state, budget buckets, urgency, job type.
- Added sorting (Most Recent, Highest Budget, Urgent First) + pagination.
- Added job details + apply flow via modal (applications stored in `localStorage` key: `athJobApplications`).
- Added save/unsave job toggle (stored in `localStorage` key: `athSavedJobs`).


## Batch I — My Profile: roles, persistence, privacy foundations
**Changes**
- Added `window.CURRENT_USER_DEFAULT` to `data.js` and introduced a localStorage-backed current user (`athCurrentUser`).
- Built a real `my-profile.html` UI (role switch + editable account details + privacy/verification panel).
- Implemented `initMyProfilePage()` in `script.js` to load, edit, validate, and persist profile state.
- Added safe masking helper to display verification identifiers as `**** **** 1234` (last 4 digits only).
- Enabled `profile-tradesman.html?id=me` and `profile-customer.html?id=me` to hydrate from `athCurrentUser` with location privacy respected.

**Files changed**
- `data.js`
- `my-profile.html`
- `script.js`
- `profile-tradesman.html`
- `profile-customer.html`

## 2026-01-18 — Batch J: Role gating + contact lock-down
- Fixed role-based visibility so you only appear as a Customer when role is `customer` or `dual`, and only appear as a Tradie when role is `tradie` or `dual`.
  - Implemented dataset injection based on `athCurrentUser.role` (adds/removes `me` in `window.TRADIES` and `window.CUSTOMERS`).
- Removed any ability to make phone/email public (prevents off-platform contact).
  - Removed phone/email public toggles from My Profile.
  - Phone/email are treated as private account fields only.

**Files changed**
- `data.js`
- `my-profile.html`
- `script.js`
- `CHANGELOG.md`

## 2026-01-18 — Batch K: Avatar upload + auth-ready profile layer
- Added avatar upload on `my-profile.html` (file picker + center-crop + resize/compress) and stored it as `athCurrentUser.avatarDataUrl` (local-only prototype). Public profile pages now prefer `avatarDataUrl` when present.
- Added `saveCurrentUser(patch)` helper in `script.js` to merge nested profile state cleanly (prepares for future Google sign-in/backends).
- Added `auth` fields to `window.CURRENT_USER_DEFAULT` (provider/uid) for future Google sign-up/in integration.
- Fixed corrupted `data.js` injected placeholders and removed duplicate role-injection blocks.

**Files changed**
- `my-profile.html`
- `script.js`
- `data.js`
- `profile-tradesman.html`
- `profile-customer.html`
- `CHANGELOG.md`

## 2026-01-18 — Batch L: Trades & Categories (multi-select)
- Added canonical trade/category list `window.TRADE_CATEGORIES` in `data.js` and helper label/normalization functions.
- Jobs now support multiple categories (`job.categories: string[]` of canonical trade IDs); UI renders categories as chips and filters match any selected category.
- `post-job.html` now uses a multi-select trade picker and stores selected categories in `athPostedJobs`.
- `my-profile.html` adds a tradie-only multi-trade picker (stored in `athCurrentUser.tradie.trades`).
- Tradie browse + profile pages now use canonical trade IDs and display multiple trades when available.

**Files changed**
- `data.js`
- `components/search-filter.js`
- `post-job.html`
- `my-profile.html`
- `script.js`
- `profile-tradesman.html`
- `CHANGELOG.md`

## 2026-01-18 — Batch M: Mobile UX pass + filter correctness
- Mobile filter drawer added to Jobs/Tradies/Customers pages (single sidebar becomes off-canvas on <lg, with backdrop + open/close + ESC).
- Trades browse filtering now supports **Any selected (OR)** vs **All selected (AND)** via toggle (persisted in localStorage).
- Fixed Post a Job trade picker selection syncing (event delegation + re-render to keep counts/checked state consistent).
- Review counts now display correctly by using canonical `reviewCount` in datasets (no more empty parentheses); customer preview cards use the same counter.

**Files changed**
- `style.css`
- `script.js`
- `components/search-filter.js`
- `browse-trades.html`
- `browse-customers.html`
- `jobs.html`
- `post-job.html`
- `profile-customer.html`
- `data.js`
- `CHANGELOG.md`

## 2026-01-18 — Batch N1: Reviews visibility + exact trade filtering
- Profile pages now show a **Reviews** section with real, visible review items (demo-generated from `reviewCount`).
- Tradies browse trade filtering now defaults to **Exact match** (selected trade set must match the tradie’s trade tags), with a single checkbox to **Broaden results (match ANY selected)**.
- Trade filter mode is persisted in localStorage (`athTradeFilterMode`).

**Files changed**
- `data.js`
- `components/search-filter.js`
- `browse-trades.html`
- `profile-tradesman.html`
- `profile-customer.html`
- `script.js`
- `CHANGELOG.md`

## 2026-01-18 — v0.016: Completion photo uploads (localStorage only)
- Added reusable image processing helper (`window.ATHImages.processImageFile`) and refactored avatar upload to use it.
- Added completion photo upload UI inside Job Details → Manage Job.
- Photos are stored in `athJobState[jobId].completionPhotos` as compressed DataURLs (no cloud uploads).

**Files changed**
- `script.js`
- `components/search-filter.js`
- `CHANGELOG.md`

## 2026-01-18 — Batch N2: Job completion + double-blind reviews (demo)
- Jobs now support **demo lifecycle state** persisted in localStorage (`athJobState`): `open` → `in_progress` → `completed`, plus `assignedTradieId`.
- Job Details modal shows a **Manage Job** panel:
  - Displays status + assigned tradie
  - Shows job applications (demo) with **Accept** to assign a tradie and move the job to `in_progress`
  - Allows **Mark Completed** which unlocks reviews
- Added **double-blind review submission** (stored in localStorage `athReviews`):
  - Customer can review tradie, tradie can review customer
  - Reviews publish when both sides submit, or automatically after **7 days** from completion
  - Profiles now merge and display published local reviews alongside demo seed reviews

**Files changed**
- `components/search-filter.js`
- `script.js`
- `CHANGELOG.md`

## 2026-01-18 — Batch N3: Contact lock banner + message persistence
- Messages are now **refresh-safe**: conversations persist to localStorage (`athConversations`) and seed once from demo data.
- Added platform-integrity **Contact Lock** banner on key surfaces (Messages, Jobs, Profiles).
- Off-platform call/video buttons are disabled while payment/contact is locked.
- Basic sanitizer removes emails/phone numbers from outgoing chat/job/profile text until payment is confirmed.

**Files changed**
- `script.js`
- `messages.html`
- `jobs.html`
- `profile-tradesman.html`
- `profile-customer.html`
- `components/search-filter.js`
- `CHANGELOG.md`

## 2026-01-18 — v0.018: Profile job history
- Added **Active Jobs** and **Past Jobs** sections to tradie and customer profile pages.
- Job lists are computed from the shared `ATHJobs.getAllJobs()` merged job list (seed + posted jobs) with `athJobState` overrides applied.
- Active jobs = `in_progress`; Past jobs = `completed`.

**Files changed**
- `profile-tradesman.html`
- `profile-customer.html`
- `CHANGELOG.md`

## 2026-01-18 — v0.022: Completion control gating hotfix
- Removed legacy **Mark In Progress** / **Mark Completed** buttons from the Job Details modal to prevent lifecycle bypass.
- Completion is no longer triggerable from an **open** job via legacy controls.

**Files changed**
- `components/search-filter.js`
- `CHANGELOG.md`

## 2026-01-18 — v0.023: Post a Job trade picker hotfix
- Fixed trade/category multi-select on **Post a Job**: checkbox selections now persist correctly.

**Files changed**
- `post-job.html`
- `CHANGELOG.md`

## 2026-01-19 — v0.024: Post a Job picker stability
- Trade picker options list no longer re-renders on every checkbox click (prevents flicker/scroll jump).
- Fixed selection state update bug so the selected count and chips update correctly.

**Files changed**
- `post-job.html`
- `CHANGELOG.md`

## 2026-01-19 — v0.024d: Posted job uses correct customer profile
- Jobs created via **Post a Job** now store `customerId` from the current user (`athCurrentUser`) so the job card shows the correct customer profile.
- Canonical mapping for posted jobs now defaults missing `customerId` to the current user (instead of a demo customer).

**Files changed**
- `post-job.html`
- `script.js`
- `CHANGELOG.md`

## 2026-01-19 — v0.025: Delete job controls
- Added **Delete Job** button for locally-posted jobs (owner-only) on the Job Board card, positioned above **Save Job**.
- Added **Delete Job** button inside the **Edit Job** modal.
- Save/Delete area on the job card sits lower (increased spacing) for clearer separation from primary actions.
- Deleting a job cleans up related local data (saved flag, job state overrides, applications, reviews).

**Files changed**
- `components/search-filter.js`
- `CHANGELOG.md`

## 2026-01-19 — v0.026: Prototype email/password auth (localStorage)
- Added client-side **Sign up / Sign in** (email + password) with a local session (`athAuthSession`).
- Passwords are stored as SHA-256 hashes when available (never plaintext).
- Added global **Sign in / Logout** nav button (desktop + mobile) and an injected auth modal.
- Added `emailVerified: false` flag (UI indicates verification is not implemented yet).
- Added a disabled **Continue with Google** button as a placeholder (no OAuth wiring yet).
- Kept auth layer separate from `athCurrentUser` to avoid breaking existing demo identity + job ownership.

**Files changed**
- `script.js`
- `CHANGELOG.md`

## 2026-01-18 — v0.021: Applications integrity hotfix
- Fixed role integrity bug: **only the customer who posted the job** can accept an applicant (applicants can no longer accept).
- Expanded job application fields (availability, experience summary, estimate, licensing, portfolio link) and display in the Applications list.
- Renamed Tradie browse CTA label from **Message** to **Contact** for consistency.

**Files changed**
- `components/search-filter.js`
- `CHANGELOG.md`


## 2026-01-19 — v0.0292: About Us page
- Added **About Us** page: plain-English overview, why it exists, how the job lifecycle works, trust/safety principles, and tier-based pricing summary.
- Linked **About Us** in the site footer across major pages.

**Files changed**
- `about-us.html` (new)
- `*.html` (footer link)
- `CHANGELOG.md`
