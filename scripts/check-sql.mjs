#!/usr/bin/env node
/**
 * SQL verification harness for deshiQR.
 *
 * Boots a throwaway real PostgreSQL (PGlite — Postgres compiled to WASM), recreates the
 * parts of the Supabase environment that the schema depends on (auth schema + auth.uid(),
 * anon/authenticated/service_role roles, request.jwt.claims), then applies
 * `supabase/schema.sql` and `supabase/seed.sql` and asserts the security and correctness
 * properties that matter:
 *
 *   - CRC-16/CCITT-FALSE matches the core library anchor vector and every synthetic payload
 *     in docs/demo-payloads.md.
 *   - A payload with a broken checksum can never be stored.
 *   - RLS: anon has no direct table access; owners only see their own rows; the public views
 *     expose published rows and never user_id; reserved slugs are rejected; verified cannot
 *     be self-assigned.
 *   - claim_invoice: pending -> claimed, once only, not after expiry.
 *   - take_rate_limit: allows N calls per window, then denies.
 *
 * Run from the repo root:  node scripts/check-sql.mjs
 * Exit code: 0 = all assertions passed, 1 = at least one failed or setup error.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Synthetic identities used by the harness. Nothing here is real.
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const OWNER_ROLE_CLAIMS = (sub) => JSON.stringify({ sub, role: "authenticated" });
const ANON_CLAIMS = JSON.stringify({ role: "anon" });

// The canonical synthetic static payload from docs/demo-payloads.md.
const DEMO_STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";

const results = [];
let assertions = 0;

function ok(condition, name, detail) {
  assertions += 1;
  const passed = Boolean(condition);
  results.push({ name, passed, detail: passed ? "" : (detail ?? "") });
  if (passed) {
    console.log(`  \u2714 ${name}`);
  } else {
    console.error(`  \u2718 ${name}`);
    if (detail) console.error(`      ${detail}`);
  }
  return passed;
}

function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  return ok(a === e, name, `expected ${e}, got ${a}`);
}

async function query(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

/** Expect a statement to fail, optionally matching the error text. */
async function fails(fn, name, matcher) {
  try {
    await fn();
    return ok(false, name, "expected the statement to fail, but it succeeded");
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!matcher) return ok(true, name);
    const passed = matcher.test(message);
    return ok(passed, name, `error did not match ${matcher}:\n      ${message}`);
  }
}

/** Run subsequent statements as a role with a JWT claims payload (mirrors Supabase). */
async function session(role, claims = "") {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  if (role) await db.exec(`set role ${role};`);
}

async function asPostgres() {
  await session(null);
}

async function asUser(sub) {
  await session("authenticated", OWNER_ROLE_CLAIMS(sub));
}

async function asAnon() {
  await session("anon", ANON_CLAIMS);
}

async function asServiceRole() {
  await session("service_role", JSON.stringify({ role: "service_role" }));
}

/**
 * docs/demo-payloads.md is the source of truth for synthetic fixtures. Extract the payload
 * code blocks from it so the harness actually proves the documented values are valid.
 */
async function loadDemoPayloads() {
  const markdown = await readFile(join(root, "docs/demo-payloads.md"), "utf8");
  const payloads = new Map();
  for (const line of markdown.split("\n")) {
    const value = line.trim();
    // Payload values may contain spaces ("DEMO STORE", "Dhaka"); printable ASCII is enough.
    if (/^000201[ -~]{40,}$/.test(value)) payloads.set(value, value);
  }
  return [...payloads.keys()];
}

