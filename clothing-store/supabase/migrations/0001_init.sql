-- ════════════════════════════════════════════════════════════════
-- Clothing store schema
-- Run in Supabase → SQL Editor (or `supabase db push`).
-- Then add the owner:  insert into admins (email) values ('owner@example.com');
-- ════════════════════════════════════════════════════════════════

-- ─── Admins ─────────────────────────────────────────────────────
-- One row per email allowed to manage the shop. Every write rule checks this.
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;
-- No policies: nobody can read or change this table through the API.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ─── Categories ─────────────────────────────────────────────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete set null,
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  image_url   text,
  size_chart  jsonb,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index if not exists categories_parent_idx on public.categories (parent_id);

-- ─── Products ───────────────────────────────────────────────────
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.categories (id) on delete restrict,
  name            text not null check (length(trim(name)) > 0),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description     text,
  price           numeric(10, 2) not null check (price > 0),
  sale_price      numeric(10, 2) check (sale_price is null or (sale_price > 0 and sale_price < price)),
  -- What the customer pays; used for sorting and price filters.
  effective_price numeric(10, 2) generated always as (coalesce(sale_price, price)) stored,
  sizes           text[] not null default '{}',
  colours         text[] not null default '{}',
  in_stock        boolean not null default true,
  is_featured     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_created_idx on public.products (created_at desc);
create index if not exists products_featured_idx on public.products (is_featured) where is_featured;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ─── Product images ─────────────────────────────────────────────
create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  -- Path inside the 'product-images' bucket. Null for seed placeholders
  -- served from the site's /public folder.
  storage_path text,
  url          text not null,
  width        int check (width > 0),
  height       int check (height > 0),
  alt          text,
  sort_order   int not null default 0
);
create index if not exists product_images_product_idx on public.product_images (product_id, sort_order);

-- ─── WhatsApp clicks ────────────────────────────────────────────
create table if not exists public.clicks (
  id         bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  size       text,
  colour     text,
  created_at timestamptz not null default now()
);
create index if not exists clicks_product_created_idx on public.clicks (product_id, created_at);

-- ─── Row Level Security ─────────────────────────────────────────
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.clicks         enable row level security;

-- Anyone may read the catalogue.
drop policy if exists "categories are public" on public.categories;
create policy "categories are public" on public.categories
  for select using (true);

drop policy if exists "products are public" on public.products;
create policy "products are public" on public.products
  for select using (true);

drop policy if exists "product images are public" on public.product_images;
create policy "product images are public" on public.product_images
  for select using (true);

-- Only the admin may change it.
drop policy if exists "admin writes categories" on public.categories;
create policy "admin writes categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin writes products" on public.products;
create policy "admin writes products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin writes product images" on public.product_images;
create policy "admin writes product images" on public.product_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Clicks: only the admin can read them. Inserts happen server-side
-- (/api/track, using the service role), so there is no public insert policy.
drop policy if exists "admin reads clicks" on public.clicks;
create policy "admin reads clicks" on public.clicks
  for select to authenticated using (public.is_admin());

-- ─── Most popular (admin dashboard) ─────────────────────────────
create or replace function public.popular_products(days int default 30, max_rows int default 10)
returns table (product_id uuid, name text, slug text, clicks bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.slug, count(c.id) as clicks
  from public.clicks c
  join public.products p on p.id = c.product_id
  where public.is_admin()
    and c.created_at >= now() - make_interval(days => days)
  group by p.id
  order by clicks desc, p.name
  limit max_rows;
$$;
revoke all on function public.popular_products(int, int) from public, anon;
grant execute on function public.popular_products(int, int) to authenticated;

-- ─── Storage: product photos ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product photos are public" on storage.objects;
create policy "product photos are public" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "admin uploads product photos" on storage.objects;
create policy "admin uploads product photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "admin updates product photos" on storage.objects;
create policy "admin updates product photos" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "admin deletes product photos" on storage.objects;
create policy "admin deletes product photos" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());
