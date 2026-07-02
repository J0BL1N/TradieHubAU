# TradieHubAU

TradieHubAU is an Australian trade marketplace for customers and tradies.

Customers can post jobs, compare quotes, and keep a clear record of job scope and completion. Tradies can build public profiles, complete verification, and quote on relevant work. The platform focuses on verification, clear job records, protected payment workflow states, completion proof, dispute support, and admin review tools.

## Key Features

- Browse public jobs
- Browse public tradie profiles
- Customer job posting
- Tradie profiles and verification
- Itemised quotes
- Protected-payment workflow foundation
- Completion proof
- Dispute support
- Admin review tools

## Current Status & Beta Boundaries

TradieHubAU is in controlled beta preparation.

> [!WARNING]
> **Beta Scope Limits:**
> - **Simulated Payments:** The current payment flow is a simulated protected payment foundation only. Real financial transaction processing is deferred and not live.
> - **GST & Accounting:** Simulated receipts/invoices are stubs only and require professional accountant review and legal audits before any production launch processing real money.
> - **Escrow Terminology:** User-facing copy must **never** use the word "escrow". Instead, use "protected payment", "secure job payment", "payment funded", or "payment released".

## Tech Stack

- React / Vite
- Supabase Auth, Database, Storage, and RLS
- Cloudflare Pages deployment

## Local Development

```bash
cd frontend
npm install
npm run dev
```

Build check:

```bash
npm run build
```

Environment variables are required for local development and deployment. Do not include real keys, private credentials, or secrets in committed files.

## Security and Privacy

- Do not commit `.env` files, service keys, private credentials, tokens, or secrets.
- Sensitive configuration belongs in local environment files or deployment environment settings.
- Verification documents, payment data, private user data, and other sensitive records must not be stored in the repository.

## License

Private project. All rights reserved unless a separate licence is added.
