# Sprint 12 — Cabang (multi-outlet)

Tanggal: 19 November 2026
Status: **selesai** untuk tahap 12.1–12.4. Tahap 12.5 (sinkron server) sengaja belum,
karena rilis berjalan tanpa akun.

---

## 1. Janji yang dipegang

Sprint ini mengubah arti setiap baris data (stok, kasbon, shift, laporan). Karena itu
ada satu janji yang tidak boleh dilanggar:

> **Toko yang hanya punya satu lokasi tidak boleh melihat angka yang berbeda, dan tidak
> boleh dipaksa memahami layar baru.**

Cara mewujudkannya:

- saat data pertama kali dibuka, aplikasi membuat **satu cabang otomatis** dari nama toko;
- semua baris lama ditandai cabang itu, dan stok lama dipindahkan ke cabang tersebut;
- pemilih cabang **hanya muncul bila cabang lebih dari satu**;
- `scopeData()` mengembalikan objek yang **sama persis** bila cabangnya satu.

Hasilnya terbukti di QA: dengan data uji yang sama, Beranda tetap menampilkan
"Masuk hari ini Rp 24.500", tanpa chip cabang, dan tanpa satu pun galat.

---

## 2. Yang dibangun

### 2.1 Data

| Bagian | Isi |
| --- | --- |
| `Outlet` | `id`, `name`, `code`, `address?`, `createdAt`, `archivedAt?` |
| Baris bercabang | transaksi, kasbon, utang, pesanan, shift → `outletId` |
| Stok | `Product.stockByOutlet: { [outletId]: jumlah }` |
| Milik toko (bukan cabang) | profil, kategori, buku pelanggan, alokasi modal, pengaturan |

**Kenapa stok per cabang:** kalau stok digabung, kasir cabang A bisa menjual barang yang
fisiknya ada di cabang B. Itu justru sumber rating bintang satu ("stok tidak cocok").

**Kenapa pelanggan toko-wide:** orang yang langganan di satu cabang sering mampir ke
cabang lain. Buku pelanggan tetap satu, kasbonnya yang menempel ke cabang tempat ia
berutang.

### 2.2 Aturan stok

- Satu pintu baca: `stockFor(product, outletId)`.
- Satu pintu tulis: `applyStockDelta` / `setStockAt`.
- Cabang yang belum punya catatan stok = **0**, bukan meminjam angka cabang lain.
- Toko satu cabang tetap mengisi kolom `stock` (cermin), sehingga struk, cadangan, dan
  data lama tetap konsisten.

### 2.3 Aturan operasional

| Kejadian | Perilaku |
| --- | --- |
| Membuka shift | hanya memeriksa shift **di cabang itu**; shift cabang lain tidak menghalangi |
| Menutup shift | hanya menutup shift cabang yang sedang dibuka |
| Mencatat penjualan/kasbon/pesanan | otomatis ditandai cabang yang sedang dibuka |
| Menyelesaikan pesanan | memakai cabang pesanan itu, bukan cabang yang kebetulan dibuka |
| Mengarsipkan cabang | ditolak bila masih ada shift terbuka; riwayat tetap utuh |
| Cabang maksimum | 3 aktif (lebih dari itu butuh laporan konsolidasi yang jauh lebih rumit) |

### 2.4 Layar

| Layar | Isi |
| --- | --- |
| `app/cabang.tsx` (baru) | daftar cabang + angka singkat (transaksi, omzet, kasbon berjalan), tambah/ubah/arsipkan, "Pakai cabang ini" |
| `Pengaturan` | baris **Cabang** — "Satu lokasi" bila baru satu |
| Header Beranda | chip nama cabang + tanda panah (hanya bila > 1 cabang) |
| Kasir | judul menampilkan cabang yang sedang dipakai |
| Struk | mencetak nama cabang (hanya bila > 1 cabang) |
| Beranda, Transaksi, Kasbon, Laporan, Pesanan, Stok, Shift, Notifikasi | otomatis memakai data cabang aktif lewat `useScopedData()` |

### 2.5 Cadangan

- `outlets` ikut tercadangkan; penghitung data bertambah satu baris ("cabang").
- Berkas lama tanpa `outlets` tetap terbuka (dibaca sebagai daftar kosong) dan tetap
  bisa dipulihkan.
- Setelah memulihkan, cabang yang sedang dibuka disesuaikan: bila tidak ada di berkas,
  dipakai cabang pertama dari berkas itu.

---

## 3. Berkas yang disentuh