async function bootstrap() {
  console.log("\n[setup] booting PGlite (real PostgreSQL, WASM) and stubbing Supabase auth/roles\n");

  // Mirror the pieces of a Supabase project the schema relies on.
  await db.exec(`
    create schema if not exists auth;

    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      aud text,
      role text,
      email_confirmed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    -- Same contract as Supabase's auth.uid(): the uuid from request.jwt.claims->>'sub'.
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(
        coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub',
        ''
      )::uuid;
    $$;

    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    insert into auth.users (id, email, aud, role)
    values
      ('${USER_A}', 'owner-a@deshiqr.invalid', 'authenticated', 'authenticated'),
      ('${USER_B}', 'owner-b@deshiqr.invalid', 'authenticated', 'authenticated');
  `);

  const schemaSql = await readFile(join(root, "supabase/schema.sql"), "utf8");
  await db.exec(schemaSql);
  console.log("[setup] applied supabase/schema.sql");

  const seedSql = await readFile(join(root, "supabase/seed.sql"), "utf8");
  await db.exec(seedSql);
  console.log("[setup] applied supabase/seed.sql");

  // Seed is documented as idempotent — prove it.
  await db.exec(seedSql);
  console.log("[setup] re-applied supabase/seed.sql (idempotency check)\n");
}

let db;

