# Fondasi Full-Stack — Sprint 1 (Tier 0)

Tanggal: 19 November 2026
Cakupan: backend + login + penyimpanan SQLite + antrean sinkron + peran/izin.
Status: **selesai dan teruji**, dengan batasan yang ditulis terbuka di bagian 7.

---

## 1. Apa yang berubah, singkat

| Sebelum | Sesudah |
| --- | --- |
| Data hanya di satu HP, satu blob JSON di AsyncStorage | Data di SQLite (`app_kv`) + antrean `outbox`; siap 10.000+ transaksi |
| Tidak ada akun | Login email/kata sandi (Supabase Auth) — **opsional**, mode lokal tetap jalan |
| Tidak ada server | Skema Postgres: 18 tabel, RLS per outlet & per peran, 7 fungsi transaksional |
| Tidak ada peran | Owner / Admin / Kasir dengan matriks izin; kasir tak bisa ubah harga, void, atau lihat laba |
| Tidak ada sinkron | Mesin sinkron offline-first: push antrean → tarik perubahan → gabungkan |
| Data hilang bila HP rusak | Data ada di server; perangkat baru tinggal login |

Prinsip yang tidak dilanggar: **tanpa backend terkonfigurasi, aplikasi tetap
100% berfungsi seperti sebelumnya** (tidak ada panggilan jaringan sama sekali).

---

## 2. Arsitektur yang dipilih

```
┌──────────────────────── HP (Expo) ─────────────────────────┐
│  Layar (expo-router)                                       │
│        │ baca/tulis                                        │
│  Zustand store ── persist ──► SQLite: app_kv (state JSON)   │
│        │                            outbox (antrean op)     │
│        │                                                   │
│  engine.ts  ── push ──► Supabase (PostgREST / RPC)          │
│             ◄─ pull ──  Postgres + RLS                      │
└────────────────────────────────────────────────────────────┘
```

Kenapa SQLite untuk seluruh state: AsyncStorage harus menulis ulang seluruh blob
setiap perubahan; pada 10 ribu transaksi itu membuat UI tersendat. `app_kv`
menyimpan state sebagai satu baris (mudah), sedangkan `outbox` adalah tabel
sungguhan yang bisa di-query, diurutkan, dan di-retry.

Kenapa tetap ada blob state di samping outbox: agar seluruh layar yang sudah
ada tidak perlu ditulis ulang pada sprint ini. Migrasi ke tabel per-entitas
dilakukan saat pindah ke `expo-sqlite` penuh (sprint 2/3), bukan sekaligus.

---

## 3. Berkas baru

| Berkas | Isi |
| --- | --- |
| `supabase/migrations/0001_init.sql` | 18 tabel: outlets, profiles, members, categories, products, price_tiers, stock_moves, shifts, customers, transactions, transaction_items, receivables(+payments), suppliers, payables(+payments), purchases(+items), audit_logs, devices |
| `supabase/migrations/0002_rls.sql` | helper `is_member`, `has_role`, `can_manage`, `is_owner` + policy untuk semua tabel |
| `supabase/migrations/0003_rpc.sql` | `sync_transaction`, `void_transaction`, `open_shift`, `close_shift`, `adjust_stock`, `apply_purchase`, `create_outlet` |
| `supabase/tests/backend.test.mjs` | 26 pemeriksaan migrasi + RLS + RPC di Postgres asli (PGlite) |
| `supabase/tests/mappers.test.mts` | 7 pemeriksaan bentuk data klien ↔ kolom tabel |
| `supabase/README.md` | panduan setup, peran, RPC, undang kasir, batasan |
| `src/services/db/types.ts` | antarmuka driver penyimpanan |
| `src/services/db/local.ts` | driver SQLite (Android/iOS) |
| `src/services/db/local.web.ts` | driver localStorage (pratinjau web) |
| `src/services/db/persistence.ts` | adapter Zustand + migrasi otomatis dari AsyncStorage |
| `src/services/supabase/client.ts` | klien Supabase, `isCloudEnabled` |
| `src/services/sync/outbox.ts` | pencatatan perubahan + id pending |
| `src/services/sync/idmap.ts` | peta id lokal ↔ UUID server |
| `src/services/sync/mappers.ts` | camelCase ↔ snake_case, angka numeric |
| `src/services/sync/engine.ts` | push / pull / merge + loop 30 detik |
| `src/services/sync/state.ts` | status sinkron untuk UI |
| `src/data/auth.ts` | sesi, peran, outlet |
| `src/utils/permissions.ts` | matriks izin per peran |
| `src/components/SyncBadge.tsx` | pil status: Mode lokal / Menunggu N / Tersinkron |
| `app/masuk.tsx` | layar login (hanya mode cloud) |
| `app/akun.tsx` | akun, peran, outlet, antrean, sinkron manual, buat toko, keluar |

