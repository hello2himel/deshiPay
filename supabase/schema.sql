-- ============================================================================
-- deshiQR — Supabase schema (single, idempotent migration)
-- ============================================================================
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- Re-running this file is safe: every object is created with `if not exists` /
-- `create or replace` / `drop ... if exists` first.
--
-- What lives here
--   * `deshiqr` schema       internal helpers (CRC, updated_at trigger, rate limiting)
--   * `merchants`            owner-managed pay pages, one row per published shop
--   * `invoices`             token-addressed payment requests created by the edge function
--   * `public_merchants`     anon-readable view: public columns only, published rows only
--   * `public_invoices`      service-role-only view: invoice columns without txid/owner data
--                            (NOT anon-readable: capability tokens must not be listable)
--   * RLS                     owners read/write their own merchants (and their invoices);
--                            `anon` has NO direct table access at all
--   * `claim_invoice(...)`   security-definer RPC: pending -> claimed, never backwards
--   * `take_rate_limit(...)` security-definer helper used by the invoice edge function
--
-- Security model in one line: reads of published data go through the `public_*` views;
-- writes go through owner-only RLS or security-definer RPCs; the base tables are never
-- exposed to the anon role.
--
-- Data policy: this repo never stores real merchant data. Seeds/examples use the synthetic
-- payloads from docs/demo-payloads.md (fake account 01000000000, "DEMO STORE").
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Extensions and helper schema
-- ----------------------------------------------------------------------------

-- pgcrypto is included in every Supabase project. It is not needed by the rest of this
-- file (all defaults use core Postgres `gen_random_uuid()`), so local Postgres builds that
-- do not ship contrib modules (e.g. PGlite, used by scripts/check-sql.mjs) can still apply
-- this migration. Keep it for Supabase deployments and for anything you add later.
do $$
begin
  create extension if not exists pgcrypto;
exception
  when others then
    raise notice 'pgcrypto is not available (%), continuing with core Postgres functions', sqlerrm;
end;
$$;

-- Internal helpers. PostgREST only exposes `public` and `graphql_public`, so nothing in
-- this schema is reachable over the REST API unless we explicitly grant it (we do not).
create schema if not exists deshiqr;

comment on schema deshiqr is
  'Internal deshiQR helpers (CRC-16, rate limiting, triggers). Not exposed by the REST API.';


-- ----------------------------------------------------------------------------
-- 1. CRC-16/CCITT-FALSE
-- ----------------------------------------------------------------------------
-- Same parameters as the `deshiqr` core library and every EMVCo-style QR:
--   poly 0x1021, init 0xFFFF, no reflection, no final XOR, uppercase 4-char hex.
-- Used by the `merchants.base_payload` CHECK constraint, which is what guarantees that a
-- payload can never be stored with a broken checksum (the edge function re-validates too).
--
-- Input is converted to UTF-8 bytes first, so multi-byte characters hash exactly like the
-- TypeScript implementation (`new TextEncoder().encode(input)`).

create or replace function deshiqr.crc16(p_input text)
returns text
language plpgsql
immutable
strict
parallel safe
as $$
declare
  v_bytes bytea;
  v_crc   integer := 65535; -- 0xFFFF
  v_byte  integer;
  v_i     integer;
  v_bit   integer;
