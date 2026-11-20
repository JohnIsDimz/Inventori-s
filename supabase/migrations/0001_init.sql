-- Inventori's — 0001: skema inti
-- Target: PostgreSQL 15+ (Supabase).
-- Prinsip:
--   * Semua tabel bisnis punya outlet_id, created_at, updated_at, deleted_at (soft delete).
--   * Uang disimpan numeric(14,2), bukan float.
--   * Stok TIDAK pernah ditulis absolut dari klien: selalu lewat stock_moves (append-only).
--   * Idempotensi transaksi lewat client_tx_id (uuid dari perangkat).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enum
do $$ begin
  create type member_role as enum ('owner', 'admin', 'kasir');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tx_type as enum ('sale', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pay_method as enum ('cash', 'qris', 'kasbon', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stock_reason as enum ('sale', 'purchase', 'opname', 'adjust', 'return', 'void');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- util
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- outlets
create table if not exists public.outlets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text unique,
  phone       text,
  address     text,
  open_time   time not null default '06:00',
  close_time  time not null default '21:00',
  currency    text not null default 'IDR',
  timezone    text not null default 'Asia/Jakarta',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- members
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'kasir',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (outlet_id, user_id)
);
create index if not exists members_user_idx on public.members (user_id) where active;

-- ---------------------------------------------------------------- kategori
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  label       text not null,
  type        tx_type not null default 'sale',
  icon        text,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists categories_outlet_idx on public.categories (outlet_id);

-- ---------------------------------------------------------------- produk
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  name        text not null,
  unit        text not null default 'pcs',
  barcode     text,
  cost_price  numeric(14, 2) not null default 0 check (cost_price >= 0),
  sell_price  numeric(14, 2) not null default 0 check (sell_price >= 0),
  stock       numeric(14, 2) not null default 0,
  min_stock   numeric(14, 2) not null default 0,
  image_path  text,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists products_barcode_uq
  on public.products (outlet_id, barcode)
  where barcode is not null and deleted_at is null;
create index if not exists products_outlet_idx on public.products (outlet_id) where deleted_at is null;

-- Harga bertingkat (dipakai mulai Tier 1, tabelnya sudah disiapkan)
create table if not exists public.price_tiers (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  tier        text not null check (tier in ('umum', 'grosir', 'member')),
  min_qty     numeric(14, 2) not null default 1,
  price       numeric(14, 2) not null check (price >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, tier, min_qty)
);

-- ---------------------------------------------------------------- stok (append-only)
create table if not exists public.stock_moves (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  delta       numeric(14, 2) not null,
  reason      stock_reason not null,
  ref_id      uuid,
  note        text,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);
create index if not exists stock_moves_outlet_time_idx on public.stock_moves (outlet_id, created_at desc);
create index if not exists stock_moves_product_idx on public.stock_moves (product_id, created_at desc);
-- Satu transaksi hanya boleh menggerakkan stok satu produk sekali
create unique index if not exists stock_moves_unique_ref
  on public.stock_moves (ref_id, product_id, reason)
  where ref_id is not null;

-- ---------------------------------------------------------------- shift kasir
create table if not exists public.shifts (
  id            uuid primary key default gen_random_uuid(),
  outlet_id     uuid not null references public.outlets (id) on delete cascade,
  opened_by     uuid not null references auth.users (id),
  opened_at     timestamptz not null default now(),
  opening_cash  numeric(14, 2) not null default 0 check (opening_cash >= 0),
  closed_by     uuid references auth.users (id),
  closed_at     timestamptz,
  closing_cash  numeric(14, 2),
  expected_cash numeric(14, 2),
  difference    numeric(14, 2),
  note          text
);
create index if not exists shifts_outlet_idx on public.shifts (outlet_id, opened_at desc);
-- Hanya boleh ada satu shift terbuka per outlet
create unique index if not exists shifts_one_open
  on public.shifts (outlet_id) where closed_at is null;

-- ---------------------------------------------------------------- pelanggan
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  name        text not null,
  phone       text,
  points      numeric(14, 2) not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists customers_outlet_idx on public.customers (outlet_id) where deleted_at is null;

-- ---------------------------------------------------------------- transaksi
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  outlet_id    uuid not null references public.outlets (id) on delete cascade,
  -- UUID buatan perangkat: kunci idempotensi saat antrean offline dikirim ulang
  client_tx_id uuid not null,
  shift_id     uuid references public.shifts (id),
  type         tx_type not null default 'sale',
  category_id  uuid references public.categories (id),
  customer_id  uuid references public.customers (id),
  subtotal     numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount     numeric(14, 2) not null default 0 check (discount >= 0),
  tax          numeric(14, 2) not null default 0 check (tax >= 0),
  total        numeric(14, 2) not null check (total >= 0),
  method       pay_method not null default 'cash',
  note         text,
  photo_path   text,
  items_count  int not null default 0,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (client_tx_id)
);
create index if not exists transactions_outlet_time_idx on public.transactions (outlet_id, created_at desc);
create index if not exists transactions_method_idx on public.transactions (outlet_id, method) where deleted_at is null;