Berkas yang diubah: `src/data/store.ts` (storage + 14 titik enqueue + `mergeRemote`),
`src/data/types.ts` (`RemotePatch`), `app/_layout.tsx` (bootstrap sesi, penjaga
rute, loop sinkron), `app/pengaturan.tsx` (kartu Akun & sinkronisasi),
`app/(tabs)/laporan.tsx` (laba disembunyikan untuk kasir), `package.json`
(skrip `test:db`, `test:mappers`), `.env.example`.

---

## 4. Aturan sinkron (dan alasannya)

1. **Idempotensi.** Setiap transaksi punya `client_tx_id` (UUID). Kalau HP
   mengirim ulang karena koneksi putus di tengah jalan, server mengembalikan
   id yang sama dan nota **tidak** berganda. Teruji di `test:db`.
2. **Server yang menghitung.** Total transaksi dihitung ulang dari item di
   server; angka kiriman klien tidak dipercaya. Stok dipotong dengan
   `SELECT ... FOR UPDATE`, jadi dua kasir tidak bisa menjual sisa barang yang
   sama — yang kedua mendapat pesan "Stok ... tidak cukup".
3. **Perangkat menang sampai terkirim.** Saat menarik data, mesin sinkron
   menyaring baris yang masih punya operasi di antrean, agar perubahan lokal
   yang belum terkirim tidak ditimpa server.
4. **Peta id.** Data lama memakai id seperti `prd_lx3k2`; server memakai UUID.
   `idmap` menyimpan pasangannya sekali, jadi id lokal (dan semua referensi
   lama) tidak perlu diubah.
5. **Kegagalan dibedakan.** Gagal jaringan → berhenti & coba lagi 30 detik
   kemudian. Gagal validasi (bukan anggota, stok kurang) → dicoba maksimal 5
   kali lalu dibuang agar antrean tidak macet selamanya.
6. **Urutan dijaga.** Operasi dikirim berurutan sesuai waktu dibuat; itulah
   sebabnya nilai stok absolut masih aman untuk satu perangkat.

---

## 5. Peran dan izin

`src/utils/permissions.ts`:

| Aksi | Owner | Admin | Kasir |
| --- | --- | --- | --- |
| Lihat laba / harga modal / margin | ya | ya | **tidak** |
| Kelola produk (tambah/ubah/hapus) | ya | ya | tidak |
| Void / hapus transaksi | ya | ya | tidak |
| Kasbon & pembayaran | ya | ya | ya |
| Penyesuaian stok, shift | ya | ya | tidak |
| Ekspor laporan | ya | ya | ya |
| Kelola anggota | ya | tidak | tidak |

Izin yang sama juga ditegakkan **di database** (RLS + pemeriksaan di RPC), jadi
kasir yang memakai klien curang tetap ditolak server. Mode lokal (`role = null`)
membuka semua izin karena perangkat itu milik pemilik toko.

---