begin
  v_bytes := convert_to(p_input, 'UTF8');
  for v_i in 0 .. length(v_bytes) - 1 loop
    v_byte := get_byte(v_bytes, v_i);
    v_crc := (v_crc # (v_byte << 8)) & 65535;
    for v_bit in 1 .. 8 loop
      if (v_crc & 32768) <> 0 then            -- if top bit set ...
        v_crc := ((v_crc << 1) & 65535) # 4129; -- ... shift and xor with 0x1021
      else
        v_crc := (v_crc << 1) & 65535;
      end if;
    end loop;
  end loop;
  return upper(lpad(to_hex(v_crc), 4, '0'));
end;
$$;

comment on function deshiqr.crc16(text) is
  'CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection) as 4 uppercase hex chars. Anchor: crc16(''123456789'') = ''29B1''.';


-- ----------------------------------------------------------------------------
-- 2. `merchants` — one row per hosted pay page
-- ----------------------------------------------------------------------------
-- `base_payload` is the static Bangla QR payload issued by the provider. It is copied
-- verbatim from the merchant's own QR; deshiQR only derives amounts/references from it and
-- never changes account/name/tokens. It is public by design — it is printed on shop walls.

create table if not exists public.merchants (
  id            uuid primary key default gen_random_uuid(),
  -- Owner. `auth.uid()` is the JWT `sub`; defaulting to it lets clients insert without
  -- spelling user_id out (the insert RLS policy still checks user_id = auth.uid()).
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug          text not null,
  title         text not null,
  note          text not null default '',
  base_payload  text not null,
  name          text not null,
  city          text,
  account_masked text,
  institution   text not null default 'bd.org.bb.npsb',
  ref_prefix    text not null default '',
  ref_len       integer not null default 0,
  presets       integer[] not null default '{}',
  verified      boolean not null default false,
  status        text not null default 'published',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Slug rules: lowercase, 3-30 chars, alphanumerics and single hyphens, no leading or
  -- trailing hyphen. Reserved slugs are rejected by the guard_reserved_slug trigger below
  -- (not a CHECK) so that the trusted seed/migration path can create the `demo` shop while
  -- ordinary owners cannot squat route names (`/new`, `/dashboard`, `/login`, ...).
  constraint merchants_slug_format
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),

  constraint merchants_title_length   check (char_length(title) between 1 and 60),
  constraint merchants_note_length    check (char_length(note) <= 160),
  constraint merchants_name_length    check (char_length(name) between 1 and 25),
  constraint merchants_city_length    check (city is null or char_length(city) between 1 and 15),
  constraint merchants_account_length check (account_masked is null or char_length(account_masked) between 4 and 40),
  constraint merchants_institution_length check (char_length(institution) between 1 and 32),
  constraint merchants_ref_prefix_length check (char_length(ref_prefix) <= 16),
  constraint merchants_ref_len_range  check (ref_len between 0 and 32),
  constraint merchants_presets_length check (coalesce(array_length(presets, 1), 0) <= 6),
  constraint merchants_presets_positive check (0 < all (presets)),
  constraint merchants_presets_not_null check (array_position(presets, null) is null),
  constraint merchants_status_valid   check (status in ('draft', 'published', 'suspended')),

  -- A stored payload must be a *valid* Bangla QR. This is defence in depth on top of the
  -- edge function / apps/web validation: no row can ever carry a payload whose last four
  -- characters do not match the CRC of everything before them.
  constraint merchants_base_payload_is_bangla_qr
    check (
      char_length(base_payload) between 8 and 1024
      and starts_with(base_payload, '000201')
      and deshiqr.crc16(left(base_payload, -4)) = upper(right(base_payload, 4))
    )
);

comment on table public.merchants is
  'Owner-managed pay pages. Base table is RLS-protected; read published rows through public_merchants.';
comment on column public.merchants.base_payload is
  'Static Bangla QR payload (public data: it is the QR printed on the shop wall). Never rewrite account/name/tokens.';
comment on column public.merchants.user_id is
  'Owner. Never exposed by any public view or API response.';
comment on column public.merchants.verified is
  'Human-verified badge. Admin/service-role only; owners cannot set it (column grants + guard trigger).';

-- One merchant per slug. A unique *index* (not a unique constraint) keeps `on conflict
-- (slug)` working in seed.sql and lets PostgREST/upsert target it.
create unique index if not exists merchants_slug_key on public.merchants (slug);
create index if not exists merchants_user_id_idx on public.merchants (user_id);


-- ----------------------------------------------------------------------------
-- 3. `invoices` — token-addressed payment requests
-- ----------------------------------------------------------------------------
-- Created by the `invoice` edge function with the service role. The `token` is the only
-- public identifier: 64 lowercase hex characters from two v4 UUIDs (2 x 122 random bits),
-- which is not enumerable in practice. Amount/reference drive the dynamic QR payload;
-- nothing is mutated on the merchant's base payload.
--
-- Status lifecycle:  pending -> claimed -> paid
--                    pending -> expired | canceled            (terminal)
-- `claimed` means the customer pressed "I paid" and supplied a txid. It is a *claim*, not
-- proof of payment: the payment is confirmed manually by the merchant (dashboard) or, in
-- future, by provider APIs. See docs/security.md.

