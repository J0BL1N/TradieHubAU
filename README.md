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

## Current Status

TradieHubAU is in controlled beta preparation.

Core protection workflows are implementation-complete, with manual QA and polish ongoing. Real payment-provider processing is not production-live unless explicitly stated in the app.

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