async function main() {
  db = await PGlite.create();
  await bootstrap();

  // ---------------------------------------------------------------------------
  console.log("[crc] CRC-16/CCITT-FALSE");
  // ---------------------------------------------------------------------------
  const anchor = await query("select deshiqr.crc16('123456789') as value");
  eq(anchor[0].value, "29B1", 'crc16("123456789") === "29B1"');

  const demoPayloads = await loadDemoPayloads();
  ok(
    demoPayloads.length >= 4,
    `docs/demo-payloads.md contains at least 4 synthetic payloads (found ${demoPayloads.length})`,
  );
  for (const payload of demoPayloads) {
    const rows = await query("select deshiqr.crc16(left($1, -4)) = upper(right($1, 4)) as valid", [payload]);
    ok(rows[0].valid === true, `documented payload CRC validates (${payload.slice(0, 24)}…)`);
  }

  const corrupted = DEMO_STATIC_PAYLOAD.slice(0, -4) + "0000";
  const corruptedRows = await query("select deshiqr.crc16(left($1, -4)) = upper(right($1, 4)) as valid", [
    corrupted,
  ]);
  ok(corruptedRows[0].valid === false, "corrupted payload fails the CRC check");

  // ---------------------------------------------------------------------------
  console.log("\n[seed] demo data");
  // ---------------------------------------------------------------------------
  const demo = await query(
    "select slug, title, name, city, account_masked, status, verified, presets, ref_prefix, ref_len from public.merchants where slug = 'demo'",
  );
  eq(demo.length, 1, "seed creates exactly one demo merchant");
  if (demo.length === 1) {
    eq(demo[0].title, "DEMO STORE", "demo merchant title is the synthetic DEMO STORE");
    eq(demo[0].city, "Dhaka", "demo merchant city is Dhaka");
    // maskAccount("01000000000") === "01000•••000" — derived from the decoded tag 26/03.
    eq(
      demo[0].account_masked,
      "01000\u2022\u2022\u2022000",
      "demo account is masked from the decoded account",
    );
    eq(demo[0].status, "published", "demo merchant is published");
    ok(demo[0].verified === false, "demo merchant is NOT marked verified");
    eq(demo[0].presets, [100, 500, 1000], "demo merchant presets are seeded");
    eq(demo[0].ref_prefix, "DEMO", "demo merchant reference prefix is seeded");
    eq(demo[0].ref_len, 25, "demo merchant reference length matches real 25-char bKash bill numbers");
  }
  const demoInvoices = await query(
    "select count(*)::int as count from public.invoices i join public.merchants m on m.id = i.merchant_id where m.slug = 'demo' and i.status = 'pending'",
  );
  eq(demoInvoices[0].count, 2, "seed creates two pending demo invoices");

  // ---------------------------------------------------------------------------
  console.log("\n[constraints] payload + slug rules");
  // ---------------------------------------------------------------------------
  await asPostgres();
  await fails(
    () =>
      query(
        `insert into public.merchants (user_id, slug, title, base_payload, name)
         values ($1, 'bad-crc-shop', 'Bad CRC', $2, 'DEMO STORE')`,
        [USER_A, corrupted],
      ),
    "a merchant with a bad-CRC payload is rejected",
    /merchants_base_payload_is_bangla_qr|check constraint/,
  );

  await asUser(USER_A);
  await fails(
    () =>
      query(
        `insert into public.merchants (user_id, slug, title, base_payload, name)
         values ($1, 'admin', 'Squatter', $2, 'DEMO STORE')`,
        [USER_A, DEMO_STATIC_PAYLOAD],
      ),
    "an authenticated owner cannot register a reserved slug",
    /reserved/,
  );
  await fails(
    () =>
      query(
        `insert into public.merchants (user_id, slug, title, base_payload, name)
         values ($1, 'Not-Lower-Case', 'Bad Slug', $2, 'DEMO STORE')`,
        [USER_A, DEMO_STATIC_PAYLOAD],
      ),
    "an authenticated owner cannot register a malformed slug",
    /merchants_slug_format|check constraint/,
  );

  // ---------------------------------------------------------------------------
  console.log("\n[rls] anon has no direct table access");
  // ---------------------------------------------------------------------------
  await asAnon();
  await fails(
    () => query("select * from public.merchants limit 1"),
    "anon cannot SELECT the merchants base table",
    /permission denied/,
  );
  await fails(
    () => query("select * from public.invoices limit 1"),
    "anon cannot SELECT the invoices base table",
    /permission denied/,
  );
  await fails(
    () =>
      query(
        `insert into public.merchants (user_id, slug, title, base_payload, name)
         values ($1, 'anon-shop', 'Anon', $2, 'DEMO STORE')`,
        [USER_A, DEMO_STATIC_PAYLOAD],
      ),
    "anon cannot INSERT into merchants",
    /permission denied/,
  );
  await fails(
    () => query("select public.take_rate_limit('x', 10, 60)"),
    "anon cannot call the rate-limit helper",
    /permission denied/,
  );

  // ---------------------------------------------------------------------------
  console.log("\n[views] public read surfaces");
  // ---------------------------------------------------------------------------
  await asAnon();
  const anonDemo = await query(
    "select slug, title, base_payload from public.public_merchants where slug = 'demo'",
  );
  eq(anonDemo.length, 1, "anon can read the demo merchant from public_merchants");
  if (anonDemo.length === 1) {
    eq(
      anonDemo[0].base_payload,
      DEMO_STATIC_PAYLOAD,
      "public_merchants returns the synthetic payload verbatim",
    );
  }
  // Privilege-level check: anon may read public_merchants, and must NOT have any SELECT
  // privilege on invoices (base table or the capability-token view).
  const anonPrivileges = await query(
    `select
       has_table_privilege('anon', 'public.merchants', 'select')   as merchants,
       has_table_privilege('anon', 'public.invoices', 'select')    as invoices,
       has_table_privilege('anon', 'public.public_invoices', 'select') as invoice_view,
       has_table_privilege('anon', 'public.public_merchants', 'select') as merchant_view`,
  );
  eq(anonPrivileges[0].merchants, false, "anon has no SELECT on the merchants base table");
  eq(anonPrivileges[0].invoices, false, "anon has no SELECT on the invoices base table");
  eq(anonPrivileges[0].invoice_view, false, "anon has no SELECT on the public_invoices view");
  eq(anonPrivileges[0].merchant_view, true, "anon has SELECT on the public_merchants view");

  // Column-shape checks are schema introspection, so run them as the owner (information_schema
  // only lists relations the current role has privileges on).
  await asPostgres();
  const merchantColumns = await query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'public_merchants'`,
  );
  const merchantColumnNames = merchantColumns.map((row) => row.column_name);
  ok(!merchantColumnNames.includes("user_id"), "public_merchants does not expose user_id");
  ok(!merchantColumnNames.includes("id"), "public_merchants does not expose internal ids");

  const invoiceColumns = await query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'public_invoices'`,
  );
  const invoiceColumnNames = invoiceColumns.map((row) => row.column_name);
  ok(invoiceColumnNames.includes("token"), "public_invoices exposes the capability token");
  ok(!invoiceColumnNames.includes("txid"), "public_invoices does not expose txid");
  ok(!invoiceColumnNames.includes("merchant_id"), "public_invoices does not expose merchant ids");

  // Capability-token rows must never be listable by anon: the invoice view is service-role
  // only, and the only public invoice read path is the token-addressed RPC.
  await asAnon();
  await fails(
    () => query("select * from public.public_invoices limit 1"),
    "anon cannot list invoices through the public_invoices view",
    /permission denied/,
  );

  // The view is security_invoker=false, so an authenticated grant would bypass RLS too.
  await asUser(USER_A);
  await fails(
    () => query("select * from public.public_invoices limit 1"),
    "authenticated cannot select the public_invoices view (it would bypass RLS)",
    /permission denied/,
  );

  // The token-addressed RPC is the only public read path for invoices.
  await asAnon();
  const oneInvoice = await query("select * from public.get_public_invoice($1)", [
    "deadbeef00000000000000000000000000000000000000000000000000000001",
  ]);
  eq(oneInvoice.length, 1, "get_public_invoice returns exactly the addressed invoice");
  ok(
    oneInvoice[0]?.token === "deadbeef00000000000000000000000000000000000000000000000000000001",
    "get_public_invoice returns the requested token",
  );

  const randomToken = "0".repeat(64);
  const noInvoice = await query("select * from public.get_public_invoice($1)", [randomToken]);
  eq(noInvoice.length, 0, "get_public_invoice returns zero rows for an unknown token");

  // ---------------------------------------------------------------------------
  console.log("\n[rls] owner-scoped rows");
  // ---------------------------------------------------------------------------
  // Owner A creates a published shop the way the web app does: without user_id, relying on
  // the `default auth.uid()` (the insert policy still enforces ownership).
  await asUser(USER_A);
  await query(
    `insert into public.merchants (slug, title, base_payload, name, account_masked)
     values ('owner-a-shop', 'Owner A Shop', $1, 'DEMO STORE', '01000•••000')`,
    [DEMO_STATIC_PAYLOAD],
  );
  const aOwn = await query("select slug, user_id from public.merchants");
  eq(
    aOwn.map((row) => row.slug),
    ["owner-a-shop"],
    "owner A sees only their own merchant via RLS",
  );
  eq(aOwn[0]?.user_id, USER_A, "owner A's insert defaults user_id to auth.uid()");
  // A different authenticated user still cannot spoof another owner through user_id.
  await fails(
    () =>
      query(
        `insert into public.merchants (user_id, slug, title, base_payload, name)
         values ($1, 'spoofed-shop', 'Spoofed', $2, 'DEMO STORE')`,
        [USER_B, DEMO_STATIC_PAYLOAD],
      ),
    "an authenticated owner cannot insert a merchant owned by someone else",
    /row-level security|violates/,
  );

  await fails(
    () => query("update public.merchants set verified = true where slug = 'owner-a-shop'"),
    "an owner cannot self-assign the verified badge",
    /permission denied/,
  );
  await fails(
    () => query("update public.merchants set user_id = $1 where slug = 'owner-a-shop'", [USER_B]),
    "an owner cannot transfer a merchant to another user",
    /permission denied/,
  );

  // Owner B creates their own shop and cannot see A's.
  await asUser(USER_B);
  await query(
    `insert into public.merchants (user_id, slug, title, base_payload, name)
     values ($1, 'owner-b-shop', 'Owner B Shop', $2, 'DEMO STORE')`,
    [USER_B, DEMO_STATIC_PAYLOAD],
  );
  const bOwn = await query("select slug from public.merchants");
  eq(
    bOwn.map((row) => row.slug),
    ["owner-b-shop"],
    "owner B sees only their own merchant via RLS",
  );

  const bUpdateA = await query(
    "update public.merchants set title = 'Hijacked' where slug = 'owner-a-shop' returning slug",
  );
  eq(bUpdateA.length, 0, "owner B cannot update owner A's merchant");

  await asUser(USER_A);
  const aUpdate = await query(
    "update public.merchants set title = 'Owner A Shop v2' where slug = 'owner-a-shop' returning slug",
  );
  eq(aUpdate.length, 1, "owner A can update their own merchant");
  const updatedTitle = await query("select title from public.merchants where slug = 'owner-a-shop'");
  eq(updatedTitle[0].title, "Owner A Shop v2", "owner A's update is applied");

  // Invoices: A sees none (seeded invoices belong to the demo user), B sees none.
  const aInvoices = await query("select count(*)::int as count from public.invoices");
  eq(aInvoices[0].count, 0, "owner A cannot read invoices belonging to another merchant");

  // Dashboard path: an owner reads their own invoices directly from the base table (RLS).
  await asPostgres();
  await query(
    `insert into public.invoices (merchant_id, token, amount, reference, status, expires_at)
     select id, $1, 250.00, 'OWNERA0001', 'pending', now() + interval '1 hour'
     from public.merchants where slug = 'owner-a-shop'`,
    ["feedface00000000000000000000000000000000000000000000000000000001"],
  );
  await asUser(USER_A);
  const ownInvoices = await query("select count(*)::int as count from public.invoices");
  eq(ownInvoices[0].count, 1, "owner A can read their own invoices under RLS");

  // Dashboard "mark paid": owner updates the confirmation columns only; the timestamp
  // trigger stamps paid_at. RLS + column grants must allow exactly this.
  const markedPaid = await query(
    "update public.invoices set status = 'paid' where token = $1 returning status, paid_at",
    ["feedface00000000000000000000000000000000000000000000000000000001"],
  );
  eq(markedPaid.length, 1, "owner A can mark their own invoice paid");
  eq(markedPaid[0]?.status, "paid", "the paid status is applied");
  ok(markedPaid[0]?.paid_at !== null, "paid_at is stamped by the trigger");
  await fails(
    () =>
      query("update public.invoices set amount = 1 where token = $1", [
        "feedface00000000000000000000000000000000000000000000000000000001",
      ]),
    "owner A cannot edit the amount of an invoice",
    /permission denied/,
  );
  await fails(
    () =>
      query("update public.invoices set txid = 'FORGED0001' where token = $1", [
        "feedface00000000000000000000000000000000000000000000000000000001",
      ]),
    "owner A cannot rewrite the customer txid",
    /permission denied/,
  );

  await asUser(USER_B);
  const otherInvoices = await query("select count(*)::int as count from public.invoices");
  eq(otherInvoices[0].count, 0, "owner B cannot read owner A's invoices");
  const bMarkPaid = await query(
    "update public.invoices set status = 'canceled' where token = $1 returning token",
    ["feedface00000000000000000000000000000000000000000000000000000001"],
  );
  eq(bMarkPaid.length, 0, "owner B cannot update owner A's invoice");

  // ---------------------------------------------------------------------------
  console.log("\n[views] published-only filtering and no user data");
  // ---------------------------------------------------------------------------
  await asPostgres();
  await query(
    `insert into public.merchants (user_id, slug, title, base_payload, name, status)
     values ($1, 'draft-shop', 'Draft Shop', $2, 'DEMO STORE', 'draft'),
            ($1, 'suspended-shop', 'Suspended Shop', $2, 'DEMO STORE', 'suspended')`,
    [USER_A, DEMO_STATIC_PAYLOAD],
  );

  await asAnon();
  const anonSlugs = await query("select slug from public.public_merchants order by slug");
  const slugs = anonSlugs.map((row) => row.slug);
  ok(slugs.includes("demo"), "anon sees the published demo merchant");
  ok(slugs.includes("owner-a-shop"), "anon sees owner A's published merchant");
  ok(slugs.includes("owner-b-shop"), "anon sees owner B's published merchant");
  ok(!slugs.includes("draft-shop"), "public_merchants hides draft merchants");
  ok(!slugs.includes("suspended-shop"), "public_merchants hides suspended merchants");

  const suspendedVisible = await query(
    "select slug from public.public_merchants where slug in ('draft-shop','suspended-shop')",
  );
  eq(suspendedVisible.length, 0, "no draft/suspended row leaks through the public view");

  // ---------------------------------------------------------------------------
  console.log("\n[claim_invoice] one-way pending -> claimed");
  // ---------------------------------------------------------------------------
  await asAnon();
  const firstClaim = await query("select public.claim_invoice($1, $2) as status", [
    "deadbeef00000000000000000000000000000000000000000000000000000001",
    "TXDEMO0001",
  ]);
  eq(firstClaim[0].status, "claimed", "a pending invoice can be claimed by anon");

  const claimedRow = await query("select status from public.get_public_invoice($1)", [
    "deadbeef00000000000000000000000000000000000000000000000000000001",
  ]);
  eq(claimedRow[0]?.status, "claimed", "claimed status is visible through the token-addressed RPC");

  await fails(
    () =>
      query("select public.claim_invoice($1, $2)", [
        "deadbeef00000000000000000000000000000000000000000000000000000001",
        "TXDEMO0002",
      ]),
    "a second claim is rejected",
    /ALREADY_CLAIMED/,
  );

  await fails(
    () => query("select public.claim_invoice($1, $2)", ["not-a-token", "TXDEMO0003"]),
    "an unknown/malformed token is rejected",
    /INVOICE_NOT_FOUND/,
  );

  await fails(
    () =>
      query("select public.claim_invoice($1, $2)", [
        "deadbeef00000000000000000000000000000000000000000000000000000002",
        "bad txid!",
      ]),
    "a malformed txid is rejected",
    /BAD_TXID/,
  );

  // Expired invoice: insert it in the past, then claim as anon.
  await asPostgres();
  await query(
    `insert into public.invoices (merchant_id, token, amount, reference, status, expires_at)
     select id, $1, 10.00, 'EXPIRED001', 'pending', now() - interval '5 minutes'
     from public.merchants where slug = 'demo'`,
    ["deadbeef00000000000000000000000000000000000000000000000000000003"],
  );
  await asAnon();
  const expiredClaim = await query("select public.claim_invoice($1, $2) as status", [
    "deadbeef00000000000000000000000000000000000000000000000000000003",
    "TXDEMO0004",
  ]);
  eq(expiredClaim[0].status, "expired", "an expired invoice is rejected with status 'expired'");
  const expiredPublic = await query("select status from public.get_public_invoice($1)", [
    "deadbeef00000000000000000000000000000000000000000000000000000003",
  ]);
  eq(expiredPublic[0]?.status, "expired", "expired invoice row is committed as expired, not claimed");

  // ---------------------------------------------------------------------------
  console.log("\n[rate limit] fixed-window counter");
  // ---------------------------------------------------------------------------
  await asPostgres();
  const limitKey = "check-sql:" + Date.now();
  const allowed = [];
  for (let i = 0; i < 4; i += 1) {
    const rows = await query("select deshiqr.take_rate_limit($1, 3, 60) as allowed", [limitKey]);
    allowed.push(rows[0].allowed);
  }
  eq(allowed, [true, true, true, false], "rate limiter allows 3 then denies the 4th call in a window");

  const otherKey = await query("select deshiqr.take_rate_limit($1, 3, 60) as allowed", [limitKey + ":other"]);
  eq(otherKey[0].allowed, true, "a different key has its own window");

  await asServiceRole();
  const viaWrapper = await query("select public.take_rate_limit($1, 5, 60) as allowed", [
    "check-sql:svc:" + Date.now(),
  ]);
  eq(viaWrapper[0].allowed, true, "service role can call the PostgREST rate-limit wrapper");

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const failed = results.filter((result) => !result.passed);
  console.log("\n" + "=".repeat(72));
  if (failed.length === 0) {
    console.log(`PASS — ${assertions}/${assertions} SQL assertions passed`);
    console.log("=".repeat(72));
    return 0;
  }
  console.log(`FAIL — ${failed.length}/${assertions} SQL assertion(s) failed:`);
  for (const failure of failed) console.log(`  \u2718 ${failure.name}\n      ${failure.detail}`);
  console.log("=".repeat(72));
  return 1;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error("\n[setup] SQL check crashed:");
  console.error(error);
  exitCode = 1;
} finally {
  if (db) await db.close();
}
process.exit(exitCode);
