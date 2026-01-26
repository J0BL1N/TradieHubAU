/**
 * verify-job-system.ts
 * Codex/GA IDE verification checks (A–H) in executable code.
 *
 * Usage (Node 18+):
 *   1) npm i @supabase/supabase-js pg dotenv
 *   2) set env vars (see below)
 *   3) node verify-job-system.ts
 *
 * Required env:
 *   SUPABASE_URL=
 *   SUPABASE_ANON_KEY=
 *   SUPABASE_DB_URL=           (Postgres connection string, e.g. postgres://...)
 *
 * Test users (must exist in Auth):
 *   TEST_CUSTOMER_EMAIL=
 *   TEST_CUSTOMER_PASSWORD=
 *   TEST_TRADIE_EMAIL=
 *   TEST_TRADIE_PASSWORD=
 *   TEST_THIRD_EMAIL=
 *   TEST_THIRD_PASSWORD=
 *
 * Known IDs to validate routes and access (create these in your dev DB first):
 *   TEST_JOB_ID=               (job_id that has an accepted assignment between customer+tradie)
 *   TEST_CONVERSATION_ID=      (conversation tied to that job, if using conversation_jobs)
 *
 * Optional:
 *   TEST_INVOICE_ID=           (invoice id linked to TEST_JOB_ID)
 *   TEST_VARIATION_ID=         (variation id linked to TEST_JOB_ID)
 *
 * Notes:
 * - This script checks schema existence, RLS enabled, policy presence, and access control.
 * - It does NOT depend on your frontend server. It validates DB & Supabase RLS + core data flows.
 */

import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

type CheckResult = { name: string; ok: boolean; details?: string };

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_DB_URL,
  TEST_CUSTOMER_EMAIL,
  TEST_CUSTOMER_PASSWORD,
  TEST_TRADIE_EMAIL,
  TEST_TRADIE_PASSWORD,
  TEST_THIRD_EMAIL,
  TEST_THIRD_PASSWORD,
  TEST_JOB_ID,
  TEST_CONVERSATION_ID,
  TEST_INVOICE_ID,
  TEST_VARIATION_ID,
} = process.env;

function requireEnv(key: string) {
  if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
}

function ok(name: string, details?: string): CheckResult {
  return { name, ok: true, details };
}
function fail(name: string, details?: string): CheckResult {
  return { name, ok: false, details };
}

