# Sprint 5 — Harga Grosir, Diskon per Barang, dan Mode Lokal Diperjelas

Tanggal: 19 November 2026
Status: **selesai dan teruji** — 103 pemeriksaan database, 12 pemeriksaan mapper, uji alur kasir di browser (0 error konsol).

---

## 1. Ringkasan

| Perubahan | Masalah nyata yang dijawab |
| --- | --- |
| **Harga grosir per barang** | "Beli 5 pcs harganya beda" — kasir tidak perlu menghitung ulang atau menawar manual |
| **Diskon per barang** | Sebelumnya hanya bisa diskon satu nota; sekarang "teh satu ini potong Rp 2.000" juga bisa |
| **Splash screen** | Masih memakai nama lama "WARUNGLUI" — sekarang **INVENTORI'S** |
| **Penjelasan mode lokal** | Pengguna yang tidak mau cloud dibuat paham bahwa aplikasi tetap penuh, bukan versi terbatas |

---

## 2. Harga grosir

### Cara kerja

Satu barang boleh punya **satu tingkat grosir**: `harga grosir` + `minimal jumlah`.
Kasir otomatis memakai harga grosir saat jumlah di keranjang mencapai batas, dan
kembali ke harga normal bila jumlah diturunkan.

```
harga satuan = (jumlah >= minimal grosir) ? harga grosir : harga jual
subtotal     = Σ (harga satuan × jumlah) − diskon per barang
```

Contoh yang diuji: Teh Botol harga jual Rp 9.000, grosir Rp 8.000 mulai 3 pcs.
Beli 3 → keranjang menampilkan **Rp 8.000 • harga grosir**, subtotal Rp 24.000.
Turunkan ke 2 → kembali Rp 9.000.

### Disimpan di mana

| Lapisan | Isi |
| --- | --- |
| Aplikasi | `Product.wholesalePrice`, `Product.wholesaleMinQty` |
| Server | kolom `products.wholesale_price`, `products.wholesale_min_qty` (migrasi `0008`) |
| Aturan | kedua kolom harus diisi bersama, minimal jumlah ≥ 1, harga ≥ 0 |
| Izin | **kasir tidak boleh mengubah harga grosir** — sama seperti harga jual (diuji) |

Catatan desain: kebutuhan 80% toko adalah *satu* tingkat grosir, jadi kolom ini
cukup dan paling sederhana dipakai kasir. Tabel `price_tiers` (umum/grosir/member
bertingkat) tetap ada di skema untuk tingkat lanjutan di sprint berikutnya.

### Di layar

- **Katalog & stok → Barang baru/Ubah**: bagian "Harga grosir (opsional)" dengan dua isian.
- Kartu barang menampilkan `• grosir Rp 8.000/3`.
- Keranjang kasir menampilkan `• harga grosir` pada baris yang memakainya.
- Struk mencetak harga yang benar-benar dipakai, jadi pembeli bisa memeriksa.

---

## 3. Diskon per barang

- Di keranjang, setiap baris punya isian **Diskon <nama barang>** (rupiah).
- Diskon baris dikurangkan lebih dulu, baru diskon nota dihitung dari subtotal
  setelahnya — jadi tidak ada diskon yang dihitung dua kali.
- Server sudah menangani ini sejak sprint 4: `sync_transaction` mengurangi
  `transaction_items.discount` dari subtotal. Sprint 5 hanya menambah jalur data
  (klien → antrean → server) dan UI-nya.

Contoh teruji: 3 × Rp 8.000 = Rp 24.000, diskon barang Rp 2.000 → subtotal
**Rp 22.000**; bila pajak 10% aktif, pajak dihitung dari Rp 22.000.

---

## 4. Splash screen baru

`assets/splash.png` (1024×1024) dibuat ulang: latar `#101320`, tile ikon aplikasi,
wordmark **INVENTORI'S**, dan tagline "KASIR & STOK TOKO". Nama lama "WARUNGLUI"
sudah tidak ada lagi di aset mana pun.

Yang perlu dilakukan agar terlihat di HP: `npx expo prebuild --clean` lalu
`npx expo run:android` (ikon & splash dibakar ke proyek native saat prebuild,
bukan saat reload JS).

Bukti: `docs/screenshots/31-splash-inventoris.png`.

---

## 5. "Bisa lokal saja tanpa cloud?"

**Bisa, dan sekarang dijelaskan di dalam aplikasi.**

Mode lokal bukan versi terbatas. Di mode lokal semuanya jalan:

