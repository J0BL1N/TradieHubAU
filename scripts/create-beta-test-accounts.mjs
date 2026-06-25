#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BATCH_ID = 'discord-beta-001';
const EMAIL_DOMAIN = 'tradiehubau.test';
const OUTPUT_PATH = path.resolve('private/beta/BETA_TEST_PROFILE_CARDS.md');
const TOTAL_CUSTOMERS = 40;
const TOTAL_TRADIES = 25;
const MAX_REST_ROWS = 1000;

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = !apply || args.has('--dry-run');

const customerNames = [
  ['Sarah', 'Mitchell'], ['James', 'Parker'], ['Emily', 'Nguyen'], ['Liam', 'Thompson'],
  ['Olivia', 'Harris'], ['Noah', 'Campbell'], ['Ava', 'Bennett'], ['Lucas', 'Foster'],
  ['Mia', 'Wallace'], ['Henry', 'Cooper'], ['Chloe', 'Morgan'], ['Ethan', 'Bailey'],
  ['Grace', 'Turner'], ['Jack', 'Collins'], ['Amelia', 'Brooks'], ['Mason', 'Ward'],
  ['Sophie', 'Kelly'], ['Thomas', 'Reed'], ['Isla', 'Murphy'], ['Charlie', 'Watson'],
];

const tradieNames = [
  ['Lingo', 'Chen'], ['Marcus', 'Reed'], ['Priya', 'Shah'], ['Dylan', 'OBrien'],
  ['Talia', 'Singh'], ['Aaron', 'Lewis'], ['Mei', 'Tan'], ['Nate', 'Roberts'],
  ['Zara', 'Ali'], ['Ben', 'Howard'], ['Jade', 'Martin'], ['Sam', 'Wilson'],
  ['Riley', 'Scott'],
];

const suburbs = [
  ['Parramatta', 'NSW', '2150'], ['Brunswick', 'VIC', '3056'], ['New Farm', 'QLD', '4005'],
  ['Fremantle', 'WA', '6160'], ['Norwood', 'SA', '5067'], ['Belconnen', 'ACT', '2617'],
  ['Sandy Bay', 'TAS', '7005'], ['Darwin City', 'NT', '0800'], ['Geelong West', 'VIC', '3218'],
  ['Wollongong', 'NSW', '2500'],
];

const jobScenarios = [
  ['Ceiling fan installation', '$250-$450', 'This week'],
  ['Leaking kitchen tap repair', '$120-$280', 'ASAP'],
  ['Fence panel replacement', '$500-$900', 'Next fortnight'],
  ['Bathroom regrouting', '$300-$650', 'Flexible'],
  ['Garden clean-up and green waste removal', '$180-$400', 'This weekend'],
  ['Internal room repaint', '$700-$1,200', 'Next month'],
  ['Blocked drain assessment', '$180-$350', 'ASAP'],
  ['Laundry shelf and cabinet install', '$300-$600', 'This week'],
];

const tradieScenarios = [
  ['BrightWire Electrical', 'electrical', 'Electrical maintenance and small install quote flow'],
  ['ClearFlow Plumbing', 'plumbing', 'Plumbing response, quote, and completion proof flow'],
  ['TrueLine Carpentry', 'carpentry', 'Carpentry quote/application and job coordination flow'],
  ['FreshCoat Painting', 'painting', 'Painting quote details and customer messaging flow'],
  ['TileMate Services', 'tiling', 'Tiling job quote and completion flow'],
  ['GreenEdge Gardens', 'gardening', 'Gardening job discovery and protected-payment flow'],
  ['SparkSafe Contractors', 'electrical', 'Verified tradie messaging and quote acceptance flow'],
  ['BuildRight Repairs', 'building', 'Building maintenance quote and evidence flow'],
];

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
}

function twoDigit(index) {
  return String(index).padStart(2, '0');
}

function fakeAbn(index) {
  return `53 004 085 ${String(500 + index).padStart(3, '0')}`;
}

function fakeLicence(index, state) {
  return `${state}-BETA-${String(260000 + index).padStart(6, '0')}`;
}

function buildCustomers() {
  return Array.from({ length: TOTAL_CUSTOMERS }, (_, offset) => {
    const index = offset + 1;
    const [firstName, lastName] = customerNames[offset % customerNames.length];
    const [suburb, state, postcode] = suburbs[offset % suburbs.length];
    const [scenario, budget, urgency] = jobScenarios[offset % jobScenarios.length];
    const id = `Customer ${twoDigit(index)}`;
    return {
      testerId: id,
      fakeName: `${firstName} ${lastName}`,
      displayName: `[BETA] ${firstName} ${lastName}`,
      email: `customer.${slug(firstName)}.${slug(lastName)}${twoDigit(index)}@${EMAIL_DOMAIN}`,
      password: `TradieBeta!2026-C${twoDigit(index)}`,
      role: 'customer',
      suburb,
      state,
      postcode,
      jobScenario: scenario,
      budgetRange: budget,
      urgency,
      mission: `Post or coordinate a fake ${scenario.toLowerCase()} job, test messaging, and report confusing steps anonymously if preferred.`,
    };
  });
}

