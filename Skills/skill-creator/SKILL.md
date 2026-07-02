---
name: tradiehubau-builder
description: Standalone builder skill for TradieHubAU project, detailing workflow, rules, stack, migration status, safety, and security.
---

# TradieHubAU Builder Skill

This file serves as the definitive standing instruction manual and workflow contract for AI agents (Antigravity/Codex) working on the **TradieHubAU** codebase.

## Startup Protocol

Before performing any tasks or making any edits:
1. **Read this SKILL.md** file in its entirety.
2. Run `git status` to check the current working tree.
3. Check recent commits using `git log -n 5 --oneline` if relevant to the task context.
4. Inspect the relevant target files before editing.
5. **No Browser/Playwright Work:** Under no circumstances should the IDE open the website, run Playwright, perform visual QA, or run visual screenshot checks unless Jay explicitly requests it.
6. **Manual QA:** Only Jay performs manual browser/mobile QA.

---

## Project Identity & Stack

*   **Project Name:** `TradieHubAU` (Do not refer to it as AussieTradieHub, AussieTradie, or TradieHub).
*   **Stack:** React/Vite frontend + Supabase Auth/Postgres/Storage/RLS/RPC/migrations.
*   **Key Directories:**
    *   Root: `F:\TradieHubAU`
    *   Frontend: `F:\TradieHubAU\frontend`
    *   Supabase: `F:\TradieHubAU\supabase`
    *   Skills: `F:\TradieHubAU\Skills`

---

## Workflow Contract

*   **Smallest Safe Changes:** Implement the minimum necessary code to fulfill the task safely. Avoid broad refactorings or rewriting unrelated code.
*   **No Invented Adjacent Work:** Stick strictly to the specified phase/task requirements. Do not add features or make styling changes not explicitly asked for.
*   **Inspection First:** Always view existing file contents and understand dependencies before editing.
*   **Build & Diff-Check:**
    *   For frontend changes, run `npm run build` inside `F:\TradieHubAU\frontend`.
    *   For any changes, run `git diff --check` and `git status` inside `F:\TradieHubAU` to verify whitespace and formatting.
*   **Commit Rules:** Commit changes regularly with clear, descriptive messages using local git.
*   **Stop and Report:** Stop and report immediately if blocked, if a step is completed, or if a decision is required.

---

## QA & Testing Restrictions

*   **No Browser Work:** Never use Playwright, automated browser subagents, or visual diff tools. Do not run any visual QA.
*   **Jay-Approved State:** Do not claim a feature is "passed" or "QA complete" based on IDE inference. A feature is only passed when Jay explicitly confirms it.
*   **Screenshots as Evidence:** Treat screenshots or reports provided by Jay as the single source of truth for UI/visual layout issues.

---

## Database & Migration Rules

*   **Manual Live SQL Application Only:** The IDE must **never** run live SQL against the hosted/production Supabase database. Jay applies migrations manually in Supabase Studio.
*   **Immutable Live Migrations:** If a migration has already been applied live, do not edit it. Instead, create a new, numbered corrective migration (e.g., `093_...`).
*   **Failed/Unapplied Migrations:** If a migration has **not** been applied live yet (or failed to apply due to syntax/dependency errors and was aborted), it may be corrected directly, provided Jay confirms it was not successfully run on the database.
*   **No DROP CASCADE:** Never write `DROP ... CASCADE` in migrations unless Jay explicitly approves after you explain the specific cascading risks.
*   **Reporting:** Always state clearly in the report whether a new/edited migration file is ready for Jay to apply manually.

---

## Safe Public Tradie Identity Rules

