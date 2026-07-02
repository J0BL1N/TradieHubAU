# TradieHubAU Beta Testing Runbook

This runbook guides **Jay** (the beta coordinator) through setting up, executing, and cleaning up beta test scenarios, users, and credentials for the public local beta.

---

## 1. Safety & Data Privacy Rules

> [!WARNING]
> **No Real User Data:**
> - Never use or upload real personal names, actual residential street addresses, real business ABNs, or actual trade licence numbers.
> - Never store real client phone numbers or passwords used for production services.
>
> **No Repository Secrets:**
> - Never commit `.env` or `.env.local` files containing live `SUPABASE_SERVICE_ROLE_KEY` or client credentials.
> - The private credentials directory `private/beta/` and credential files are gitignored. Do **not** bypass this ignore rule.

---

## 2. Target Region & Local Scenarios

To ensure dense communities of matching customers and contractors, all test scenarios are focused on the **South East Melbourne (VIC)** corridor and **City of Salisbury (SA)**.

### Customer Scenarios (Fake Names & Data)
1. **Sarah Mitchell (Pakenham VIC 3810)**:
   *   **Scenario:** Leaking kitchen tap repair.
   *   **Budget:** \$120–\$280.
   *   **Urgency:** ASAP.
   *   **Mission:** Post the job, receive plumbing quotes, verify notification updates, select a plumber, simulate funding, check chat functionality.
2. **James Parker (Berwick VIC 3806)**:
   *   **Scenario:** Townhouse ceiling fan installation.
   *   **Budget:** \$250–\$450.
   *   **Urgency:** This week.
3. **Emily Nguyen (Cranbourne VIC 3977)**:
   *   **Scenario:** Garden clean-up and green waste removal.
   *   **Budget:** \$180–\$400.
   *   **Urgency:** This weekend.

### Tradie Scenarios (Fake Business & Licensing Data)
1. **Lingo Chen — BrightWire Electrical (Electrical)**:
   *   **Location:** Narre Warren VIC 3805.
   *   **Fake ABN:** `53 004 085 501`.
   *   **Fake Licence:** `VIC-BETA-260001`.
   *   **Mission:** Log in, browse electrical jobs, submit an itemized quote, chat with customers, request variations if needed.
2. **Marcus Reed — ClearFlow Plumbing (Plumbing)**:
   *   **Location:** Clyde North VIC 3978.
   *   **Fake ABN:** `53 004 085 502`.
   *   **Fake Licence:** `VIC-BETA-260002`.
   *   **Mission:** Quote on Sarah's tap leak, get accepted, upload completion proof images, check invoice statement.

### Admin Scenario
1. **Administrator User**:
   *   **Mission:** View the verification approval queues, manually review upload documents (IDs/licences), approve or request rechecks, monitor active disputes/issues, review enforcement actions.

---

## 3. Account Seed Tooling

The script `scripts/create-beta-test-accounts.mjs` generates 65 fake accounts (40 customers, 25 tradies) mapped to Victoria/SA locations.

### Step 1: Run in Dry-Run Mode (Safe Preview)
Generates the credentials text file without making any network requests or database changes.
```powershell
node scripts/create-beta-test-accounts.mjs --dry-run
```
*   **Result:** Outputs credentials checklist to `private/beta/BETA_TEST_PROFILE_CARDS.md`.

### Step 2: Apply Seeds to Deployed Supabase
To create these users inside your hosted Supabase instance, set the required environment flags and run the script with `--apply`.
```powershell
# Set connection environment variables
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
$env:TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM="discord-beta-001"

# Execute application
node scripts/create-beta-test-accounts.mjs --apply
```
*   **Note:** The script will automatically trigger email confirmations in Supabase Auth so testers do not have to verify emails manually.

### Step 3 (Optional): Generate Visual Beta Access Cards
You can generate high-res landscape access card PNGs/PDFs containing login information and missions for Discord DM distribution:
```powershell
# Install canvas rendering dependencies in the scripts folder
cd F:\TradieHubAU\scripts
npm install

# Run generation from project root
cd F:\TradieHubAU
node scripts/generate-beta-access-cards.mjs
```
*   **Output folder:** `private/beta/profile-card-images/` and `private/beta/profile-card-pdfs/`.

---

## 4. Post-Beta Cleanup Script

Once the beta phase completes, remove all testing accounts cleanly before launching the public app. The script deletes both the Auth records and the profile rows.

```powershell
# Dry-run check to list accounts flagged for deletion
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
$env:TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM="discord-beta-001"

node scripts/delete-beta-test-accounts.mjs

# Execute deletion
node scripts/delete-beta-test-accounts.mjs --apply
```
*   **Safety mechanism:** The delete script only targets accounts that end in `@tradiehubau.test` and are tagged with the specific batch metadata `discord-beta-001`.