function buildTradies() {
  return Array.from({ length: TOTAL_TRADIES }, (_, offset) => {
    const index = offset + 1;
    const [firstName, lastName] = tradieNames[offset % tradieNames.length];
    const [suburb, state, postcode] = suburbs[(offset + 4) % suburbs.length];
    const [businessName, trade, missionFocus] = tradieScenarios[offset % tradieScenarios.length];
    const id = `Tradie ${twoDigit(index)}`;
    return {
      testerId: id,
      fakeName: `${firstName} ${lastName}`,
      displayName: `[BETA] ${firstName} ${lastName}`,
      businessName: `[BETA] ${businessName}`,
      email: `tradie.${slug(firstName)}.${slug(lastName)}${twoDigit(index)}@${EMAIL_DOMAIN}`,
      password: `TradieBeta!2026-T${twoDigit(index)}`,
      role: 'tradie',
      suburb,
      state,
      postcode,
      trade,
      abn: fakeAbn(index),
      licenseNumber: fakeLicence(index, state),
      mission: `${missionFocus}. Apply only to fake beta jobs and avoid real contact/payment details.`,
    };
  });
}

function profileForAccount(account) {
  const base = {
    email: account.email,
    role: account.role,
    display_name: account.role === 'tradie' ? account.businessName : account.displayName,
    suburb: account.suburb,
    state: account.state,
    postcode: account.postcode,
    show_location: true,
    address_rule: 'afterAccepted',
    verified: account.role === 'tradie',
    identity_verified: account.role === 'tradie',
    tradie_verified: account.role === 'tradie',
  };

  if (account.role === 'tradie') {
    return {
      ...base,
      trades: [account.trade],
      abn: account.abn,
      license_number: account.licenseNumber,
    };
  }

  return {
    ...base,
    trades: null,
    abn: null,
    license_number: null,
  };
}

function metadataForAccount(account) {
  return {
    beta_test_batch: BATCH_ID,
    tester_id: account.testerId,
    fake_profile: true,
    role: account.role,
    display_name: account.role === 'tradie' ? account.businessName : account.displayName,
  };
}

function renderCards(customers, tradies) {
  const lines = [
    '# TradieHubAU Beta Test Profile Cards',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Batch: ${BATCH_ID}`,
    '',
    '> Private beta coordination file. Do not commit. Do not post outside the private beta tester channel.',
    '',
    '## Customer Accounts',
    '',
  ];

  for (const account of customers) {
    lines.push(
      `### ${account.testerId} - ${account.fakeName}`,
      '',
      `- Email: \`${account.email}\``,
      `- Password: \`${account.password}\``,
      '- Role: Customer',
      `- Location: ${account.suburb}, ${account.state} ${account.postcode}`,
      `- Fake job scenario: ${account.jobScenario}`,
      `- Budget range: ${account.budgetRange}`,
      `- Urgency: ${account.urgency}`,
      `- Mission: ${account.mission}`,
      ''
    );
  }

  lines.push('## Verified Tradie Accounts', '');

  for (const account of tradies) {
    lines.push(
      `### ${account.testerId} - ${account.fakeName}`,
      '',
      `- Business: ${account.businessName}`,
      `- Email: \`${account.email}\``,
      `- Password: \`${account.password}\``,
      '- Role: Verified Tradie',
      `- Trade category: ${account.trade}`,
      `- Fake ABN: ${account.abn}`,
      `- Fake licence: ${account.licenseNumber}`,
      `- Location: ${account.suburb}, ${account.state} ${account.postcode}`,
      `- Mission: ${account.mission}`,
      ''
    );
  }

  return `${lines.join('\n')}\n`;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply.');
  }
  if (process.env.TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM !== BATCH_ID) {
    throw new Error(`Set TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM=${BATCH_ID} before using --apply.`);
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function supabaseFetch(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}${endpoint}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || 'GET'} ${endpoint} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function createAuthUser(config, account) {
  return supabaseFetch(config, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: metadataForAccount(account),
      app_metadata: {
        beta_test_batch: BATCH_ID,
        beta_account: true,
      },
    }),
  });
}

async function upsertProfile(config, userId, account) {
  const profile = {
    id: userId,
    ...profileForAccount(account),
  };

  return supabaseFetch(config, '/rest/v1/users?on_conflict=id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(profile),
  });
}

async function applyAccounts(accounts) {
  const config = supabaseConfig();
  const created = [];

  for (const account of accounts) {
    const authUser = await createAuthUser(config, account);
    const userId = authUser?.id;
    if (!userId) throw new Error(`Supabase did not return an auth user id for ${account.email}`);
    await upsertProfile(config, userId, account);
    created.push({ email: account.email, id: userId });
    console.log(`Created ${account.email}`);
  }

  return created;
}

async function main() {
  const customers = buildCustomers();
  const tradies = buildTradies();
  const accounts = [...customers, ...tradies];
  const cards = renderCards(customers, tradies);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, cards, 'utf8');

  console.log(`Prepared ${accounts.length} beta accounts (${customers.length} customer, ${tradies.length} tradie).`);
  console.log(`Wrote private profile cards to ${OUTPUT_PATH}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);

  if (dryRun) {
    console.log('No Supabase users were created. Re-run with --apply and required env vars to create accounts.');
    return;
  }

  await applyAccounts(accounts);
  console.log(`Created ${accounts.length} Supabase beta auth users and profile rows.`);
  console.log(`Cleanup batch id: ${BATCH_ID}. Max REST rows constant: ${MAX_REST_ROWS}.`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
