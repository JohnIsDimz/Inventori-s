-- 0011_sprint10.sql — uang muka (DP) pada pesanan
--
-- Kenapa DP disimpan di pesanan, bukan langsung jadi transaksi?
-- Karena uangnya sudah diterima tetapi barangnya belum keluar. Kalau langsung
-- dicatat sebagai penjualan, omzet dan stok jadi bohong. DP baru "jadi uang" saat
-- pesanan diserahkan: transaksi penuh dicatat, lalu DP masuk sebagai pembayaran
-- pertama pada kasbon sisanya.
--
-- Isi berkas:
--   1. kolom `orders.deposit` dengan pemeriksaan 0 ≤ deposit ≤ total
--   2. `sync_order` versi baru yang menerima & memeriksa deposit
--   3. indeks tambahan untuk daftar pesanan ber-DP (laporan uang muka)

alter table public.orders
  add column if not exists deposit numeric(14, 2) not null default 0;

-- Total dihitung server SETELAH rincian diproses, jadi pemeriksaan deposit juga
-- dilakukan di dalam fungsi (constraint di bawah menjaga data lama/CLI manual).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_deposit_chk'
  ) then
    alter table public.orders
      add constraint orders_deposit_chk check (deposit >= 0 and deposit <= total);
  end if;
end $$;

create index if not exists orders_deposit_idx
  on public.orders (outlet_id, created_at desc)
  where deposit > 0 and deleted_at is null;

/**
 * Simpan pesanan (versi sprint 10: ditambah `deposit`).
 *
 * Aturan baru:
 *   - `deposit` tidak boleh negatif dan tidak boleh melebihi total pesanan;
 *   - `deposit` dari klien hanya diterima sebagai angka, bukan sebagai dasar
 *     perhitungan uang — sisa tagihan tetap dihitung klien dari total server.
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
  v_deposit   numeric(14, 2) := coalesce((p ->> 'deposit')::numeric, 0);
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
  if v_deposit < 0 then
    raise exception 'Uang muka tidak boleh negatif';
  end if;

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
    total, deposit, transaction_id, created_by, created_at, updated_at
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
    values (v_id, nullif(v_item ->> 'product_id', '')::uuid, v_name, v_qty, v_price, v_qty * v_price);

    v_total := v_total + v_qty * v_price;
  end loop;

  if v_deposit > v_total then
    raise exception 'Uang muka (%) melebihi total pesanan (%)', v_deposit, v_total;
  end if;

  update public.orders
     set total = v_total,
         deposit = v_deposit
   where id = v_id;

  return v_id;
end $$;

grant execute on function public.sync_order(jsonb) to authenticated;

comment on column public.orders.deposit is
  'Uang muka yang sudah diterima. Sisa saat diambil = total - deposit; dicatat sebagai kas saat pesanan diserahkan.';
