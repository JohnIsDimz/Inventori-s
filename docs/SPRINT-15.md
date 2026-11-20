# Sprint 15 — Buku supplier & retur barang

Tanggal: 20 November 2026
Status: **selesai**. Seluruh uji hijau (13 suite), layar supplier dan retur tersambung ke
stok, utang, dan kulakan.

---

## 1. Masalah yang diselesaikan

Setelah Sprint 14, kulakan sudah tercatat. Tetapi dua hal masih menggantung:

1. **Siapa suppliernya?** Riwayat kulakan hanya menyimpan nama. Kalau agennya lima,
   pemilik harus membuka nota satu per satu untuk tahu "ke siapa saya masih berutang,
   dan berapa".
2. **Barang rusak/salah kirim.** Selama ini satu-satunya jalan adalah mengembalikan
   barang tanpa catatan, lalu stok dan utang jadi tidak cocok. Tidak ada jejak bahwa
   barang keluar bukan karena terjual.

Sekarang: satu layar berisi daftar agen lengkap dengan utang dan saldo, dan satu layar
retur yang mengurus stok + utang sekaligus.

---

## 2. Aturan yang dipegang

| Aturan | Alasan |
| --- | --- |
| **Supplier dicocokkan lewat nama yang dinormalkan** | Kulakan lama hanya menyimpan nama; tanpa ini semua riwayat lama jadi tidak terbaca. |
| **Buku supplier melengkapi sendiri dari riwayat** | Pemilik tidak perlu mengetik ulang agen yang sudah pernah kulakan (`ensureSuppliers`, idempoten). |
| **Nama ganda ditolak** | "Agen Sumber Rejeki" dan "agen sumber rejeki" adalah orang yang sama; kalau dibiarkan, utangnya terpecah dua. |
| **Ubah nama supplier ikut merapikan riwayat** | Nota kulakan, utang, dan retur mengikuti nama baru — riwayat tidak pecah. |
| **Retur tidak membuat uang tunai muncul di kas** | Nilai retur memotong utang kulakan lebih dulu; sisanya menjadi saldo. Uang tunai yang benar-benar diterima dicatat pemilik lewat Tabungan/modal. |
| **Saldo retur tidak bisa dipakai dua kali** | Saldo = nilai retur − saldo yang sudah dipakai saat kulakan berikutnya. |
| **Retur dibatasi jumlah beli & stok rak** | Tidak mungkin meretur barang yang sudah terjual. |
| **Supplier yang masih berutang tidak bisa diarsipkan** | Supaya utangnya tidak "hilang" dari daftar. |

---

## 3. Yang dibangun

### 3.1 Data (`src/data/suppliers.ts`, baru — murni)

```
SupplierInput / validateSupplier()   nama wajib, tanpa ganda, HP diseragamkan ke 62…
cleanSupplierName() / supplierKey()  perapian nama & kunci pencocokan
supplierNamesFrom()                  nama dari riwayat kulakan + utang (isi awal buku)
supplierStats()                      jumlah kulakan, total, utang, retur, saldo, terakhir
availableCredit()                    saldo retur yang belum terpakai per supplier
openPayablesFor()                    utang terbuka, yang paling lama di atas
returnCandidates()                   barang yang bisa diretur (batas = beli & stok rak)
buildReturnItems() / parseReturnQty()  isian → baris retur, dipotong ke batas
validateReturn()                     pembagian nilai: potong utang + saldo
returnSummaryText() / returnReportText()   ringkasan & nota retur siap dibagikan
```

Tipe baru: `Supplier { id, name, phone?, address?, note?, archivedAt? }` dan
`PurchaseReturn { supplierName, items[], total, appliedAmount, creditValue, … }`.
`Purchase` mendapat `creditUsed` — saldo retur yang dipakai membayar kulakan.

### 3.2 Aksi store

| Aksi | Perilaku |
| --- | --- |
| `ensureSuppliers()` | membuat entri supplier dari nama di kulakan & utang yang belum ada (idempoten) |
| `addSupplier` / `updateSupplier` / `archiveSupplier` | validasi, ubah nama merapikan riwayat, arsip ditolak bila masih ada utang |
| `commitReturn()` | stok cabang berkurang, nilai retur memotong utang tertua, sisanya jadi saldo, `stock_delta` beralasan `return` |
| `commitPurchase()` (diperbarui) | saldo retur dipakai otomatis: uang tunai yang keluar = total − saldo |

### 3.3 Layar

| Layar | Isi |
| --- | --- |
| `app/supplier.tsx` (baru) | daftar supplier + chip utang / "ada saldo retur", cari, tambah/ubah (nama, HP, alamat, catatan), detail: kulakan/utang/saldo, 3 kulakan terakhir, tombol Retur / Catat kulakan / Ubah / Arsipkan |
| `app/retur.tsx` (baru) | pilih supplier (chip), catatan, daftar barang dengan "Beli … • di rak …" dan batas otomatis, footer "Potong utang Rp 9.300 • saldo …", Sheet hasil (nilai retur, potong utang, saldo) + bagikan nota |
| `app/pembelian.tsx` | menampilkan "Saldo retur Rp X dipakai otomatis" dan baris saldo terpakai di Sheet hasil |
| `Pengaturan` | baris **Buku supplier** — jumlah supplier / "Daftar agen, utang & retur barang" |