## 6. Hasil verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run test:db` (Postgres asli, PGlite) | **26/26 lulus** |
| `npm run test:mappers` | **7/7 lulus** |
| `npx tsc --noEmit` | bersih |
| `npx expo export --platform web` | berhasil (bundle `masuk`, `akun` ikut terbentuk) |
| Buka aplikasi tanpa `.env` (mode lokal) | beranda normal, tidak ada error konsol |
| Seed data ke SQLite-web lalu muat ulang | data tampil (profil, transaksi) |
| Migrasi dari kunci lama `warunglui-store-v1` | data lama tampil, kunci baru terisi otomatis |
| Layar Akun di mode lokal | menampilkan panduan `EXPO_PUBLIC_SUPABASE_URL` |

Yang diuji `test:db` secara rinci: profil otomatis dari `auth.users`, `create_outlet`
+ peran owner, barcode ganda ditolak, total dihitung server (7.000 − 500 = 6.500),
`client_tx_id` idempoten, stok 10 → 8, satu `stock_move` per produk, penolakan
stok kurang, kasir tidak bisa ubah harga, kasir tidak bisa void, user outlet lain
melihat 0 baris, owner void → stok pulih + audit tercatat, shift buka/tutup dengan
selisih Rp 7.000, HPP rata-rata (3.000×10 + 4.000×10)/20 = 3.500, penyesuaian
stok 0 ditolak.

Berkas tangkapan layar: `docs/screenshots/18-akun-mode-lokal.png`,
`docs/screenshots/19-pengaturan-kartu-akun.png`.

---

## 7. Batasan yang perlu diketahui (jujur)

1. ~~Stok antar-perangkat masih absolut~~ → **selesai di sprint 2** (delta +
   `stock_ref`), lihat `docs/SPRINT-2.md`.
2. ~~Belum ada realtime~~ → **selesai di sprint 2** (Supabase Realtime).
3. ~~Kategori & alokasi modal belum disinkron~~ → **selesai di sprint 2**.
   Foto bukti transaksi masih lokal (unggah ke Storage menyusul).
4. **Foto bukti transaksi** masih tersimpan lokal (kolom `photo_path` disiapkan).
5. **Belum ada uji ke Supabase sungguhan.** Migrasi & RPC diuji di Postgres asli
   (PGlite), tetapi policy Supabase Auth (`auth.uid()`) dipakai lewat stub pada
   pengujian. Uji pertama di proyek Supabase Anda adalah langkah wajib sebelum
   dipakai berjualan (lihat `supabase/README.md`).
6. **Belum ada halaman admin web.** Menambah anggota masih lewat SQL Editor.
7. **Belum ada signal 'offline' eksplisit.** Status hanya membedakan idle /
   menyinkronkan / gagal; deteksi konektivitas memakai `@react-native-community/netinfo`
   direncanakan sprint 2.

---

## 8. Cara menjalankan

```bash
# mode lokal (tanpa backend)
npm install
npx expo prebuild --clean
npx expo run:android

# mode cloud
cp .env.example .env      # isi URL + anon key
# jalankan migrasi supabase/migrations/*.sql di SQL Editor Supabase
npx expo prebuild --clean && npx expo run:android

# uji backend tanpa akun Supabase
npm run test:db
npm run test:mappers
```

---

## 9. Sprint berikutnya (usulan urutan)

| Sprint | Isi | Alasan urutan |
| --- | --- | --- |
| S2 | `stock_moves` sebagai delta, realtime Supabase, NetInfo, sinkron kategori & alokasi | Menutup risiko terbesar: stok beda antar perangkat |
| S3 | Undang anggota dari aplikasi, audit log di UI, shift kasir di UI | Melengkapi peran yang sudah ada di database |
| S4 | Diskon & pajak per transaksi, harga bertingkat | Fitur yang paling sering diminta saat demo |
| S5 | Pembelian supplier + HPP rata-rata di UI (RPC sudah siap), stok opname | Laba makin akurat |
| S6 | QRIS dinamis, struk digital WhatsApp, backup otomatis | Nilai jual |
