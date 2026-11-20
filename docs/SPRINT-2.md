# Sprint 2 — Stok Delta, Realtime, Offline, Kategori & Alokasi

Tanggal: 19 November 2026
Status: **selesai dan teruji** (37 pemeriksaan database + 9 pemeriksaan mapper + uji aplikasi di browser).

---

## 1. Masalah yang diselesaikan

Sprint 1 menyisakan satu risiko nyata: **stok dikirim sebagai angka absolut**.
Kalau HP A dan HP B sama-sama menjual barang terakhir, masing-masing menghitung
stok lokalnya sendiri, lalu kiriman yang datang belakangan **menimpa** angka
yang benar. Untuk satu perangkat aman, untuk dua perangkat tidak.

Sprint 2 mengubah arah sinkronisasi stok dari "ini angka barunya" menjadi
**"barang ini berubah sebanyak X"**, dan server yang menghitung.

| Sebelum (sprint 1) | Sesudah (sprint 2) |
| --- | --- |
| `products.upsert({ stock: 8 })` | `sync_product({ ..., stock_delta: -2, stock_ref: uuid })` |
| Dua perangkat saling menimpa stok | Server menjumlahkan delta di atas stok terkini |
| Kiriman ulang bisa menambah stok dua kali | `stock_ref` unik → kiriman ulang diabaikan |
| Perubahan dari HP lain terlihat ≤ 30 detik | Realtime memicu sinkron ± 1 detik |
| Offline tidak terdeteksi | NetInfo menahan sinkron & memberi tahu UI |
| Kategori & alokasi modal hanya lokal | Ikut tersinkron |

---

## 2. Stok berbasis delta

### Server (`supabase/migrations/0004_sprint2.sql`)

- `_apply_stock(product, delta, reason, ref, note)` — inti: kunci baris stok
  (`FOR UPDATE`), tolak bila hasilnya minus, catat `stock_moves`, lalu
  `stock = stock + delta`. Bila `ref` sudah pernah dipakai untuk produk itu,
  fungsi langsung mengembalikan stok sekarang **tanpa** menambah lagi.
- `apply_stock_delta(...)` — pembungkus dengan pemeriksaan izin (hanya
  owner/admin), dipakai untuk koreksi stok manual dan opname.
- `sync_product(p jsonb)` — membuat/mengubah data produk **tanpa menyentuh
  stok**, kecuali ada `stock_delta`. Kasir boleh menambah barang baru (termasuk
  stok awal), tetapi tidak boleh mengubah harga barang yang sudah ada.
- Enum `stock_reason` mendapat nilai `opening` (stok awal) dan `transfer`.

### Klien

- `pushProduct()` di store tidak lagi mengirim `stock`; ia mengirim
  `stockDelta`, `stockReason` (`opening`/`adjust`), dan `stockRef` (UUID baru).
- Saat pemilik mengubah stok di form barang, selisihnya dihitung
  (`stok baru − stok lama`) dan dikirim sebagai delta.
- Tombol −/+ memakai entitas antrean baru `stock_delta`:
  `{ id, productId, delta, reason }` → RPC `apply_stock_delta`.

Bukti dari aplikasi yang benar-benar dijalankan (browser, mode lokal):

```
OUTBOX setelah tambah barang:
[{ "e": "product", "op": "upsert", "d": 7, "r": "opening" }]
CHECK tanpa stok absolut di payload: true
CHECK op stock_delta muncul: true
{ id: "ce4876f5-…", productId: "prd_mwnr3zxjlyesdh", delta: 1, reason: "adjust" }
CHECK barang bertahan setelah reload (stok 8): true
```

---

## 3. Realtime

`src/services/sync/realtime.ts` berlangganan `postgres_changes` untuk tabel
`transactions`, `products`, dan `categories`, difilter `outlet_id = outlet`.
Setiap perubahan memicu `syncSoon()` (debounce 1,2 detik) sehingga tarikan data
tidak menumpuk.

Migrasi 0004 menambahkan tabel-tabel tersebut ke publication
`supabase_realtime` (aman dijalankan berulang; melewati tabel yang tidak ada).

Kalau jaringan putus atau Realtime belum diaktifkan, aplikasi tetap benar —
hanya kembali ke interval 30 detik.

---

## 4. Deteksi offline (NetInfo)

`src/services/sync/connectivity.ts` memantau `@react-native-community/netinfo`:

- **Offline** → `syncNow()` langsung berhenti (tidak membuang baterai & sinyal),
  perubahan tetap menumpuk di antrean.
- **Online kembali** → sinkron langsung dipicu, bukan menunggu timer.
- UI: pil status menampilkan `Offline · N menunggu`; layar **Akun** menampilkan
  baris "Koneksi: Offline (antrean ditahan)".

---

## 5. Kategori & alokasi modal

- Kategori kini punya entitas antrean `category` (upsert/soft delete) dan ikut
  ditarik saat sinkron.
