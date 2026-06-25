# TradieHubAU Beta Testing Account Plan

## Purpose

TradieHubAU will use placeholder beta tester accounts for the Discord-based beta so testers do not need to register with personal emails. This keeps onboarding simple, avoids real personal data in the beta workflow, and makes the accounts easy to identify and remove before launch.

## Account Count

The planned beta pool is 65 fake accounts, about 1.25x the expected tester count:

* 40 customer accounts
* 25 verified tradie accounts

The first small beta sample focuses on South East Melbourne suburbs and nearby service areas including Pakenham, Officer, Berwick, Cranbourne, Narre Warren, Clyde, Clyde North, Hallam, Dandenong, Frankston, Carrum Downs, and Keysborough.

All account names, emails, passwords, suburbs, ABNs, licence numbers, jobs, and business names are fake beta-only data.

## Private Profile Cards

The account generation script writes private profile cards to:

```txt
private/beta/BETA_TEST_PROFILE_CARDS.md
```

That folder is gitignored. The generated file contains passwords and must not be committed. Profile cards can be posted manually into a private Discord beta channel when the beta coordinator is ready.

## Data Rules

Beta testers must not use real:

* passwords they use elsewhere
* identity documents
* ABNs, licences, or business details
* phone numbers, addresses, or personal contact details
* payment details
* customer job information

Anonymous tester feedback is allowed. Testers may report issues by assigned tester ID rather than by real name.

## Cleanup Requirement

All generated beta accounts must be deleted before production launch unless a later approved migration replaces them with real opt-in accounts.

Generated accounts are tagged with:

* email domain `@tradiehubau.test`
* auth metadata `beta_test_batch: "discord-beta-001"`
* auth app metadata `beta_account: true`
* display names or businesses prefixed with `[BETA]`

The cleanup script only targets users that match both the fake email domain and the beta batch metadata.

## Tooling

Create fake profile cards without touching Supabase:

```bash
node scripts/create-beta-test-accounts.mjs --dry-run
```

Create hosted Supabase users only after explicit approval and configuration:

```bash
$env:SUPABASE_URL="https://example.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
$env:TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM="discord-beta-001"
node scripts/create-beta-test-accounts.mjs --apply
```

Preview cleanup:

```bash
$env:SUPABASE_URL="https://example.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
$env:TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM="discord-beta-001"
node scripts/delete-beta-test-accounts.mjs
```

Apply cleanup after checking the listed accounts:

```bash
node scripts/delete-beta-test-accounts.mjs --apply
```

Never commit `.env` files, service-role keys, generated profile cards, or generated credential exports.

---

## Beta Access Cards

Individual license-style Beta Access Cards can be generated for private Discord DM distribution.
Each card is a landscape "access card" containing the tester's assigned ID, fake name, login email,
password, role, location, and mission — styled with TradieHubAU branding and a clear beta/fake disclaimer.
Cards do not contain real personal information.

### Outputs

| Path | Contents |
|------|----------|
| `private/beta/profile-card-images/` | One PNG per tester (1600×900 px, hi-res) |
| `private/beta/profile-card-pdfs/` | One A4-landscape PDF per tester |
| `private/beta/TradieHubAU_Beta_Access_Cards.zip` | ZIP of all PNGs and PDFs |

All output paths are gitignored. Never commit generated card files.

### File naming

```
Customer-01-Sarah-Mitchell.png / .pdf
Tradie-01-Lingo-Chen.png / .pdf
```

### Generate cards

Install dependencies once (in the scripts/ folder):

```bash
cd F:\TradieHubAU\scripts
npm install
```

Run the generator from the repo root:

```bash
cd F:\TradieHubAU
node scripts/generate-beta-access-cards.mjs
```

This reads `private/beta/BETA_TEST_PROFILE_CARDS.md` and writes all output to `private/beta/`.
No Supabase changes, no app code changes, no migrations.

### Card design

- Landscape card, 1600×900 px
- Dark background with orange (customer) or teal (tradie) accent stripe
- TradieHubAU wordmark + `BETA ACCESS CARD` title
- Role badge: `CUSTOMER` or `VERIFIED TRADIE`
- Tester ID, name, location, credentials, mission
- Customer cards: job scenario, budget, urgency
- Tradie cards: business name, trade category, fake ABN, fake licence
- QR placeholder referencing `/beta-feedback`
- Rotated "✓ VERIFIED BETA TESTER" stamp
- Disclaimer footer: `Not a real ID. Beta testing account only. Use fake information only.`

### Safety

- All card content is fake beta-only data
- Cards clearly state they are not real IDs
- Passwords are included (for convenience during Discord DM distribution) — handle with care
- Do not post cards in public channels
- Generated files are gitignored and must not be committed

