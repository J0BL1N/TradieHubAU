import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🔍 Australian Location Validation Script

Usage:
  node scripts/validate-australian-locations.mjs

Options:
  --help, -h    Show this help message and exit.

Description:
  Validates that:
  1. The fallback seed in migration 088 includes the core testing suburbs (VIC Cardinia/Casey, SA Salisbury).
  2. The generated supabase/seed_locations.sql file contains all required 15 critical suburbs
     (spanning capital centroids and local Salisbury/Cardinia localities) if the seed exists.
`);
  process.exit(0);
}

const seedPath = path.resolve('supabase/seed_locations.sql');
const migrationPath = path.resolve('supabase/migrations/088_national_location_database.sql');

console.log(`🔍 Starting location validation suite...`);

const criticalSuburbs = [
  { suburb: 'Ingle Farm', state: 'SA', postcode: '5098' },
  { suburb: 'Salisbury', state: 'SA', postcode: '5108' },
  { suburb: 'Salisbury Downs', state: 'SA', postcode: '5108' },
  { suburb: 'Salisbury East', state: 'SA', postcode: '5109' },
  { suburb: 'Pakenham', state: 'VIC', postcode: '3810' },
  { suburb: 'Koo Wee Rup', state: 'VIC', postcode: '3981' },
  { suburb: 'Officer', state: 'VIC', postcode: '3809' },
  { suburb: 'Beaconsfield', state: 'VIC', postcode: '3807' },
  { suburb: 'Berwick', state: 'VIC', postcode: '3806' },
  { suburb: 'Clyde', state: 'VIC', postcode: '3978' },
  { suburb: 'Cranbourne', state: 'VIC', postcode: '3977' },
  { suburb: 'Narre Warren', state: 'VIC', postcode: '3805' },
  { suburb: 'Dandenong', state: 'VIC', postcode: '3175' },
  { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
  { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
  { suburb: 'Perth', state: 'WA', postcode: '6000' },
  { suburb: 'Adelaide', state: 'SA', postcode: '5000' },
  { suburb: 'Hobart', state: 'TAS', postcode: '7000' },
  { suburb: 'Canberra', state: 'ACT', postcode: '2600' }
];

let checksPassed = true;

// 1. Check if migration fallback exists
console.log(`Checking migration 088 fallback seed...`);
if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration 088 file not found at ${migrationPath}`);
  checksPassed = false;
} else {
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  for (const item of criticalSuburbs) {
    // Some critical suburbs are excluded from migration 088's fallback seed on purpose (since 088 is a small fallback)
    // We only warn here; we do not fail the check for migration 088 unless Salisbury/Cardinia are missing.
    const query = `'${item.suburb}', '${item.state}', '${item.postcode}'`;
    if (!migrationContent.includes(query)) {
      const isSalisburyOrCardinia = ['SA', 'VIC'].includes(item.state) &&
        ['Ingle Farm', 'Salisbury', 'Salisbury Downs', 'Salisbury East', 'Pakenham', 'Koo Wee Rup', 'Officer', 'Beaconsfield', 'Berwick', 'Clyde', 'Cranbourne', 'Narre Warren', 'Dandenong', 'Melbourne'].includes(item.suburb);

      if (isSalisburyOrCardinia) {
        console.error(`❌ Error: Suburb ${item.suburb} (${item.state} ${item.postcode}) is missing from Migration 088 fallback seed.`);
        checksPassed = false;
      } else {
        console.log(`⚠️ Info: Suburb ${item.suburb} (${item.state} ${item.postcode}) is not in migration fallback seed (expected for small seed).`);
      }
    }
  }
}

// 2. Check if a full SQL seed file is generated
console.log(`Checking generated SQL seed...`);
if (!fs.existsSync(seedPath)) {
  console.log(`💡 Note: No full SQL seed found at ${seedPath}. A full seed is created only after running the importer script.`);
} else {
  const seedContent = fs.readFileSync(seedPath, 'utf8');
  let missingCount = 0;
  for (const item of criticalSuburbs) {
    const query = `'${item.suburb}', '${item.state}', '${item.postcode}'`;
    if (!seedContent.includes(query)) {
      console.error(`❌ Error: Suburb ${item.suburb} (${item.state} ${item.postcode}) not found in generated SQL seed.`);
      missingCount += 1;
      checksPassed = false;
    }
  }

  // Brisbane/Brisbane City verification
  const brisbaneQueries = [
    `'Brisbane', 'QLD', '4000'`,
    `'Brisbane City', 'QLD', '4000'`
  ];
  const hasBrisbane = brisbaneQueries.some(q => seedContent.includes(q));
  if (!hasBrisbane) {
    console.error(`❌ Error: Brisbane / Brisbane City (QLD 4000) not found in generated SQL seed.`);
    missingCount += 1;
    checksPassed = false;
  }

  // Darwin/Darwin City verification
  const darwinQueries = [
    `'Darwin', 'NT', '0800'`,
    `'Darwin City', 'NT', '0800'`
  ];
  const hasDarwin = darwinQueries.some(q => seedContent.includes(q));
  if (!hasDarwin) {
    console.error(`❌ Error: Darwin / Darwin City (NT 0800) not found in generated SQL seed.`);
    missingCount += 1;
    checksPassed = false;
  }

  if (missingCount === 0) {
    console.log(`✅ Success: All critical suburbs found in the generated SQL seed.`);
  }
}

if (checksPassed) {
  console.log(`🎉 Validation suite completed successfully!`);
  process.exit(0);
} else {
  console.error(`❌ Validation suite failed.`);
  process.exit(1);
}
