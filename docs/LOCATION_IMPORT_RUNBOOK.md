# Australian National Location Import Runbook

This document outlines the step-by-step workflow for importing the full national Australian location dataset (suburbs, postcodes, coordinates, and regions) into the **TradieHubAU** database.

> [!IMPORTANT]
> **Manual Deployment Directive:**
> The database import must be executed manually by **Jay** via Supabase Studio or the command line. The IDE must never apply SQL directly to the live/production database.
>
> **Google Places UI Constraint:**
> The Google Places/address search UI must remain disabled/absent in the public beta. The application relies strictly on this local, validated database for all job posting and profile suburb lookups.

---

## 1. Import Workflow Steps

### Step 1: Place the CSV Data File
1. Obtain a clean, complete Australian postcodes dataset (e.g. from the Matthew Proctor public domain source or ABS boundaries).
2. Save the file exactly to:
   `F:\TradieHubAU\data\location-imports\australian_postcodes.csv`

#### Accepted Column Headers (Aliased)
The importer script expects a header row containing at least the following columns:
*   `locality` (or alias `suburb`) — **Required**
*   `state` — **Required**
*   `postcode` — **Required**
*   `lgaregion` (or alias `region`) — *Optional* (falls back to SA3/SA4 names or "State region" if absent)
*   `lat` (or alias `latitude`) — *Optional*
*   `lon` (or alias `longitude`) — *Optional*

---

### Step 2: Run the SQL Seed Generator
From the root directory (`F:\TradieHubAU`), run the importer script. This parses the CSV, validates it, and generates a PostgreSQL seed script.
```powershell
node scripts/import-australian-locations.mjs
```
*   *Note:* If you placed the CSV elsewhere, you can pass the path as an argument:
    `node scripts/import-australian-locations.mjs path/to/your/file.csv`

#### Output Location
The generated SQL script will be written to:
`F:\TradieHubAU\supabase\seed_locations.sql`

---

### Step 3: Run the Validation Script (Dry-run Check)
Before applying the generated SQL to the database, run the validator to verify that all 15+ critical beta suburbs and capital centroids are correctly present in both the migration and the seed files:
```powershell
node scripts/validate-australian-locations.mjs
```
Expected output:
`🎉 Validation suite completed successfully!`

---

### Step 4: Apply the SQL Seed to Supabase Manually
Since the generated `seed_locations.sql` file can be large (usually ~16,000 suburbs), copy-pasting the entire file into the Supabase Studio SQL Editor may crash the browser.

#### Recommended Method: Supabase CLI or psql
Run the script directly via `psql` using your Supabase database connection string (found in the Supabase Dashboard under Project Settings -> Database):

```powershell
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" -f F:\TradieHubAU\supabase\seed_locations.sql
```

#### Safe Merge behavior
The generated SQL uses:
*   `ON CONFLICT (state, region_name, region_type) DO NOTHING` for regions.
*   `ON CONFLICT (suburb, state, postcode) DO UPDATE` for suburbs.

This guarantees that existing records are safely updated in-place without causing duplicate key constraint violations or breaking existing FK connections.

---

## 2. Post-Apply Database Verification Queries

Run the following queries in the Supabase Dashboard SQL Editor to verify the data was successfully loaded:

```sql
-- 1. Count total imported suburbs (should be ~16,000+ for national coverage)
SELECT count(*) FROM public.location_suburbs WHERE source = 'national_import_pipeline';

-- 2. Count total imported regions
SELECT count(*) FROM public.location_regions WHERE source = 'national_import_pipeline';

-- 3. Verify specific critical suburbs are correctly present and linked
SELECT id, suburb, state, postcode, region_name, latitude, longitude, is_verified, is_active
FROM public.location_suburbs
WHERE (suburb = 'Salisbury' AND state = 'SA' AND postcode = '5108')
   OR (suburb = 'Pakenham' AND state = 'VIC' AND postcode = '3810')
   OR (suburb = 'Melbourne' AND state = 'VIC' AND postcode = '3000');
```

---

## 3. Sample/Fallback Seed Reference
*   **Sample CSV:** The file at [sample_locations.csv](file:///f:/TradieHubAU/data/location-imports/sample_locations.csv) contains only a tiny fraction of data for testing. Do not use this as a source for full deployments.
*   **Migration Seed:** The seed records contained inside [088_national_location_database.sql](file:///f:/TradieHubAU/supabase/migrations/088_national_location_database.sql) are fallback seeds only (covering key regions like City of Salisbury and Cardinia Shire) to make local development immediately functional without importing the massive dataset.
