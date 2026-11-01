-- =====================================================================
-- DeshiQR: Supabase schema
-- Run this whole file once in: Supabase dashboard > SQL Editor > New query.
-- It is safe to re-run (everything is "if not exists" / "or replace").
--
-- Security model
--   * public.profiles holds one row per signed-in user.
--   * Row Level Security: a user can only read/write their OWN row.
--   * The public payment page never reads the table directly. It calls
--     get_public_page(), a SECURITY DEFINER function that returns only the
--     fields meant to be public, and only for pages marked as published.
--     (It never exposes user_id or the email address.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reserved usernames (they would clash with site routes or look official)
-- Keep this list in sync with RESERVED in public/js/common.js
-- ---------------------------------------------------------------------
create or replace function public.is_reserved_username(u text)
returns boolean
language sql
immutable
as $$
  select u = any (array[
    'app','api','admin','administrator','login','logout','signin','signup','register','auth',
    'pay','payment','payments','dashboard','settings','account','profile','help','support',
    'about','terms','privacy','contact','static','assets','css','js','vendor','img','images',
    'fonts','favicon','robots','sitemap','index','home','new','null','undefined','www','mail',
    'status','blog','docs','deshiqr','bkash','nagad','rocket','upay','bank','official',
    'security','verify','root','system','staff','team'
  ]);
$$;

-- ---------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,

  username     text    not null,                       -- the URL: yourdomain.com/<username>
  title        text    not null,                       -- name shown at the top of the page
  message      text    not null default '',            -- optional note for customers
  theme        text    not null default 'rose',
  presets      integer[] not null default '{100,500,1000,5000}',

  -- Bangla QR (the payload with the amount and reference removed, checksum included)
  qr_payload   text,
  qr_name      text,                                   -- merchant name from the QR (tag 59), display only
  qr_city      text,                                   -- merchant city from the QR (tag 60), display only
  ref_prefix   text    not null default '',            -- see README "References"
  ref_len      integer not null default 0,

  -- Direct transfer details
  wallets      jsonb   not null default '[]'::jsonb,   -- [{provider, type, number}]
  banks        jsonb   not null default '[]'::jsonb,   -- [{bank, name, number, branch, routing, swift}]

  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_username_format   check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  constraint profiles_username_reserved check (not public.is_reserved_username(username)),
  constraint profiles_title_len         check (char_length(title) between 1 and 60),
  constraint profiles_message_len       check (char_length(message) <= 160),
  constraint profiles_theme_valid       check (theme in
    ('rose','crimson','amber','coffee','olive','emerald','teal','ocean','violet','graphite')),
  constraint profiles_presets_valid     check (cardinality(presets) <= 6),
  constraint profiles_qr_len            check (qr_payload is null or char_length(qr_payload) between 20 and 1024),
  constraint profiles_ref_valid         check (ref_len between 0 and 99 and char_length(ref_prefix) <= ref_len),
  constraint profiles_wallets_valid     check (jsonb_typeof(wallets) = 'array' and jsonb_array_length(wallets) <= 6 and length(wallets::text) < 4000),
  constraint profiles_banks_valid       check (jsonb_typeof(banks)   = 'array' and jsonb_array_length(banks)   <= 4 and length(banks::text)   < 6000),
  constraint profiles_has_method        check (qr_payload is not null or jsonb_array_length(wallets) > 0 or jsonb_array_length(banks) > 0)
);

create unique index if not exists profiles_username_key on public.profiles (username);

-- keep updated_at honest
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security: owners only
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = user_id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Public read: one page by username, public fields only
-- ---------------------------------------------------------------------
create or replace function public.get_public_page(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'username',   p.username,
    'title',      p.title,
    'message',    p.message,
    'theme',      p.theme,
    'presets',    to_jsonb(p.presets),
    'qr_payload', p.qr_payload,
    'qr_name',    p.qr_name,
    'qr_city',    p.qr_city,
    'ref_prefix', p.ref_prefix,
    'ref_len',    p.ref_len,
    'wallets',    p.wallets,
    'banks',      p.banks
  )
  from public.profiles p
  where p.username = lower(p_username)
    and p.is_published;
$$;

revoke all on function public.get_public_page(text) from public;
grant execute on function public.get_public_page(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Is this username free? (used for the live check during onboarding)
-- ---------------------------------------------------------------------
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
     and not public.is_reserved_username(p_username)
     and not exists (select 1 from public.profiles where username = p_username);
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
