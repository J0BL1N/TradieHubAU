#!/usr/bin/env node

const BATCH_ID = 'discord-beta-001';
const EMAIL_DOMAIN = '@tradiehubau.test';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirm = process.env.TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM === BATCH_ID;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  if (!confirm) {
    throw new Error(`Set TRADIEHUBAU_BETA_ACCOUNT_TOOL_CONFIRM=${BATCH_ID} before cleanup.`);
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

async function listAuthUsers(config) {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const result = await supabaseFetch(config, `/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
    const batch = Array.isArray(result?.users) ? result.users : [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

function isBetaUser(user) {
  const email = String(user.email || '');
  const metadata = {
    ...(user.user_metadata || {}),
    ...(user.app_metadata || {}),
  };
  return email.endsWith(EMAIL_DOMAIN) && metadata.beta_test_batch === BATCH_ID;
}

async function deleteProfile(config, userId) {
  await supabaseFetch(config, `/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });
}

async function deleteAuthUser(config, userId) {
  await supabaseFetch(config, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

async function main() {
  const config = supabaseConfig();
  const authUsers = await listAuthUsers(config);
  const betaUsers = authUsers.filter(isBetaUser);

  console.log(`Found ${betaUsers.length} beta auth users for batch ${BATCH_ID}.`);
  betaUsers.forEach(user => console.log(`- ${user.email} (${user.id})`));

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to delete only the listed beta-tagged users.');
    return;
  }

  for (const user of betaUsers) {
    await deleteProfile(config, user.id);
    await deleteAuthUser(config, user.id);
    console.log(`Deleted ${user.email}`);
  }

  console.log(`Deleted ${betaUsers.length} beta users and matching profile rows.`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
