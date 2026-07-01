import fs from 'node:fs';
import path from 'node:path';

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
  { suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
  { suburb: 'Sydney', state: 'NSW', postcode: '2000' },
  { suburb: 'Perth', state: 'WA', postcode: '6000' },
  { suburb: 'Adelaide', state: 'SA', postcode: '5000' },
  { suburb: 'Hobart', state: 'TAS', postcode: '7000' },
  { suburb: 'Canberra', state: 'ACT', postcode: '2600' }
];

let checksPassed = true;

// 1. Check if at least migration fallback exists
console.log(`Checking migration 088 fallback seed...`);
if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration 088 file not found at ${migrationPath}`);
  checksPassed = false;
} else {
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  for (const item of criticalSuburbs) {
    // Check if the query is in the fallback seed values
    const query = `'${item.suburb}', '${item.state}', '${item.postcode}'`;
    if (!migrationContent.includes(query)) {
      console.warn(`⚠️ Warning: Suburb ${item.suburb} (${item.state} ${item.postcode}) is missing from Migration 088 fallback seed.`);
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
