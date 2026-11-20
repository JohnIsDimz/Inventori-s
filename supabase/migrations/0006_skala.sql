-- 0006_skala.sql — fondasi agar satu database aman dipakai banyak toko
--
-- Isi:
--   0. Perbaikan bug: kolom updated_at yang hilang (capital_allocations, shifts)
--   1. Indeks untuk pola tarik-sinkron (outlet_id, updated_at)
--   2. prune_old_data()  — pembersihan data lama berbasis kebijakan retensi
--   3. outlet_usage()    — pemakaian data per outlet (untuk kuota & tagihan)
--
-- Semua aditif: tidak mengubah angka yang sudah ada.

-- -------------------------------------------------- 0. kolom updated_at hilang
-- BUG YANG DIPERBAIKI DI SINI:
-- Klien menarik data dengan `updated_at > cursor` untuk semua tabel bisnis.
-- `capital_allocations` (0004) dan `shifts` (0001) dibuat tanpa kolom updated_at,
-- sehingga tarikan ke dua tabel itu gagal (42703) dan seluruh putaran sinkron
-- ikut berhenti. Diuji di bagian 21.
alter table public.capital_allocations
  add column if not exists updated_at timestamptz not null default now();
alter table public.shifts
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists capital_allocations_touch on public.capital_allocations;
create trigger capital_allocations_touch
  before update on public.capital_allocations
  for each row execute function public.touch_updated_at();

drop trigger if exists shifts_touch on public.shifts;
create trigger shifts_touch
  before update on public.shifts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- 1. indeks
-- Klien menarik data dengan: outlet_id = ? and updated_at > ? order by updated_at limit 300
-- Tanpa indeks komposit, Postgres memakai products_outlet_idx lalu menyortir seluruh
-- baris outlet itu setiap tarikan. Dengan indeks ini, tarikan jadi index-only scan.
create index if not exists products_outlet_updated_idx
  on public.products (outlet_id, updated_at);
create index if not exists categories_outlet_updated_idx
  on public.categories (outlet_id, updated_at);
create index if not exists transactions_outlet_updated_idx
  on public.transactions (outlet_id, updated_at);
create index if not exists receivables_outlet_updated_idx
  on public.receivables (outlet_id, updated_at);
create index if not exists payables_outlet_updated_idx
  on public.payables (outlet_id, updated_at);
create index if not exists capital_allocations_outlet_updated_idx
  on public.capital_allocations (outlet_id, updated_at);
create index if not exists shifts_outlet_updated_idx
  on public.shifts (outlet_id, updated_at);

-- Jejak audit & kode undangan tumbuh paling cepat karena tidak pernah dipakai ulang.
create index if not exists invites_expires_idx on public.invites (expires_at);
create index if not exists audit_actor_idx on public.audit_logs (actor, at desc);

-- ---------------------------------------------------------------- 2. retensi
-- Kebijakan yang dipakai:
--   * stock_moves  : detail gerak stok 180 hari (stok terkini ada di products.stock,
--                    jadi menghapus riwayat lama tidak merusak angka stok)
--   * audit_logs   : 365 hari (kebutuhan pemeriksaan biasanya 1 tahun)
--   * invites      : kode terpakai/kedaluwarsa > 30 hari
--   * transaksi, kasbon, shift: TIDAK PERNAH dihapus otomatis (data keuangan)
--
-- Jalankan terjadwal (pg_cron), contoh tiap Senin 03:00 WIB:
--   select cron.schedule('prune', '0 20 * * 0', $$select public.prune_old_data()$$);
create or replace function public.prune_old_data(
  p_stock_days int default 180,
  p_audit_days int default 365
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moves bigint;
  v_audit bigint;
  v_invites bigint;
begin
  if p_stock_days < 30 or p_audit_days < 90 then
    raise exception 'Retensi terlalu pendek (stok >= 30 hari, audit >= 90 hari)'
      using errcode = '22023';
  end if;

  delete from public.stock_moves
   where created_at < now() - make_interval(days => p_stock_days);
  get diagnostics v_moves = row_count;

  delete from public.audit_logs
   where at < now() - make_interval(days => p_audit_days);
  get diagnostics v_audit = row_count;

  delete from public.invites
   where expires_at < now() - interval '30 days'
      or (used_at is not null and used_at < now() - interval '30 days');
  get diagnostics v_invites = row_count;

  return jsonb_build_object(
    'stock_moves', v_moves,
    'audit_logs', v_audit,
    'invites', v_invites,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.prune_old_data(int, int) from public;
revoke all on function public.prune_old_data(int, int) from anon, authenticated;
-- service_role hanya ada di Supabase/self-host lengkap; jaga agar migrasi tetap
-- bisa dijalankan di Postgres minimal (mis. harness uji PGlite).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.prune_old_data(int, int) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------- 3. pemakaian
-- Dipakai layar Pengaturan → "Pemakaian data" dan (nanti) penagihan per toko.
-- Angka byte adalah perkiraan: Postgres tidak menyimpan ukuran per tenant.
create or replace function public.outlet_usage(p_outlet uuid)
returns table (
  outlet_id uuid,
  outlet_name text,
  products bigint,
  transactions bigint,
  stock_moves bigint,
  audit_rows bigint,
  members bigint,
  first_record timestamptz,
  est_mb numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role member_role;
  v_name text;
begin
  select m.role into v_role
    from public.members m
   where m.outlet_id = p_outlet and m.user_id = auth.uid() and m.active
   limit 1;

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Hanya pemilik/admin yang bisa melihat pemakaian data'
      using errcode = '42501';
  end if;

  select o.name into v_name from public.outlets o where o.id = p_outlet;

  return query
    select
      p_outlet,
      v_name,
      (select count(*) from public.products p where p.outlet_id = p_outlet),
      (select count(*) from public.transactions t where t.outlet_id = p_outlet),
      (select count(*) from public.stock_moves sm where sm.outlet_id = p_outlet),
      (select count(*) from public.audit_logs al where al.outlet_id = p_outlet),
      (select count(*) from public.members mb where mb.outlet_id = p_outlet),
      (select min(t.created_at) from public.transactions t where t.outlet_id = p_outlet),
      -- 700 byte/transaksi (header + rata-rata 3 item), 220 byte/gerak stok,
      -- 400 byte/audit, 900 byte/barang (termasuk teks).
      round((
        (select count(*) from public.transactions t where t.outlet_id = p_outlet) * 700
        + (select count(*) from public.stock_moves sm where sm.outlet_id = p_outlet) * 220
        + (select count(*) from public.audit_logs al where al.outlet_id = p_outlet) * 400
        + (select count(*) from public.products p where p.outlet_id = p_outlet) * 900
      ) / 1048576.0, 2);
end;
$$;

revoke all on function public.outlet_usage(uuid) from public;
revoke all on function public.outlet_usage(uuid) from anon;
grant execute on function public.outlet_usage(uuid) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.outlet_usage(uuid) to service_role;
  end if;
end $$;
