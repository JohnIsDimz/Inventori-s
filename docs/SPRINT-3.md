# Sprint 3 — Shift Kasir, Undang Anggota, Audit Log

Tanggal: 19 November 2026
Status: **selesai dan teruji** (56 pemeriksaan database + 10 pemeriksaan mapper + uji alur di browser, 0 error).

---

## 1. Tiga hal yang diselesaikan

| Fitur | Masalah nyata yang dijawab |
| --- | --- |
| **Shift kasir** | "Uang di laci seharusnya berapa, dan kurang/lebih berapa?" — tanpa ini, selisih kas hanya jadi tuduhan tanpa bukti |
| **Undang anggota** | Karyawan memakai akun pemilik, atau pemilik menyerahkan HP-nya. Sekarang tiap orang punya akun & perannya sendiri |
| **Audit log** | "Siapa yang menurunkan harga Indomie jadi Rp 3.000?" — sebelumnya tidak ada jejaknya |

---

## 2. Shift kasir

### Alur

1. Kasir membuka shift dengan **modal awal** (uang tunai di laci).
2. Selama shift, semua transaksi tunai dihitung.
3. Saat tutup, kasir memasukkan **uang fisik**. Aplikasi & server menghitung:

```
kas seharusnya = modal awal + penjualan tunai − pengeluaran tunai
selisih        = uang fisik − kas seharusnya
```

Kasbon, QRIS, dan transfer **tidak** dihitung karena bukan uang fisik di laci.

### Di mana aturannya dijaga

- Klien menghitung untuk tampilan instan (`shiftCash()` di `src/data/selectors.ts`).
- Server menghitung ulang saat menutup lewat RPC `sync_shift` — angka dari HP tidak
  dipercaya. Diuji: modal 50.000, tutup 52.000 → `expected_cash = 50000`,
  `difference = 2000`.
- Hanya boleh **satu shift terbuka per outlet** (dijaga unique index + pesan jelas).
- Menutup shift **milik orang lain** butuh owner/admin; kasir hanya bisa menutup shiftnya sendiri.
- Shift tersimpan lokal (bisa dibuka/tutup saat offline) lalu dikirim sebagai
  entitas antrean `shift`.

### Tampilan

`app/shift.tsx` — kartu ringkasan (dibuka, modal awal, penjualan tunai,
pengeluaran tunai, kas seharusnya), form tutup shift, dan riwayat 10 shift
terakhir dengan lencana **Pas / Lebih Rp X / Kurang Rp X**.

Masuk dari: Beranda → aksi cepat **Shift**, atau Pengaturan → **Tim & keamanan → Shift kasir**.

---

## 3. Undang anggota (kode undangan)

### Kenapa bukan "buat akun dari aplikasi"

Membuat akun `auth.users` dari klien butuh **service_role key**, dan kunci itu
tidak boleh ada di aplikasi (siapa pun bisa membongkar APK). Jadi alurnya:

```
Pemilik                     Calon anggota
  │  Buat kode 8 karakter (sekali pakai, 72 jam)
  ├──────────── kirim via WhatsApp ────────────►
  │                              Daftar (email + kata sandi + kode)
  │                              redeem_invite(code)
  ▼                                        │
  anggota aktif dengan peran kasir/admin ◄──┘
```

### Yang dijaga server

- `create_invite` hanya owner/admin; **peran owner tidak bisa diundang**.
- Kode sekali pakai (`used_at`), punya masa berlaku, dan unik (diulang maks. 20 kali bila bentrok).
- `redeem_invite` menandai kode terpakai dan membuat baris `members` (`on conflict` → mengaktifkan kembali anggota lama).
- `outlet_members` mengembalikan email anggota (join `auth.users` lewat security definer, karena `profiles` hanya bisa dibaca pemiliknya sendiri).
- `set_member_role` / `set_member_active` hanya owner, dan **pemilik terakhir tidak bisa diturunkan atau dinonaktifkan** (mencegah toko terkunci).

### Tampilan

- `app/anggota.tsx` — daftar anggota + email + peran, tombol jadikan admin/kasir & nonaktifkan, pembuat kode undangan dengan tombol **Bagikan** (share sheet).
- `app/daftar.tsx` — pendaftaran dengan kolom kode undangan opsional. Tanpa kode: pengguna jadi pemilik toko baru (dibuat di layar Akun).
- `app/masuk.tsx` — tautan ke layar Daftar.

---

## 4. Audit log

- Sumber: `audit_logs` yang diisi **trigger** (`product.update` saat harga berubah,
  `product.delete`) dan **RPC** (`transaction.void`).
- RPC baru `audit_feed(p_outlet, p_limit)` mengembalikan 100 catatan terakhir
  beserta **email pelaku**; hanya owner/admin (diuji: kasir ditolak).
- `app/audit.tsx` menampilkan: aksi dalam bahasa manusia ("Harga jual Rp 3.500 → Rp 3.000"),
  waktu, email pelaku, dan nama entitas. Ada tombol muat ulang.

Di mode lokal layar ini menjelaskan dengan jujur bahwa audit butuh server (karena
dibuat oleh database), bukan menampilkan daftar kosong yang membingungkan.

---

## 5. Berkas baru / berubah

