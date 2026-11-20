-- 0008_sprint5.sql — harga bertingkat (grosir) & dukungan diskon per barang
--
-- Isi:
--   1. Kolom harga grosir di products (harga + minimal jumlah)
--   2. sync_product versi baru: ikut menyimpan harga grosir, dan kasir tetap
--      tidak boleh mengubah harga (termasuk harga grosir)
--
-- Catatan desain: satu tingkat grosir per barang disimpan langsung di `products`
-- karena itulah kebutuhan 80% toko (harga kulakan minimal 5 pcs, dst.). Tabel
-- `price_tiers` yang sudah ada tetap disiapkan untuk tingkat member/grosir
-- bertingkat di sprint berikutnya. Diskon per barang TIDAK butuh kolom baru:
-- `transaction_items.discount` sudah ada sejak 0001 dan sudah dipakai
-- sync_transaction (sprint 4).

alter table public.products
  add column if not exists wholesale_price numeric(14, 2),
  add column if not exists wholesale_min_qty numeric(14, 2);

alter table public.products
  drop constraint if exists products_wholesale_chk;

alter table public.products
  add constraint products_wholesale_chk check (
    (wholesale_price is null and wholesale_min_qty is null)
    or (wholesale_price is not null and wholesale_price >= 0
        and wholesale_min_qty is not null and wholesale_min_qty >= 1)
  );

comment on column public.products.wholesale_price is
  'Harga satuan bila jumlah beli >= wholesale_min_qty. Null = tanpa harga grosir.';

-- ---------------------------------------------------------------- sync_product
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
  v_wprice  numeric := nullif(p ->> 'wholesale_price', '')::numeric;
  v_wqty    numeric := nullif(p ->> 'wholesale_min_qty', '')::numeric;
begin
  if v_id is null then
    raise exception 'id produk wajib dikirim';
  end if;
  if not public.is_member(v_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;

  -- Harga grosir hanya bermakna bila keduanya diisi.
  if (v_wprice is null) <> (v_wqty is null) then
    raise exception 'Harga grosir dan minimal jumlah harus diisi bersama'
      using errcode = '23514';
  end if;
  if v_wqty is not null and v_wqty < 1 then
    raise exception 'Minimal jumlah grosir harus 1 atau lebih' using errcode = '23514';
  end if;
  if v_wprice is not null and v_wprice < 0 then
    raise exception 'Harga grosir tidak boleh negatif' using errcode = '23514';
  end if;

  select * into v_existing from public.products where id = v_id;
  if v_existing.id is not null and v_existing.outlet_id <> v_outlet then
    raise exception 'Produk milik outlet lain' using errcode = '42501';
  end if;

  -- Kasir boleh menambah barang baru, tetapi tidak boleh mengubah harga barang
  -- yang sudah ada (termasuk harga grosir). Perubahan stok awal tetap diizinkan.
  if v_existing.id is not null and not public.can_manage(v_outlet) then
    if v_existing.sell_price <> coalesce((p ->> 'sell_price')::numeric, v_existing.sell_price)
       or v_existing.cost_price <> coalesce((p ->> 'cost_price')::numeric, v_existing.cost_price)
       or v_existing.wholesale_price is distinct from v_wprice
       or v_existing.wholesale_min_qty is distinct from v_wqty
       or v_existing.deleted_at is not null then
      raise exception 'Hanya pemilik atau admin yang boleh mengubah harga' using errcode = '42501';
    end if;
  end if;

  insert into public.products (
    id, outlet_id, name, unit, barcode, cost_price, sell_price, min_stock,
    wholesale_price, wholesale_min_qty, created_by
  )
  values (
    v_id, v_outlet,
    coalesce(p ->> 'name', 'Barang'),
    coalesce(p ->> 'unit', 'pcs'),
    nullif(p ->> 'barcode', ''),
    coalesce((p ->> 'cost_price')::numeric, 0),
    coalesce((p ->> 'sell_price')::numeric, 0),
    coalesce((p ->> 'min_stock')::numeric, 0),
    v_wprice, v_wqty,
    auth.uid()
  )
  on conflict (id) do update set
    name              = excluded.name,
    unit              = excluded.unit,
    barcode           = excluded.barcode,
    cost_price        = excluded.cost_price,
    sell_price        = excluded.sell_price,
    min_stock         = excluded.min_stock,
    wholesale_price   = excluded.wholesale_price,
    wholesale_min_qty = excluded.wholesale_min_qty,
    deleted_at        = null;

  if v_delta <> 0 then
    perform public._apply_stock(v_id, v_delta, v_reason, v_ref, null);
  end if;

  return v_id;
end $$;

revoke all on function public.sync_product(jsonb) from public;
grant execute on function public.sync_product(jsonb) to authenticated;

-- ---------------------------------------------------------------- indeks bantu
-- Kasir mencari harga grosir saat menghitung keranjang; tidak perlu indeks baru
-- karena kolomnya ikut terbaca saat produk diambil.
