# National Location Database Plan

This document outlines the architecture, pipeline, and management steps for the proper, verified all-Australia location database (suburbs, localities, postcodes, and regions).

> [!IMPORTANT]
> **Status & Accuracy Notice:**
> - **Fallback Seed Only**: The initial database migration (`088_national_location_database.sql`) contains only a minimal fallback seed for smoke testing (covering key SA Salisbury and VIC Cardinia/Casey suburbs). It does **not** contain the entire Australian dataset.
> - **Full National Import Pending**: A full import must be run using the import pipeline script described below.
> - **Old Data Inaccuracies**: The old hardcoded frontend location lists (`au-postcode-localities.json`) are known to contain inaccuracies and errors. Do not rely on them as a source of truth.
> - **Licensing Caution**: Do not use or distribute unverified third-party CSV files without confirming their licensing terms and boundary/coordinate accuracy.

---

## 1. Schema Design & Data Relations

The database contains two core tables:
1. **`public.location_regions`**: Grouping of states and region/council areas (e.g. Cardinia Shire, City of Salisbury).
2. **`public.location_suburbs`**: All individual Australian suburbs, mapping to their postcodes, state, latitude/longitude centroids, and foreign key relations to `location_regions`.

### Database Security (RLS)
- Both tables have **Row Level Security (RLS)** enabled.
- Anonymous/authenticated users can only `SELECT` records.
- Any writes (INSERT/UPDATE/DELETE) are locked down and can only be performed by service-role scripts or direct migrations.

---

## 2. Data Source Hierarchy

To ensure accuracy, the database is populated from verified sources in order of preference:
1. **ABS ASGS Suburbs and Localities / Postal Areas**: Official Australian government boundary datasets.
2. **G-NAF (Geocoded National Address File)**: Free national address file.
3. **Australia Post Postcode Data**: Official commercial lists (requires licensing check before bundling).
4. **Matthew Proctor Postcode CSV**: Community-compiled public domain data (suitable as fallback/import source).

> [!WARNING]
> Do NOT bulk import unverified CSVs from community forums without checking licensing and coordinate accuracy. The old frontend hardcoded locations had multiple known inaccuracies.

---

## 3. How Jay Can Import or Update the National Location Dataset

The project contains a database import pipeline that does not overload Postgres migrations with massive insert files.

### Step 1: Place the Source Data File
Jay can download an updated postcodes CSV (e.g. from Matthew Proctor's public domain repository or ABS data exports) and save it to:
`data/location-imports/australian_postcodes.csv`

### Step 2: Run the Importer Script
From the project root directory, run:
```bash
node scripts/import-australian-locations.mjs [path_to_csv]
```

This script:
1. Validates that critical suburbs exist.
2. Normalizes suburb names to Title Case and states to uppercase.
3. Groups unique regions and maps suburbs to regions.
4. Generates a database seed script at `supabase/seed_locations.sql` with safe batch updates.
5. If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided in the environment, it can upsert them directly.

### Step 3: Run the Validation Script
To verify the import meets all QA benchmarks (including South Australian Salisbury-area validation), run:
```bash
node scripts/validate-australian-locations.mjs
```

The validation suite verifies the existence of all critical localities:
- **City of Salisbury (SA)**: Ingle Farm (5098), Salisbury (5108), Salisbury Downs (5108), Salisbury East (5109)
- **Cardinia Shire (VIC)**: Pakenham (3810), Koo Wee Rup (3981), Officer (3809), Beaconsfield (3807)
- **City of Casey (VIC)**: Berwick (3806), Clyde (3978), Cranbourne (3977), Narre Warren (3805)
- **City of Greater Dandenong (VIC)**: Dandenong (3175)
- **Capital Centroids**: Melbourne (3000), Sydney (2000), Brisbane (4000), Perth (6000), Adelaide (5000), Hobart (7000), Darwin (0800), Canberra (2600)

---

## 4. Future Geolocation & Address Plans

1. **G-NAF Street-Level Imports**: Future database updates will add a `public.location_addresses` table to support street-level address verification keyless.
2. **Radial Distance Queries**: Suburbs have `latitude` and `longitude` fields to support radial job searches (e.g., "Find jobs within 25km of Salisbury SA 5108") using Postgres PostGIS or mathematical distance queries.
