# Sprint 14 — Kulakan supplier & HPP rata-rata

Tanggal: 19 November 2026
Status: **selesai**. Seluruh uji hijau, layar kulakan tersambung ke stok, kas, dan utang.

---

## 1. Masalah yang diselesaikan

Sebelum sprint ini, satu-satunya cara mengubah harga modal adalah membuka katalog,
memilih barang, mengetik modal baru — satu per satu, tanpa catatan kapan dan dari
siapa barangnya dibeli. Akibatnya dua hal:

1. **Laba terlihat lebih besar dari kenyataan.** Kalau agen menaikkan harga dari
   2.900 ke 3.100, penjualan tetap dihitung untung 600 per bungkus padahal untungnya
   sudah menyusut. Pemilik baru sadar saat uangnya habis untuk kulakan berikutnya.
2. **Belanja stok tidak tercatat sebagai uang keluar.** Kas di laci berkurang, catatan
   tidak. Saat tutup shift, selisihnya dicari ke mana-mana.

Sekarang satu kulakan dicatat sekali: supplier, barang, jumlah, harga beli, dibayar
berapa. Stok bertambah, harga modal dihitung **rata-rata tertimbang**, uang keluar
tercatat sebesar yang benar-benar dibayar, dan sisanya menjadi utang supplier.

---

## 2. Aturan yang dipegang

| Aturan | Alasan |
| --- | --- |
| **HPP = rata-rata tertimbang, bukan harga terakhir** | Sisa 10 @2.900 + masuk 30 @3.100 → modal 3.050. Laba tidak melompat hanya karena baru kulakan. |
| **Stok lama kosong → harga beli terbaru langsung dipakai** | Tidak ada gunanya merata-ratakan dengan angka yang barangnya sudah tidak ada. |
| **Yang dicatat sebagai pengeluaran = yang dibayar** | Belum dibayar bukan berarti sudah keluar uang. Sisa masuk daftar utang supplier. |
| **Utang supplier terpisah dari kasbon pelanggan** | Dua arah uang yang berbeda; mencampurnya membuat buku kasbon tidak bisa dipercaya. |
| **Stok menambah cabang yang sedang dibuka** | Toko bercabang menerima barang di cabangnya sendiri. |
| **Jumlah beli 0 bukan pembelian** | Isian kosong berarti belum diisi, bukan "beli nol barang". |

Nilai yang diketik dibatasi: jumlah 1–100.000, harga beli 0–100.000.000 (nol rupiah
sah untuk barang bonus).

---

## 3. Yang dibangun

### 3.1 Data (`src/data/purchases.ts`, baru — murni)

```
PurchaseItem        { productId, name, unit, qty, unitCost }
Purchase            { id, outletId?, supplierName, createdAt, items[], total, paid,
                      method, payableId?, note?, costChanges[] }
averageCost()       rata-rata tertimbang dari stok lama + barang masuk
purchaseTotal()     total rupiah nota
purchaseRemaining() sisa yang belum dibayar
parseQty()/parseMoney()  angka aman; kosong/negatif → null
buildPurchaseItems()     hanya barang yang jumlahnya diisi
validatePurchase()       pesan penolakan berbahasa warung
previewCosts()           HPP & stok sebelum vs sesudah (dipakai layar)
supplierSuggestions()    saran nama supplier dari riwayat
lastUnitCost()           harga beli terakhir per barang
purchaseSummaryText() / purchaseReportText()   ringkasan + nota siap dibagikan
PURCHASE_METHODS         tunai / QRIS-bank / transfer (tanpa kasbon)
```

### 3.2 Aksi `commitPurchase`

1. memeriksa isian (supplier wajib, minimal satu barang, dibayar 0…total);
2. menghitung **HPP baru per barang** dari stok cabang yang sedang dibuka;
3. menambah stok lewat `applyStockDelta()` dan menulis `costPrice` baru;
4. mencatat **pengeluaran kulakan** sebesar yang dibayar (kategori *Kulakan Grosir*);
5. membuat **utang supplier** untuk sisanya (jatuh tempo bawaan 7 hari);
6. menyimpan nota kulakan lengkap dengan jejak `costChanges` (modal sebelum → sesudah);
7. mengirim ke antrean sinkron: `product` (harga modal baru), `stock_delta`
   beralasan `purchase`, `transaction`, dan `payable` bila ada sisa.

### 3.3 Layar `app/pembelian.tsx` (baru)

| Bagian | Isi |
| --- | --- |
| Kepala | "Catat kulakan" + nama cabang (bila lebih dari satu) |
| Penjelas | satu kartu: stok bertambah, modal dihitung rata-rata |
| Supplier | isian bebas + tombol saran dari riwayat kulakan |
| Daftar barang | tiap baris: stok & modal sekarang, isian **Jumlah** dan **Harga beli**, subtotal, dan kalimat "Modal rata-rata menjadi Rp 3.011 (dari Rp 2.900)" |
| Pembayaran | **Lunas / Bayar sebagian / Belum bayar**, isian nominal, pilihan Tunai / QRIS / Transfer |
| Sisa | "Sisa Rp 41.000 dicatat sebagai utang supplier." |
| Riwayat | 5 kulakan terakhir + tanda Lunas / Belum lunas |
| Footer | ringkasan barang & total, tombol Simpan |
| Sheet hasil | total / dibayar / sisa, daftar barang, daftar perubahan harga modal, Bagikan nota |

