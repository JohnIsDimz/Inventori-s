# Sprint 8 — Pesanan / Kuotasi

Status: **selesai** (19 November 2026)

Masalah nyata di warung: pelanggan sering **memesan dulu** (kue, katering, gas,
beras karungan) lalu diambil nanti. Sebelum sprint ini pilihannya cuma dua:
catat sebagai penjualan (padahal barang belum diambil → stok & omzet jadi bohong),
atau tulis di buku (lalu lupa). Sprint 8 memberi jalur ketiga yang benar.

---

## 1. Prinsip yang dijaga

> **Pesanan adalah janji, bukan penjualan.**

- Stok **tidak** berkurang saat pesanan dibuat.
- Omzet **tidak** bertambah di laporan.
- Stok & uang baru bergerak saat pesanan **dijadikan transaksi** — di situ kasir
  memilih metode bayar (tunai, QRIS, transfer, atau kasbon).
- Pesanan batal/hapus tidak meninggalkan jejak di laporan keuangan.

Kalimat itu juga ditampilkan di layar supaya kasir tidak salah paham:
*"Pesanan tidak mengurangi stok dan tidak dihitung omzet sampai dijadikan transaksi."*

---

## 2. Yang dibangun

### Data (`src/data/types.ts`, `src/data/orders.ts`)

```ts
type OrderStatus = 'terbuka' | 'selesai' | 'batal';

interface Order {
  id, customerName, customerPhone?,
  items: { productId?, name, qty, price, note? }[],
  total,            // Σ(qty × harga), dihitung ulang di store & server
  dueDate?, note?, status,
  createdAt, updatedAt?, transactionId?
}
```

Fungsi murni di `src/data/orders.ts`:
`orderTotal`, `normalizeOrderItems`, `orderItemSummary`, `orderShareText`,
`orderDueTone` (lewat / dekat / aman / tanpa), `ORDER_STATUS_LABEL`.

### Aksi store (`src/data/store.ts`)

| Aksi | Perilaku |
|---|---|
| `addOrder` | Nama pelanggan wajib, minimal 1 barang, total > 0. Barang yang tidak masuk akal dibuang. |
| `updateOrder` | Hanya pesanan `terbuka` yang bisa diubah; total dihitung ulang. |
| `cancelOrder` | Status → `batal`. Pesanan yang sudah jadi transaksi ditolak. |
| `deleteOrder` | Hapus dari daftar (hanya yang belum jadi transaksi). |
| `completeOrder` | Membuat transaksi penjualan lewat `addTransaction` (stok, omzet, kasbon bila perlu), lalu status → `selesai` + `transactionId`. |

Setiap perubahan masuk antrean sinkron (`enqueue('order', …)`), termasuk saat
mode lokal — jadi begitu pengguna mengaktifkan cloud, pesanan yang sudah ada
ikut terkirim.

### Layar

- **`app/pesanan.tsx`** — ringkasan (jumlah & nilai pesanan terbuka, jatuh tempo,
  sudah jadi transaksi), kartu pesanan per pelanggan dengan chip tenggat
  (`Lewat tenggat` merah, `Hari ini/besok` amber), tombol
  **Jadikan transaksi** (sheet 4 metode), **Bagikan** (teks WhatsApp), dan
  **Batalkan**. Riwayat 12 pesanan terakhir di bawah.
- **`app/pesanan-baru.tsx`** — nama & WhatsApp pelanggan, cari barang lalu tap
  untuk menambah (harga grosir otomatis bila minimalnya 1), **barang bebas**
  untuk yang tidak ada di katalog, stepper jumlah, pilihan ambil
  (hari ini / besok / 3 hari / 1 minggu), catatan, dan total lekat di bawah.
- **Beranda** — petak **Pesanan** dengan keterangan `N terbuka` (grid jadi 3 × 3).

### Berbagi ke pelanggan

`orderShareText()` menyusun pesan WhatsApp tanpa emoji: nama toko, pelanggan,
tanggal ambil, rincian `- Kue Lapis 3 x Rp 5.000 = Rp 15.000`, total, catatan.

