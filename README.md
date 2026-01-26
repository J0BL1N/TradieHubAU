# TradieHubAU

TradieHubAU (AussieTradieHub) is a marketplace that connects customers with verified tradies, supports quotes and hiring, and manages jobs through to payment and invoicing.

## Core Functionality

- Marketing home with search, category shortcuts, featured tradies, recent jobs, trust badges, reviews carousel, FAQ, and app download CTA (coming soon).
- Customer and tradie discovery with search, location/state filters, category filtering, and profile previews.
- Account management with email/password and Google sign-in, session persistence, and automatic profile creation in Supabase.
- Role-based experience for customer, tradie, or dual accounts, with UI and access guards.

## Customer Features

- Post jobs with title, categories, state, budget, preferred date, and description.
- Browse and filter job board, including featured/urgent jobs, budget bands, and "my jobs" view.
- View job details, compare quotes, and accept a proposal to hire a tradie.
- Secure checkout flow with platform fees and escrow messaging.
- Message tradies, share attachments, and manage job conversations.
- View tradie profiles, reviews, and verification status.
- Mark invoices paid and track job progress in the ongoing job workspace.

## Tradie Features

- Public tradie profile with trade tags, bio, reviews, and verification badge.
- Browse customers and jobs by category and location.
- Submit quotes with price, estimated start date, availability, and cover letter.
- Messaging tools for customer communication and file sharing.
- Job workspace with invoices (draft, sent, paid), line items, notes, activity log, and workflow actions.
- Identity verification submission (license/ID upload) for approval.
- Stripe Connect onboarding (simulated in MVP) for payouts.

## Messaging and Collaboration

- Conversations list with search, unread indicators, and online status.
- Real-time chat with message search, replies, starred messages, emojis, templates, and typing indicator.
- Image, file, and photo set sharing with preview and gallery view.
- System messages for job events (quote accepted, invoice sent, etc.).

## Payments, Trust, and Safety

- Escrow payment flow with service fee tiers and job status updates.
- Job completion with proof uploads and payout release hooks.
- Identity verification pipeline with admin approval and verified badges.
- Dispute resolution surfaces (admin area).

## Invoicing

- Tradies can create draft invoices with line items, issue/due dates, and notes.
- Send invoices to customers from the job workspace and log events to the timeline.
- Customers can review invoices and mark them paid externally (MVP flow).

## Admin and Operations

- Admin dashboard with user, job, verification, and revenue stats.
- Verification queue review and approval.
- User moderation (ban/unban) and role management.
- Admin sections for users, jobs, categories, disputes, and settings.
- Broadcast alerts stored in local storage for demo use.

## Platform and Infrastructure

- Supabase database for users, jobs, proposals, conversations, messages, invoices, reviews, and events.
- Supabase storage for avatars, job photos, chat attachments, and verification documents.
- Edge functions for Stripe webhook handling, payment sheet, payouts, and email notifications.
- PWA support with manifest and service worker caching for offline basics.
- SPA-style navigation shell with mobile bottom navigation.

## Page Map

- `index.html`: Home and marketing entry point.
- `pages/browse-trades.html`: Tradie discovery and filtering.
- `pages/browse-customers.html`: Customer discovery.
- `pages/jobs.html`: Job board, filters, and job details modal.
- `pages/post-job.html`: Create a job listing.
- `pages/checkout.html`: Secure checkout and hire flow.
- `pages/ongoing-job.html`: Active job workspace with invoices and timeline.
- `pages/messages.html`: Messaging inbox and chat workspace.
- `pages/my-profile.html`: Profile, role, privacy, and verification management.
- `pages/profile-tradesman.html`: Public tradie profile.
- `pages/profile-customer.html`: Public customer profile.
- `pages/admin*.html`: Admin dashboard and management screens.
- `pages/how-it-works.html`, `pages/resources.html`, `pages/trust-safety.html`, `pages/about-us.html`: Informational pages.
- `pages/terms-of-service.html`, `pages/privacy-policy.html`, `pages/cookie-policy.html`: Legal pages.
