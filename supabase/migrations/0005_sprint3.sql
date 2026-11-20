-- Inventori's — 0005: sprint 3
-- Isi:
--   1. `sync_shift` — buka/tutup shift dari aplikasi (idempoten, bisa offline).
--   2. `audit_feed` — umpan audit log untuk pemilik (dengan email pelaku).
--   3. Undangan anggota: tabel `invites` + `create_invite` / `redeem_invite`,
--      serta `outlet_members`, `set_member_role`, `set_member_active`.
--
-- Kenapa undangan berbasis kode, bukan "buat user dari aplikasi":
-- membuat akun auth butuh service_role key, yang TIDAK BOLEH ada di aplikasi.
-- Alur yang aman: pemilik membuat kode 8 karakter (sekali pakai, kedaluwarsa),
-- calon anggota mendaftar sendiri lalu menukarkan kode → langsung jadi anggota
-- outlet dengan peran yang ditentukan.

-- ---------------------------------------------------------------- shift
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
  v_in          numeric := 0;
  v_out         numeric := 0;
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

  select * into v_existing from public.shifts where id = v_id;

  if v_existing.id is null then
    -- Hanya boleh ada satu shift terbuka per outlet.
    select id into v_other_open
    from public.shifts
    where outlet_id = v_outlet and closed_at is null
    limit 1;

    if v_other_open is not null and v_closed_at is null then
      raise exception 'Sudah ada shift terbuka di outlet ini. Tutup dulu shift tersebut.'
        using errcode = '23505';
    end if;

    insert into public.shifts (id, outlet_id, opened_by, opened_at, opening_cash)
    values (v_id, v_outlet, auth.uid(), v_opened_at, v_opening);
  else
    if v_existing.outlet_id <> v_outlet then
      raise exception 'Shift milik outlet lain' using errcode = '42501';
    end if;
    -- Menutup shift orang lain perlu owner/admin.
    if v_closed_at is not null
       and v_existing.opened_by <> auth.uid()
       and not public.can_manage(v_outlet) then
      raise exception 'Hanya shift sendiri yang bisa ditutup' using errcode = '42501';
    end if;
  end if;

  if v_closed_at is not null then
    select coalesce(sum(total), 0) into v_in
    from public.transactions
    where outlet_id = v_outlet and method = 'cash' and type = 'sale'
      and deleted_at is null and created_at >= v_opened_at and created_at <= v_closed_at;

    select coalesce(sum(total), 0) into v_out
    from public.transactions
    where outlet_id = v_outlet and method = 'cash' and type = 'expense'
      and deleted_at is null and created_at >= v_opened_at and created_at <= v_closed_at;

    v_expected := v_opening + v_in - v_out;

    update public.shifts
    set closed_at     = v_closed_at,
        closed_by     = auth.uid(),
        closing_cash  = greatest(coalesce(v_closing, 0), 0),
        expected_cash = v_expected,
        difference    = greatest(coalesce(v_closing, 0), 0) - v_expected,
        note          = v_note
    where id = v_id;
  else
    update public.shifts
    set opening_cash = v_opening,
        note         = coalesce(v_note, note)
    where id = v_id;
  end if;

  return v_id;
end $$;

-- ---------------------------------------------------------------- audit feed
-- Mengembalikan audit log beserta email pelaku. Tabel `profiles` hanya bisa
-- dibaca pemiliknya sendiri (RLS), jadi email diambil dari auth.users lewat
-- fungsi security definer ini — hanya untuk owner/admin outlet terkait.
create or replace function public.audit_feed(p_outlet uuid, p_limit int default 100)
returns table (
  id          bigint,
  at          timestamptz,
  actor_email text,
  action      text,
  entity      text,
  entity_id   text,
  before      jsonb,
  after       jsonb
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.can_manage(p_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh melihat audit log'
      using errcode = '42501';
  end if;

  return query
  select a.id, a.at, coalesce(u.email, 'perangkat'), a.action, a.entity, a.entity_id, a.before, a.after
  from public.audit_logs a
  left join auth.users u on u.id = a.actor
  where a.outlet_id = p_outlet
  order by a.at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- ---------------------------------------------------------------- undangan
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid not null references public.outlets (id) on delete cascade,
  code       text not null unique,
  role       member_role not null default 'kasir',
  expires_at timestamptz not null default now() + interval '72 hours',
  used_by    uuid references auth.users (id),
  used_at    timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists invites_outlet_idx on public.invites (outlet_id);

alter table public.invites enable row level security;

drop policy if exists invites_read on public.invites;
create policy invites_read on public.invites
  for select using (public.can_manage(outlet_id));

drop policy if exists invites_write on public.invites;
create policy invites_write on public.invites
  for all using (public.can_manage(outlet_id)) with check (public.can_manage(outlet_id));

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
begin
  if not public.can_manage(p_outlet) then
    raise exception 'Hanya pemilik atau admin yang boleh mengundang anggota'
      using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Undangan untuk peran owner tidak diizinkan';
  end if;

  loop
    v_try := v_try + 1;
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text || v_try::text), 1, 8));
    exit when not exists (select 1 from public.invites where code = v_code);
    if v_try > 20 then
      raise exception 'Gagal membuat kode undangan, coba lagi';
    end if;
  end loop;

  insert into public.invites (outlet_id, code, role, expires_at, created_by)
  values (p_outlet, v_code, p_role, now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 72), 720))), auth.uid());

  return v_code;
