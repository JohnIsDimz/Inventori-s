# Backend Inventori's (Supabase)

Folder ini berisi **seluruh backend** aplikasi: skema database, kebijakan keamanan
(RLS), dan fungsi transaksional (RPC). Tidak ada server sendiri yang perlu
dirawat — Supabase menyediakan Postgres, Auth, dan Storage.

```
supabase/
├── migrations/
│   ├── 0001_init.sql    # tabel, indeks, trigger updated_at + audit
│   ├── 0002_rls.sql     # helper is_member/has_role + policy per tabel
│   ├── 0003_rpc.sql     # sync_transaction, void_transaction, shift, stok, pembelian
│   ├── 0004_sprint2.sql # delta stok (sync_product/apply_stock_delta), alokasi modal, realtime
│   ├── 0005_sprint3.sql # shift kasir (sync_shift), undangan anggota, audit feed
│   ├── 0006_skala.sql   # indeks tarik-sinkron, retensi (prune), pemakaian per outlet
│   ├── 0007_sprint4.sql # diskon & pajak, audit anggota/stok, laporan shift
│   ├── 0008_sprint5.sql # harga grosir per barang (wholesale_price/min_qty)
│   ├── 0009_sprint7.sql # serah terima toko, keluar toko, hapus akun (UU PDP)
│   └── 0010_sprint8.sql # pesanan/kuotasi + sync_order (stok & omzet tidak bergerak)
└── tests/
    ├── backend.test.mjs # migrasi + RLS + RPC dijalankan di Postgres asli (PGlite)
    └── mappers.test.mts # bentuk data klien ↔ kolom tabel
```

---

## 1. Menyiapkan proyek (sekali, ± 15 menit)

