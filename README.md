# TradieHubAU

TradieHubAU is an Australian trade marketplace for posting jobs, finding verified tradies, protected payments, quotes, completion proof, disputes, and admin oversight.

## Current Stack

- React / Vite frontend
- Supabase Auth, Database, Storage, RLS, and RPCs
- Supabase migrations and Edge Function stubs under `supabase/`

## Project Paths

- Root: `F:\TradieHubAU`
- Frontend: `F:\TradieHubAU\frontend`
- Supabase: `F:\TradieHubAU\supabase`

## Local Setup

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Production build check:

```bash
npm run build
```

Environment variables are required for Supabase-backed frontend runs. Use the example file as a guide and do not commit real keys or secrets.

## Product Model

- Guest users can browse safe public jobs and public tradie profiles.
- Guests cannot save, apply, quote, message, or view private/contact/payment/evidence/invoice/admin data.
- Customers can post jobs and manage quotes.
- Tradies require verification before trusted quoting/application flows.
- The protected payment workflow is designed around accepted quotes, completion proof, dispute handling, and admin review.

## Verification Model

- Customer ID verification foundation.
- Tradie ID, ABN, licence, insurance/trade checks, and admin approval.
- Revoked, recheck-requested, rejected, or expired ID states should show action required and allow replacement upload.
- Admin-only verification controls must remain protected.

## Protection Build Status

Protection build A through O is implementation-complete:

- A: Liveness Selfie Verification Foundation
- B: Verification Status Upgrade
- C: Verification Expiry / Recheck Later
- D: Itemised Quote Lines
- E: Lock Accepted Quote Lines
- F: Early Release Request Foundation
- G: Early Release Caps
- H: Customer Approval Modal
- I: Itemised Variation Requests
- J: Variation Approval + Funding Groundwork
- K: Final Invoice Itemisation
- L: Job Evidence Timeline
- M: Admin Evidence Pack
- N: Enforcement Actions
- O: Tradie Risk Controls

## Recent QA / Hotfix Notes

- `e998a77` fixed guest `/jobs` anon loading by avoiding unsafe public profile hydration.
- `e1b0eb2` fixed revoked/recheck ID profile state.
- `185e508` moved help links into the info hub.

## Migration Notes

- Supabase protection-build migrations include 064-078 locally.
- This repository may also include later hotfix migrations after 078.
- Live SQL/migration deployment is manual unless project docs for a specific task say otherwise.
- Apply migrations carefully and verify linked Supabase state before assuming live parity.

## Validation Commands

```bash
cd frontend && npm run build
git diff --check
```

## Project Status

- Protection build implementation-complete.
- Manual QA and polish are ongoing.
- Not yet production-final.

## Security

Never commit `.env`, service role keys, private credentials, secrets, or Supabase keys beyond allowed public anon key usage.

## Supporting Docs

- Detailed roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- Supabase setup: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
