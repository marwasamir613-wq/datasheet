-- ===========================================================
-- NOUR DATASHEET - production Supabase schema
-- Run once in Supabase SQL Editor, then add your admin email to admin_users.
-- ===========================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  description   text default '',
  display_order int  not null default 0,
  is_visible    boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references public.categories(id) on delete set null,
  name           text not null,
  slug           text not null unique,
  description    text default '',
  dimensions_w   numeric,
  dimensions_h   numeric,
  dimensions_d   numeric,
  specifications jsonb not null default '[]'::jsonb,
  features       jsonb not null default '[]'::jsonb,
  keywords       jsonb not null default '[]'::jsonb,
  images         jsonb not null default '[]'::jsonb,
  content_blocks jsonb not null default '[]'::jsonb,
  dimension_image text default '',
  ai_open_image_url text default '',
  ai_closed_image_url text default '',
  custom_note    text default '',
  internal_price numeric,
  price_label    text default '',
  spec_sheet_url text default '',
  display_order  int  not null default 0,
  is_visible     boolean not null default true,
  is_featured    boolean not null default false,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table public.products add column if not exists ai_open_image_url text default '';
alter table public.products add column if not exists ai_closed_image_url text default '';
alter table public.products add column if not exists internal_price numeric;
alter table public.products add column if not exists price_label text default '';
alter table public.products add column if not exists spec_sheet_url text default '';

create table if not exists public.site_settings (
  id         int primary key default 1,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  constraint site_settings_single_row check (id = 1)
);

-- Allowlist for dashboard writers. Insert the same email you create in
-- Supabase Auth:
--   insert into public.admin_users (email) values ('you@example.com')
--   on conflict (email) do nothing;
create table if not exists public.admin_users (
  email      text primary key,
  created_at timestamptz default now()
);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_order_idx    on public.products (display_order);
create index if not exists categories_order_idx  on public.categories (display_order);

-- ---------- Admin helper ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.categories    enable row level security;
alter table public.products      enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_users   enable row level security;

-- Public visitors: read only.
drop policy if exists "public read categories" on public.categories;
drop policy if exists "public read products"   on public.products;
drop policy if exists "public read settings"   on public.site_settings;
create policy "public read categories" on public.categories    for select using (true);
create policy "public read products"   on public.products      for select using (true);
create policy "public read settings"   on public.site_settings for select using (true);

-- Remove the earlier broad authenticated policies if they exist.
drop policy if exists "auth write categories" on public.categories;
drop policy if exists "auth write products"   on public.products;
drop policy if exists "auth write settings"   on public.site_settings;

-- Admin-only write policies.
drop policy if exists "admin insert categories" on public.categories;
drop policy if exists "admin update categories" on public.categories;
drop policy if exists "admin delete categories" on public.categories;
create policy "admin insert categories" on public.categories for insert to authenticated with check (public.is_admin());
create policy "admin update categories" on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete categories" on public.categories for delete to authenticated using (public.is_admin());

drop policy if exists "admin insert products" on public.products;
drop policy if exists "admin update products" on public.products;
drop policy if exists "admin delete products" on public.products;
create policy "admin insert products" on public.products for insert to authenticated with check (public.is_admin());
create policy "admin update products" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete products" on public.products for delete to authenticated using (public.is_admin());

drop policy if exists "admin insert settings" on public.site_settings;
drop policy if exists "admin update settings" on public.site_settings;
drop policy if exists "admin delete settings" on public.site_settings;
create policy "admin insert settings" on public.site_settings for insert to authenticated with check (public.is_admin());
create policy "admin update settings" on public.site_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete settings" on public.site_settings for delete to authenticated using (public.is_admin());

-- ---------- Storage bucket for images ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public read images"  on storage.objects;
drop policy if exists "auth upload images"  on storage.objects;
drop policy if exists "auth update images"  on storage.objects;
drop policy if exists "auth delete images"  on storage.objects;
drop policy if exists "admin upload images" on storage.objects;
drop policy if exists "admin update images" on storage.objects;
drop policy if exists "admin delete images" on storage.objects;
create policy "public read images" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "admin upload images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy "admin update images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "admin delete images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

insert into public.site_settings (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;
