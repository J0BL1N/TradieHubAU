# Product Roadmap — TradieHub

## Phase 1: High-Fidelity Prototype (Current Status)

**Goal:** A fully immersive, "feels real" application running continuously in the browser using `localStorage`.

- [x] **Core Job Board:** Posting, searching, filtering, and saving jobs.
- [x] **User Profiles:** Distinct Tradie vs. Customer views, editing flows, and avatar uploads.
- [x] **Messaging System:** Real-time feel, auto-scrolling, distinct conversation threads.
- [x] **Job Lifecycle:** Open → Applied → In Progress → Completed → Reviewed.
- [x] **Double-Blind Reviews:** Mutual reviews that unlock only after both sides submit.
- [ ] **Notification Simulation:** In-app toast notifications for "New Application" or "Message Received".
- [ ] **Mobile Polish:** Refine complex modals and tables for small screens.
- [ ] **Onboarding Wizard:** Guided flow for new users (e.g., "Tell us your trade").

## Phase 2: Backend Migration (Next Up)

**Goal:** Replace the purely client-side logic with a robust backend and real persistence.

- [ ] **Database Architecture:** Design schemas for `Users`, `Jobs`, `Conversations`, `Reviews`.
- [ ] **Authentication Integration:** Replace simulated auth with real providers (Supabase Auth / Firebase / NextAuth).
- [ ] **API Development:** Create secure endpoints for data fetching and mutation.
- [ ] **Cloud Storage:** Move images from Base64 `localStorage` strings to S3/Cloudinary buckets.

## Phase 3: Trust, Safety & Monetization

**Goal:** Implement the "Contact Lock" business model and identity verification.

- [ ] **Payment Gateway:** Integration with Stripe for "Unlock User" or "Lead Fee" payments.
- [ ] **Identity Verification:** Upload flow for licenses/ID and admin verification queue.
- [ ] **Communication Security:** Backend scrubbing of phone numbers/emails in chat until payment calls are cleared.
- [ ] **Admin Dashboard:** Interface for staff to manage reported content and disputes.

## Phase 4: Production Readiness

**Goal:** Prepare for public launch.

- [ ] **SEO & Metadata:** OpenGraph tags, sitemap, and structure data for job postings.
- [ ] **Transactional Email:** Send real emails for account verification and missed messages.
- [ ] **Performance Optimization:** Code splitting, image optimization, and caching strategies.
- [ ] **Legal:** Terms of Service and Privacy Policy finalization.