- Alokasi modal punya tabel baru `capital_allocations` di server, entitas
  `allocation`, dan RLS: dibaca semua anggota, ditulis owner/admin.
  Nominal boleh negatif (penarikan dari tabungan modal) — constraint
  `amount <> 0`, bukan `> 0`.

Sisa yang masih lokal: **foto bukti transaksi** (kolom `photo_path` sudah ada,
unggah ke Storage menyusul di sprint 3).

---

## 6. Berkas yang berubah / baru

| Berkas | Perubahan |
| --- | --- |
| `supabase/migrations/0004_sprint2.sql` | **baru** — delta stok, `sync_product`, `capital_allocations`, realtime |
| `supabase/tests/backend.test.mjs` | +11 pemeriksaan (total 37) |
| `supabase/tests/mappers.test.mts` | +2 pemeriksaan, produk tanpa `stock` (total 9) |
| `src/services/sync/connectivity.ts` | **baru** — NetInfo |
| `src/services/sync/realtime.ts` | **baru** — langganan Supabase Realtime |
| `src/services/sync/state.ts` | tambah `online`, label "Offline" |
| `src/services/sync/engine.ts` | entitas `stock_delta`/`category`/`allocation`, `sync_product`, tarik kategori & alokasi, `syncSoon()`, cek offline |
| `src/services/sync/outbox.ts` | tipe entitas baru |
| `src/services/sync/mappers.ts` | produk tanpa `stock`, mapper kategori & alokasi |
| `src/data/store.ts` | delta stok di `upsertProduct`/`adjustStock`, enqueue kategori & alokasi, merge kategori/alokasi |
| `src/data/types.ts` | `RemotePatch` + kategori & alokasi |
| `app/_layout.tsx` | pemantauan koneksi + langganan realtime |
| `src/components/SyncBadge.tsx`, `app/akun.tsx` | status offline |
| `package.json` | `@react-native-community/netinfo` |

---

## 7. Hasil verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run test:db` | **37/37 lulus** |
| `npm run test:mappers` | **9/9 lulus** |
| `npx tsc --noEmit` | bersih |
| `npx expo export --platform web` / `android` | berhasil |
| Aplikasi di browser: tambah barang, koreksi stok, muat ulang | antrean berisi `product(stockDelta 7, opening)` + `stock_delta(1)`, data bertahan, **0 error konsol** |

Pemeriksaan baru di `test:db`:

1. Barang baru dengan `stock_delta: 7` → stok 7.
2. Kirim ulang dengan `stock_ref` sama → stok tetap 7, gerakan stok tetap 1.
3. Ubah nama/harga tanpa `stock_delta` → stok tidak berubah.
4. `apply_stock_delta(-3)` dua kali dengan `ref` sama → 7 → 4 → 4.
5. Stok minus ditolak dengan pesan jelas.
6. Kasir dilarang mengubah harga produk lama; boleh menambah barang baru.
7. Kasir dilarang menyesuaikan stok manual.
8. Owner melihat kategori & alokasi modal; user outlet lain melihat 0 baris.
9. Publication `supabase_realtime` memuat `products`, `transactions`,
   `categories`, `capital_allocations`, `receivables`, `payables`, `stock_moves`.

---

## 8. Menerapkan di proyek Supabase Anda

1. Jalankan migrasi baru di **SQL Editor**:

   ```
   0004_sprint2.sql
   ```

   (Migrasi 0001–0003 yang sudah ada tidak perlu dijalankan ulang.)

2. Pastikan Realtime hidup: **Database → Replication** → tabel yang dipakai
   sudah tercentang, atau jalankan ulang blok `do $$ ... $$` di akhir 0004.

3. Bangun ulang aplikasi (`npx expo prebuild --clean && npx expo run:android`)
   karena ada modul native baru (`@react-native-community/netinfo`).

4. Uji cepat dua perangkat: buat barang stok 5 di HP A → di HP B (setelah
   sinkron) jual 2 → dalam ± 1–2 detik HP A menampilkan stok 3.

---

## 9. Batasan yang masih ada

1. **Konflik sunting bersamaan** pada produk (nama/harga) masih menang-terakhir
   per baris. Stok sudah aman karena delta, tetapi dua orang mengubah harga
   barang yang sama pada detik yang sama akan saling menimpa.
2. **Realtime bergantung pada policy RLS**; kalau RLS salah, perangkat tidak
   menerima event dan aplikasi hanya mengandalkan interval 30 detik.
3. **Foto bukti belum diunggah** ke Storage.
4. **Belum ada uji di proyek Supabase sungguhan** — semua uji memakai Postgres
   asli (PGlite) dengan stub `auth.uid()`. Realtime & NetInfo baru diuji
   "tidak merusak apa pun" di browser, belum dengan server hidup.
5. **Belum ada penanganan konflik kategori** (dua perangkat membuat kategori
   bernama sama → dua baris). Pembersihan duplikat menyusul bersama UI kategori.
