# Structured Australian Job Locations

TradieHubAU job posting uses a dependent location selector:

1. State / Territory
2. Region / Council Area
3. Suburb
4. Postcode, auto-filled from the selected suburb/postcode row

The frontend dataset is `frontend/public/data/au-postcode-localities.json`.

## Source

The generated JSON is based on the Matthew Proctor Australian Postcodes community dataset:

`https://github.com/matthewproctor/australianpostcodes`

The source project describes the data as public domain. The import uses:

- `state`
- `locality`
- `postcode`
- `lgaregion` for the Region / Council Area label
- `sa3name` / `sa4name` as fallback labels when `lgaregion` is blank

Some source `lgaregion` labels are broad or stale for specific locality/postcode rows. The generator keeps a small audited correction hook for display labels required by beta QA examples.

## Regenerating

From `frontend/`:

```bash
node scripts/generate-au-locations.mjs
```

This downloads the CSV and rewrites `public/data/au-postcode-localities.json`.

## Limitations

The selector is Australia-wide for postcode/locality coverage from the imported dataset, but it is not an address verifier and does not collect street addresses. Council/LGA labels depend on the imported dataset plus the documented correction hook. If stricter official LGA boundaries are required later, replace the generator with an ABS LGA/locality correspondence import.