Pintu masuk: ubin **Kulakan** di Beranda, dan baris **Kulakan & harga modal** di
Pengaturan (bagian Operasional toko).

### 3.4 Cadangan

`purchases` ikut tercadangkan, tergabung, dan dipulihkan; penghitung data bertambah
menjadi **12** (sebelas jenis data + pesanan). Berkas cadangan lama tanpa `purchases`
tetap terbuka.

---

## 4. Berkas yang disentuh

```
src/data/purchases.ts          # BARU — aturan kulakan & HPP rata-rata (murni, diuji Node)
src/data/types.ts              # PurchaseItem, Purchase, purchases di state & RemotePatch
src/data/store.ts              # field purchases, aksi commitPurchase, partialize/backup/restore
src/data/outlets.ts            # ScopedData.purchases → riwayat kulakan tersaring per cabang
src/services/backup.ts         # purchases di bangun/parse/terapkan/gabung + penghitung "kulakan"
app/pembelian.tsx              # BARU — layar Catat kulakan
app/_layout.tsx                # rute "pembelian"
app/(tabs)/index.tsx           # ubin Kulakan
app/pengaturan.tsx             # baris Kulakan & harga modal
app/cadangan.tsx, app/privasi.tsx  # ikut menyebut data kulakan
supabase/tests/purchases.test.mts  # BARU — 14 pemeriksaan
supabase/tests/backup.test.mts     # penghitung data 11 → 12
package.json                   # skrip test:purchases
```

---

## 5. Uji

| Suite | Sebelum | Sesudah |
| --- | --- | --- |
| `test:db` | 148 | 148 |
| `test:mappers` | 12 | 12 |
| `test:backup` | 23 | 23 (kunci "kulakan" bertambah) |
| `test:rbac` | 9 | 9 |
| `test:orders` | 9 | 9 |
| `test:notif` | 10 | 10 |
| `test:lan` | 10 | 10 |
| `test:customers` | 19 | 19 |
| `test:outlets` | 18 | 18 |
| `test:opname` | 11 | 11 |
| `test:purchases` | — | **14** |
| `test:copy` | 8 | 8 |
| `typecheck` | 0 | 0 |

Pemeriksaan layar (Playwright 412×892, 0 galat konsol):

| Berkas | Isi |
| --- | --- |
| `108-beranda-kulakan.png` | Ubin **Kulakan** di aksi cepat |
| `109-kulakan-kosong.png` | Layar kulakan sebelum diisi |
| `110-kulakan-terisi.png` | Indomie 30 @3.100, Teh Botol 12 @4.000, modal rata-rata langsung terlihat |
| `111-kulakan-bayar-sebagian.png` | Bayar sebagian Rp 100.000 dari total Rp 141.000, "Sisa Rp 41.000 dicatat sebagai utang supplier" |
| `112-kulakan-hasil.png` | Sheet hasil: total/dibayar/sisa, modal Indomie 2.900 → 3.011, Teh Botol 3.800 → 3.900 |
| `113-kulakan-riwayat.png` | Riwayat kulakan tersimpan |
| `114-stok-modal-baru.png` | Katalog: Indomie 54 pcs modal Rp 3.011, Teh Botol 24 botol modal Rp 3.900 |
| `115-utang-kulakan.png` | Menu Kasbon & utang: "Utang supplier Rp 41.000, 1 aktif, 7 hari lagi" |
| `116-beranda-sesudah-kulakan.png` | Beranda: "Keluar hari ini Rp 100.000", ubin Kulakan "1 tercatat" |

Pemeriksaan data setelah menyimpan (dibaca langsung dari penyimpanan):

```
stok   : out_a Indomie 24 → 54 | Teh Botol 12 → 24
modal  : Indomie 2.900 → 3.011  ((24×2.900 + 30×3.100) / 54)
         Teh Botol 3.800 → 3.900 ((12×3.800 + 12×4.000) / 24)
uang   : pengeluaran tercatat Rp 100.000 (bukan Rp 141.000)
utang  : Agen Sumber Rejeki Rp 41.000
```

---

## 6. Batas yang belum dikerjakan

| Hal | Alasan |
| --- | --- |
| Buku supplier (alamat, telepon, syarat tempo) | Nama supplier + saran dari riwayat sudah cukup; master supplier menyusul bersama akun |
| Nota kulakan sebagai lampiran foto | Ditunda bersama lampiran foto lain |
| Retur ke supplier (barang rusak dikembalikan) | Butuh alur sendiri (barang keluar + pengurang utang) |
| Riwayat harga beli per barang (grafik) | Data `purchases` sudah menyimpannya; tampilan menyusul |
| Titip barang (konsinyasi) | Model kepemilikan barang berbeda, belum perlu sekarang |

---

## 7. Ringkasan untuk pemilik warung

- Barang datang dari agen → buka **Kulakan** (di Beranda) atau **Pengaturan → Kulakan &
  harga modal**.
- Isi nama supplier, jumlah barang, dan harga belinya. Kalau lupa harga, isian sudah
  terisi modal terakhir.
- Pilih **Lunas**, **Bayar sebagian**, atau **Belum bayar**. Aplikasi yang menghitung
  sisanya dan menaruhnya di daftar utang supplier.
- Setelah disimpan: stok bertambah, harga modal ikut rata-rata, dan laba penjualan
  berikutnya sudah memakai modal yang benar.