create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  token       text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  amount      numeric(10, 2) not null,
  reference   text not null,
  note        text not null default '',
  status      text not null default 'pending',
  txid        text,
  claimed_at  timestamptz,
  paid_at     timestamptz,
  expires_at  timestamptz not null default (now() + interval '30 minutes'),
  created_at  timestamptz not null default now(),

  constraint invoices_amount_range   check (amount > 0 and amount < 100000000),
  -- Bill numbers / references: 1-32 printable ASCII, matching deshiqr's assertReference().
  -- Real bKash dynamic QRs use 25 characters today; 32 is the safe upper bound EMVCo allows.
  constraint invoices_reference_format check (
    char_length(reference) between 1 and 32
    and reference ~ '^[ -~]+$'
  ),
  constraint invoices_note_length    check (char_length(note) <= 160),
  constraint invoices_token_format   check (token ~ '^[0-9a-f]{64}$'),
  constraint invoices_status_valid   check (status in ('pending', 'claimed', 'paid', 'expired', 'canceled')),
  constraint invoices_txid_format    check (txid is null or txid ~ '^[A-Za-z0-9._-]{4,64}$')
);

comment on table public.invoices is
  'Token-addressed payment requests. Writes through the service role (edge function) and claim_invoice(); public reads through get_public_invoice(token) or the edge function (the public_invoices view is service-role-only).';
comment on column public.invoices.token is
  'Unguessable capability token (64 lowercase hex chars). This is the public address of the invoice.';
comment on column public.invoices.txid is
  'Transaction id supplied by the payer with an "I paid" claim. Never exposed publicly.';
comment on column public.invoices.status is
  'pending | claimed | paid | expired | canceled. claimed != paid: confirmation is manual/off-chain.';

create unique index if not exists invoices_token_key on public.invoices (token);
create index if not exists invoices_merchant_status_idx on public.invoices (merchant_id, status);
create index if not exists invoices_expires_at_idx on public.invoices (expires_at);


-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------

-- Reserved slugs are names that collide with app routes (`/new`, `/dashboard`, `/login`, the
-- `/p/:slug` and `/i/:token` prefixes) or with provider/project identity (`bkash`, `nagad`,
-- `rocket`, `demo`, ...). A CHECK constraint would also block the trusted seed and admin
-- tooling, so this is a BEFORE trigger: postgres / service_role may create them (seed.sql
-- publishes the `demo` shop), ordinary authenticated owners may not. This doubles as
-- anti-squatting: an attacker cannot register `login` or `deshiqr` as a shop.
create or replace function deshiqr.guard_reserved_slug()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_jwt_role text;
begin
  v_jwt_role := coalesce(
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) ->> 'role',
    ''
  );
  if current_user in ('postgres', 'service_role')
     or v_jwt_role in ('postgres', 'service_role') then
    return new;
  end if;

  if new.slug in (
    'admin', 'api', 'auth', 'dashboard', 'login', 'new', 'p', 'i', 'm',
    'support', 'help', 'about', 'terms', 'privacy', 'docs', 'status',
    'billing', 'demo', 'bkash', 'nagad', 'rocket'
  ) then
    raise exception 'slug "%" is reserved', new.slug using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists merchants_guard_reserved_slug on public.merchants;
create trigger merchants_guard_reserved_slug
  before insert or update of slug on public.merchants
  for each row
  execute function deshiqr.guard_reserved_slug();

-- Keep updated_at honest on every owner edit.
create or replace function deshiqr.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists merchants_touch_updated_at on public.merchants;
create trigger merchants_touch_updated_at
  before update on public.merchants
  for each row
  execute function deshiqr.touch_updated_at();

-- Verification badges and "un-suspending" are admin actions. Owners can edit their own
-- merchant through RLS but must not be able to flip `verified` or lift a suspension. The
-- column-level grants below already stop `verified` from being written by `authenticated`;
-- this trigger is defence in depth for any grant mistake and for admin tooling.
create or replace function deshiqr.guard_merchant_admin_fields()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_claims jsonb;
  v_jwt_role text;
begin
  -- Trusted paths: a direct SQL connection as postgres (migrations / SQL editor) or the
  -- service role used by the edge function.
  v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_jwt_role := coalesce(v_claims ->> 'role', '');
  if current_user in ('postgres', 'service_role')
     or v_jwt_role in ('postgres', 'service_role') then
    return new;
  end if;

  if new.verified is distinct from old.verified then
    raise exception 'verified is an admin-only field' using errcode = '42501';
  end if;
  if old.status = 'suspended' and new.status is distinct from old.status then
    raise exception 'merchant is suspended; contact support' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists merchants_guard_admin_fields on public.merchants;
create trigger merchants_guard_admin_fields
  before update on public.merchants
  for each row
  execute function deshiqr.guard_merchant_admin_fields();

