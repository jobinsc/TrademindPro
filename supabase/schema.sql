-- TradeMind Pro — run once in Supabase → SQL Editor → New query → Run

-- Profiles (name, role, blocked)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists password_hash text;

-- App data key/value store (mirrors browser localStorage)
create table if not exists public.user_kv (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists user_kv_user_id_idx on public.user_kv (user_id);

alter table public.profiles enable row level security;
alter table public.user_kv enable row level security;

-- Helper: is current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.blocked = false
  );
$$;

-- Total profiles (for “first user = admin”); bypasses RLS
create or replace function public.profile_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.profiles;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.profile_count() to authenticated;

-- Profiles policies
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  using (public.is_admin() and id <> auth.uid());

-- Synced app keys include: nejoic, jimbo, blink (trademindpro_blink_v1), trades, paper, etc.
-- See src/lib/cloud-sync-keys.ts for the full allowlist.
drop policy if exists "user_kv_select_own" on public.user_kv;
create policy "user_kv_select_own"
  on public.user_kv for select
  using (user_id = auth.uid());

drop policy if exists "user_kv_insert_own" on public.user_kv;
create policy "user_kv_insert_own"
  on public.user_kv for insert
  with check (user_id = auth.uid());

drop policy if exists "user_kv_update_own" on public.user_kv;
create policy "user_kv_update_own"
  on public.user_kv for update
  using (user_id = auth.uid());

drop policy if exists "user_kv_delete_own" on public.user_kv;
create policy "user_kv_delete_own"
  on public.user_kv for delete
  using (user_id = auth.uid());
