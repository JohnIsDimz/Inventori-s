-- Inventori's — 0004: sprint 2
-- Isi:
--   1. Stok berbasis DELTA (`_apply_stock`, `apply_stock_delta`, `sync_product`)
--      sehingga dua perangkat tidak saling menimpa angka stok.
--   2. Sinkron kategori & alokasi modal (tabel baru capital_allocations).
--   3. Aktifkan Supabase Realtime pada tabel yang penting.
--
-- Kenapa ini perlu: pada sprint 1 produk dikirim dengan nilai stok ABSOLUT.
-- Bila HP A dan HP B sama-sama menjual barang yang sama, stok lokal masing-masing
-- berbeda, dan pengiriman yang datang belakangan menimpa angka yang benar.
-- Mulai sekarang server hanya menerima "berubah sebanyak X", lalu menghitungnya
-- sendiri di atas stok terkini.

-- Alasan stok baru: stok awal barang & perpindahan antar outlet.
alter type stock_reason add value if not exists 'opening';
alter type stock_reason add value if not exists 'transfer';

-- ---------------------------------------------------------------- inti delta
-- Tidak punya pemeriksaan izin: hanya boleh dipanggil fungsi lain di bawah.
create or replace function public._apply_stock(
  p_product uuid,
  p_delta   numeric,
  p_reason  stock_reason,
  p_ref     uuid default null,
  p_note    text default null
)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet uuid;
  v_stock  numeric;
  v_move   uuid;
begin
  if coalesce(p_delta, 0) = 0 then
    raise exception 'Perubahan stok tidak boleh 0';
  end if;

  select outlet_id into v_outlet from public.products where id = p_product and deleted_at is null;
  if v_outlet is null then
    raise exception 'Produk tidak ditemukan';
  end if;

  -- Idempotensi: kalau ref yang sama sudah pernah dipakai untuk produk ini,
  -- jangan potong/tambah dua kali (kiriman ulang akibat sinyal putus).
  if p_ref is not null then
    select id into v_move
    from public.stock_moves
    where ref_id = p_ref and product_id = p_product
    limit 1;
    if v_move is not null then
      select stock into v_stock from public.products where id = p_product;
      return v_stock;
    end if;
  end if;

  select stock into v_stock from public.products where id = p_product for update;
  if v_stock + p_delta < 0 then
    raise exception 'Stok tidak boleh minus (tersisa %)', v_stock using errcode = '22000';
  end if;

  insert into public.stock_moves (outlet_id, product_id, delta, reason, ref_id, note, created_by)
  values (v_outlet, p_product, p_delta, coalesce(p_reason, 'adjust'), p_ref, p_note, auth.uid());

  update public.products set stock = stock + p_delta where id = p_product
  returning stock into v_stock;

  return v_stock;
end $$;

