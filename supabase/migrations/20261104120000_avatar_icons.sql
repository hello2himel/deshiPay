-- Avatar icons: page owners can pick an icon instead of the first-letter monogram.
-- The site validates the id against its avatar list; the database stores it and
-- exposes it through get_public_page().

alter table public.profiles add column if not exists avatar text not null default '';

alter table public.profiles drop constraint if exists profiles_avatar_valid;
alter table public.profiles add constraint profiles_avatar_valid
  check (avatar = '' or avatar ~ '^[a-z0-9-]{1,32}$');

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
    'avatar',     p.avatar,
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