end $$;

create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_invite public.invites;
begin
  if auth.uid() is null then
    raise exception 'Belum masuk' using errcode = '42501';
  end if;

  select * into v_invite
  from public.invites
  where code = upper(trim(p_code))
  for update;

  if v_invite.id is null then
    raise exception 'Kode undangan tidak ditemukan';
  end if;
  if v_invite.used_at is not null then
    raise exception 'Kode undangan ini sudah dipakai';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Kode undangan sudah kedaluwarsa';
  end if;

  insert into public.members (outlet_id, user_id, role, active)
  values (v_invite.outlet_id, auth.uid(), v_invite.role, true)
  on conflict (outlet_id, user_id) do update set role = excluded.role, active = true;

  update public.invites
  set used_by = auth.uid(), used_at = now()
  where id = v_invite.id;

  return v_invite.outlet_id;
end $$;

-- ---------------------------------------------------------------- anggota
create or replace function public.outlet_members(p_outlet uuid)
returns table (
  member_id  uuid,
  user_id    uuid,
  email      text,
  role       member_role,
  active     boolean,
  created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_member(p_outlet) then
    raise exception 'Tidak punya akses ke outlet ini' using errcode = '42501';
  end if;

  return query
  select m.id, m.user_id, coalesce(u.email, 'tanpa email'), m.role, m.active, m.created_at
  from public.members m
  left join auth.users u on u.id = m.user_id
  where m.outlet_id = p_outlet
  order by m.created_at asc;
end $$;

create or replace function public.set_member_role(p_member uuid, p_role member_role)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member public.members;
  v_owners int;
begin
  select * into v_member from public.members where id = p_member for update;
  if v_member.id is null then
    raise exception 'Anggota tidak ditemukan';
  end if;
  if not public.is_owner(v_member.outlet_id) then
    raise exception 'Hanya pemilik yang boleh mengubah peran' using errcode = '42501';
  end if;

  if v_member.role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owners
    from public.members
    where outlet_id = v_member.outlet_id and role = 'owner' and active;
    if v_owners <= 1 then
      raise exception 'Tidak bisa menurunkan peran pemilik terakhir';
    end if;
  end if;

  update public.members set role = p_role where id = p_member;
end $$;

create or replace function public.set_member_active(p_member uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member public.members;
  v_owners int;
begin
  select * into v_member from public.members where id = p_member for update;
  if v_member.id is null then
    raise exception 'Anggota tidak ditemukan';
  end if;
  if not public.is_owner(v_member.outlet_id) then
    raise exception 'Hanya pemilik yang boleh mengubah status anggota' using errcode = '42501';
  end if;

  if v_member.role = 'owner' and coalesce(p_active, false) = false then
    select count(*) into v_owners
    from public.members
    where outlet_id = v_member.outlet_id and role = 'owner' and active;
    if v_owners <= 1 then
      raise exception 'Tidak bisa menonaktifkan pemilik terakhir';
    end if;
  end if;

  update public.members set active = coalesce(p_active, false) where id = p_member;
end $$;

-- ---------------------------------------------------------------- hak eksekusi
revoke all on function public.sync_shift(jsonb) from public;
revoke all on function public.audit_feed(uuid, int) from public;
revoke all on function public.create_invite(uuid, member_role, int) from public;
revoke all on function public.redeem_invite(text) from public;
revoke all on function public.outlet_members(uuid) from public;
revoke all on function public.set_member_role(uuid, member_role) from public;
revoke all on function public.set_member_active(uuid, boolean) from public;

grant execute on function public.sync_shift(jsonb) to authenticated;
grant execute on function public.audit_feed(uuid, int) to authenticated;
grant execute on function public.create_invite(uuid, member_role, int) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.outlet_members(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, member_role) to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