| Berkas | Isi |
| --- | --- |
| `supabase/migrations/0005_sprint3.sql` | **baru** — `sync_shift`, `audit_feed`, `invites`, `create_invite`, `redeem_invite`, `outlet_members`, `set_member_role`, `set_member_active` |
| `supabase/tests/backend.test.mjs` | +19 pemeriksaan (total **56**) |
| `supabase/tests/mappers.test.mts` | +1 pemeriksaan shift (total **10**) |
| `app/shift.tsx` | **baru** — buka/tutup shift + riwayat |
| `app/anggota.tsx` | **baru** — kelola anggota & kode undangan |
| `app/audit.tsx` | **baru** — log audit |
| `app/daftar.tsx` | **baru** — pendaftaran + tukar kode undangan |
| `src/data/types.ts` | tipe `Shift`, `shifts` di state tersimpan, `RemotePatch.shifts` |
| `src/data/store.ts` | `openShift`, `closeShift`, `shifts` di state/partialize/merge |
| `src/data/selectors.ts` | `activeShift()`, `shiftCash()` |
| `src/services/sync/{mappers,engine,outbox}.ts` | entitas `shift`, `sync_shift`, tarik 50 shift terakhir |
| `src/utils/permissions.ts` | kasir boleh `shift.manage`; `audit.view` untuk owner/admin |
| `app/(tabs)/index.tsx` | aksi cepat **Shift** |
| `app/pengaturan.tsx` | bagian **Tim & keamanan** (Shift, Anggota, Log audit) |
| `app/_layout.tsx`, `app/masuk.tsx` | rute baru + tautan Daftar |

---

## 6. Hasil verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run test:db` | **56/56 lulus** |
| `npm run test:mappers` | **10/10 lulus** |
| `npx tsc --noEmit` | bersih |
| `npx expo export --platform web` / `android` | berhasil |
| Alur aplikasi di browser | 10 pemeriksaan, **0 error konsol** |

Pemeriksaan baru (server):

1. Shift terbuka dengan modal 50.000; shift kedua ditolak ("Sudah ada shift terbuka").
2. Tutup shift 52.000 → kas seharusnya 50.000, selisih +2.000.
3. Audit feed berisi catatan dan **email pelaku**; kasir ditolak.
4. Kasir tidak boleh membuat undangan; owner mendapat kode 8 karakter.
5. Menukar kode menjadikan anggota dengan peran kasir; kode tidak bisa dipakai dua kali.
6. `outlet_members` mengembalikan 3 anggota beserta email.
7. Owner bisa menaikkan peran jadi admin; **pemilik terakhir tidak bisa diturunkan**.
8. Bukan owner tidak bisa mengubah peran; owner bisa menonaktifkan anggota.

Pemeriksaan baru (aplikasi):

- Tile **Shift** muncul di Beranda ("Buka laci").
- Buka shift 50.000 → status "Shift sedang berjalan", kas seharusnya Rp 50.000.
- Tutup dengan uang fisik 52.000 → riwayat menampilkan **Lebih Rp 2.000**; form buka shift kembali muncul.
- Antrean sinkron berisi dua op `shift` (buka & tutup, yang kedua punya `closedAt`).
- Pengaturan menampilkan tiga baris baru; Anggota & Log audit menjelaskan kebutuhan mode cloud.

Tangkapan layar: `docs/screenshots/22-shift-berjalan.png`, `23-shift-ditutup.png`,
`24-anggota-mode-lokal.png`, `25-audit-mode-lokal.png`.

---

## 7. Menerapkan di proyek Supabase Anda

1. Jalankan `0005_sprint3.sql` di **SQL Editor** (0001–0004 tidak perlu diulang).
2. Alur uji dua akun:
   - Masuk sebagai owner → **Pengaturan → Anggota toko → Buat kode undangan**.
   - Di HP lain: **Daftar** → isi email, kata sandi, dan kode → otomatis masuk sebagai kasir.
3. Uji shift: buka shift 50.000 → catat penjualan tunai 30.000 → tutup dengan uang fisik 80.000 → selisih Rp 0.
4. Uji audit: ubah harga barang sebagai owner → buka **Log audit** → catatan
   "Harga jual … → …" dengan email Anda.

---

## 8. Batasan yang masih ada

1. **Shift tidak memisahkan transaksi per kasir di server**: `transactions.shift_id`
   terisi otomatis hanya untuk shift yang sedang terbuka saat transaksi dikirim
   (transaksi offline lama bisa masuk setelah shift ditutup).
2. **Undangan belum dikirim otomatis** lewat WhatsApp API — kode dibagikan lewat
   share sheet (WhatsApp/SMS/apa pun).
3. **Riwayat shift** diambil 50 terakhir; belum ada laporan shift per periode.
4. **Audit belum mencakup semua aksi** — baru perubahan harga/penghapusan barang
   dan void transaksi. Perubahan anggota & stok manual belum dicatat.
5. **Belum diuji ke Supabase hidup** (semua uji memakai Postgres asli via PGlite
   dengan stub `auth.uid()`); alur daftar/login sungguhan perlu dicoba sekali.

---

## 9. Usulan sprint 4

1. Diskon & pajak per transaksi (nominal, %, diskon per item) — paling sering diminta saat demo.
2. Harga bertingkat: umum / grosir / member (tabel `price_tiers` sudah ada).
3. Laporan shift per periode + setoran kas ke bank.
4. Audit untuk perubahan anggota & stok manual.