1. Buat akun di [supabase.com](https://supabase.com) → **New project**.
   Catat **Project URL** dan **anon public key** (Settings → API).
2. Buka **SQL Editor**, lalu tempel isi kelima berkas migrasi **berurutan**:
   `0001_init.sql` → `0002_rls.sql` → `0003_rpc.sql` → `0004_sprint2.sql` →
   `0005_sprint3.sql` → `0006_skala.sql` → `0007_sprint4.sql` → `0008_sprint5.sql` →
   `0009_sprint7.sql` → `0010_sprint8.sql` → **Run**.
   (Atau lewat CLI: `supabase link` lalu `supabase db push`.)
3. Buat akun pemilik toko: **Authentication → Users → Add user** (email + kata sandi).
   Trigger `on_auth_user_created` otomatis membuat baris `profiles`.
4. Isi berkas `.env` di akar proyek (lihat `.env.example`):

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

5. Bangun ulang aplikasi: `npx expo prebuild --clean && npx expo run:android`.
   Setelah variabel terisi, aplikasi menampilkan layar masuk.
   Login → layar **Akun & Sinkron** → tombol **Buat toko** (akun otomatis jadi *owner*).

> `anon key` aman dipasang di aplikasi karena semua akses dibatasi RLS.
> **Jangan pernah** menaruh `service_role key` di aplikasi.

---

## 2. Cara kerja keamanannya

| Peran | Boleh |
| --- | --- |
| **Kasir** | Lihat produk, transaksi, kasbon outletnya; membuat penjualan (lewat RPC); mencatat pembayaran kasbon |
| **Admin** | Semua di atas + ubah/hapus produk, void transaksi, penyesuaian stok, catat pembelian, buka/tutup shift |
| **Owner** | Semua + mengelola anggota (`members`) dan melihat audit log |

Yang dijaga di sisi database, bukan hanya di UI:

- `transactions` **tidak punya policy INSERT** untuk klien. Satu-satunya jalan
  masuk adalah RPC `sync_transaction()` yang memeriksa keanggotaan, menghitung
  total sendiri, mengunci baris stok (`FOR UPDATE`), dan menolak bila stok kurang.
- `stock_moves` juga tanpa policy INSERT: stok tidak bisa "dikarang" dari klien.
- `products` UPDATE hanya untuk owner/admin, jadi kasir tidak bisa menurunkan
  harga lalu belanja sendiri.
- Setiap user hanya melihat baris dengan `outlet_id` tempat ia menjadi anggota —
  diuji: user outlet lain melihat 0 produk dan 0 transaksi.
- `void_transaction()` dan `adjust_stock()` memeriksa peran **dan** menulis
  `audit_logs`.

---

## 3. Fungsi RPC yang tersedia

| Fungsi | Dipakai aplikasi untuk | Catatan |
| --- | --- | --- |
| `sync_transaction(p jsonb)` | semua penjualan/pengeluaran dari kasir & catat | idempoten lewat `client_tx_id` |
| `void_transaction(p_tx, p_reason)` | hapus transaksi | mengembalikan stok + audit |
| `open_shift(p_outlet, p_opening_cash)` | buka shift kasir | satu shift terbuka per outlet |
| `close_shift(p_shift, p_closing_cash, p_note)` | tutup shift | hitung kas seharusnya & selisih |
| `adjust_stock(p_product, p_delta, p_reason, p_note)` | stok masuk/keluar manual, opname | owner/admin saja |
| `apply_purchase(p jsonb)` | catat kulakan | memperbarui HPP rata-rata bergerak |
| `create_outlet(p_name, p_code)` | buat toko pertama | pemanggil otomatis jadi owner |
| `sync_product(p jsonb)` | tambah/ubah barang | **tidak menyentuh stok**; kirim `stock_delta` + `stock_ref` bila ada perubahan stok |
| `sync_shift(p jsonb)` | buka & tutup shift kasir | menghitung kas seharusnya + selisih; satu shift terbuka per outlet |
| `audit_feed(p_outlet, p_limit)` | log audit + email pelaku | owner/admin saja |
| `create_invite(p_outlet, p_role, p_hours)` | kode undangan 8 karakter | sekali pakai, default 72 jam |
| `redeem_invite(p_code)` | tukar kode → jadi anggota | dipakai dari layar Daftar |
| `outlet_members(p_outlet)` | daftar anggota + email | semua anggota boleh melihat |
| `set_member_role` / `set_member_active` | ubah peran / nonaktifkan | owner; pemilik terakhir dilindungi |
| `outlet_usage(p_outlet)` | pemakaian data per toko | owner/admin; dipakai layar Pengaturan |
| `prune_old_data(days, days)` | retensi gerak stok & audit | `service_role` saja; jadwalkan via `pg_cron` |
| `shift_report(p_outlet, p_from, p_to)` | rekap shift per periode | owner/admin; penjualan tunai & selisih per shift |
| `apply_stock_delta(p_product, p_delta, p_reason, p_ref, p_note)` | koreksi stok manual & opname | owner/admin; idempoten lewat `p_ref` |

### Aturan stok (penting)

Stok **tidak pernah** dikirim sebagai angka absolut dari aplikasi. Server
menghitung: `stok = stok + delta`. Setiap delta membawa `ref` unik sehingga
kiriman ulang (sinyal putus) tidak menambah stok dua kali. Inilah yang membuat
dua perangkat bisa menjual bersamaan tanpa saling menimpa.

Panggil dari aplikasi seperti biasa:

```ts
await supabase.rpc('sync_transaction', { p: payload });
```

> Jangan memanggil fungsi yang mengembalikan `record` dengan
> `select (close_shift(...)).*` — Postgres mengevaluasinya sekali per kolom
> (ini pernah membuat shift tertutup dua kali saat pengujian). Gunakan
> `select * from close_shift(...)`, seperti yang dilakukan PostgREST.

---

## 4. Mengundang kasir

**Cara utama (dari aplikasi, sejak sprint 3):**

1. Masuk sebagai pemilik → **Pengaturan → Tim & keamanan → Anggota toko**.
2. Pilih peran (Kasir/Admin) → **Buat kode undangan** → **Bagikan**.
3. Karyawan memasang aplikasi → **Daftar** → isi email, kata sandi, dan kode
   → otomatis masuk sebagai anggota outlet dengan peran tersebut.

Kode sekali pakai dan berlaku 72 jam. Peran **owner** tidak bisa diundang.

**Cara manual (cadangan):** Authentication → Users → Add user, lalu

```sql
insert into public.members (outlet_id, user_id, role)
values ('<outlet-id>', '<user-id>', 'kasir');
```

Mencabut akses: **Anggota toko → Nonaktifkan**, atau
`update public.members set active = false where user_id = '<id>';`

---

## 5. Menguji backend tanpa akun Supabase

```bash
npm run test:db       # 148 pemeriksaan, Postgres asli via PGlite (WASM)
npm run test:mappers  # 12 pemeriksaan bentuk data
npm run test:backup   # 21 pemeriksaan ekspor/impor cadangan + pengingat
npm run test:orders   # 9 pemeriksaan hitungan & teks pesanan
npm run test:copy     # 6 pemeriksaan audit teks rilis (tanpa istilah teknis)
npm run test:notif    # 10 pemeriksaan jadwal pengingat jatuh tempo
npm run test:lan      # 10 pemeriksaan penggabungan data antar-HP
npm run test:rbac     # 9 pemeriksaan matriks izin per peran
```

`test:db` menjalankan ketiga migrasi di Postgres sungguhan lalu memverifikasi:
profil otomatis, peran owner, barcode unik, perhitungan total di server,
idempotensi `client_tx_id`, stok terpotong, penolakan stok kurang, RLS lintas
outlet, hak kasir, audit void, buka/tutup shift + selisih, HPP rata-rata,
delta stok yang idempoten, penolakan stok minus, izin ubah harga, publication
realtime, buka/tutup shift + selisih, audit feed, kode undangan sekali pakai,
perlindungan "pemilik terakhir", fondasi skala (indeks tarik-sinkron, retensi
data, pemakaian per outlet), serta diskon & pajak yang dihitung ulang server.

### Harga grosir

`products.wholesale_price` + `products.wholesale_min_qty` diisi lewat `sync_product`
(keduanya wajib berpasangan, minimal jumlah >= 1). Kasir tidak boleh mengubahnya.
Tabel `price_tiers` tetap disiapkan untuk tingkat member/grosir bertingkat.

### Diskon & pajak dihitung server

`sales` mengirim `discount_kind` (`amount`/`percent`), `discount_value`, dan
`tax_rate`; `sync_transaction` menghitung sendiri `discount`, `tax`, dan `total`.
Nominal kiriman klien tidak dipercaya lagi. Aturan: diskon persen 0–100, tarif
pajak 0–100, diskon nominal dipangkas ke subtotal, total harus > 0.

### Retensi data (penting untuk biaya)

`prune_old_data()` menghapus gerak stok > 180 hari, audit > 365 hari, dan kode
undangan kedaluwarsa > 30 hari. **Transaksi, kasbon, dan shift tidak pernah
dihapus otomatis.** Jadwalkan di SQL Editor (butuh ekstensi `pg_cron`):

```sql
select cron.schedule('prune', '0 20 * * 0', $$select public.prune_old_data()$$);
```

Rencana skala, biaya, dan kepatuhan: lihat `docs/CLOUD-SKALA.md`.

---

## 6. Yang belum ada di backend (jujur)

| Belum | Rencana |
| --- | --- |
| Unggah foto bukti ke Storage | Sprint 3 (kolom `photo_path` sudah ada) |
| Konflik sunting produk (nama/harga) | Masih menang-terakhir per baris |
| Push notification stok menipis | Sprint 3, butuh `expo-notifications` + tabel `devices` (sudah disiapkan) |
| Storage foto bukti transaksi | Kolom `photo_path` sudah ada, unggah belum diaktifkan |
| Backup otomatis & retensi | Aktifkan PITR/backup harian di paket Pro |
| Rate limit / captcha login | Supabase Auth sudah membatasi; tambahkan captcha bila publik |