### 3.4 Cadangan

`suppliers` dan `purchaseReturns` ikut tercadangkan, tergabung, dan dipulihkan;
penghitung data bertambah menjadi **14** (tiga belas jenis data + pesanan). Berkas
cadangan lama tetap terbuka.

---

## 4. Berkas yang disentuh

```
src/data/suppliers.ts        # BARU — buku supplier & retur (murni, diuji Node)
src/data/types.ts            # Supplier, PurchaseReturn, ReturnItem, Purchase.creditUsed
src/data/purchases.ts        # sisa kulakan memperhitungkan saldo retur
src/data/store.ts            # field suppliers/purchaseReturns, 4 aksi baru, saldo di kulakan
src/data/outlets.ts          # supplier milik toko; retur tersaring per cabang
src/services/backup.ts       # suppliers + purchaseReturns + penghitung "supplier"/"retur"
app/supplier.tsx             # BARU — buku supplier
app/retur.tsx                # BARU — retur barang
app/pembelian.tsx            # saldo retur dipakai otomatis
app/pengaturan.tsx           # baris Buku supplier
app/_layout.tsx              # rute "supplier" & "retur", ensureSuppliers() setelah data siap
app/cadangan.tsx, app/privasi.tsx
supabase/tests/suppliers.test.mts  # BARU — 15 pemeriksaan
supabase/tests/backup.test.mts     # penghitung data 12 → 14
package.json                 # skrip test:suppliers
```

---

## 5. Uji

| Suite | Sebelum | Sesudah |
| --- | --- | --- |
| `test:db` | 148 | 148 |
| `test:mappers` | 12 | 12 |
| `test:backup` | 23 | 23 (kunci "supplier" & "retur") |
| `test:rbac` | 9 | 9 |
| `test:orders` | 9 | 9 |
| `test:notif` | 10 | 10 |
| `test:lan` | 10 | 10 |
| `test:customers` | 19 | 19 |
| `test:outlets` | 18 | 18 |
| `test:opname` | 11 | 11 |
| `test:purchases` | 14 | 14 |
| `test:suppliers` | — | **15** |
| `test:copy` | 8 | 8 |
| `typecheck` | 0 | 0 |

Pemeriksaan layar (Playwright 412×892, 0 galat konsol):

| Berkas | Isi |
| --- | --- |
| `117-buku-supplier.png` | Buku supplier terisi otomatis dari riwayat kulakan ("Agen Sumber Rejeki • 1 kulakan", chip utang) |
| `118-supplier-detail.png` | Detail supplier: kulakan 1, utang Rp 41.000, saldo retur —, kulakan terakhir 19 Nov Rp 141.000 |
| `119-retur-kosong.png` | Layar retur: pilih supplier, daftar barang "Beli 30 pcs • di rak 54 pcs • Rp 3.100" |
| `120-retur-terisi.png` | Indomie 3 pcs — footer "Potong utang Rp 9.300" |
| `121-retur-hasil.png` | Sheet: nilai retur Rp 9.300, potong utang Rp 9.300, saldo — |
| `122-retur-jadi-saldo.png` | Retur kedua Rp 40.000 → potong utang Rp 31.700 (utang lunas), saldo Rp 8.300 |
| `123-supplier-saldo.png` | Detail supplier setelah retur: utang **Lunas**, saldo retur **Rp 8.300** |

Pemeriksaan data setelah dua retur (dibaca langsung dari penyimpanan):

```
supplier otomatis : ['Agen Sumber Rejeki']  (tanpa mengetik apa pun)
stok              : Indomie 54 → 51 (retur 3) | Teh Botol 24 → 14 (retur 10)
utang             : Rp 41.000 → Rp 31.700 → Rp 0 (lunas, dua kali dipotong)
saldo retur       : Rp 8.300 (menunggu dipakai kulakan berikutnya)
```

---

## 6. Batas yang belum dikerjakan

| Hal | Alasan |
| --- | --- |
| Uang tunai kembali dari supplier otomatis masuk kas | Butuh arah uang baru yang tidak mengacaukan laporan; sekarang dicatat pemilik lewat Tabungan/modal, dan retur sudah mengurangi beban utang |
| Retur per nota (memilih satu kulakan tertentu) | Barang digabung per supplier; nota tetap tercatat di riwayat kulakan |
| Tukar barang (retur lalu langsung kulakan pengganti) | Bisa dilakukan dua langkah: retur, lalu catat kulakan — saldonya otomatis terpakai |
| Pengingat otomatis ke supplier | Menyusul bersama pengingat kasbon (WhatsApp) |
| Riwayat harga beli per supplier (grafik) | Direncanakan di sprint laporan berikutnya |

---

## 7. Ringkasan untuk pemilik warung

- Buka **Pengaturan → Buku supplier**. Agen yang pernah kamu kulakan sudah ada di sana
  lengkap dengan nomor HP (kalau diisi) dan utang yang belum dibayar.
- Barang rusak atau salah kirim: buka suppliernya → **Retur barang** → isi jumlahnya.
- Nilai retur langsung memotong utang ke agen itu. Kalau utangnya sudah lunas, sisanya
  jadi **saldo** dan otomatis memotong pembayaran kulakan berikutnya — tidak ada uang
  yang hilang di tengah jalan.
