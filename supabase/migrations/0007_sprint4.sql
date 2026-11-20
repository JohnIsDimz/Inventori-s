-- 0007_sprint4.sql — diskon & pajak, laporan shift, audit yang lebih luas
--
-- Isi:
--   1. Kolom diskon/pajak di transactions + aturan hitung baru di sync_transaction
--   2. Audit otomatis untuk perubahan anggota & penyesuaian stok manual
--   3. shift_report() — rekap shift per periode (owner/admin)
--
-- Catatan keamanan: sebelumnya `discount` dan `tax` dikirim klien lalu DIPERCAYA
-- apa adanya. Sekarang server menghitung ulang dari aturan (persen/nominal + tarif),
-- jadi kasir tidak bisa mengakali total atau menghapus pajak.

-- ---------------------------------------------------------------- 1. kolom baru
alter table public.transactions
  add column if not exists discount_kind text not null default 'amount',
  add column if not exists discount_value numeric(14, 2) not null default 0,
  add column if not exists tax_rate numeric(5, 2) not null default 0;

alter table public.transactions
  drop constraint if exists transactions_discount_kind_chk,
  drop constraint if exists transactions_discount_value_chk,
  drop constraint if exists transactions_tax_rate_chk;

alter table public.transactions
  add constraint transactions_discount_kind_chk
    check (discount_kind in ('amount', 'percent')),
  add constraint transactions_discount_value_chk
    check (discount_value >= 0 and discount_value <= 100000000),
  add constraint transactions_tax_rate_chk
    check (tax_rate >= 0 and tax_rate <= 100);

-- Baris lama: anggap diskonnya nominal.
update public.transactions
   set discount_value = discount
 where discount_kind = 'amount' and discount_value = 0 and discount > 0;

-- ---------------------------------------------------------------- 2. sync_transaction
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
  v_discount numeric := 0;
  v_dkind    text := coalesce(p ->> 'discount_kind', 'amount');
  v_dvalue   numeric := 0;
  v_rate     numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric;
  v_item     jsonb;
  v_pid      uuid;
  v_qty      numeric;
  v_price    numeric;
  v_idisc    numeric;
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

  -- Subtotal = jumlah (qty x harga) dikurangi diskon per baris.
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb))
  loop
    v_qty := coalesce((v_item ->> 'qty')::numeric, 0);
    v_price := coalesce((v_item ->> 'price')::numeric, 0);
    v_idisc := coalesce((v_item ->> 'discount')::numeric, 0);
    if v_qty <= 0 then
      raise exception 'Jumlah barang harus lebih dari 0';
    end if;
    if v_price < 0 or v_idisc < 0 then
      raise exception 'Harga tidak boleh negatif' using errcode = '23514';
    end if;
    v_subtotal := v_subtotal + (v_qty * v_price) - v_idisc;
  end loop;

  v_subtotal := greatest(v_subtotal, 0);

  -- Diskon: nominal (dipangkas ke subtotal) atau persen 0..100.
  if v_dkind not in ('amount', 'percent') then
    raise exception 'Jenis diskon tidak dikenal' using errcode = '22023';
  end if;
  v_dvalue := coalesce(
    (p ->> 'discount_value')::numeric,
    (p ->> 'discount')::numeric,
    0
  );
  if v_dvalue < 0 then
    raise exception 'Diskon tidak boleh negatif' using errcode = '23514';
  end if;
  if v_dkind = 'percent' then
    if v_dvalue > 100 then
      raise exception 'Diskon persen maksimal 100' using errcode = '23514';
    end if;
    v_discount := round(v_subtotal * v_dvalue / 100.0, 2);
  else
    v_discount := least(v_dvalue, v_subtotal);
  end if;

  -- Pajak: tarif persen dari (subtotal - diskon). Klien lama yang mengirim
  -- nominal `tax` tanpa `tax_rate` tetap dilayani, tapi tidak bisa melebihi 100%.
  if p ? 'tax_rate' then
    v_rate := coalesce((p ->> 'tax_rate')::numeric, 0);
    if v_rate < 0 or v_rate > 100 then
      raise exception 'Tarif pajak harus 0-100%%' using errcode = '23514';
    end if;
    v_tax := round((v_subtotal - v_discount) * v_rate / 100.0, 2);
  else
    v_tax := greatest(coalesce((p ->> 'tax')::numeric, 0), 0);
    if v_tax > v_subtotal then
      v_tax := v_subtotal;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_tax;
  if v_total <= 0 then
    raise exception 'Total transaksi harus lebih dari 0';
  end if;

  insert into public.transactions (
    outlet_id, client_tx_id, shift_id, type, category_id, customer_id,
    subtotal, discount, discount_kind, discount_value, tax, tax_rate, total,
    method, note, items_count, created_by, created_at
  ) values (
    v_outlet, v_client, v_shift, v_tx_type,
    nullif(p ->> 'category_id', '')::uuid,
    nullif(p ->> 'customer_id', '')::uuid,
    v_subtotal, v_discount, v_dkind, v_dvalue, v_tax, v_rate, v_total,
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

-- ---------------------------------------------------------------- 3. audit lebih luas
-- a. Perubahan anggota (siapa menaikkan peran, siapa menonaktifkan)
create or replace function public.log_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, after)
    values (new.outlet_id, auth.uid(), 'member.add', 'members', new.id::text,
            jsonb_build_object('role', new.role, 'active', new.active));
    return new;
  end if;

  if old.role <> new.role then
    insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before, after)
    values (new.outlet_id, auth.uid(), 'member.role', 'members', new.id::text,
            jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
  end if;

  if old.active <> new.active then
    insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before, after)
    values (new.outlet_id, auth.uid(), 'member.active', 'members', new.id::text,
            jsonb_build_object('active', old.active), jsonb_build_object('active', new.active));
  end if;

  return new;