create table if not exists public.transaction_items (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  product_id     uuid references public.products (id),
  name           text not null,
  qty            numeric(14, 2) not null check (qty > 0),
  price          numeric(14, 2) not null check (price >= 0),
  -- HPP saat barang terjual: dasar laba kotor yang akurat
  cost           numeric(14, 2) not null default 0 check (cost >= 0),
  discount       numeric(14, 2) not null default 0 check (discount >= 0)
);
create index if not exists tx_items_tx_idx on public.transaction_items (transaction_id);
create index if not exists tx_items_product_idx on public.transaction_items (product_id);

-- ---------------------------------------------------------------- kasbon / utang
create table if not exists public.receivables (
  id            uuid primary key default gen_random_uuid(),
  outlet_id     uuid not null references public.outlets (id) on delete cascade,
  customer_id   uuid references public.customers (id),
  customer_name text not null,
  amount        numeric(14, 2) not null check (amount > 0),
  due_date      date,
  note          text,
  status        text not null default 'open' check (status in ('open', 'paid', 'void')),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists receivables_outlet_idx on public.receivables (outlet_id, status) where deleted_at is null;

create table if not exists public.receivable_payments (
  id             uuid primary key default gen_random_uuid(),
  receivable_id  uuid not null references public.receivables (id) on delete cascade,
  amount         numeric(14, 2) not null check (amount > 0),
  method         pay_method not null default 'cash',
  paid_at        timestamptz not null default now(),
  note           text,
  received_by    uuid references auth.users (id),
  created_at     timestamptz not null default now()
);

create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  name        text not null,
  phone       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.payables (
  id            uuid primary key default gen_random_uuid(),
  outlet_id     uuid not null references public.outlets (id) on delete cascade,
  supplier_id   uuid references public.suppliers (id),
  supplier_name text not null,
  amount        numeric(14, 2) not null check (amount > 0),
  due_date      date,
  note          text,
  status        text not null default 'open' check (status in ('open', 'paid', 'void')),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists public.payable_payments (
  id           uuid primary key default gen_random_uuid(),
  payable_id   uuid not null references public.payables (id) on delete cascade,
  amount       numeric(14, 2) not null check (amount > 0),
  method       pay_method not null default 'cash',
  paid_at      timestamptz not null default now(),
  note         text,
  paid_by      uuid references auth.users (id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- pembelian (Tier 1.4)
create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  outlet_id    uuid not null references public.outlets (id) on delete cascade,
  supplier_id  uuid references public.suppliers (id),
  invoice_no   text,
  subtotal     numeric(14, 2) not null default 0,
  total        numeric(14, 2) not null default 0,
  paid_amount  numeric(14, 2) not null default 0,
  purchased_at timestamptz not null default now(),
  note         text,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table if not exists public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id  uuid not null references public.products (id),
  qty         numeric(14, 2) not null check (qty > 0),
  cost        numeric(14, 2) not null check (cost >= 0),
  subtotal    numeric(14, 2) not null
);

-- ---------------------------------------------------------------- audit & perangkat
create table if not exists public.audit_logs (
  id         bigserial primary key,
  outlet_id  uuid references public.outlets (id) on delete cascade,
  actor      uuid references auth.users (id),
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index if not exists audit_outlet_time_idx on public.audit_logs (outlet_id, at desc);

create table if not exists public.devices (
  id           uuid primary key default gen_random_uuid(),
  outlet_id    uuid not null references public.outlets (id) on delete cascade,
  user_id      uuid references auth.users (id),
  name         text,
  push_token   text,
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);

-- ---------------------------------------------------------------- trigger updated_at
do $$
declare t text;
begin
  foreach t in array array[
    'outlets', 'profiles', 'members', 'categories', 'products', 'price_tiers',
    'customers', 'transactions', 'receivables', 'suppliers', 'payables',
    'purchases'
  ]
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I
       for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- audit otomatis
-- Catat setiap perubahan harga/jumlah produk dan penghapusan transaksi.
create or replace function public.log_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE') and (old.sell_price <> new.sell_price or old.cost_price <> new.cost_price or old.deleted_at is distinct from new.deleted_at) then
    insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before, after)
    values (
      new.outlet_id, auth.uid(),
      case when new.deleted_at is not null and old.deleted_at is null then 'product.delete' else 'product.update' end,
      'products', new.id::text,
      jsonb_build_object('sell_price', old.sell_price, 'cost_price', old.cost_price),
      jsonb_build_object('sell_price', new.sell_price, 'cost_price', new.cost_price)
    );
  end if;
  return new;
end $$;

drop trigger if exists products_audit on public.products;
create trigger products_audit
  after update on public.products
  for each row execute function public.log_price_change();

create or replace function public.log_tx_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before)
  values (old.outlet_id, auth.uid(), 'transaction.void', 'transactions', old.id::text,
          jsonb_build_object('total', old.total, 'method', old.method, 'created_at', old.created_at));
  return old;
end $$;

drop trigger if exists transactions_audit on public.transactions;
create trigger transactions_audit
  after update on public.transactions
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.log_tx_delete();