| Fitur | Mode lokal | Butuh cloud |
| --- | --- | --- |
| Kasir, barcode, diskon, pajak, harga grosir | ya | — |
| Stok, opname, katalog, margin, laba | ya | — |
| Kasbon, tabungan modal, pengeluaran | ya | — |
| Shift kasir + hitung selisih laci | ya | — |
| Struk printer thermal Bluetooth | ya | — |
| Input suara Bahasa Indonesia | ya | — |
| Data dibuka dari HP lain | **tidak** | ya |
| Cadangan otomatis / pulih setelah HP hilang | **tidak** | ya |
| Peran anggota (owner/admin/kasir) & log audit | **tidak** | ya |

Di layar **Akun & Sinkron**, mode lokal kini dijelaskan dengan bahasa pemilik toko
(bukan istilah teknis): apa yang tetap jalan, apa yang belum ada, dan bagaimana
menyalakan cloud bila mau. Kalimat untuk pengguna:

> "Mode lokal — semua fitur kasir tetap jalan. Data tersimpan penuh di perangkat ini.
> Yang belum ada: data tidak bisa dibuka dari HP lain, tidak ada cadangan otomatis,
> peran anggota & log audit tidak tersedia."

**Untuk MVP full-stack, keduanya tetap satu kode yang sama.** Cloud hanya menyala
bila `EXPO_PUBLIC_SUPABASE_URL` + anon key diisi saat build. Artinya Anda bisa
merilis dua hal dari satu repositori:

1. **Build lokal** (tanpa env) — untuk pengguna yang tidak mau ribet; nol akun, nol server.
2. **Build cloud** (dengan env) — untuk toko dengan lebih dari satu HP atau yang mau data aman.

Saran praktis: rilis build lokal sebagai "versi gratis tanpa akun", lalu tawarkan
build/proyek cloud untuk yang butuh sinkron — sesuai model harga di
`docs/CLOUD-SKALA.md`.

---

## 6. Berkas yang berubah

| Berkas | Isi |
| --- | --- |
| `supabase/migrations/0008_sprint5.sql` | **baru** — kolom harga grosir + `sync_product` versi baru |
| `supabase/tests/backend.test.mjs` | +9 pemeriksaan (total **103**) |
| `supabase/tests/mappers.test.mts` | +1 pemeriksaan (total **12**) |
| `src/data/types.ts` | `Product.wholesalePrice/wholesaleMinQty`, `LineItem.discount` |
| `src/data/store.ts` | validasi harga grosir, `discount` ikut dinormalisasi |
| `src/services/sync/mappers.ts` | kirim/baca kolom grosir, diskon baris |
| `src/services/sync/engine.ts` | diskon per baris ikut terkirim |
| `app/kasir.tsx` | harga grosir otomatis + isian diskon per barang |
| `app/stok.tsx` | isian harga grosir & minimal jumlah, ringkasan di kartu barang |
| `app/akun.tsx` | penjelasan mode lokal & cara menyalakan cloud |
| `assets/splash.png` | splash baru: INVENTORI'S |

---

## 7. Hasil verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run test:db` | **103/103 lulus** |
| `npm run test:mappers` | **12/12 lulus** |
| `npx tsc --noEmit` | bersih |
| `npx expo export` web & android | berhasil |
| Alur kasir di browser | 5 pemeriksaan, **0 error konsol** |

Bukti dari aplikasi yang dijalankan: Teh Botol (jual 9.000, grosir 8.000/3) → keranjang
menampilkan "harga grosir" dan Rp 24.000 → diskon barang Rp 2.000 → subtotal
**Rp 22.000** → tersimpan `{amount: 22000, subtotal: 22000, items[0]: {qty: 3, price: 8000, discount: 2000}}`.

---

## 8. Batasan yang masih ada

1. **Satu tingkat grosir per barang.** Belum ada tingkat member atau grosir bertingkat
   (5 pcs satu harga, 12 pcs lebih murah). Tabel `price_tiers` sudah siap untuk itu.
2. **Diskon barang berupa rupiah**, belum persen per barang.
3. **Harga grosir tidak otomatis dipakai di kasbon/laporan lain** — hanya di kasir.
4. **Belum diuji ke Supabase hidup**; semua uji memakai Postgres asli (PGlite).
5. **Mode lokal belum punya cadangan manual** (ekspor file). Ini pekerjaan berikutnya
   yang paling terasa gunanya untuk pengguna tanpa cloud.

---

## 9. Usulan sprint 6

1. **Ekspor & impor cadangan lokal** (satu berkas JSON/CSV) untuk pengguna mode lokal —
   pengganti backup cloud tanpa memaksa akun.
2. Tingkat harga member/grosir bertingkat memakai `price_tiers`.
3. Diskon per barang dalam bentuk persen + tombol cepat (5/10/20%).
4. Pemilihan pelanggan tetap (member) di kasir + riwayat belanjanya.