end $$;

drop trigger if exists members_audit on public.members;
create trigger members_audit
  after insert or update on public.members
  for each row execute function public.log_member_change();

-- b. Penyesuaian stok manual (opname / rusak / hilang). Penjualan tidak dicatat
--    di sini supaya audit tidak tenggelam oleh transaksi harian.
create or replace function public.log_stock_adjust()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before, after)
  values (
    new.outlet_id, auth.uid(), 'stock.adjust', 'products', new.product_id::text,
    jsonb_build_object('stock', (select stock - new.delta from public.products where id = new.product_id)),
    jsonb_build_object('stock', (select stock from public.products where id = new.product_id),
                       'delta', new.delta, 'reason', new.reason, 'note', new.note)
  );
  return new;
end $$;

drop trigger if exists stock_moves_audit on public.stock_moves;
create trigger stock_moves_audit
  after insert on public.stock_moves
  for each row
  when (new.reason in ('adjust', 'opname'))
  execute function public.log_stock_adjust();

-- ---------------------------------------------------------------- 4. laporan shift
-- Rekap per shift dalam rentang tanggal: berguna untuk setoran kas ke pemilik.
create or replace function public.shift_report(
  p_outlet uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  shift_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  opened_by_email text,
  opening_cash numeric,
  cash_sales numeric,
  cash_expenses numeric,
  expected_cash numeric,
  closing_cash numeric,
  difference numeric,
  tx_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage(p_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh melihat laporan shift'
      using errcode = '42501';
  end if;

  return query
    select
      s.id,
      s.opened_at,
      s.closed_at,
      u.email::text,
      s.opening_cash,
      coalesce((
        select sum(t.total) from public.transactions t
         where t.outlet_id = s.outlet_id and t.method = 'cash' and t.type = 'sale'
           and t.deleted_at is null
           and t.created_at >= s.opened_at
           and t.created_at <= coalesce(s.closed_at, now())
      ), 0),
      coalesce((
        select sum(t.total) from public.transactions t
         where t.outlet_id = s.outlet_id and t.method = 'cash' and t.type = 'expense'
           and t.deleted_at is null
           and t.created_at >= s.opened_at
           and t.created_at <= coalesce(s.closed_at, now())
      ), 0),
      s.expected_cash,
      s.closing_cash,
      s.difference,
      (
        select count(*) from public.transactions t
         where t.outlet_id = s.outlet_id and t.deleted_at is null
           and t.created_at >= s.opened_at
           and t.created_at <= coalesce(s.closed_at, now())
      )
    from public.shifts s
    left join auth.users u on u.id = s.opened_by
   where s.outlet_id = p_outlet
     and (p_from is null or s.opened_at >= p_from)
     and (p_to is null or s.opened_at <= p_to)
   order by s.opened_at desc;
end $$;

-- ---------------------------------------------------------------- hak eksekusi
revoke all on function public.shift_report(uuid, timestamptz, timestamptz) from public;
revoke all on function public.shift_report(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.shift_report(uuid, timestamptz, timestamptz) to authenticated;
