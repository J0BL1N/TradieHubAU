import fs from 'node:fs';
import path from 'node:path';

const sourceUrl = 'https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv';
const outPath = path.resolve('public/data/au-postcode-localities.json');

// Audited presentation/council corrections for rows where the source postcode CSV
// carries a broader or stale LGA-style label. Keep this list small and source-audited.
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
  ['NT|0801|Darwin', 'Darwin'],
]);

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
  return text
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

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to download ${sourceUrl}: ${response.status}`);
}

const csv = await response.text();
const rows = parseCsv(csv);
const headers = rows.shift();
const index = Object.fromEntries(headers.map((header, i) => [header, i]));
const stateOrder = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const stateSet = new Set(stateOrder);
const seen = new Set();
const entries = [];

for (const row of rows) {
  const state = (row[index.state] || '').trim().toUpperCase();
  if (!stateSet.has(state)) continue;

  const postcode = (row[index.postcode] || '').trim().padStart(4, '0');
  const localityRaw = (row[index.locality] || '').trim();
  if (!/^\d{4}$/.test(postcode) || !localityRaw) continue;

  const suburb = titleCase(localityRaw);
  const correctionKey = `${state}|${postcode}|${suburb}`;
  const lgaRaw = (row[index.lgaregion] || '').trim();
  const fallbackRegion = (row[index.sa3name] || row[index.sa4name] || '').trim();
  const region = regionCorrections.get(correctionKey) || titleCase(lgaRaw || fallbackRegion || `${state} region`);
  const key = `${state}|${region}|${suburb}|${postcode}`;

  if (seen.has(key)) continue;
  seen.add(key);
  entries.push({ state, region, suburb, postcode });
}

entries.sort((a, b) =>
  stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state) ||
  a.region.localeCompare(b.region) ||
  a.suburb.localeCompare(b.suburb) ||
  a.postcode.localeCompare(b.postcode)
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  source: `Matthew Proctor Australian Postcodes community dataset, public domain, downloaded from ${sourceUrl}`,
  generatedAt: new Date().toISOString(),
  regionField: 'lgaregion, falling back to SA3/SA4 where lgaregion is blank; see generator corrections for audited display labels',
  entries,
}));

console.log(`Generated ${entries.length} location rows at ${outPath}`);
