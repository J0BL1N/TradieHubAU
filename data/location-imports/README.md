# Australian Location Imports

This directory contains the pipeline components and source data instructions for importing a proper, verified all-Australia location database (suburbs, localities, postcodes, and regions).

## 1. Directory Structure

- `data/location-imports/README.md`: This file.
- `data/location-imports/sample_locations.csv`: Sample CSV file for verification.
- `scripts/import-australian-locations.mjs`: Importer script.
- `scripts/validate-australian-locations.mjs`: Validator script to verify data integrity.

---

## 2. Data Source Hierarchy & Licensing WARNING

Before downloading or importing data, ensure compliance with licensing terms:
1. **ABS ASGS Suburbs and Localities / Postal Areas**: Free open data, highly reliable for boundary correspondences. Preferred.
2. **G-NAF (Geocoded National Address File)**: Free open geocoded data updated every 3 months. Ideal for full coordinate and address mapping.
3. **Australia Post Postcode Data**: Commercial licensing is required for corporate production usage. Do not package or bundle their proprietary data in public repositories without permission.
4. **Matthew Proctor Australian Postcodes CSV**: Community-compiled public domain data (suitable as fallback/import source).

> [!WARNING]
> Do NOT blindly import arbitrary community CSVs or copy-paste list files from internet forums without verifying licensing and data accuracy. Some older datasets contain incorrect postcodes (e.g., Adelaide Hills suburbs mapped to wrong postcodes or regions).

---

## 3. How to Import the National Location Dataset

### Step 1: Download Source File
Download a verified postcodes CSV file (such as the Matthew Proctor dataset or ABS postcode locality correspondences).
Save the downloaded file to:
`data/location-imports/australian_postcodes.csv`

### Step 2: Run the Importer Script
From the project root directory, run:
```bash
node scripts/import-australian-locations.mjs [path_to_csv]
```
If no path is provided, the script will default to `data/location-imports/australian_postcodes.csv`.

The script does the following:
1. Validates and parses the CSV.
2. Normalizes suburbs (Title Case) and state abbreviations (uppercase).
3. Deduplicates entries.
4. Maps suburbs to their LGAs or regions.
5. Generates a SQL seed file at `supabase/seed_locations.sql` for easy import via Supabase Studio or `psql`.
6. If the env variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are defined, it can automatically upsert the records directly to the database.

### Step 3: Run the Validation Script
To verify the imported dataset meets all local beta requirements, run the validation script:
```bash
node scripts/validate-australian-locations.mjs
```

---

## 4. Known Validation Suburbs
To ensure a successful import, the validator checks for the existence of these critical locations:
- Ingle Farm, SA 5098 (Salisbury region)
- Salisbury, SA 5108
- Salisbury Downs, SA 5108
- Salisbury East, SA 5109
- Pakenham, VIC 3810 (Cardinia Shire)
- Koo Wee Rup, VIC 3981
- Officer, VIC 3809
- Beaconsfield, VIC 3807
- Berwick, VIC 3806
- Clyde, VIC 3978
- Cranbourne, VIC 3977
- Narre Warren, VIC 3805
- Dandenong, VIC 3175
- Melbourne, VIC 3000
- Sydney, NSW 2000
- Brisbane, QLD 4000
- Perth, WA 6000
- Adelaide, SA 5000
- Hobart, TAS 7000
- Darwin, NT 0800
- Canberra, ACT 2600

---

## 5. Future Roadmap Plans
1. **Full G-NAF Address Import**: Future phases will expand the tables to map full street addresses rather than just suburb-level centroids.
2. **Geospatial Distance Filtering**: Future updates will utilize the `latitude` and `longitude` fields in `location_suburbs` to support "Jobs within X km of my location" filtering using Postgres `PostGIS` or direct mathematical distance queries.