async function pgQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  requireEnv("SUPABASE_DB_URL");
  const pool = new pg.Pool({ connectionString: SUPABASE_DB_URL });
  try {
    const res = await pool.query(sql, params);
    return res.rows as T[];
  } finally {
    await pool.end();
  }
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_ANON_KEY");
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Auth failed for ${email}: ${error?.message ?? "no session"}`);
  }
  // Return a client "as user" by setting auth header via built-in session
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    },
  });
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await pgQuery<{ exists: boolean }>(
    `
    select exists (
      select 1
      from information_schema.tables
      where table_schema='public' and table_name=$1
    ) as exists
    `,
    [table]
  );
  return !!rows[0]?.exists;
}

async function rlsEnabled(table: string): Promise<boolean> {
  const rows = await pgQuery<{ relrowsecurity: boolean }>(
    `
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname=$1
    `,
    [table]
  );
  return !!rows[0]?.relrowsecurity;
}

async function listPolicies(table: string): Promise<
  { policyname: string; permissive: string; roles: string[]; cmd: string; qual: string | null; with_check: string | null }[]
> {
  return pgQuery(
    `
    select
      p.policyname,
      case when p.permissive then 'PERMISSIVE' else 'RESTRICTIVE' end as permissive,
      p.roles,
      p.cmd,
      pg_get_expr(p.qual, p.polrelid) as qual,
      pg_get_expr(p.with_check, p.polrelid) as with_check
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname=$1
    order by p.policyname
    `,
    [table]
  );
}

function printResults(title: string, results: CheckResult[]) {
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== ${title} (${passed}/${total} passed) ===`);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}: ${r.name}${r.details ? ` — ${r.details}` : ""}`);
  }
}

async function checkA_databaseObjects(): Promise<CheckResult[]> {
  const requiredTables = [
    "job_assignments",
    "invoices",
    "invoice_items",
    "job_variations",
    "disputes",
    "job_events",
    // recommended:
    "conversation_jobs",
  ];

  const results: CheckResult[] = [];
  for (const t of requiredTables) {
    const exists = await tableExists(t);
    results.push(exists ? ok(`Table exists: ${t}`) : fail(`Table exists: ${t}`, "missing"));
  }

  // Check unique constraint on job_assignments.job_id (minimum)
  const uniques = await pgQuery<{ conname: string }>(
    `
    select conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname='public'
      and rel.relname='job_assignments'
      and con.contype='u'
    `
  );
  const hasUnique = uniques.some((u) => /job_id/i.test(u.conname));
  results.push(
    hasUnique
      ? ok("job_assignments has UNIQUE(job_id)")
      : fail("job_assignments has UNIQUE(job_id)", "expected a unique constraint involving job_id")
  );

  return results;
}

async function checkB_rlsPolicies(): Promise<CheckResult[]> {
  const tables = ["job_assignments", "invoices", "invoice_items", "job_variations", "disputes", "job_events"];
  const results: CheckResult[] = [];

  for (const t of tables) {
    const enabled = await rlsEnabled(t);
    results.push(enabled ? ok(`RLS enabled: ${t}`) : fail(`RLS enabled: ${t}`, "RLS not enabled"));
    if (enabled) {
      const policies = await listPolicies(t);
      results.push(
        policies.length > 0
          ? ok(`Policies exist: ${t}`, `${policies.length} policy(s)`)
          : fail(`Policies exist: ${t}`, "no policies found")
      );
    }
  }

  // Minimal presence checks for status-guard style policies (heuristic)
  // NOTE: This does not prove correctness; it flags likely missing guards.
  const invPolicies = await listPolicies("invoices").catch(() => []);
  const invHasDraftGuard = invPolicies.some((p) => (p.with_check ?? "").includes("draft") || (p.qual ?? "").includes("draft"));
  results.push(
    invHasDraftGuard
      ? ok("Invoices have a draft-related guard in policy (heuristic)")
      : fail("Invoices have a draft-related guard in policy (heuristic)", "no 'draft' mention found in policy qual/with_check")
  );

  const itemPolicies = await listPolicies("invoice_items").catch(() => []);
  const itemsHaveDraftGuard = itemPolicies.some(
    (p) => (p.with_check ?? "").includes("draft") || (p.qual ?? "").includes("draft")
  );
  results.push(
    itemsHaveDraftGuard
      ? ok("Invoice items have draft-related guard in policy (heuristic)")
      : fail("Invoice items have draft-related guard in policy (heuristic)", "no 'draft' mention found in policy qual/with_check")
  );

  return results;
}

async function checkD_accessControl_jobPageTables(): Promise<CheckResult[]> {
  requireEnv("TEST_JOB_ID");
  requireEnv("TEST_CUSTOMER_EMAIL");
  requireEnv("TEST_CUSTOMER_PASSWORD");
  requireEnv("TEST_TRADIE_EMAIL");
  requireEnv("TEST_TRADIE_PASSWORD");
  requireEnv("TEST_THIRD_EMAIL");
  requireEnv("TEST_THIRD_PASSWORD");

  const results: CheckResult[] = [];

  const customer = await signIn(TEST_CUSTOMER_EMAIL!, TEST_CUSTOMER_PASSWORD!);
  const tradie = await signIn(TEST_TRADIE_EMAIL!, TEST_TRADIE_PASSWORD!);
  const third = await signIn(TEST_THIRD_EMAIL!, TEST_THIRD_PASSWORD!);

  // customer/tradie should read assignment; third should fail or return empty due to RLS
  const cAssign = await customer.from("job_assignments").select("*").eq("job_id", TEST_JOB_ID).maybeSingle();
  results.push(
    cAssign.error
      ? fail("Customer can read job_assignments for TEST_JOB_ID", cAssign.error.message)
      : cAssign.data
      ? ok("Customer can read job_assignments for TEST_JOB_ID")
      : fail("Customer can read job_assignments for TEST_JOB_ID", "no row returned")
  );

  const tAssign = await tradie.from("job_assignments").select("*").eq("job_id", TEST_JOB_ID).maybeSingle();
  results.push(
    tAssign.error
      ? fail("Tradie can read job_assignments for TEST_JOB_ID", tAssign.error.message)
      : tAssign.data
      ? ok("Tradie can read job_assignments for TEST_JOB_ID")
      : fail("Tradie can read job_assignments for TEST_JOB_ID", "no row returned")
  );

  const xAssign = await third.from("job_assignments").select("*").eq("job_id", TEST_JOB_ID).maybeSingle();
  // RLS may yield empty with no error; treat "no row" as PASS.
  results.push(
    xAssign.error
      ? ok("Third user blocked from job_assignments (RLS error expected/acceptable)", xAssign.error.message)
      : xAssign.data
      ? fail("Third user blocked from job_assignments", "unexpectedly received row (RLS leak)")
      : ok("Third user blocked from job_assignments", "no row returned")
  );

  return results;
}

async function checkE_invoices_flowSemantics(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  if (!TEST_INVOICE_ID) {
    results.push(fail("Invoice flow checks require TEST_INVOICE_ID", "set TEST_INVOICE_ID env var"));
    return results;
  }

  const customer = await signIn(TEST_CUSTOMER_EMAIL!, TEST_CUSTOMER_PASSWORD!);
  const tradie = await signIn(TEST_TRADIE_EMAIL!, TEST_TRADIE_PASSWORD!);
  const third = await signIn(TEST_THIRD_EMAIL!, TEST_THIRD_PASSWORD!);

  // Read invoice
  const invC = await customer.from("invoices").select("*").eq("id", TEST_INVOICE_ID).maybeSingle();
  results.push(
    invC.error
      ? fail("Customer can read invoice", invC.error.message)
      : invC.data
      ? ok("Customer can read invoice")
      : fail("Customer can read invoice", "no row returned")
  );

  const invT = await tradie.from("invoices").select("*").eq("id", TEST_INVOICE_ID).maybeSingle();
  results.push(
    invT.error
      ? fail("Tradie can read invoice", invT.error.message)
      : invT.data
      ? ok("Tradie can read invoice")
      : fail("Tradie can read invoice", "no row returned")
  );

  const invX = await third.from("invoices").select("*").eq("id", TEST_INVOICE_ID).maybeSingle();
  results.push(
    invX.error
      ? ok("Third user blocked from invoice (RLS error expected/acceptable)", invX.error.message)
      : invX.data
      ? fail("Third user blocked from invoice", "unexpectedly received row (RLS leak)")
      : ok("Third user blocked from invoice", "no row returned")
  );

  // Status semantics: should be one of draft/submitted/approved/disputed/void (not paid)
  const status = invC.data?.status;
  const allowed = new Set(["draft", "submitted", "approved", "disputed", "void"]);
  results.push(
    allowed.has(status)
      ? ok("Invoice status uses escrow semantics (draft/submitted/approved/disputed/void)", `status=${status}`)
      : fail("Invoice status uses escrow semantics", `unexpected status=${status} (avoid 'paid' in escrow model)`)
  );

  return results;
}

async function checkF_variations_flowAccess(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  if (!TEST_VARIATION_ID) {
    results.push(fail("Variation checks require TEST_VARIATION_ID", "set TEST_VARIATION_ID env var"));
    return results;
  }

  const customer = await signIn(TEST_CUSTOMER_EMAIL!, TEST_CUSTOMER_PASSWORD!);
  const tradie = await signIn(TEST_TRADIE_EMAIL!, TEST_TRADIE_PASSWORD!);
  const third = await signIn(TEST_THIRD_EMAIL!, TEST_THIRD_PASSWORD!);

  const vC = await customer.from("job_variations").select("*").eq("id", TEST_VARIATION_ID).maybeSingle();
  results.push(
    vC.error
      ? fail("Customer can read variation", vC.error.message)
      : vC.data
      ? ok("Customer can read variation")
      : fail("Customer can read variation", "no row returned")
  );

  const vT = await tradie.from("job_variations").select("*").eq("id", TEST_VARIATION_ID).maybeSingle();
  results.push(
    vT.error
      ? fail("Tradie can read variation", vT.error.message)
      : vT.data
      ? ok("Tradie can read variation")
      : fail("Tradie can read variation", "no row returned")
  );

  const vX = await third.from("job_variations").select("*").eq("id", TEST_VARIATION_ID).maybeSingle();
  results.push(
    vX.error
      ? ok("Third user blocked from variation (RLS error expected/acceptable)", vX.error.message)
      : vX.data
      ? fail("Third user blocked from variation", "unexpectedly received row (RLS leak)")
      : ok("Third user blocked from variation", "no row returned")
  );

  // Status semantics
  const status = vC.data?.status;
  const allowed = new Set(["pending_customer", "approved", "declined", "cancelled"]);
  results.push(
    allowed.has(status)
      ? ok("Variation status uses expected semantics", `status=${status}`)
      : fail("Variation status uses expected semantics", `unexpected status=${status}`)
  );

  return results;
}

async function checkG_disputes_basic(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const customer = await signIn(TEST_CUSTOMER_EMAIL!, TEST_CUSTOMER_PASSWORD!);

  // Ensure disputes table exists and is RLS enabled (already checked in B if present)
  const exists = await tableExists("disputes");
  results.push(exists ? ok("disputes table exists") : fail("disputes table exists"));

  if (!TEST_JOB_ID) {
    results.push(fail("Dispute checks require TEST_JOB_ID", "set TEST_JOB_ID env var"));
    return results;
  }

  // Try selecting disputes for job (participant should be able to select; may be empty)
  const d = await customer.from("disputes").select("*").eq("job_id", TEST_JOB_ID).limit(5);
  results.push(d.error ? fail("Participant can select disputes for job", d.error.message) : ok("Participant can select disputes for job"));

  return results;
}

async function checkH_messages_jobContextLink(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  if (!TEST_CONVERSATION_ID) {
    results.push(fail("Messages context checks require TEST_CONVERSATION_ID", "set TEST_CONVERSATION_ID env var"));
    return results;
  }

  const customer = await signIn(TEST_CUSTOMER_EMAIL!, TEST_CUSTOMER_PASSWORD!);

  // If conversation_jobs exists, verify a link row can be read by participant
  const cjExists = await tableExists("conversation_jobs");
  if (!cjExists) {
    results.push(fail("conversation_jobs exists (recommended)", "missing table"));
    return results;
  }
  const link = await customer.from("conversation_jobs").select("*").eq("conversation_id", TEST_CONVERSATION_ID).limit(5);
  results.push(
    link.error ? fail("Participant can read conversation_jobs link", link.error.message) : ok("Participant can read conversation_jobs link")
  );

  return results;
}

async function main() {
  // Basic env checks
  ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_DB_URL"].forEach(requireEnv);

  const A = await checkA_databaseObjects();
  const B = await checkB_rlsPolicies();

  const D = TEST_JOB_ID ? await checkD_accessControl_jobPageTables() : [fail("D checks skipped", "set TEST_JOB_ID")];
  const E = await checkE_invoices_flowSemantics();
  const F = await checkF_variations_flowAccess();
  const G = await checkG_disputes_basic();
  const H = await checkH_messages_jobContextLink();

  // Summaries by category (A–H)
  printResults("A) Database objects exist and match spec", A);
  printResults("B) RLS policies enforce participant-only access + status guards", B);
  printResults("D) Participant access control (job tables) behaves correctly", D);
  printResults("E) Completion invoices semantics & access", E);
  printResults("F) Variations semantics & access", F);
  printResults("G) Disputes basic presence & participant select", G);
  printResults("H) Messages sidebar context linkage (conversation_jobs)", H);

  // Overall PASS/FAIL summary like Codex
  const sections: { key: string; results: CheckResult[] }[] = [
    { key: "A", results: A },
    { key: "B", results: B },
    { key: "D", results: D },
    { key: "E", results: E },
    { key: "F", results: F },
    { key: "G", results: G },
    { key: "H", results: H },
  ];

  console.log("\n=== PASS/FAIL SUMMARY (computed) ===");
  for (const s of sections) {
    const okAll = s.results.length > 0 && s.results.every((r) => r.ok);
    console.log(`${s.key}) ${okAll ? "PASS" : "FAIL"}`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Verification script failed:", e);
  process.exit(1);
});