-- Wrapper dengan pemeriksaan izin, dipakai aplikasi untuk stok masuk/keluar manual.
drop function if exists public.apply_stock_delta(uuid, numeric, stock_reason, uuid, text);
create or replace function public.apply_stock_delta(
  p_product uuid,
  p_delta   numeric,
  p_reason  stock_reason default 'adjust',
  p_ref     uuid default null,
  p_note    text default null
)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_outlet uuid;
begin
  select outlet_id into v_outlet from public.products where id = p_product and deleted_at is null;
  if v_outlet is null then
    raise exception 'Produk tidak ditemukan';
  end if;
  if not public.can_manage(v_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh menyesuaikan stok' using errcode = '42501';
  end if;
  return public._apply_stock(p_product, p_delta, coalesce(p_reason, 'adjust'), p_ref, p_note);
end $$;

-- ---------------------------------------------------------------- produk tanpa stok absolut
-- Aplikasi mengirim data produk TANPA kolom stok, lalu (bila ada) perubahan
-- stok lewat `stock_delta`. Kolom stok di server hanya diubah oleh stok itu sendiri.
create or replace function public.sync_product(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet  uuid := (p ->> 'outlet_id')::uuid;
  v_id      uuid := (p ->> 'id')::uuid;
  v_existing public.products;
  v_delta   numeric := coalesce((p ->> 'stock_delta')::numeric, 0);
  v_reason  stock_reason := coalesce((p ->> 'stock_reason')::stock_reason, 'opening');
  v_ref     uuid := nullif(p ->> 'stock_ref', '')::uuid;
begin
  if v_id is null then
    raise exception 'id produk wajib dikirim';
  end if;
  if not public.is_member(v_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;

  select * into v_existing from public.products where id = v_id;
  if v_existing.id is not null and v_existing.outlet_id <> v_outlet then
    raise exception 'Produk milik outlet lain' using errcode = '42501';
  end if;

  -- Kasir boleh menambah barang baru, tetapi tidak boleh mengubah harga barang
  -- yang sudah ada. Perubahan stok awal tetap diizinkan (barang baru masuk).
  if v_existing.id is not null and not public.can_manage(v_outlet) then
    if v_existing.sell_price <> coalesce((p ->> 'sell_price')::numeric, v_existing.sell_price)
       or v_existing.cost_price <> coalesce((p ->> 'cost_price')::numeric, v_existing.cost_price)
       or v_existing.deleted_at is not null then
      raise exception 'Hanya pemilik atau admin yang boleh mengubah harga' using errcode = '42501';
    end if;
  end if;

  insert into public.products (id, outlet_id, name, unit, barcode, cost_price, sell_price, min_stock, created_by)
  values (
    v_id, v_outlet,
    coalesce(p ->> 'name', 'Barang'),
    coalesce(p ->> 'unit', 'pcs'),
    nullif(p ->> 'barcode', ''),
    coalesce((p ->> 'cost_price')::numeric, 0),
    coalesce((p ->> 'sell_price')::numeric, 0),
    coalesce((p ->> 'min_stock')::numeric, 0),
    auth.uid()
  )
  on conflict (id) do update set
    name       = excluded.name,
    unit       = excluded.unit,
    barcode    = excluded.barcode,
    cost_price = excluded.cost_price,
    sell_price = excluded.sell_price,
    min_stock  = excluded.min_stock,
    deleted_at = null;

  if v_delta <> 0 then
    perform public._apply_stock(v_id, v_delta, v_reason, v_ref, null);
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------- alokasi modal
create table if not exists public.capital_allocations (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid not null references public.outlets (id) on delete cascade,
  amount     numeric(14, 2) not null check (amount <> 0),
  note       text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists capital_allocations_outlet_idx
  on public.capital_allocations (outlet_id, created_at desc) where deleted_at is null;

alter table public.capital_allocations enable row level security;

drop policy if exists capital_allocations_read on public.capital_allocations;
create policy capital_allocations_read on public.capital_allocations
  for select using (public.is_member(outlet_id));

drop policy if exists capital_allocations_write on public.capital_allocations;
create policy capital_allocations_write on public.capital_allocations
  for all using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

-- ---------------------------------------------------------------- realtime
-- Perangkat lain langsung diberi tahu saat ada transaksi/produk baru, tanpa
-- menunggu interval sinkron 30 detik.
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_table in array array[
    'products', 'transactions', 'categories', 'capital_allocations',
    'receivables', 'payables', 'stock_moves'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    exception
      when duplicate_object then null;
      when undefined_table then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------- hak eksekusi
revoke all on function public._apply_stock(uuid, numeric, stock_reason, uuid, text) from public;
revoke all on function public.apply_stock_delta(uuid, numeric, stock_reason, uuid, text) from public;
revoke all on function public.sync_product(jsonb) from public;

grant execute on function public.apply_stock_delta(uuid, numeric, stock_reason, uuid, text) to authenticated;
grant execute on function public.sync_product(jsonb) to authenticated;
