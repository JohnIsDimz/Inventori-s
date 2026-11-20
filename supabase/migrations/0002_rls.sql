-- Inventori's — 0002: Row Level Security
-- Aturan besar:
--   * Kasir  : baca semua data outletnya, tulis transaksi lewat RPC, tidak boleh ubah harga/void.
--   * Admin  : seperti kasir + kelola produk, kasbon, utang, shift, void transaksi.
--   * Owner  : semua, termasuk mengelola anggota.
--   * Tidak ada satu pun policy yang membiarkan lintas outlet: semua lewat helper is_member/has_role.

-- ---------------------------------------------------------------- helper
create or replace function public.is_member(p_outlet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.outlet_id = p_outlet and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function public.has_role(p_outlet uuid, p_roles member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.outlet_id = p_outlet and m.user_id = auth.uid() and m.active
      and m.role = any (p_roles)
  );
$$;

create or replace function public.can_manage(p_outlet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_outlet, array['owner', 'admin']::member_role[]);
$$;

create or replace function public.is_owner(p_outlet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_outlet, array['owner']::member_role[]);
$$;

-- ---------------------------------------------------------------- outlets
alter table public.outlets enable row level security;

drop policy if exists outlets_read on public.outlets;
create policy outlets_read on public.outlets
  for select using (public.is_member(id));

drop policy if exists outlets_update on public.outlets;
create policy outlets_update on public.outlets
  for update using (public.can_manage(id)) with check (public.can_manage(id));

drop policy if exists outlets_insert on public.outlets;
create policy outlets_insert on public.outlets
  for insert with check (auth.uid() is not null);

-- ---------------------------------------------------------------- profiles
alter table public.profiles enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select using (id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------- members
alter table public.members enable row level security;

drop policy if exists members_read on public.members;
create policy members_read on public.members
  for select using (user_id = auth.uid() or public.is_member(outlet_id));

drop policy if exists members_write on public.members;
create policy members_write on public.members
  for all using (public.is_owner(outlet_id)) with check (public.is_owner(outlet_id));

-- ---------------------------------------------------------------- kategori
alter table public.categories enable row level security;

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select using (public.is_member(outlet_id));
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

-- ---------------------------------------------------------------- produk
alter table public.products enable row level security;

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select using (public.is_member(outlet_id));

-- Kasir hanya boleh menambah produk baru (stok masuk) tapi tidak mengubah harga.
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (public.is_member(outlet_id));

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (public.can_manage(outlet_id));

-- price_tiers
alter table public.price_tiers enable row level security;
drop policy if exists price_tiers_read on public.price_tiers;
create policy price_tiers_read on public.price_tiers
  for select using (exists (select 1 from public.products p where p.id = product_id and public.is_member(p.outlet_id)));
drop policy if exists price_tiers_write on public.price_tiers;
create policy price_tiers_write on public.price_tiers
  for all using (exists (select 1 from public.products p where p.id = product_id and public.can_manage(p.outlet_id)))
  with check (exists (select 1 from public.products p where p.id = product_id and public.can_manage(p.outlet_id)));

-- ---------------------------------------------------------------- stok
alter table public.stock_moves enable row level security;

drop policy if exists stock_moves_read on public.stock_moves;
create policy stock_moves_read on public.stock_moves
  for select using (public.is_member(outlet_id));
-- Sengaja TIDAK ada policy insert: stok hanya bergerak lewat RPC security definer.

-- ---------------------------------------------------------------- shift
alter table public.shifts enable row level security;

drop policy if exists shifts_read on public.shifts;
create policy shifts_read on public.shifts
  for select using (public.is_member(outlet_id));

-- ---------------------------------------------------------------- pelanggan
alter table public.customers enable row level security;

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers
  for select using (public.is_member(outlet_id));
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all using (public.is_member(outlet_id)) with check (public.is_member(outlet_id));

-- ---------------------------------------------------------------- transaksi
alter table public.transactions enable row level security;

-- Kasir melihat transaksi outletnya, TAPI kolom laba tidak dikirim ke perangkat kasir
-- (aplikasi tidak meminta harga modal bila peran bukan owner/admin).
drop policy if exists transactions_read on public.transactions;
create policy transactions_read on public.transactions
  for select using (public.is_member(outlet_id));

-- Void/hapus hanya owner & admin. Insert hanya lewat RPC sync_transaction.
drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions
  for update using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

alter table public.transaction_items enable row level security;
drop policy if exists tx_items_read on public.transaction_items;
create policy tx_items_read on public.transaction_items
  for select using (exists (
    select 1 from public.transactions t where t.id = transaction_id and public.is_member(t.outlet_id)
  ));
-- Insert lewat RPC saja.

-- ---------------------------------------------------------------- kasbon / utang
alter table public.receivables enable row level security;
drop policy if exists receivables_read on public.receivables;
create policy receivables_read on public.receivables
  for select using (public.is_member(outlet_id));
drop policy if exists receivables_insert on public.receivables;
create policy receivables_insert on public.receivables
  for insert with check (public.is_member(outlet_id));
drop policy if exists receivables_update on public.receivables;
create policy receivables_update on public.receivables
  for update using (public.is_member(outlet_id)) with check (public.is_member(outlet_id));
drop policy if exists receivables_delete on public.receivables;
create policy receivables_delete on public.receivables
  for delete using (public.can_manage(outlet_id));

alter table public.receivable_payments enable row level security;
drop policy if exists rp_read on public.receivable_payments;
create policy rp_read on public.receivable_payments
  for select using (exists (
    select 1 from public.receivables r where r.id = receivable_id and public.is_member(r.outlet_id)
  ));
drop policy if exists rp_write on public.receivable_payments;
create policy rp_write on public.receivable_payments
  for insert with check (exists (
    select 1 from public.receivables r where r.id = receivable_id and public.is_member(r.outlet_id)
  ));

alter table public.suppliers enable row level security;
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers
  for select using (public.is_member(outlet_id));
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers
  for all using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

alter table public.payables enable row level security;
drop policy if exists payables_read on public.payables;
create policy payables_read on public.payables
  for select using (public.is_member(outlet_id));
drop policy if exists payables_write on public.payables;
create policy payables_write on public.payables
  for all using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

alter table public.payable_payments enable row level security;
drop policy if exists pp_read on public.payable_payments;
create policy pp_read on public.payable_payments
  for select using (exists (
    select 1 from public.payables p where p.id = payable_id and public.is_member(p.outlet_id)
  ));
drop policy if exists pp_write on public.payable_payments;
create policy pp_write on public.payable_payments
  for insert with check (exists (
    select 1 from public.payables p where p.id = payable_id and public.can_manage(p.outlet_id)
  ));

-- ---------------------------------------------------------------- pembelian
alter table public.purchases enable row level security;
drop policy if exists purchases_read on public.purchases;
create policy purchases_read on public.purchases
  for select using (public.is_member(outlet_id));
drop policy if exists purchases_write on public.purchases;
create policy purchases_write on public.purchases
  for all using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

alter table public.purchase_items enable row level security;
drop policy if exists purchase_items_read on public.purchase_items;
create policy purchase_items_read on public.purchase_items
  for select using (exists (
    select 1 from public.purchases pu where pu.id = purchase_id and public.is_member(pu.outlet_id)
  ));

-- ---------------------------------------------------------------- audit & perangkat
alter table public.audit_logs enable row level security;
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs
  for select using (public.can_manage(outlet_id));
-- Insert hanya dari trigger/RPC (security definer).

alter table public.devices enable row level security;
drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices
  for select using (user_id = auth.uid() or public.is_owner(outlet_id));
drop policy if exists devices_write on public.devices;
create policy devices_write on public.devices
  for all using (user_id = auth.uid() or public.is_owner(outlet_id))
  with check (user_id = auth.uid() or public.is_owner(outlet_id));
