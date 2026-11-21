-- 0012_audit_fixes.sql — Perbaikan komprehensif hasil audit keamanan & logika bisnis
--
-- Mencakup:
--   1. Pencabutan hak eksekusi fungsi internal `_apply_stock` dari `anon` & `authenticated`
--   2. Pencegahan IDOR lintas outlet & pembatasan hapus pada `sync_order`
--   3. Pengetatan `sync_product` & kebijakan RLS (`products`, `receivables`, `payables`, `orders`)
--   4. Penguatan `create_invite` (CSPRNG + khusus owner untuk admin) & `redeem_invite`
--      (blokir reaktivasi anggota nonaktif & self-demotion owner + batas percobaan)
--   5. Validasi diskon baris, FK lintas outlet, stok khusus `sale`, & audit harga di `sync_transaction`
--   6. Penguncian shift tertutup & perhitungan kas cicilan kasbon/utang tunai di `sync_shift` / `close_shift`
--   7. Pembersihan residu perangkat (`devices`) & metadata pengguna pada `delete_my_account`

-- ================================================================ 1. _apply_stock
revoke all on function public._apply_stock(uuid, numeric, stock_reason, uuid, text) from public;
revoke all on function public._apply_stock(uuid, numeric, stock_reason, uuid, text) from anon, authenticated;

-- ================================================================ 2. RLS diperketat
-- Kasir tidak boleh menyisipkan produk dengan stok langsung (wajib lewat RPC agar tercatat di stock_moves)
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (
    public.can_manage(outlet_id)
    or (public.is_member(outlet_id) and coalesce(stock, 0) = 0)
  );

-- Kasir tidak boleh mem-void / menghapus piutang & utang atau mengubah nominal pokoknya
drop policy if exists receivables_update on public.receivables;
create policy receivables_update on public.receivables
  for update
  using (public.is_member(outlet_id))
  with check (
    public.can_manage(outlet_id)
    or (public.is_member(outlet_id) and status <> 'void' and deleted_at is null)
  );

drop policy if exists payables_update on public.payables;
create policy payables_update on public.payables
  for update
  using (public.is_member(outlet_id))
  with check (
    public.can_manage(outlet_id)
    or (public.is_member(outlet_id) and status <> 'void' and deleted_at is null)
  );

create or replace function public.guard_debt_mutation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.outlet_id <> new.outlet_id then
    raise exception 'Tidak boleh memindahkan data antar toko' using errcode = '42501';
  end if;
  if not public.can_manage(old.outlet_id) then
    if old.amount <> new.amount
       or (old.status <> 'void' and new.status = 'void')
       or (old.deleted_at is null and new.deleted_at is not null) then
      raise exception 'Hanya pemilik atau admin yang boleh mengubah pokok atau membatalkan catatan utang/kasbon'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_receivables on public.receivables;
create trigger trg_guard_receivables
  before update on public.receivables
  for each row execute function public.guard_debt_mutation();

drop trigger if exists trg_guard_payables on public.payables;
create trigger trg_guard_payables
  before update on public.payables
  for each row execute function public.guard_debt_mutation();

-- Pisahkan izin tulis vs hapus permanen pada orders & order_items
drop policy if exists orders_write on public.orders;
drop policy if exists orders_insert on public.orders;
drop policy if exists orders_update on public.orders;
drop policy if exists orders_delete on public.orders;

create policy orders_insert on public.orders
  for insert with check (public.is_member(outlet_id));

create policy orders_update on public.orders
  for update
  using (public.is_member(outlet_id))
  with check (
    public.can_manage(outlet_id)
    or (public.is_member(outlet_id) and deleted_at is null)
  );

create policy orders_delete on public.orders
  for delete using (public.can_manage(outlet_id));

drop policy if exists order_items_write on public.order_items;
drop policy if exists order_items_insert on public.order_items;
drop policy if exists order_items_update on public.order_items;
drop policy if exists order_items_delete on public.order_items;