-- Stamp timestamps when a status change arrives from any path (dashboard "mark paid",
-- expiry sweep, admin tools), so nothing has to remember to set them.
create or replace function deshiqr.sync_invoice_timestamps()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'claimed' and new.claimed_at is null then
    new.claimed_at := now();
  end if;
  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_sync_timestamps on public.invoices;
create trigger invoices_sync_timestamps
  before update on public.invoices
  for each row
  execute function deshiqr.sync_invoice_timestamps();


-- ----------------------------------------------------------------------------
-- 5. Public read surfaces
-- ----------------------------------------------------------------------------
-- These are *views*, so they cannot be INSERT/UPDATE targets and they select columns
-- explicitly: adding a private column later never leaks through them.
--
-- Both views are owned by the migration role (postgres), so they run with that role's
-- privileges (`security_invoker = false`, the default) and are NOT filtered by the RLS
-- policies on the base tables. That is intentional: the WHERE clause below is the access
-- control, and it is deliberately narrow. `anon` gets SELECT on the views only — never on
-- the tables.

-- Public pay-page data. Only published merchants; never user_id, id, status, or timestamps
-- that matter only to the owner. The payload is public by design: it is the QR printed on
-- the shop wall, and any app that scans it shows the same account/name/city.
create or replace view public.public_merchants
with (security_invoker = false)
as
select
  m.slug,
  m.title,
  m.note,
  m.base_payload,
  m.name,
  m.city,
  m.account_masked,
  m.institution,
  m.ref_prefix,
  m.ref_len,
  m.presets,
  m.verified
from public.merchants m
where m.status = 'published';

comment on view public.public_merchants is
  'Anon-readable pay-page data for published merchants only. Exposes public columns only; never user_id. Payload is public by design (printed on shop walls).';

-- Invoice columns that are safe to show the payer. This view exists for service-role/admin
-- tooling only and is deliberately NOT granted to anon or authenticated: invoice tokens are
-- 256-bit capability URLs, so a listable view would hand anonymous callers every hosted
-- invoice link plus amounts/notes/timestamps. Token-addressed access is the ONLY public read
-- path: `public.get_public_invoice(token)` (single row) or the `invoice` edge function.
create or replace view public.public_invoices
with (security_invoker = false)
as
select
  i.token,
  i.amount,
  i.reference,
  i.note,
  i.status,
  i.expires_at,
  i.created_at,
  i.claimed_at,
  i.paid_at
from public.invoices i;

comment on view public.public_invoices is
  'Service-role-only invoice column surface (never txid/merchant uuid/user_id). NOT granted to anon/authenticated: listing capability-token rows is a privacy leak. Public reads use get_public_invoice(token) or the invoice edge function.';


-- ----------------------------------------------------------------------------
-- 6. Row Level Security (base tables)
-- ----------------------------------------------------------------------------
-- The golden rule: no direct anon access to base tables. `authenticated` gets owner-scoped
-- access through the policies below. The service role (edge function) bypasses RLS.

alter table public.merchants enable row level security;
alter table public.invoices enable row level security;

-- Merchants: owners manage their own rows. `auth.uid()` is Supabase's helper that reads the
-- JWT `sub` claim; it returns null for anon, so anon can never match a row.
drop policy if exists merchants_owner_select on public.merchants;
create policy merchants_owner_select
  on public.merchants for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists merchants_owner_insert on public.merchants;
create policy merchants_owner_insert
  on public.merchants for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists merchants_owner_update on public.merchants;
create policy merchants_owner_update
  on public.merchants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists merchants_owner_delete on public.merchants;
create policy merchants_owner_delete
  on public.merchants for delete
  to authenticated
  using (user_id = auth.uid());

-- Invoices: readable by the merchant that owns the parent merchant row (dashboard), and
-- updatable only in the confirmation columns (status/txid/claimed_at/paid_at — enforced by
-- column grants below). Creation is service-role only; claiming is the claim_invoice RPC.
drop policy if exists invoices_owner_select on public.invoices;
create policy invoices_owner_select
  on public.invoices for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchants m
      where m.id = invoices.merchant_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists invoices_owner_update on public.invoices;
create policy invoices_owner_update
  on public.invoices for update
  to authenticated
  using (
    exists (
      select 1
      from public.merchants m
      where m.id = invoices.merchant_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.merchants m
      where m.id = invoices.merchant_id
        and m.user_id = auth.uid()
    )
  );