```
src/data/outlets.ts        # BARU — seluruh aturan cabang & stok (murni, diuji Node)
src/data/scope.ts          # BARU — hook useScopedData()
src/data/types.ts          # Outlet, outletId di 5 jenis baris, Product.stockByOutlet
src/data/store.ts          # aksi cabang, penandaan cabang, stok per cabang, migrasi versi 2
src/services/backup.ts     # cabang ikut tercadangkan & tergabung
src/services/printer/receipt.ts  # nama cabang di struk
app/cabang.tsx             # BARU — layar cabang
app/_layout.tsx            # rute "cabang" + ensureOutlets() setelah data siap
app/pengaturan.tsx         # baris menu Cabang
app/kasir.tsx              # judul cabang + nama cabang di struk
src/components/AppHeader.tsx     # chip ganti cabang
app/(tabs)/{index,transaksi,kasbon,laporan}.tsx, app/stok.tsx, app/pesanan.tsx,
app/catatan… (catat), app/shift.tsx, app/notifikasi.tsx, app/pilih-transaksi.tsx,
app/kasbon/[id].tsx        # memakai useScopedData()
supabase/tests/outlets.test.mts  # BARU — 18 pemeriksaan
supabase/tests/backup.test.mts   # penghitung data + cabang
package.json               # skrip test:outlets
```

Catatan teknis: `persist` naik ke **versi 2**. Migrasi membuat cabang otomatis dan
menandai baris lama. Setelah migrasi, keadaan langsung ditulis ulang supaya versi
tersimpan ikut naik — ini mencegah migrasi berjalan berulang setiap aplikasi dibuka.

---

## 4. Uji

| Suite | Sebelum | Sesudah |
| --- | --- | --- |
| `test:db` | 148 | 148 |
| `test:mappers` | 12 | 12 |
| `test:backup` | 23 | 23 (kunci "cabang" ditambahkan) |
| `test:rbac` | 9 | 9 |
| `test:orders` | 9 | 9 |
| `test:notif` | 10 | 10 |
| `test:lan` | 10 | 10 |
| `test:customers` | 19 | 19 |
| `test:outlets` | — | **18** |
| `test:copy` | 8 | 8 |
| `typecheck` | 0 | 0 |

Pemeriksaan layar (Playwright 390×844, 0 galat konsol):

1. `90-beranda-cabang-chip.png` — chip cabang di header
2. `91-cabang-daftar.png` — dua cabang, angka terpisah (Warung Berkah: 5 transaksi /
   Rp 67.500 / kasbon Rp 12.000 ; Cabang Pasar Baru: 1 transaksi / Rp 68.000 / Rp 25.000)
3. `92-cabang-form.png` — tambah cabang
4. `93-cabang-tiga.png` — tiga cabang aktif, cabang baru langsung dipakai
5. `94-beranda-cabang-pasar-baru.png` — setelah pindah cabang: "Masuk hari ini Rp 68.000",
   kas Rp 292.000 (bukan angka cabang pertama)
6. `95-kasir-stok-cabang.png` — katalog sama, **stok berbeda**: Indomie 6, Teh Botol 2,
   Beras "Stok habis", Kopi 40, Gula 1
7. `96-toko-satu-cabang.png` — data uji tanpa cabang: tanpa chip, angka tetap Rp 24.500
8. `97-cabang-satu-lokasi.png` — toko satu lokasi: satu baris cabang, tidak ada layar
   tambahan yang mengganggu

Pemeriksaan migrasi (langsung dari penyimpanan setelah aplikasi dibuka):

```
versi tersimpan: 2 | cabang: 1 | cabang aktif: out_utama
transaksi bertanda cabang: 6/6 | produk dengan stok per cabang: 5/5
```

---

## 5. Batas yang belum dikerjakan

| Hal | Alasan |
| --- | --- |
| Harga jual berbeda per cabang | Menambah kerumitan harga; ditunda sampai ada permintaan nyata |
| Mutasi/pindah stok antar cabang | Butuh alur sendiri (kirim barang + terima barang) |
| Laporan konsolidasi semua cabang dalam satu grafik | Cukup daftar angka per cabang untuk sekarang |
| Hak akses per cabang (siapa boleh buka cabang mana) | Menyusul bersama akun; rilis ini tanpa akun |
| Sinkron server per cabang (tahap 12.5) | Server belum dipakai pada rilis tanpa akun; skema `sync_*` perlu kolom `outlet_id` saat akun dinyalakan |
| Lebih dari 3 cabang | Butuh laporan konsolidasi & peran per cabang |

---

## 6. Ringkasan untuk pemilik warung

- Satu lokasi: **tidak ada yang berubah**. Semua angka tetap sama.
- Buka cabang kedua: stok, kasbon, shift, dan laporan dipisah otomatis; buku pelanggan
  tetap satu.
- Pindah cabang: satu ketukan pada nama cabang di bagian atas Beranda.