create policy order_items_insert on public.order_items
  for insert with check (
    exists (select 1 from public.orders o where o.id = order_id and public.is_member(o.outlet_id))
  );

create policy order_items_update on public.order_items
  for update
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_member(o.outlet_id)))
  with check (exists (select 1 from public.orders o where o.id = order_id and public.is_member(o.outlet_id)));

create policy order_items_delete on public.order_items
  for delete using (
    exists (select 1 from public.orders o where o.id = order_id and public.can_manage(o.outlet_id))
  );

-- ================================================================ 3. sync_order (anti-IDOR)
create or replace function public.sync_order(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id        uuid := (p ->> 'id')::uuid;
  v_outlet    uuid := (p ->> 'outlet_id')::uuid;
  v_status    order_status := coalesce((p ->> 'status')::order_status, 'terbuka');
  v_tx        uuid := nullif(p ->> 'transaction_id', '')::uuid;
  v_deleted   timestamptz := nullif(p ->> 'deleted_at', '')::timestamptz;
  v_deposit   numeric(14, 2) := coalesce((p ->> 'deposit')::numeric, 0);
  v_total     numeric(14, 2) := 0;
  v_items     jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_existing  public.orders;
  v_item      jsonb;
  v_name      text;
  v_qty       numeric;
  v_price     numeric;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;
  if v_id is null or v_outlet is null then
    raise exception 'Pesanan tanpa id/outlet tidak bisa disimpan';
  end if;
  if not public.is_member(v_outlet) then
    raise exception 'Bukan anggota toko ini' using errcode = '42501';
  end if;

  -- Cek kepemilikan ID lebih dulu untuk mencegah penimpaan pesanan toko lain (IDOR)
  select * into v_existing from public.orders where id = v_id for update;
  if v_existing.id is not null and v_existing.outlet_id <> v_outlet then
    raise exception 'Pesanan bukan milik toko ini' using errcode = '42501';
  end if;

  if v_deleted is not null and not public.can_manage(v_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh menghapus pesanan' using errcode = '42501';
  end if;

  if length(trim(coalesce(p ->> 'customer_name', ''))) = 0 then
    raise exception 'Nama pelanggan wajib diisi';
  end if;
  if jsonb_array_length(v_items) = 0 and v_deleted is null then
    raise exception 'Pesanan harus punya minimal satu barang';
  end if;
  if v_status = 'selesai' and v_tx is null then
    raise exception 'Pesanan selesai harus menunjuk transaksi';
  end if;
  if v_tx is not null and not exists (
    select 1 from public.transactions t where t.id = v_tx and t.outlet_id = v_outlet
  ) then
    raise exception 'Transaksi rujukan bukan milik toko ini' using errcode = '42501';
  end if;
  if v_deposit < 0 then
    raise exception 'Uang muka tidak boleh negatif';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where nullif(item ->> 'product_id', '') is not null
      and not exists (
        select 1 from public.products pr
        where pr.id = (item ->> 'product_id')::uuid and pr.outlet_id = v_outlet
      )
  ) then
    raise exception 'Ada barang yang bukan milik toko ini';
  end if;

  insert into public.orders (
    id, outlet_id, customer_name, customer_phone, note, due_date, status,
    total, deposit, transaction_id, created_by, created_at, updated_at, deleted_at
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
    now(),
    v_deleted
  )
  on conflict (id) do update set
    customer_name  = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    note           = excluded.note,
    due_date       = excluded.due_date,
    status         = excluded.status,
    transaction_id = excluded.transaction_id,
    updated_at     = now(),
    deleted_at     = excluded.deleted_at
  where public.orders.outlet_id = v_outlet;

  if not found then
    raise exception 'Pesanan bukan milik toko ini' using errcode = '42501';
  end if;

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

  if v_deposit > v_total and v_deleted is null then
    raise exception 'Uang muka (%) melebihi total pesanan (%)', v_deposit, v_total;
  end if;

  update public.orders
     set total = v_total,
         deposit = least(v_deposit, v_total)
   where id = v_id and outlet_id = v_outlet;

  return v_id;
end $$;

revoke all on function public.sync_order(jsonb) from public;
grant execute on function public.sync_order(jsonb) to authenticated;

-- ================================================================ 4. sync_product
create or replace function public.sync_product(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet   uuid := (p ->> 'outlet_id')::uuid;
  v_id       uuid := (p ->> 'id')::uuid;
  v_existing public.products;
  v_delta    numeric := coalesce((p ->> 'stock_delta')::numeric, 0);
  v_reason   stock_reason := coalesce((p ->> 'stock_reason')::stock_reason, 'opening');
  v_ref      uuid := nullif(p ->> 'stock_ref', '')::uuid;
  v_wprice   numeric := nullif(p ->> 'wholesale_price', '')::numeric;
  v_wqty     numeric := nullif(p ->> 'wholesale_min_qty', '')::numeric;
  v_name     text := coalesce(p ->> 'name', 'Barang');
  v_unit     text := coalesce(p ->> 'unit', 'pcs');
  v_barcode  text := nullif(p ->> 'barcode', '');
  v_min      numeric := coalesce((p ->> 'min_stock')::numeric, 0);
  v_cost     numeric := coalesce((p ->> 'cost_price')::numeric, 0);
  v_sell     numeric := coalesce((p ->> 'sell_price')::numeric, 0);
begin
  if auth.uid() is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'id produk wajib dikirim';
  end if;
  if not public.is_member(v_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;
  if v_cost < 0 or v_sell < 0 or v_min < 0 then
    raise exception 'Harga atau stok minimum tidak boleh negatif' using errcode = '23514';
  end if;

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

  select * into v_existing from public.products where id = v_id for update;
  if v_existing.id is not null and v_existing.outlet_id <> v_outlet then
    raise exception 'Produk milik outlet lain' using errcode = '42501';
  end if;

  if not public.can_manage(v_outlet) then
    if v_existing.id is not null then
      -- Kasir dilarang mengubah harga barang yang sudah ada
      if v_existing.sell_price <> coalesce((p ->> 'sell_price')::numeric, v_existing.sell_price)
         or v_existing.cost_price <> coalesce((p ->> 'cost_price')::numeric, v_existing.cost_price)
         or v_existing.wholesale_price is distinct from v_wprice
         or v_existing.wholesale_min_qty is distinct from v_wqty
         or v_existing.deleted_at is not null then
        raise exception 'Hanya pemilik atau admin yang boleh mengubah harga' using errcode = '42501';
      end if;
      -- Kasir juga tidak boleh memodifikasi atribut katalog atau menambah stok barang lama lewat sync_product
      if v_existing.name <> v_name
         or v_existing.unit <> v_unit
         or v_existing.barcode is distinct from v_barcode
         or v_existing.min_stock <> v_min
         or v_delta <> 0 then
        raise exception 'Hanya pemilik atau admin yang boleh mengubah data atau stok barang'
          using errcode = '42501';
      end if;
    else
      -- Saat kasir mendaftarkan barang baru (mis. pindai barcode baru), stok awal tidak boleh minus dan wajib bertipe opening
      if v_delta < 0 or v_reason <> 'opening' then
        raise exception 'Kasir hanya boleh mengisi stok awal positif untuk barang baru'
          using errcode = '42501';
      end if;
    end if;
  end if;

  insert into public.products (
    id, outlet_id, name, unit, barcode, cost_price, sell_price, min_stock,
    wholesale_price, wholesale_min_qty, created_by
  )
  values (
    v_id, v_outlet,
    v_name, v_unit, v_barcode, v_cost, v_sell, v_min,
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
    deleted_at        = null
  where public.products.outlet_id = v_outlet;

  if v_delta <> 0 then
    perform public._apply_stock(v_id, v_delta, v_reason, v_ref, null);
  end if;

  return v_id;
end $$;

revoke all on function public.sync_product(jsonb) from public;
grant execute on function public.sync_product(jsonb) to authenticated;

-- ================================================================ 5. Undangan anggota
create table if not exists public.invite_attempts (
  id           bigserial primary key,
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists invite_attempts_user_time_idx
  on public.invite_attempts (user_id, attempted_at desc);

alter table public.invite_attempts enable row level security;

create or replace function public.create_invite(
  p_outlet uuid,
  p_role   member_role default 'kasir',
  p_hours  int default 72
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_try  int := 0;
  v_is_owner boolean;
begin
  if not public.can_manage(p_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh mengundang anggota'
      using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Undangan untuk peran owner tidak diizinkan' using errcode = '42501';
  end if;

  if p_role = 'admin' then
    select exists (
      select 1 from public.members
      where outlet_id = p_outlet and user_id = auth.uid() and active = true and role = 'owner'
    ) into v_is_owner;

    if not v_is_owner then
      raise exception 'Hanya pemilik toko yang boleh mengundang admin'
        using errcode = '42501';
    end if;
  end if;

  loop
    v_try := v_try + 1;
    -- gen_random_uuid() memakai CSPRNG OS (pg_strong_random), jauh lebih aman dari md5(random())
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.invites where code = v_code);
    if v_try > 20 then
      raise exception 'Gagal membuat kode undangan, coba lagi';
    end if;
  end loop;

  insert into public.invites (outlet_id, code, role, expires_at, created_by)
  values (
    p_outlet,
    v_code,
    p_role,
    now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 72), 720))),
    auth.uid()
  );

  return v_code;
end $$;

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_clean   text := upper(trim(coalesce(p_code, '')));
  v_invite  public.invites;
  v_member  public.members;
  v_recent  int := 0;
begin
  if v_uid is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('invite:' || v_uid::text));
  select count(*) into v_recent
  from public.invite_attempts
  where user_id = v_uid and attempted_at > now() - interval '15 minutes';

  if v_recent >= 5 then
    return null; -- no exception: attempts must not be rolled back
  end if;

  insert into public.invite_attempts (user_id) values (v_uid);
  if length(v_clean) = 0 then return null; end if;

  select * into v_invite
  from public.invites
  where code = v_clean
  for update;

  if v_invite.id is null then return null; end if;
  if v_invite.used_at is not null then
    raise exception 'Kode undangan ini sudah dipakai';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Kode undangan sudah kedaluwarsa';
  end if;

  -- Cegah reaktivasi mandiri anggota yang sudah dinonaktifkan & cegah owner menurunkan perannya sendiri
  select * into v_member
  from public.members
  where outlet_id = v_invite.outlet_id and user_id = v_uid
  for update;

  if v_member.id is not null then
    if not v_member.active then
      raise exception 'Keanggotaan Anda di toko ini sudah dinonaktifkan. Hubungi pemilik toko.'
        using errcode = '42501';
    end if;
    raise exception 'Anda sudah terdaftar sebagai anggota toko ini.'
      using errcode = '23505';
  end if;

  insert into public.members (outlet_id, user_id, role, active)
  values (v_invite.outlet_id, v_uid, v_invite.role, true);

  update public.invites
  set used_by = v_uid, used_at = now()
  where id = v_invite.id;

  return v_invite.outlet_id;
end $$;

-- ================================================================ 6. sync_transaction & void_transaction
create or replace function public.sync_transaction(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet     uuid := (p ->> 'outlet_id')::uuid;
  v_client     uuid := (p ->> 'client_tx_id')::uuid;
  v_existing_o uuid;
  v_id         uuid;
  v_shift      uuid;
  v_cat        uuid := nullif(p ->> 'category_id', '')::uuid;
  v_cust       uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_tx_type    tx_type := coalesce((p ->> 'type')::tx_type, 'sale');
  v_subtotal   numeric := 0;
  v_discount   numeric := 0;
  v_dkind      text := coalesce(p ->> 'discount_kind', 'amount');
  v_dvalue     numeric := 0;
  v_rate       numeric := 0;
  v_tax        numeric := 0;
  v_total      numeric;
  v_has_items  boolean := jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) > 0;
  v_item       jsonb;
  v_pid        uuid;
  v_qty        numeric;
  v_price      numeric;
  v_cost       numeric;
  v_idisc      numeric;
  v_prod_row   public.products;
  v_min_valid  numeric;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;

  if not public.is_member(v_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;

  if v_client is not null then
    select id, outlet_id into v_id, v_existing_o
    from public.transactions
    where client_tx_id = v_client;

    if v_id is not null then
      if v_existing_o <> v_outlet then
        raise exception 'client_tx_id sudah dipakai di outlet lain' using errcode = '42501';
      end if;
      return v_id;
    end if;
  end if;

  v_shift := nullif(p ->> 'shift_id', '')::uuid;
  if v_shift is not null then
    if not exists (select 1 from public.shifts where id = v_shift and outlet_id = v_outlet) then
      raise exception 'Shift bukan milik toko ini' using errcode = '42501';
    end if;
  else
    select id into v_shift from public.shifts where outlet_id = v_outlet and closed_at is null;
  end if;

  if v_cat is not null and not exists (
    select 1 from public.categories where id = v_cat and outlet_id = v_outlet
  ) then
    v_cat := null;
  end if;

  if v_cust is not null and not exists (
    select 1 from public.customers where id = v_cust and outlet_id = v_outlet
  ) then
    v_cust := null;
  end if;

  if v_has_items then
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
      if v_idisc > (v_qty * v_price) then
        raise exception 'Diskon barang tidak boleh melebihi harga baris' using errcode = '23514';
      end if;
      v_subtotal := v_subtotal + (v_qty * v_price) - v_idisc;
    end loop;
  else
    -- Transaksi cepat tanpa rincian barang (mis. pengeluaran listrik atau penjualan cepat dari Catat)
    v_subtotal := greatest(coalesce((p ->> 'subtotal')::numeric, (p ->> 'amount')::numeric, 0), 0);
  end if;

  v_subtotal := greatest(v_subtotal, 0);

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
    v_cat,
    v_cust,
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
    v_price := (v_item ->> 'price')::numeric;
    v_idisc := coalesce((v_item ->> 'discount')::numeric, 0);
    v_cost := greatest(coalesce((v_item ->> 'cost')::numeric, 0), 0);

    if v_pid is not null then
      select * into v_prod_row
      from public.products
      where id = v_pid and outlet_id = v_outlet and deleted_at is null
      for update;

      if v_prod_row.id is null then
        raise exception 'Produk tidak ditemukan di outlet ini';
      end if;

      -- Gunakan harga modal katalog server bila klien tidak mengirimkannya
      if (v_item ->> 'cost') is null then
        v_cost := v_prod_row.cost_price;
      end if;

      if v_tx_type = 'sale' then
        if v_prod_row.stock < v_qty then
          raise exception 'Stok % tidak cukup (tersisa %)', v_prod_row.name, v_prod_row.stock
            using errcode = '22000';
        end if;

        -- Catat jejak audit bila kasir menjual di bawah harga katalog/grosir
        v_min_valid := case
          when v_prod_row.wholesale_price is not null
               and v_prod_row.wholesale_min_qty is not null
               and v_qty >= v_prod_row.wholesale_min_qty
          then least(v_prod_row.sell_price, v_prod_row.wholesale_price)
          else v_prod_row.sell_price
        end;

        if not public.can_manage(v_outlet) and v_price < v_min_valid then
          insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before, after)
          values (
            v_outlet, auth.uid(), 'transaction.price_override', 'transactions', v_id::text,
            jsonb_build_object('product_id', v_pid, 'catalog_price', v_min_valid),
            jsonb_build_object('sold_price', v_price, 'qty', v_qty)
          );
        end if;

        insert into public.stock_moves (outlet_id, product_id, delta, reason, ref_id, created_by)
        values (v_outlet, v_pid, -v_qty, 'sale', v_id, auth.uid())
        on conflict do nothing;

        update public.products set stock = stock - v_qty where id = v_pid;
      end if;
    end if;

    insert into public.transaction_items (transaction_id, product_id, name, qty, price, cost, discount)
    values (
      v_id, v_pid, coalesce(v_item ->> 'name', 'Barang'), v_qty,
      v_price, v_cost, v_idisc
    );
  end loop;

  return v_id;
end $$;

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

  if v_tx.type = 'sale' then
    for v_item in select * from public.transaction_items where transaction_id = p_tx loop
      if v_item.product_id is not null then
        insert into public.stock_moves (outlet_id, product_id, delta, reason, ref_id, note, created_by)
        values (v_tx.outlet_id, v_item.product_id, v_item.qty, 'void', p_tx, p_reason, auth.uid())
        on conflict do nothing;

        update public.products set stock = stock + v_item.qty where id = v_item.product_id;
      end if;
    end loop;
  end if;

  update public.transactions
  set deleted_at = now(),
      note = nullif(concat_ws(' | ', note, case when p_reason is null then null else 'void: ' || p_reason end), '')
  where id = p_tx;
end $$;

-- Preserve non-cash debt offsets across devices (return credit / historical deposit).
alter table public.receivable_payments add column if not exists source text
  check (source in ('deposit', 'retur'));
alter table public.payable_payments add column if not exists source text
  check (source in ('deposit', 'retur'));

create or replace function public.touch_payment_parent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'receivable_payments' then
    if tg_op <> 'INSERT' then
      update public.receivables set updated_at = now() where id = old.receivable_id;
    end if;
    if tg_op <> 'DELETE' then
      update public.receivables set updated_at = now() where id = new.receivable_id;
    end if;
  else
    if tg_op <> 'INSERT' then
      update public.payables set updated_at = now() where id = old.payable_id;
    end if;
    if tg_op <> 'DELETE' then
      update public.payables set updated_at = now() where id = new.payable_id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_payment_parent on public.receivable_payments;
create trigger trg_payment_parent after insert or update or delete on public.receivable_payments
  for each row execute function public.touch_payment_parent();
drop trigger if exists trg_payment_parent on public.payable_payments;
create trigger trg_payment_parent after insert or update or delete on public.payable_payments
  for each row execute function public.touch_payment_parent();

-- ================================================================ 7. Shift kasir (termasuk cicilan tunai)
create or replace function public.close_shift(p_shift uuid, p_closing_cash numeric, p_note text default null)
returns public.shifts
language plpgsql security definer set search_path = public
as $$
declare
  v_shift     public.shifts;
  v_now       timestamptz := now();
  v_in        numeric := 0;
  v_out       numeric := 0;
  v_rcv_in    numeric := 0;
  v_pay_out   numeric := 0;
  v_expected  numeric;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if v_shift.id is null then
    raise exception 'Shift tidak ditemukan';
  end if;
  if v_shift.closed_at is not null then
    raise exception 'Shift ini sudah ditutup';
  end if;
  if not public.is_member(v_shift.outlet_id) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;
  if v_shift.opened_by <> auth.uid() and not public.can_manage(v_shift.outlet_id) then
    raise exception 'Hanya shift sendiri yang bisa ditutup' using errcode = '42501';
  end if;

  select coalesce(sum(total), 0) into v_in
  from public.transactions
  where outlet_id = v_shift.outlet_id and method = 'cash' and type = 'sale'
    and deleted_at is null and created_at >= v_shift.opened_at and created_at <= v_now;

  select coalesce(sum(total), 0) into v_out
  from public.transactions
  where outlet_id = v_shift.outlet_id and method = 'cash' and type = 'expense'
    and deleted_at is null and created_at >= v_shift.opened_at and created_at <= v_now;

  select coalesce(sum(rp.amount), 0) into v_rcv_in
  from public.receivable_payments rp
  join public.receivables r on r.id = rp.receivable_id
  where r.outlet_id = v_shift.outlet_id and r.deleted_at is null and r.status <> 'void'
    and rp.method = 'cash' and rp.source is null and rp.paid_at >= v_shift.opened_at and rp.paid_at <= v_now;

  select coalesce(sum(pp.amount), 0) into v_pay_out
  from public.payable_payments pp
  join public.payables py on py.id = pp.payable_id
  where py.outlet_id = v_shift.outlet_id and py.deleted_at is null and py.status <> 'void'
    and pp.method = 'cash' and pp.source is null and pp.paid_at >= v_shift.opened_at and pp.paid_at <= v_now;

  v_expected := v_shift.opening_cash + v_in + v_rcv_in - v_out - v_pay_out;

  update public.shifts
  set closed_at     = v_now,
      closed_by     = auth.uid(),
      closing_cash  = greatest(coalesce(p_closing_cash, 0), 0),
      expected_cash = v_expected,
      difference    = greatest(coalesce(p_closing_cash, 0), 0) - v_expected,
      note          = p_note
  where id = p_shift
  returning * into v_shift;

  return v_shift;
end $$;

create or replace function public.sync_shift(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_outlet      uuid := (p ->> 'outlet_id')::uuid;
  v_id          uuid := (p ->> 'id')::uuid;
  v_opened_at   timestamptz := coalesce((p ->> 'opened_at')::timestamptz, now());
  v_closed_at   timestamptz := nullif(p ->> 'closed_at', '')::timestamptz;
  v_opening     numeric := greatest(coalesce((p ->> 'opening_cash')::numeric, 0), 0);
  v_closing     numeric := nullif(p ->> 'closing_cash', '')::numeric;
  v_note        text := nullif(p ->> 'note', '');
  v_existing    public.shifts;
  v_other_open  uuid;
  v_eff_open_at timestamptz;
  v_eff_opening numeric;
  v_in          numeric := 0;
  v_out         numeric := 0;
  v_rcv_in      numeric := 0;
  v_pay_out     numeric := 0;
  v_expected    numeric;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'id shift wajib dikirim';
  end if;
  if not public.is_member(v_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;

  select * into v_existing from public.shifts where id = v_id for update;

  if v_existing.id is null then
    select id into v_other_open
    from public.shifts
    where outlet_id = v_outlet and closed_at is null
    limit 1;

    if v_other_open is not null and v_closed_at is null then
      raise exception 'Sudah ada shift terbuka di outlet ini. Tutup dulu shift tersebut.'
        using errcode = '23505';
    end if;

    insert into public.shifts (id, outlet_id, opened_by, opened_at, opening_cash, note)
    values (v_id, v_outlet, auth.uid(), v_opened_at, v_opening, v_note);

    v_eff_open_at := v_opened_at;
    v_eff_opening := v_opening;
  else
    if v_existing.outlet_id <> v_outlet then
      raise exception 'Shift milik outlet lain' using errcode = '42501';
    end if;

    -- Shift yang sudah ditutup bersifat final (kecuali kiriman ulang idempoten dengan closing_cash sama)
    if v_existing.closed_at is not null then
      if v_closed_at is not null
         and v_existing.closing_cash = greatest(coalesce(v_closing, 0), 0) then
        return v_id;
      end if;
      raise exception 'Shift yang sudah ditutup tidak dapat diubah lagi'
        using errcode = '42501';
    end if;

    if v_closed_at is not null
       and v_existing.opened_by <> auth.uid()
       and not public.can_manage(v_outlet) then
      raise exception 'Hanya shift sendiri yang bisa ditutup' using errcode = '42501';
    end if;

    -- Pertahankan waktu buka & modal awal asli yang tercatat saat shift dibuka
    v_eff_open_at := v_existing.opened_at;
    v_eff_opening := case
      when public.can_manage(v_outlet) and v_closed_at is null then v_opening
      else v_existing.opening_cash
    end;
  end if;

  if v_closed_at is not null then
    if v_closed_at < v_eff_open_at then
      v_closed_at := now();
    end if;

    select coalesce(sum(total), 0) into v_in
    from public.transactions
    where outlet_id = v_outlet and method = 'cash' and type = 'sale'
      and deleted_at is null and created_at >= v_eff_open_at and created_at <= v_closed_at;

    select coalesce(sum(total), 0) into v_out
    from public.transactions
    where outlet_id = v_outlet and method = 'cash' and type = 'expense'
      and deleted_at is null and created_at >= v_eff_open_at and created_at <= v_closed_at;

    select coalesce(sum(rp.amount), 0) into v_rcv_in
    from public.receivable_payments rp
    join public.receivables r on r.id = rp.receivable_id
    where r.outlet_id = v_outlet and r.deleted_at is null and r.status <> 'void'
      and rp.method = 'cash' and rp.source is null and rp.paid_at >= v_eff_open_at and rp.paid_at <= v_closed_at;

    select coalesce(sum(pp.amount), 0) into v_pay_out
    from public.payable_payments pp
    join public.payables py on py.id = pp.payable_id
    where py.outlet_id = v_outlet and py.deleted_at is null and py.status <> 'void'
      and pp.method = 'cash' and pp.source is null and pp.paid_at >= v_eff_open_at and pp.paid_at <= v_closed_at;

    v_expected := v_eff_opening + v_in + v_rcv_in - v_out - v_pay_out;

    update public.shifts
    set closed_at     = v_closed_at,
        closed_by     = auth.uid(),
        closing_cash  = greatest(coalesce(v_closing, 0), 0),
        expected_cash = v_expected,
        difference    = greatest(coalesce(v_closing, 0), 0) - v_expected,
        note          = coalesce(v_note, note)
    where id = v_id;
  else
    update public.shifts
    set opening_cash = v_eff_opening,
        note         = coalesce(v_note, note)
    where id = v_id;
  end if;

  return v_id;
end $$;

-- ================================================================ 8. delete_my_account (residu perangkat & metadata)
create or replace function public.delete_my_account()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_preview jsonb;
  v_outlets int := 0;
  v_members int := 0;
  v_ids uuid[] := '{}';
begin
  if v_me is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;

  v_preview := public.account_delete_preview();
  if not (v_preview ->> 'can_delete')::boolean then
    raise exception '%', v_preview ->> 'reason';
  end if;

  select count(*) into v_members from public.members where user_id = v_me;

  insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before)
  values (null, v_me, 'account.delete', 'profile', v_me::text, v_preview);

  select coalesce(array_agg(m.outlet_id), '{}') into v_ids
  from public.members m
  where m.user_id = v_me and m.role = 'owner' and m.active;

  delete from public.transaction_items ti
    using public.transactions t
    where ti.transaction_id = t.id and t.outlet_id = any(v_ids);
  delete from public.purchase_items pi
    using public.purchases p
    where pi.purchase_id = p.id and p.outlet_id = any(v_ids);

  with gone as (
    delete from public.outlets o where o.id = any(v_ids) returning o.id
  )
  select count(*) into v_outlets from gone;

  delete from public.members where user_id = v_me;
  delete from public.devices where user_id = v_me;
  delete from public.invite_attempts where user_id = v_me;
  delete from public.profiles where id = v_me;

  -- Bersihkan metadata profil pada skema auth tanpa memutus integritas tabel auth.users
  update auth.users set raw_user_meta_data = '{}'::jsonb where id = v_me;

  return jsonb_build_object(
    'outlets_deleted', v_outlets,
    'memberships_removed', v_members
  );
end $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