### Cadangan

Pesanan ikut tercadangkan (`counts.pesanan`). Berkas versi 1 (sebelum sprint ini)
tetap bisa dipulihkan — `orders` dibaca sebagai daftar kosong.

---

## 3. Sisi server (`0010_sprint8.sql`)

| Objek | Keterangan |
|---|---|
| `order_status` | enum `terbuka/selesai/batal` |
| `orders` | pesanan per outlet, indeks `(outlet_id, status, due_date)` + `(outlet_id, updated_at)` |
| `order_items` | rincian; `product_id` boleh kosong (barang bebas) dan `on delete set null` |
| `sync_order(jsonb)` | simpan pesanan idempoten |
| RLS | baca: semua anggota; tulis: semua anggota (kasir menjual); rincian mengikuti induknya |
| Realtime | `orders` ditambahkan ke publication |

Aturan yang ditegakkan server (bukan hanya UI):

1. **Total dihitung server** dari rincian — nilai `total` dari klien diabaikan
   (diuji: klien mengirim `total: 1`, tersimpan `16.500`).
2. Barang dari **toko lain** tidak bisa diselipkan → `Ada barang yang bukan milik toko ini`.
3. Jumlah 0 / negatif dan harga negatif ditolak, dengan nama barangnya disebut.
4. `status = 'selesai'` **wajib** menunjuk `transaction_id`.
5. Kiriman ulang (sinyal putus) tidak menggandakan: rincian diganti, bukan
   ditumpuk (diuji: 2 baris → 1 baris setelah kiriman kedua).
6. Pesanan **tidak** menyentuh `products.stock` maupun `stock_moves`.

---

## 4. Status uji

| Pemeriksaan | Sebelum | Sesudah |
|---|---|---|
| `npm run test:db` | 124 | **143** (+19 pesanan) |
| `npm run test:backup` | 18 | **21** (+3 pesanan & kompatibilitas v1) |
| `npm run test:orders` | – | **7** (baru) |
| `npm run test:rbac` | 9 | 9 |
| `npm run test:mappers` | 12 | 12 |
| `npm run typecheck` | 0 error | 0 error |
| Ekspor web & Android | OK | OK |

Uji ujung-ke-ujung di peramban (390 × 844):

- pesanan contoh "Bu Ratna" terbuka → **Jadikan transaksi → Tunai** →
  status `selesai`, transaksi bertambah 1, stok Indomie turun 3, `transactionId` terisi;
- form pesanan baru "Pak Joko" → tersimpan `Rp 3.500`; 0 error konsol.

Tangkapan layar: `docs/screenshots/45`–`49`.

---

## 5. Berkas yang disentuh

```
supabase/migrations/0010_sprint8.sql   tabel pesanan + sync_order + RLS + realtime
src/data/orders.ts                     hitungan & teks pesanan (baru)
src/data/types.ts                      Order, OrderItem, OrderStatus, orders di state
src/data/store.ts                      addOrder/updateOrder/cancelOrder/deleteOrder/completeOrder
src/data/selectors.ts                  openOrders, dueOrders, orderSummary
src/services/sync/outbox.ts            entitas 'order'
src/services/sync/engine.ts            push sync_order + tarik orders/order_items
src/services/backup.ts                 orders di payload & hitungan
app/pesanan.tsx                        layar daftar pesanan (baru)
app/pesanan-baru.tsx                   form pesanan (baru)
app/(tabs)/index.tsx                   petak Pesanan di Aksi cepat
app/_layout.tsx                        rute pesanan & pesanan-baru
supabase/tests/orders.test.mts         uji murni pesanan (baru)
```

## 6. Usulan Sprint 9

1. **Batas paket berbayar** — kunci fitur setelah N transaksi/bulan (Rp 49.000/toko).
2. **Pengingat jatuh tempo otomatis** — notifikasi lokal H-1 untuk kasbon & pesanan.
3. **Sinkron antar-HP lewat Wi-Fi lokal** — untuk toko tanpa internet.
4. **Uang muka pesanan (DP)** — sisa tagihan otomatis jadi kasbon saat diambil.
