-- 0009_sprint7.sql — kendali akun & kepatuhan (UU PDP)
--
-- Yang ditambahkan:
--   1. transfer_ownership  — pemilik menyerahkan toko ke anggota lain
--   2. leave_outlet        — kasir/admin keluar dari toko
--   3. account_delete_preview — apa yang akan hilang bila akun dihapus
--   4. delete_my_account   — hapus data akun (hak penghapusan UU PDP)
--   5. audit action account.delete / member.leave / ownership.transfer
--
-- Catatan penting: baris di `auth.users` hanya bisa dihapus dengan service_role
-- (tidak boleh ada di klien). Fungsi di bawah menghapus SEMUA data milik toko
-- dan profil; akun login menjadi kosong (tanpa outlet) dan bisa dipakai membuat
-- toko baru. Penghapusan baris auth dijadwalkan di sisi server.

-- ---------------------------------------------------------------- serah terima
create or replace function public.transfer_ownership(p_outlet uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;
  if v_me = p_to then
    raise exception 'Toko ini sudah milik Anda';
  end if;
  if not public.has_role(p_outlet, array['owner']::member_role[]) then
    raise exception 'Hanya pemilik yang boleh menyerahkan toko' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members
    where outlet_id = p_outlet and user_id = p_to and active
  ) then
    raise exception 'Anggota tujuan tidak aktif di toko ini';
  end if;

  update public.members set role = 'admin' where outlet_id = p_outlet and user_id = v_me;
  update public.members set role = 'owner' where outlet_id = p_outlet and user_id = p_to;

  insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, after)
  values (p_outlet, v_me, 'ownership.transfer', 'members', p_to::text,
          jsonb_build_object('new_owner', p_to, 'previous_owner', v_me));
end $$;

-- ---------------------------------------------------------------- keluar toko
create or replace function public.leave_outlet(p_outlet uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_member public.members;
begin
  if v_me is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;

  select * into v_member from public.members
  where outlet_id = p_outlet and user_id = v_me and active
  for update;

  if v_member.id is null then
    raise exception 'Anda bukan anggota aktif toko ini';
  end if;
  if v_member.role = 'owner' then
    raise exception 'Pemilik tidak bisa keluar. Serahkan toko ke anggota lain dulu.';
  end if;

  delete from public.members where id = v_member.id;

  insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before)
  values (p_outlet, v_me, 'member.leave', 'members', v_member.id::text,
          jsonb_build_object('role', v_member.role, 'user_id', v_me));
end $$;

-- ---------------------------------------------------------------- pratinjau hapus
create or replace function public.account_delete_preview()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_owned int := 0;
  v_blocked int := 0;
  v_members int := 0;
  v_blocker text := null;
begin
  if v_me is null then
    raise exception 'Harus masuk dulu' using errcode = '42501';
  end if;

  select count(*) into v_members from public.members where user_id = v_me and active;

  select count(*) into v_owned
  from public.members m
  where m.user_id = v_me and m.active and m.role = 'owner';

  -- Toko yang masih punya anggota lain tidak boleh hilang begitu saja.
  select count(*), min(o.name) into v_blocked, v_blocker
  from public.members me
  join public.outlets o on o.id = me.outlet_id
  where me.user_id = v_me
    and me.active
    and me.role = 'owner'
    and exists (
      select 1 from public.members other
      where other.outlet_id = me.outlet_id and other.user_id <> v_me and other.active
    );

  if v_blocked > 0 then
    return jsonb_build_object(
      'can_delete', false,
      'outlets_owned', v_owned,
      'memberships', v_members,
      'blocked_outlets', v_blocked,
      'reason', format(
        'Toko "%s" masih punya anggota lain. Serahkan kepemilikan atau nonaktifkan anggota dulu.',
        coalesce(v_blocker, 'tanpa nama')
      )
    );
  end if;

  return jsonb_build_object(
    'can_delete', true,
    'outlets_owned', v_owned,
    'memberships', v_members,
    'blocked_outlets', 0,
    'reason', null
  );
end $$;

-- ---------------------------------------------------------------- hapus akun
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

  -- Jejak audit dibuat lebih dulu: setelah outlet dihapus, log ikut terhapus
  -- karena `on delete cascade`, jadi salinannya disimpan tanpa outlet.
  insert into public.audit_logs (outlet_id, actor, action, entity, entity_id, before)
  values (null, v_me, 'account.delete', 'profile', v_me::text, v_preview);

  -- Toko yang tinggal saya satu-satunya: seluruh data toko ikut dihapus.
  select coalesce(array_agg(m.outlet_id), '{}') into v_ids
  from public.members m
  where m.user_id = v_me and m.role = 'owner' and m.active;

  -- `transaction_items.product_id` dan `purchase_items.product_id` tidak memakai
  -- `on delete cascade`, jadi baris item dihapus lebih dulu supaya penghapusan
  -- barang tidak ditolak foreign key.
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

  delete from public.profiles where id = v_me;

  return jsonb_build_object(
    'outlets_deleted', v_outlets,
    'memberships_removed', v_members
  );
end $$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.leave_outlet(uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.account_delete_preview() to authenticated;

comment on function public.delete_my_account() is
  'Hak penghapusan UU PDP: hapus toko milik sendiri + seluruh keanggotaan + profil.';
