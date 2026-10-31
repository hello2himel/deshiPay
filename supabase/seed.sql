-- ============================================================================
-- deshiQR — demo seed (synthetic data only, idempotent)
-- ============================================================================
--
-- Optional. Apply after schema.sql (SQL editor or `supabase db seed`). Safe to re-run:
-- every INSERT ends with `on conflict ... do nothing`.
--
-- Everything here is fake and matches docs/demo-payloads.md:
--   * account 01000000000  (deliberately unassignable operator prefix — not a real number)
--   * name "DEMO STORE", city "Dhaka"
--   * NPSB tokens that spell "deshiqr dummy token A/B not real"
--   * fake auth user @deshiqr.invalid and dummy invoice tokens
--
-- NEVER replace these values with a real merchant QR, account number or token.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Demo owner
-- ----------------------------------------------------------------------------
-- A stable fake auth user so the seeded merchant has an owner and the RLS policies can be
-- demonstrated. It cannot be used to log in (no password / no confirmation flow); it only
-- exists so `public.merchants.user_id` has a valid FK target.
--
-- If your Supabase project disallows direct inserts into auth.users, create a test user in
-- the dashboard and point `user_id` in the merchant insert below at that user's uuid.
insert into auth.users (id, email, aud, role)
values (
  '00000000-0000-4000-8000-000000000001',
  'demo@deshiqr.invalid',
  'authenticated',
  'authenticated'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Demo merchant
-- ----------------------------------------------------------------------------
-- `base_payload` is verbatim the static synthetic payload from docs/demo-payloads.md
-- ("Static QR (no amount)"). The CHECK constraint in schema.sql verifies its CRC, and
-- inserting this row is itself a regression test for the SQL CRC implementation.
--
-- Slug `demo` is reserved in deshiqr.guard_reserved_slug(); it is allowed here because the
-- seed runs as the migration/owner role (postgres), not as an ordinary authenticated user.
insert into public.merchants (
  id, user_id, slug, title, note,
  base_payload, name, city, account_masked, institution,
  ref_prefix, ref_len, presets, verified, status
)
values (
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-000000000001',
  'demo',
  'DEMO STORE',
  'Synthetic demo shop. Every payment here is fake — do not scan or send money.',
  '00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D',
  'DEMO STORE',
  'Dhaka',
  '01000•••000',
  'bd.org.bb.npsb',
  'DEMO',
  25,      -- bKash dynamic QRs use 25-character bill numbers (tag 62/01)
  array[100, 500, 1000],
  false,   -- never claim verification for the demo shop
  'published'
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Demo pending invoices
-- ----------------------------------------------------------------------------
-- Two pending invoices that the hosted invoice page, the claim flow and the edge function
-- GET/claim endpoints can be exercised against. Tokens are 64 lowercase hex characters;
-- these two are obviously synthetic (`deadbeef...`), real ones are random from
-- gen_random_uuid().
--
-- The first invoice (500.00 / DEMOQR0VZeK2MfbVRI6w36osd) derives exactly the synthetic
-- "Dynamic QR, amount 500.00, 25-character reference" payload in docs/demo-payloads.md.
insert into public.invoices (
  merchant_id, token, amount, reference, note, status, expires_at
)
select
  m.id,
  'deadbeef00000000000000000000000000000000000000000000000000000001',
  500.00,
  'DEMOQR0VZeK2MfbVRI6w36osd',
  'Synthetic demo invoice. Reference DEMOQR0VZeK2MfbVRI6w36osd.',
  'pending',
  now() + interval '1 day'
from public.merchants m
where m.slug = 'demo'
on conflict (token) do nothing;

insert into public.invoices (
  merchant_id, token, amount, reference, note, status, expires_at
)
select
  m.id,
  'deadbeef00000000000000000000000000000000000000000000000000000002',
  120.00,
  'DEMO123456789012345678901',
  'Synthetic demo invoice. A smaller amount to test presets/formatting.',
  'pending',
  now() + interval '1 day'
from public.merchants m
where m.slug = 'demo'
on conflict (token) do nothing;