-- ----------------------------------------------------------------------------
-- 7. Privileges
-- ----------------------------------------------------------------------------
-- Everything is explicit because local Postgres (and PGlite) does not have Supabase's
-- default privileges. On Supabase, `anon`/`authenticated` may receive blanket default
-- privileges for new `public` objects, so we also REVOKE from anon to be sure.

grant usage on schema public to anon, authenticated;

-- Base tables: no direct access for anon. Authenticated gets owner-scoped access gated by
-- RLS. Column lists on INSERT/UPDATE keep server-managed fields (verified, timestamps,
-- user_id changes) out of reach even if a policy were misconfigured later.
revoke all on table public.merchants from anon;
revoke all on table public.invoices from anon;
revoke all on table public.merchants from public;
revoke all on table public.invoices from public;

grant select on table public.merchants to authenticated;
grant insert (user_id, slug, title, note, base_payload, name, city, account_masked,
              institution, ref_prefix, ref_len, presets, status)
  on table public.merchants to authenticated;
grant update (slug, title, note, base_payload, name, city, account_masked, institution,
              ref_prefix, ref_len, presets, status)
  on table public.merchants to authenticated;
grant delete on table public.merchants to authenticated;

grant select on table public.invoices to authenticated;
-- Owners may only move the status (mark paid / cancel). Timestamps are set by the
-- sync_invoice_timestamps trigger; amount/reference/txid/merchant_id are not writable.
grant update (status) on table public.invoices to authenticated;

-- Public read surfaces. Merchants are public pages (payload is printed on shop walls).
grant select on public.public_merchants to anon, authenticated;
-- Invoices are addressed by capability token only: NO anon/authenticated grant on
-- public_invoices, and no SELECT on the base table. Public invoice reads go through
-- get_public_invoice(token) or the invoice edge function.
revoke all on table public.public_invoices from anon;
revoke all on table public.public_invoices from authenticated;