*   **No Anonymous Masking:** Browse Tradies should not display raw masked strings (e.g. `***`) once safe public identity controls are active.
*   **Display Name:** Use public-safe display names, such as "John S." (first name + first letter of last name) or "Verified Tradie" when the full name is private.
*   **Hide Raw Contact Details:** Fully hide raw business names, website URLs, email addresses, phone numbers, social media links, ABNs, and licence numbers from the public/anonymous views.
*   **Show Safe Text:** Publicly display the headline, bio, and service areas if verified to be contact-bypass free.
*   **Contact-Bypass Validation:** Hardened regex/validators must be maintained on profile fields, portfolio items, and job completion proof texts to prevent users from sharing phone numbers, emails, or URLs to bypass platform billing.
*   **Authorised Access:** Ensure that the profile owner, admins, and customers with active funded contracts retain full intended visibility of necessary details as defined by security policies.

---

## Messaging Safety & Moderation

*   **Moderation Filters:** Maintain regex/rules to screen message text for profanities and contact-bypass patterns (emails, phone numbers).
*   **Preserve Evidence:** Blocked or flagged messages must be preserved in database logs/moderation tables for admin review, rather than being silently deleted.
*   **Bypass Prevention:** Prevent off-platform contact exchanges and payment coordination before a job contract is officially funded.

---

## Protected Payment Terminology

*   **Escrow Restriction:** Do **not** use the term "escrow" in user-facing UI, documentation, or copy.
*   **Approved Wording:** Use "protected payment", "secure job payment", "payment funded", or "payment released".
*   **Beta Scope:** Keep payment interfaces simulating/stubbing real financial transactions for beta. Clearly label real integrations as deferred.

---

## Security, RLS, & RPC Hardening

*   **Never Weaken RLS:** Do not disable, bypass, or loosen Row Level Security policies.
*   **Security Definer RPCs:** Always include explicit security checks within `SECURITY DEFINER` functions (e.g., verifying `auth.uid()` matches the request parameters) to prevent spoofing.
*   **Safe Views:** Public/anonymous views and RPCs must filter out private columns (emails, phones, etc.) in the SQL query itself.
*   **No service_role Frontend Usage:** Never expose the service role key or use it in frontend API requests.

---

## Storage & Evidence Access

*   **Secure Buckets:** Keep verification documents, contractor licences, and private dispute evidence in private storage buckets.
*   **Authorised Access Only:** Access keys/URLs to these files must be generated via secure, policy-guarded RPCs or storage RLS.
*   **Safe Gallery:** Public portfolio galleries must contain images that have been filtered/verified clean of contact details.

---

## UI, Styling, & Product Rules

*   **Theme Palette:** Navy, orange, white, and light-grey (matches the established TradieHubAU visual style).
*   **Compact Footers:** Maintain compact, clean footers.
*   **Consistency:** Info hubs and content pages must share cohesive typography and spacing.
*   **Job Posting Flow:** Location selection must go in order of: State -> Region -> Suburb -> Postcode.
*   **No Google Places UI:** The Google Places/address search input must remain absent from the visible beta UI. Locations must come from the local/national database.

---

## Validation & Reporting Commands

When verifying changes, run:

```powershell
# 1. Verify frontend build
cd F:\TradieHubAU\frontend
npm run build

# 2. Check for git diff issues/formatting anomalies
cd F:\TradieHubAU
git diff --check
git status
```

---

## Future Prompt Template

Use this format when instructing subagents or referencing future tasks:
```
Read and follow F:\TradieHubAU\Skills\skill-creator\SKILL.md before making changes.
Task: [Describe the precise task here]
Likely files: [List files here]
Validate:
  - Verify frontend build (if applicable)
  - Run git diff --check and git status
Commit and push if validation passes.
Do not mark manual QA as passed.
```

---

## Current Database/Migration Status Context

*   `088_national_location_database.sql` - Foundation structures for Australian locations.
*   `089_harden_live_location_database.sql` - Corrective migration for location tables.
*   `090_messaging_safety_moderation.sql` - Messaging safety features.
*   `091_supabase_lint_hardening.sql` - Security/lint fixes.
*   `092_public_profile_identity_safety.sql` - Profile visibility/anonymity controls (undergoing correction in Phase 1).
*   *Full Australian location dataset import:* Pending/prepared (not live).