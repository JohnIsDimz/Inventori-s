-- 0010_sprint8.sql — pesanan / kuotasi
--
-- Pesanan adalah janji jual: stok dan omzet TIDAK berubah sampai pesanan
-- dijadikan transaksi. Karena itu tabel ini berdiri sendiri dan tidak menyentuh
-- `products.stock`, `stock_moves`, atau `transactions`.
--
-- Isi berkas:
--   1. tipe `order_status` + tabel `orders` dan `order_items`
--   2. RLS: semua anggota boleh membaca; kasir boleh membuat/mengubah pesanan
--      (menjual adalah pekerjaannya), menghapus permanen hanya pemilik/admin
--      lewat klien (baris dihapus lunak dengan `deleted_at`)
--   3. `sync_order(jsonb)` — simpan pesamaan idempoten, total dihitung server
--   4. Realtime untuk tabel pesanan

do $$ begin
  create type order_status as enum ('terbuka', 'selesai', 'batal');
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  outlet_id      uuid not null references public.outlets (id) on delete cascade,
  customer_name  text not null check (length(trim(customer_name)) between 1 and 60),
  customer_phone text,
  note           text,
  due_date       date,
  status         order_status not null default 'terbuka',
  total          numeric(14, 2) not null default 0 check (total >= 0),
  -- Diisi bila pesanan sudah dijadikan transaksi penjualan.
  transaction_id uuid references public.transactions (id),
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists orders_outlet_status_idx
  on public.orders (outlet_id, status, due_date) where deleted_at is null;
create index if not exists orders_outlet_updated_idx
  on public.orders (outlet_id, updated_at) where deleted_at is null;

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name       text not null,
  qty        numeric(14, 2) not null check (qty > 0),
  price      numeric(14, 2) not null check (price >= 0),
  subtotal   numeric(14, 2) not null check (subtotal >= 0)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- RLS
alter table public.orders enable row level security;

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders
  for select using (public.is_member(outlet_id));

-- Pesanan boleh dibuat & diubah siapa pun yang bekerja di toko (termasuk kasir).
drop policy if exists orders_write on public.orders;
create policy orders_write on public.orders
  for all using (public.is_member(outlet_id)) with check (public.is_member(outlet_id));

alter table public.order_items enable row level security;

drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_items.order_id and public.is_member(o.outlet_id))
  );

drop policy if exists order_items_write on public.order_items;
create policy order_items_write on public.order_items
  for all using (
    exists (select 1 from public.orders o where o.id = order_items.order_id and public.is_member(o.outlet_id))
  ) with check (
    exists (select 1 from public.orders o where o.id = order_items.order_id and public.is_member(o.outlet_id))
  );

-- ---------------------------------------------------------------- sync
/**
 * Simpan pesanan dari klien.
 *
 * Aturan uang sama seperti transaksi: total TIDAK dipercaya dari klien, selalu
 * dihitung dari rincian barang. Idempoten berdasarkan `id`, jadi kiriman ulang
 * akibat sinyal putus tidak menggandakan pesanan (atau rinciannya).
 */
create or replace function public.sync_order(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id        uuid := (p ->> 'id')::uuid;
  v_outlet    uuid := (p ->> 'outlet_id')::uuid;
  v_status    order_status := coalesce((p ->> 'status')::order_status, 'terbuka');
  v_tx        uuid := nullif(p ->> 'transaction_id', '')::uuid;
  v_total     numeric(14, 2) := 0;
  v_items     jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_item      jsonb;
  v_name      text;
  v_qty       numeric;
  v_price     numeric;
begin
  if v_id is null or v_outlet is null then
    raise exception 'Pesanan tanpa id/outlet tidak bisa disimpan';
  end if;
  if not public.is_member(v_outlet) then
    raise exception 'Bukan anggota toko ini' using errcode = '42501';
  end if;
  if length(trim(coalesce(p ->> 'customer_name', ''))) = 0 then
    raise exception 'Nama pelanggan wajib diisi';
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'Pesanan harus punya minimal satu barang';
  end if;
  if v_status = 'selesai' and v_tx is null then
    raise exception 'Pesanan selesai harus menunjuk transaksi';
  end if;

  -- Barang milik toko lain tidak boleh diselipkan ke pesanan ini.
  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where item ->> 'product_id' is not null
      and not exists (
        select 1 from public.products pr
        where pr.id = (item ->> 'product_id')::uuid and pr.outlet_id = v_outlet
      )
  ) then
    raise exception 'Ada barang yang bukan milik toko ini';
  end if;

  insert into public.orders (
    id, outlet_id, customer_name, customer_phone, note, due_date, status,
    total, transaction_id, created_by, created_at, updated_at
  )
  values (
    v_id,
    v_outlet,
    trim(p ->> 'customer_name'),
    nullif(p ->> 'customer_phone', ''),
    nullif(p ->> 'note', ''),
    nullif(p ->> 'due_date', '')::date,
    v_status,
    0,
    v_tx,
    auth.uid(),
    coalesce((p ->> 'created_at')::timestamptz, now()),
    now()
  )
  on conflict (id) do update set
    customer_name  = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    note           = excluded.note,
    due_date       = excluded.due_date,
    status         = excluded.status,
    transaction_id = excluded.transaction_id,
    updated_at     = now(),
    deleted_at     = null;

  delete from public.order_items where order_id = v_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_name := trim(coalesce(v_item ->> 'name', ''));
    v_qty := (v_item ->> 'qty')::numeric;
    v_price := (v_item ->> 'price')::numeric;

    if v_name = '' then
      raise exception 'Nama barang pada pesanan tidak boleh kosong';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Jumlah barang harus lebih dari 0 (barang: %)', v_name;
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Harga barang tidak boleh negatif (barang: %)', v_name;
    end if;

    insert into public.order_items (order_id, product_id, name, qty, price, subtotal)
    values (
      v_id,
      nullif(v_item ->> 'product_id', '')::uuid,
      v_name,
      v_qty,
      v_price,
      v_qty * v_price
    );

    v_total := v_total + v_qty * v_price;
  end loop;

  update public.orders set total = v_total where id = v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------- realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.orders;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

grant execute on function public.sync_order(jsonb) to authenticated;