-- The CRC helper is called by the merchants CHECK constraint, so the inserting role needs
-- EXECUTE on it (and USAGE on its schema) — otherwise owner inserts would fail.
grant usage on schema deshiqr to authenticated;
grant execute on function deshiqr.crc16(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 8. Rate limiting helper
-- ----------------------------------------------------------------------------
-- Fixed-window counter in a table so it is shared by all edge-function isolates and
-- survives cold starts. The edge function derives the key (merchant + client IP) and calls
-- `public.take_rate_limit(...)` over PostgREST with the service role.
--
-- Semantics: increments the counter for the current window and returns true while the count
-- is <= p_limit. A window that has expired resets to 1. Concurrent calls are serialised by
-- the ON CONFLICT row lock, so the limit cannot be raced.

create table if not exists deshiqr.rate_limits (
  key          text primary key,
  count        integer not null default 1,
  window_start timestamptz not null default now(),
  expires_at   timestamptz not null
);

comment on table deshiqr.rate_limits is
  'Fixed-window rate-limit counters. Internal only (no grants); read/write via take_rate_limit().';

create index if not exists rate_limits_expires_at_idx on deshiqr.rate_limits (expires_at);

create or replace function deshiqr.take_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
begin
  if p_key is null or p_key = ''
     or char_length(p_key) > 512
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    -- Fail closed: a malformed rate-limit request must not become an unlimited one.
    return false;
  end if;

  insert into deshiqr.rate_limits as rl (key, count, window_start, expires_at)
  values (p_key, 1, now(), now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count        = case when rl.expires_at <= now() then 1 else rl.count + 1 end,
        window_start = case when rl.expires_at <= now() then now() else rl.window_start end,
        expires_at   = case when rl.expires_at <= now()
                            then now() + make_interval(secs => p_window_seconds)
                            else rl.expires_at end
  returning rl.count into v_count;

  return v_count <= p_limit;
exception
  when others then
    -- A broken rate limiter must deny, not open the floodgates.
    return false;
end;
$$;

comment on function deshiqr.take_rate_limit(text, integer, integer) is
  'Fixed-window rate limiter. Returns true while count <= limit for the window; fails closed.';

-- PostgREST only exposes the `public` schema in a default Supabase project, so the edge
-- function needs a public wrapper to reach the helper. Execute is granted to service_role
-- only (see below): anon/authenticated must never be able to mint arbitrary counters.
create or replace function public.take_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select deshiqr.take_rate_limit($1, $2, $3);
$$;

comment on function public.take_rate_limit(text, integer, integer) is
  'PostgREST-callable wrapper around deshiqr.take_rate_limit (service role only).';


-- ----------------------------------------------------------------------------
-- 9. claim_invoice(token, txid) — the only public write path for invoices
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so the anon role can claim without table privileges. Pinned search_path
-- so a compromised search path cannot redirect the UPDATE. The transition is one-way:
-- pending -> claimed, only before expiry. A claimed/paid invoice can never be re-claimed,
-- which makes the "customer pressed I paid" signal idempotent and auditable.
--
-- Returns the resulting status: 'claimed' or 'expired'. Raises with a stable message for the
-- cases the edge function maps to its JSON error codes:
--   INVOICE_NOT_FOUND  (P0002)  unknown/malformed token
--   BAD_TXID           (22023)  txid fails ^[A-Za-z0-9._-]{4,64}$
--   ALREADY_CLAIMED    (P0003)  invoice is already claimed
--   ALREADY_PAID       (P0004)  invoice is already paid
--   CANCELED           (P0006)  invoice was canceled
--
-- Expiry is a non-error outcome: the row is moved to 'expired' (committed) and the function
-- returns 'expired'. Raising here instead would roll the status update back.

create or replace function public.claim_invoice(p_token text, p_txid text)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_txid is null or p_txid !~ '^[A-Za-z0-9._-]{4,64}$' then
    raise exception 'BAD_TXID' using errcode = '22023';
  end if;

  -- Lock the row: two concurrent claims must not both succeed.
  select * into v_invoice
  from public.invoices
  where token = p_token
  for update;

  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invoice.status = 'claimed' then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0003';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'ALREADY_PAID' using errcode = 'P0004';
  end if;
  if v_invoice.status = 'canceled' then
    raise exception 'CANCELED' using errcode = 'P0006';
  end if;
  if v_invoice.status = 'expired' then
    return 'expired';
  end if;

  if v_invoice.expires_at <= now() then
    -- Committed: expiry is a status transition, not an error. Claim never happens.
    update public.invoices
    set status = 'expired'
    where id = v_invoice.id;
    return 'expired';
  end if;

  update public.invoices
  set status = 'claimed', txid = p_txid
  where id = v_invoice.id;

  return 'claimed';
end;
$$;

comment on function public.claim_invoice(text, text) is
  'Anon-callable, one-way pending->claimed transition with expiry check. Returns ''claimed''.';

-- Token-addressed public read: one invoice by capability token, without exposing the
-- list-everything surface of the view. Recommended path for clients.
create or replace function public.get_public_invoice(p_token text)
returns table (
  token text,
  amount numeric,
  reference text,
  note text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  claimed_at timestamptz,
  paid_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select i.token, i.amount, i.reference, i.note, i.status,
         i.expires_at, i.created_at, i.claimed_at, i.paid_at
  from public.invoices i
  where i.token = p_token;
$$;

comment on function public.get_public_invoice(text) is
  'Token-addressed public invoice lookup (no txid, no merchant uuid, no user_id).';

grant execute on function public.claim_invoice(text, text) to anon, authenticated;
grant execute on function public.get_public_invoice(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 10. Service role grants (edge function)
-- ----------------------------------------------------------------------------
-- Guarded so this migration also applies on plain Postgres / PGlite where the Supabase
-- roles do not exist. On Supabase the service role also has BYPASSRLS, so table grants are
-- what it actually needs.

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant usage on schema deshiqr to service_role';
    execute 'grant all privileges on table public.merchants to service_role';
    execute 'grant all privileges on table public.invoices to service_role';
    execute 'grant select on public.public_merchants to service_role';
    execute 'grant select on public.public_invoices to service_role';
    execute 'grant execute on function deshiqr.crc16(text) to service_role';
    execute 'grant execute on function deshiqr.take_rate_limit(text, integer, integer) to service_role';
    execute 'grant execute on function public.take_rate_limit(text, integer, integer) to service_role';
    execute 'grant execute on function public.claim_invoice(text, text) to service_role';
    execute 'grant execute on function public.get_public_invoice(text) to service_role';
  else
    raise notice 'service_role does not exist; skipping Supabase service-role grants';
  end if;
end;
$$;

-- `anon` and `authenticated` must NOT be able to reach the rate limiter (minting arbitrary
-- counters is a free DoS), so it stays service-role-only. The edge function uses the
-- service role key.
revoke all on function public.take_rate_limit(text, integer, integer) from public;
