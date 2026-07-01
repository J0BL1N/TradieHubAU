import fs from 'node:fs';
import path from 'node:path';

// Get source CSV path
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🚀 Australian Postcode Importer Script

Usage:
  node scripts/import-australian-locations.mjs [path_to_csv]

Options:
  --help, -h    Show this help message and exit.

Arguments:
  [path_to_csv] Path to the source CSV file (defaults to data/location-imports/australian_postcodes.csv).

Description:
  Parses an Australian locality/postcode CSV file, normalizes fields (Title Case suburb names,
  uppercase state abbreviations, 4-digit postcodes), filters out duplicate rows in memory,
  performs critical required suburb validation, and generates a clean PostgreSQL batch seed
  file at supabase/seed_locations.sql.
`);
  process.exit(0);
}

const sourcePath = args[0] || path.resolve('data/location-imports/australian_postcodes.csv');
const outSqlPath = path.resolve('supabase/seed_locations.sql');

console.log(`🚀 Starting location import pipeline from: ${sourcePath}`);

if (!fs.existsSync(sourcePath)) {
  console.error(`❌ Error: Source file not found at ${sourcePath}`);
  console.error(`Please place the official postcode CSV at that location or pass the path as an argument.`);
  console.error(`Type 'node scripts/import-australian-locations.mjs --help' for details.`);
  process.exit(1);
}

// 1. Lightweight CSV parser
function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        value += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(value);
      value = '';
    } else if (ch === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (ch !== '\r') {
      value += ch;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function titleCase(text) {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, char => char.toUpperCase())
    .replace(/\bNsw\b/g, 'NSW')
    .replace(/\bQld\b/g, 'QLD')
    .replace(/\bWa\b/g, 'WA')
    .replace(/\bSa\b/g, 'SA')
    .replace(/\bTas\b/g, 'TAS')
    .replace(/\bVic\b/g, 'VIC')
    .replace(/\bNt\b/g, 'NT')
    .replace(/\bAct\b/g, 'ACT')
    .replace(/\bOf\b/g, 'of');
}

// Read and parse file
const csvContent = fs.readFileSync(sourcePath, 'utf8');
const parsedRows = parseCsv(csvContent);
const headers = parsedRows.shift();

// Normalize headers to support generic column names
const index = Object.fromEntries(
  headers.map((h, i) => {
    let key = h.trim().toLowerCase();
    if (key === 'suburb') key = 'locality';
    if (key === 'region') key = 'lgaregion';
    if (key === 'latitude') key = 'lat';
    if (key === 'longitude') key = 'lon';
    return [key, i];
  })
);

// Verify required headers exist
const requiredHeaders = ['state', 'postcode', 'locality'];
for (const h of requiredHeaders) {
  if (index[h] === undefined) {
    console.error(`❌ Error: Missing required column header "${h}" (or alias like "suburb") in CSV.`);
    console.error(`Available headers: ${headers.join(', ')}`);
    process.exit(1);
  }
}

const stateOrder = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const stateSet = new Set(stateOrder);

const suburbsList = [];
const uniqueRegions = new Set(); // Set of "State|RegionName"
const seenSuburbs = new Set(); // In-memory deduplication set

// Audited presentation/council corrections
const regionCorrections = new Map([
  ['VIC|3810|Pakenham', 'Cardinia Shire'],
  ['VIC|3981|Koo Wee Rup', 'Cardinia Shire'],
  ['VIC|3977|Cranbourne', 'City of Casey'],
  ['NSW|2000|Sydney', 'City of Sydney'],
  ['QLD|4000|Brisbane', 'Brisbane City'],
  ['WA|6000|Perth', 'City of Perth'],
  ['SA|5000|Adelaide', 'City of Adelaide'],
  ['TAS|7000|Hobart', 'City of Hobart'],
  ['ACT|2600|Canberra', 'Canberra'],
  ['NT|0800|Darwin', 'Darwin'],
]);

for (const row of parsedRows) {
  if (row.length < 3) continue;

  const state = (row[index.state] || '').trim().toUpperCase();
  if (!stateSet.has(state)) continue;

  const postcode = (row[index.postcode] || '').trim().padStart(4, '0');
  const localityRaw = (row[index.locality] || '').trim();
  if (!/^\d{4}$/.test(postcode) || !localityRaw) continue;

  const suburb = titleCase(localityRaw);

  // Deduplicate duplicate suburb/state/postcode rows in memory
  const duplicateKey = `${suburb}|${state}|${postcode}`.toLowerCase();
  if (seenSuburbs.has(duplicateKey)) {
    continue;
  }
  seenSuburbs.add(duplicateKey);

  const lgaRaw = index.lgaregion !== undefined ? (row[index.lgaregion] || '').trim() : '';
  const sa3Raw = index.sa3name !== undefined ? (row[index.sa3name] || '').trim() : '';
  const sa4Raw = index.sa4name !== undefined ? (row[index.sa4name] || '').trim() : '';
  
  const correctionKey = `${state}|${postcode}|${suburb}`;
  let regionName = regionCorrections.get(correctionKey) || titleCase(lgaRaw || sa3Raw || sa4Raw || `${state} region`);
  
  if (!regionName || regionName === 'N/A' || regionName.toLowerCase() === 'blank') {
    regionName = `${state} region`;
  }

  // Latitude and Longitude if available
  const latVal = index.lat !== undefined ? parseFloat(row[index.lat]) : null;
  const lngVal = index.lon !== undefined ? parseFloat(row[index.lon]) : null;
  const sourceRecordId = index.id !== undefined ? (row[index.id] || '').trim() : null;

  uniqueRegions.add(`${state}|${regionName}`);
  suburbsList.push({
    suburb,
    state,
    postcode,
    regionName,
    latitude: isNaN(latVal) ? null : latVal,
    longitude: isNaN(lngVal) ? null : lngVal,
    sourceRecordId
  });
}

// 2. Validate known locations exist in the parsed dataset
const criticalSuburbs = [
  { suburb: 'Ingle Farm', state: 'SA', postcode: '5098' },
  { suburb: 'Salisbury', state: 'SA', postcode: '5108' },
  { suburb: 'Pakenham', state: 'VIC', postcode: '3810' },
  { suburb: 'Koo Wee Rup', state: 'VIC', postcode: '3981' },
  { suburb: 'Officer', state: 'VIC', postcode: '3809' },
  { suburb: 'Beaconsfield', state: 'VIC', postcode: '3807' },
  { suburb: 'Berwick', state: 'VIC', postcode: '3806' },
  { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
  { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
  { suburb: 'Perth', state: 'WA', postcode: '6000' },
  { suburb: 'Adelaide', state: 'SA', postcode: '5000' },
  { suburb: 'Hobart', state: 'TAS', postcode: '7000' },
  { suburb: 'Canberra', state: 'ACT', postcode: '2600' }
];

let validationFailed = false;
const missingSuburbs = [];

for (const critical of criticalSuburbs) {
  const found = suburbsList.some(
    s => s.suburb.toLowerCase() === critical.suburb.toLowerCase() &&
         s.state === critical.state &&
         s.postcode === critical.postcode
  );
  if (!found) {
    missingSuburbs.push(critical);
    validationFailed = true;
  }
}

// Verify Brisbane (either Brisbane City QLD 4000 or Brisbane QLD 4000)
const foundBrisbane = suburbsList.some(
  s => (s.suburb.toLowerCase() === 'brisbane' || s.suburb.toLowerCase() === 'brisbane city') &&
       s.state === 'QLD' &&
       s.postcode === '4000'
);
if (!foundBrisbane) {
  missingSuburbs.push({ suburb: 'Brisbane / Brisbane City', state: 'QLD', postcode: '4000' });
  validationFailed = true;
}

// Verify Darwin (either Darwin City NT 0800 or Darwin NT 0800)
const foundDarwin = suburbsList.some(
  s => (s.suburb.toLowerCase() === 'darwin' || s.suburb.toLowerCase() === 'darwin city') &&
       s.state === 'NT' &&
       s.postcode === '0800'
);
if (!foundDarwin) {
  missingSuburbs.push({ suburb: 'Darwin / Darwin City', state: 'NT', postcode: '0800' });
  validationFailed = true;
}

if (validationFailed) {
  console.error(`❌ Validation Failed: Missing critical suburbs from import source:`);
  for (const m of missingSuburbs) {
    console.error(`  - ${m.suburb}, ${m.state} ${m.postcode}`);
  }
  console.error(`Aborting import to prevent deploying corrupted location database.`);
  process.exit(1);
}

console.log(`✅ Validation Passed: All ${criticalSuburbs.length + 2} critical verification locations verified.`);

// 3. Generate SQL Seed file contents
let sqlContent = `-- Generated SQL Seed for Australian Locations\n`;
sqlContent += `-- Generated at: ${new Date().toISOString()}\n`;
sqlContent += `-- Source: ${path.basename(sourcePath)}\n\n`;

// Insert unique regions
sqlContent += `-- 1. Populate Regions\n`;
sqlContent += `INSERT INTO public.location_regions (state, region_name, region_type, source) VALUES\n`;

const regionsArray = Array.from(uniqueRegions).map(rKey => {
  const [state, regionName] = rKey.split('|');
  const escapedRegionName = regionName.replace(/'/g, "''");
  return `  ('${state}', '${escapedRegionName}', 'app_region', 'national_import_pipeline')`;
});

sqlContent += regionsArray.join(',\n') + `\nON CONFLICT (state, region_name, region_type) DO NOTHING;\n\n`;

// Insert suburbs
sqlContent += `-- 2. Populate Suburbs (Linking to Region IDs dynamically)\n`;

const suburbsArray = suburbsList.map(s => {
  const escapedSuburb = s.suburb.replace(/'/g, "''");
  const escapedRegion = s.regionName.replace(/'/g, "''");
  const displayName = `${escapedSuburb} ${s.state} ${s.postcode}`;
  const latVal = s.latitude !== null ? s.latitude : 'NULL';
  const lngVal = s.longitude !== null ? s.longitude : 'NULL';
  const sourceRec = s.sourceRecordId ? `'${s.sourceRecordId.replace(/'/g, "''")}'` : 'NULL';

  return `  ('${escapedSuburb}', '${s.state}', '${s.postcode}', (SELECT id FROM regions WHERE state = '${s.state}' AND region_name = '${escapedRegion}'), '${escapedRegion}', '${displayName}', ${latVal}, ${lngVal}, 'national_import_pipeline', ${sourceRec})`;
});

const BATCH_SIZE = 1000;
let finalSql = sqlContent;

for (let i = 0; i < suburbsArray.length; i += BATCH_SIZE) {
  const batch = suburbsArray.slice(i, i + BATCH_SIZE);
  finalSql += `WITH regions AS (
  SELECT id, state, region_name FROM public.location_regions WHERE source = 'national_import_pipeline'
)
INSERT INTO public.location_suburbs (suburb, state, postcode, region_id, region_name, display_name, latitude, longitude, source, source_record_id) VALUES\n`;
  finalSql += batch.join(',\n') + `\nON CONFLICT (suburb, state, postcode) DO UPDATE\nSET\n  region_id = EXCLUDED.region_id,\n  region_name = EXCLUDED.region_name,\n  display_name = EXCLUDED.display_name,\n  latitude = EXCLUDED.latitude,\n  longitude = EXCLUDED.longitude,\n  source = EXCLUDED.source,\n  is_verified = true,\n  is_active = true;\n\n`;
}

fs.writeFileSync(outSqlPath, finalSql, 'utf8');
console.log(`✅ Success: Generated SQL seed file containing ${uniqueRegions.size} regions and ${suburbsList.length} suburbs at ${outSqlPath}`);
