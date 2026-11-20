-- Inventori's — 0003: fungsi transaksional (RPC)
-- Inilah "server sebagai hakim": klien hanya mengusulkan, server yang menghitung
-- total, memotong stok, dan menolak bila stok tidak cukup.
-- Semua fungsi security definer + search_path tetap, lalu memeriksa keanggotaan
-- lewat is_member/has_role sebelum menyentuh data.

-- ---------------------------------------------------------------- jual / catat
-- p contoh:
-- {
--   "outlet_id": "uuid", "client_tx_id": "uuid",
--   "type": "sale", "method": "cash", "category_id": "uuid|null",
--   "discount": 0, "tax": 0, "note": "",
--   "created_at": "2026-11-19T10:00:00Z",
--   "items": [{ "product_id": "uuid", "name": "Indomie", "qty": 2, "price": 3500, "cost": 3000 }]
-- }
create or replace function public.sync_transaction(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet   uuid := (p ->> 'outlet_id')::uuid;
  v_client   uuid := (p ->> 'client_tx_id')::uuid;
  v_id       uuid;
  v_shift    uuid;
  v_tx_type  tx_type := coalesce((p ->> 'type')::tx_type, 'sale');
  v_subtotal numeric := 0;
  v_discount numeric := coalesce((p ->> 'discount')::numeric, 0);
  v_tax      numeric := coalesce((p ->> 'tax')::numeric, 0);
  v_total    numeric;
  v_item     jsonb;
  v_pid      uuid;
  v_qty      numeric;
  v_stock    numeric;
  v_name     text;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;

  if not public.is_member(v_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;

  -- Idempotensi: perangkat boleh mengirim ulang tanpa menggandakan nota.
  select id into v_id from public.transactions where client_tx_id = v_client;
  if v_id is not null then
    return v_id;
  end if;

  v_shift := nullif(p ->> 'shift_id', '')::uuid;
  if v_shift is null then
    select id into v_shift from public.shifts where outlet_id = v_outlet and closed_at is null;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb))
  loop
    if coalesce((v_item ->> 'qty')::numeric, 0) <= 0 then
      raise exception 'Jumlah barang harus lebih dari 0';
    end if;
    v_subtotal := v_subtotal + (v_item ->> 'qty')::numeric * (v_item ->> 'price')::numeric;
  end loop;

  v_total := v_subtotal - v_discount + v_tax;
  if v_total <= 0 then
    raise exception 'Total transaksi harus lebih dari 0';
  end if;

  insert into public.transactions (
    outlet_id, client_tx_id, shift_id, type, category_id, customer_id,
    subtotal, discount, tax, total, method, note, items_count, created_by, created_at
  ) values (
    v_outlet, v_client, v_shift, v_tx_type,
    nullif(p ->> 'category_id', '')::uuid,
    nullif(p ->> 'customer_id', '')::uuid,
    v_subtotal, v_discount, v_tax, v_total,
    coalesce((p ->> 'method')::pay_method, 'cash'),
    p ->> 'note',
    jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)),
    auth.uid(),
    coalesce((p ->> 'created_at')::timestamptz, now())
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb))
  loop
    v_pid := nullif(v_item ->> 'product_id', '')::uuid;
    v_qty := (v_item ->> 'qty')::numeric;

    insert into public.transaction_items (transaction_id, product_id, name, qty, price, cost, discount)
    values (
      v_id, v_pid, coalesce(v_item ->> 'name', 'Barang'), v_qty,
      (v_item ->> 'price')::numeric,
      coalesce((v_item ->> 'cost')::numeric, 0),
      coalesce((v_item ->> 'discount')::numeric, 0)
    );

    if v_pid is not null then
      -- FOR UPDATE mengunci baris: dua kasir tidak bisa menjual sisa barang yang sama.
      select stock, name into v_stock, v_name
      from public.products
      where id = v_pid and outlet_id = v_outlet and deleted_at is null
      for update;

      if v_stock is null then
        raise exception 'Produk tidak ditemukan di outlet ini';
      end if;

      if v_stock < v_qty then
        raise exception 'Stok % tidak cukup (tersisa %)', v_name, v_stock using errcode = '22000';
      end if;

      insert into public.stock_moves (outlet_id, product_id, delta, reason, ref_id, created_by)
      values (v_outlet, v_pid, -v_qty, 'sale', v_id, auth.uid())
      on conflict do nothing;

      update public.products set stock = stock - v_qty where id = v_pid;
    end if;
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------- void transaksi
create or replace function public.void_transaction(p_tx uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tx   public.transactions;
  v_item public.transaction_items;
begin
  select * into v_tx from public.transactions where id = p_tx and deleted_at is null for update;
  if v_tx.id is null then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  if not public.can_manage(v_tx.outlet_id) then
    raise exception 'Hanya pemilik atau admin yang boleh membatalkan transaksi' using errcode = '42501';
  end if;

  for v_item in select * from public.transaction_items where transaction_id = p_tx loop
    if v_item.product_id is not null then
      insert into public.stock_moves (outlet_id, product_id, delta, reason, ref_id, note, created_by)
      values (v_tx.outlet_id, v_item.product_id, v_item.qty, 'void', p_tx, p_reason, auth.uid())
      on conflict do nothing;

      update public.products set stock = stock + v_item.qty where id = v_item.product_id;
    end if;
  end loop;

  update public.transactions
  set deleted_at = now(),
      note = nullif(concat_ws(' | ', note, case when p_reason is null then null else 'void: ' || p_reason end), '')
  where id = p_tx;
end $$;

-- ---------------------------------------------------------------- shift kasir
create or replace function public.open_shift(p_outlet uuid, p_opening_cash numeric default 0)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_member(p_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;

  select id into v_id from public.shifts where outlet_id = p_outlet and closed_at is null;
  if v_id is not null then
    return v_id; -- sudah ada shift terbuka: lanjutkan, jangan buat baru
  end if;

  insert into public.shifts (outlet_id, opened_by, opening_cash)
  values (p_outlet, auth.uid(), greatest(coalesce(p_opening_cash, 0), 0))
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.close_shift(p_shift uuid, p_closing_cash numeric, p_note text default null)
returns public.shifts
language plpgsql security definer set search_path = public
as $$
declare
  v_shift    public.shifts;
  v_in       numeric := 0;
  v_out      numeric := 0;
  v_expected numeric;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if v_shift.id is null then
    raise exception 'Shift tidak ditemukan';
  end if;
  if v_shift.closed_at is not null then
    raise exception 'Shift ini sudah ditutup';
  end if;
  if not (public.is_member(v_shift.outlet_id)) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;
  -- Kasir boleh menutup shift miliknya sendiri; menutup shift orang lain perlu owner/admin.
  if v_shift.opened_by <> auth.uid() and not public.can_manage(v_shift.outlet_id) then
    raise exception 'Hanya shift sendiri yang bisa ditutup' using errcode = '42501';
  end if;

  select coalesce(sum(total), 0) into v_in
  from public.transactions
  where outlet_id = v_shift.outlet_id and method = 'cash' and type = 'sale'
    and deleted_at is null and created_at >= v_shift.opened_at;

  select coalesce(sum(total), 0) into v_out
  from public.transactions
  where outlet_id = v_shift.outlet_id and method = 'cash' and type = 'expense'
    and deleted_at is null and created_at >= v_shift.opened_at;

  v_expected := v_shift.opening_cash + v_in - v_out;

  update public.shifts
  set closed_at = now(), closed_by = auth.uid(),
      closing_cash = greatest(coalesce(p_closing_cash, 0), 0),
      expected_cash = v_expected,
      difference = greatest(coalesce(p_closing_cash, 0), 0) - v_expected,
      note = p_note
  where id = p_shift
  returning * into v_shift;

  return v_shift;
end $$;

-- ---------------------------------------------------------------- stok manual & opname
create or replace function public.adjust_stock(p_product uuid, p_delta numeric, p_reason stock_reason default 'adjust', p_note text default null)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet uuid;
  v_stock  numeric;
begin
  select outlet_id into v_outlet from public.products where id = p_product and deleted_at is null;
  if v_outlet is null then
    raise exception 'Produk tidak ditemukan';
  end if;
  if not public.can_manage(v_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh menyesuaikan stok' using errcode = '42501';
  end if;
  if coalesce(p_delta, 0) = 0 then
    raise exception 'Perubahan stok tidak boleh 0';
  end if;

  insert into public.stock_moves (outlet_id, product_id, delta, reason, note, created_by)
  values (v_outlet, p_product, p_delta, coalesce(p_reason, 'adjust'), p_note, auth.uid());

  update public.products set stock = stock + p_delta where id = p_product
  returning stock into v_stock;

  return v_stock;
end $$;

-- ---------------------------------------------------------------- pembelian + HPP rata-rata
-- Menambah stok dan memperbarui harga pokok rata-rata bergerak:
--   cost_baru = (stok_lama * cost_lama + qty * cost_beli) / (stok_lama + qty)
create or replace function public.apply_purchase(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet   uuid := (p ->> 'outlet_id')::uuid;
  v_id       uuid;
  v_item     jsonb;
  v_pid      uuid;
  v_qty      numeric;
  v_cost     numeric;
  v_stock    numeric;
  v_old_cost numeric;
  v_new_cost numeric;
  v_total    numeric := 0;
begin
  if not public.can_manage(v_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh mencatat pembelian' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    v_total := v_total + (v_item ->> 'qty')::numeric * (v_item ->> 'cost')::numeric;
  end loop;

  insert into public.purchases (outlet_id, supplier_id, invoice_no, subtotal, total, paid_amount, purchased_at, note, created_by)
  values (
    v_outlet, nullif(p ->> 'supplier_id', '')::uuid, p ->> 'invoice_no',
    v_total, v_total, coalesce((p ->> 'paid_amount')::numeric, 0),
    coalesce((p ->> 'purchased_at')::timestamptz, now()), p ->> 'note', auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    v_pid  := (v_item ->> 'product_id')::uuid;
    v_qty  := (v_item ->> 'qty')::numeric;
    v_cost := (v_item ->> 'cost')::numeric;

    insert into public.purchase_items (purchase_id, product_id, qty, cost, subtotal)
    values (v_id, v_pid, v_qty, v_cost, v_qty * v_cost);

    select stock, cost_price into v_stock, v_old_cost
    from public.products where id = v_pid and outlet_id = v_outlet
    for update;

    if v_stock is null then
      raise exception 'Produk tidak ditemukan di outlet ini';
    end if;

    if v_stock + v_qty > 0 then
      v_new_cost := round((greatest(v_stock, 0) * v_old_cost + v_qty * v_cost) / (greatest(v_stock, 0) + v_qty), 2);
    else
      v_new_cost := v_cost;
    end if;

    insert into public.stock_moves (outlet_id, product_id, delta, reason, ref_id, created_by)
    values (v_outlet, v_pid, v_qty, 'purchase', v_id, auth.uid());

    update public.products
    set stock = stock + v_qty, cost_price = v_new_cost
    where id = v_pid;
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------- pendaftaran toko
-- Membuat outlet + menjadikan pemanggil sebagai owner dalam satu langkah.
create or replace function public.create_outlet(p_name text, p_code text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nama toko wajib diisi';
  end if;

  insert into public.outlets (name, code)
  values (trim(p_name), nullif(trim(p_code), ''))
  returning id into v_id;

  insert into public.members (outlet_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return v_id;
end $$;

-- ---------------------------------------------------------------- hak eksekusi
revoke all on function public.sync_transaction(jsonb) from public;
revoke all on function public.void_transaction(uuid, text) from public;
revoke all on function public.open_shift(uuid, numeric) from public;
revoke all on function public.close_shift(uuid, numeric, text) from public;
revoke all on function public.adjust_stock(uuid, numeric, stock_reason, text) from public;
revoke all on function public.apply_purchase(jsonb) from public;
revoke all on function public.create_outlet(text, text) from public;

grant execute on function public.sync_transaction(jsonb) to authenticated;
grant execute on function public.void_transaction(uuid, text) to authenticated;
grant execute on function public.open_shift(uuid, numeric) to authenticated;
grant execute on function public.close_shift(uuid, numeric, text) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, stock_reason, text) to authenticated;
grant execute on function public.apply_purchase(jsonb) to authenticated;
grant execute on function public.create_outlet(text, text) to authenticated;
