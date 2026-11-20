# Audit menyeluruh — Sprint 17 (logika uang, alur fitur, tata letak)

Tanggal audit: 20 November 2026
Cakupan: seluruh `app/` (32 layar) + `src/` (61 berkas TypeScript), alur uang, penyimpanan lokal, ekspor, dan tampilan.
Metode:

1. **Statis** — `npm run typecheck`, 17 suite uji, pembacaan kode inti (`store.ts`, `selectors.ts`, `outlets.ts`, `purchases.ts`, `suppliers.ts`) dan layar penyimpan data.
2. **Uji alur uang end-to-end** (baru: `npm run test:store`) — 59 pemeriksaan yang menjalankan `src/data/store.ts` sungguhan di Node dengan penyimpanan tiruan: kasir, kasbon, diskon/pajak, kulakan, retur, opname, pesanan + DP, shift, cabang, cadangan.
3. **Telusur semua layar** dengan Playwright pada build web: 30 rute × 3 keadaan data (kosong/instalasi baru, data terisi, data ekstrem), viewport 412 dan **360 px**, memeriksa galat konsol, layar merah, dan luapan tata letak.
4. **Uji interaksi** pada alur yang diperbaiki (kasir tunai + pelanggan, struk, tagih kasbon).

Hasil akhir: **0 galat TypeScript, 0 galat konsol, 0 layar gagal** pada semua rute; **17 suite / 403 pemeriksaan hijau**.

> **Pembaruan 20 November 2026 (ronde lanjutan).** Tiga butir yang semula ditahan sudah dikerjakan atas persetujuan pemilik: rincian barang pada pengeluaran kini murni catatan, menghapus transaksi hasil pesanan membuka pesanan kembali, dan nama pelanggan yang diketik manual di kasir otomatis masuk buku pelanggan. Tambahan 9 pemeriksaan membuat total menjadi **17 suite / 412 pemeriksaan hijau** — lihat §5.

---

## 1. Ringkasan temuan

| # | Tingkat | Temuan | Status |
| --- | --- | --- | --- |
| 1 | **Kritis (uang)** | Pesanan yang dibayar tunai/QRIS tetap tercatat sebagai **kasbon**: kas tidak bertambah, pelanggan terlihat berutang | diperbaiki |
| 2 | **Tinggi (uang)** | Retur barang dihitung sebagai **uang keluar**: saldo kas turun & laporan "uang keluar" naik sebesar nilai retur, padahal tidak ada uang keluar | diperbaiki |
| 3 | **Tinggi (uang)** | Tutup shift menghitung kas **semua cabang**: kas seharusnya 20.000 tercatat 119.000 (selisih palsu) | diperbaiki |
| 4 | Sedang (data) | Hapus kasbon mengembalikan stok ke **cabang yang salah** saat toko punya 2 cabang | diperbaiki |
| 5 | Sedang (sinkron) | Hapus kasbon tidak pernah mengirim perintah hapus transaksi ke server (antrean kosong) | diperbaiki |
| 6 | Sedang (fitur) | Transaksi tunai tidak bisa ditautkan ke pelanggan → "total belanja" & poin pelanggan hanya menghitung kasbon | diperbaiki |
| 7 | Ringan (pindai) | Pindai barcode memeriksa stok dari data mentah, bukan stok cabang yang dibuka | diperbaiki |
| 8 | Ringan (UI) | Nama toko panjang + jam operasional saling menabrak; jam terpotong di layar 360 px | diperbaiki |
| 9 | Ringan (UI) | Lencana "1 telat" pada kotak Aksi cepat melebar keluar kotak di layar 360 px | diperbaiki |
| 10 | Ringan (UI) | Label "Masuk hari ini / Keluar hari ini" terpotong di 3 kolom layar sempit | diperbaiki |
| 11 | Ringan (UI) | Setelah "Hapus semua data", kotak template pesan masih berisi template lama (tidak ikut kembali ke bawaan) | diperbaiki |

Tidak ditemukan: layar gagal render, galat konsol, luapan horizontal, data contoh yang tidak sengaja masuk, atau rumus uang yang tidak konsisten di luar empat butir di atas.

---

## 2. Rincian perbaikan

### 2.1 Pesanan dibayar tunai berubah jadi kasbon — **kritis**

**Gejala.** Buat pesanan 20.000 tanpa DP → "Jadikan transaksi" → pilih **Tunai**. Pesanan berstatus selesai, tetapi: kas tidak bertambah Rp 1 pun, dan pelanggan muncul di Buku Kasbon dengan utang Rp 20.000. Pada pesanan berDP (mis. DP 5.000 dari 50.000) yang dilunasi tunai saat diambil, sisa Rp 45.000 juga menjadi piutang.

**Sebab.** `src/data/store.ts` → `completeOrder`:

```ts
const useKasbon = remaining > 0 || payment.method === 'kasbon';
```

`remaining` selalu > 0 bila tidak ada DP, sehingga semua pesanan dipaksa lewat jalur kasbon dan metode yang dipilih kasir diabaikan.

**Perbaikan.** Metode pilihan pengguna dihormati; jalur kasbon hanya dipakai bila memang dipilih (sesuai teks di layar: "Sisa … masuk kasbon otomatis" hanya untuk pesanan berDP).

```ts
const useKasbon = payment.method === 'kasbon';
…
if (deposit > 0 && useKasbon) { /* DP dicatat sebagai pembayaran pertama */ }
```

**Bukti uji.** `npm run test:store` — "pesanan berDP yang dibayar tunai: kas masuk penuh, tidak jadi kasbon", "pesanan tanpa DP dibayar QRIS tidak membuat piutang".

### 2.2 Retur barang dihitung sebagai uang keluar — **tinggi**

**Gejala.** Kulakan 90.000 belum dibayar → retur 2 barang senilai 6.000. Saldo kas di Beranda turun 6.000, dan laporan periode mencatat "uang keluar" 6.000. Padahal tidak ada uang yang keluar: utang berkurang karena barang kembali.

**Sebab.** `commitReturn` mencatat pemotongan utang sebagai pembayaran biasa (`DebtPayment` metode `cash`), lalu `selectors.cashBalance` & `summarize` menjumlah **semua** pembayaran utang sebagai kas keluar.

**Perbaikan.** Pembayaran bertanda `source: 'retur'`; helper baru `debtPaidCash()` dipakai untuk kas, laporan, pemisahan tabungan, dan pembatalan pemisahan. Utang tetap berkurang (tampilan supplier tidak berubah).

**Bukti uji.** "retur: kas, uang keluar, dan saldo kas tetap konsisten" → uang keluar 0, kas tetap 100.000.

### 2.3 Tutup shift menghitung kas antar-cabang — **tinggi**

**Gejala.** Toko 2 cabang, shift di cabang A (modal 10.000, penjualan tunai A 10.000). Kasir cabang B menjual tunai 99.000. Layar Shift menampilkan "kas seharusnya 20.000", tetapi setelah ditutup tersimpan 119.000 dan selisih −99.000.

**Sebab.** `closeShift` menjumlah `state.transactions` tanpa menyaring cabang; layar memakai `shiftCash()` yang sudah tersaring (karena datanya hasil `scopeData`), jadi angka layar dan angka tersimpan berbeda.

**Perbaikan.** `closeShift` menyaring `tx.outletId === shift.outletId`.

**Bukti uji.** "tutup shift cabang A tidak terpengaruh kasir cabang B" → 20.000.

### 2.4 Hapus kasbon mengembalikan stok ke cabang yang salah — **sedang**

**Gejala.** Toko 2 cabang; kasbon 2 barang dibuat di cabang B, lalu dihapus. Stok cabang B tetap 0 (barang "hilang"), sedangkan kolom stok lama berubah.

**Sebab.** `deleteReceivable` memanggil `applyStockDeltas(…, null)` sehingga penulisan stok jatuh ke kolom `stock` global, bukan `stockByOutlet[cabang]`.

**Perbaikan.** Mengembalikan stok per transaksi memakai `tx.outletId`.

**Bukti uji.** "hapus kasbon mengembalikan stok ke cabang transaksinya" → cabang B 2, cabang A 10 (tidak tersentuh).

### 2.5 Antrean hapus transaksi tidak pernah terkirim — **sedang (sinkron)**

**Gejala.** Menghapus kasbon menghasilkan transaksi yang hilang di HP, tetapi tetap ada di server saat mode cloud aktif (omzet server lebih besar).

**Sebab.** Daftar transaksi diambil **setelah** dihapus dari state:

```ts
set((s) => ({ transactions: s.transactions.filter((t) => t.receivableId !== id) }));
for (const tx of get().transactions.filter((t) => t.receivableId === id)) { /* kosong */ }
```

**Perbaikan.** Daftar transaksi disimpan sebelum `set`, lalu dipakai untuk antrean.

### 2.6 Transaksi tunai tidak bisa ditautkan ke pelanggan — **sedang**

**Gejala.** Layar Pelanggan menampilkan "Total belanja" dan "Poin: setiap Rp 10.000 belanja jadi 1 poin", tetapi pelanggan yang selalu bayar tunai selalu tercatat "Belum pernah belanja".

**Sebab.** Pilihan pelanggan di kasir hanya muncul saat metode **kasbon**, dan `customerId` hanya dikirim untuk kasbon.

**Perbaikan.** Baris "Pelanggan tersimpan" tampil untuk semua metode (untuk non-kasbon diberi keterangan *opsional*); ketuk untuk memilih, ketuk lagi untuk melepas. `customerId` selalu dikirim, sehingga riwayat & poin ikut terhitung.

**Bukti.** Uji interaksi: jual tunai + pilih "Bu Ratna" → transaksi tersimpan dengan `customerId: cus_1`, kasbon baru 0, struk tampil normal.

### 2.7 Pindai barcode memakai stok mentah — **ringan**

`findByBarcode` mengembalikan produk dari state mentah (`product.stock`), padahal aturan proyek: selalu stok cabang. Sekarang hasil pindai dipetakan ke `data.products` (scoped) sebelum masuk keranjang.

### 2.8–2.10 Tata letak layar sempit (360 px)

| Sebelum | Sesudah |
| --- | --- |
| Chip cabang + jam operasional menabrak tombol lonceng; jam tampil "06:00–21:0…" | Chip cabang yang dipotong lebih dulu, jam utuh (`135` vs `138`) |
| Lencana "1 telat" melebar keluar kotak Aksi cepat | Lencana pil kecil di dalam kotak, dipotong rapi |
| Label "Masuk hari i…", "Keluar hari…" | "Masuk" / "Keluar" (keterangan tetap di baris bawah) |

### 2.11 Template pesan tidak ikut direset — **ringan**

`confirmReset` menulis ulang `setTemplate(template)` — nilai template **sebelum** reset. Sekarang form membaca ulang `useAppStore.getState().settings.reminderTemplate` sehingga cocok dengan data yang baru direset.

---

## 3. Alat audit baru: `npm run test:store`

Alur uang sebelumnya hanya bisa diuji lewat layar, karena `store.ts` bergantung pada expo-sqlite & AsyncStorage. Sekarang:

```
supabase/tests/store/cases.ts        # 59 pemeriksaan alur uang
supabase/tests/stubs/*.mjs           # tiruan penyimpanan (kv, antrean)
supabase/tests/store.test.mts        # membundel + menjalankan di Node (esbuild)
```

Yang diperiksa antara lain: stok & kas pada penjualan, kasbon (termasuk lebih bayar yang harus ditolak), diskon persen + pajak, HPP rata-rata kulakan, utang hanya sebesar sisa, retur memotong utang tanpa kas, opname menimpa stok, pesanan + DP, shift (termasuk lintas cabang), pemisahan tabungan, cadangan (ekspor/impor, mode merge, cadangan versi lama), isolasi stok antar cabang, dan invarian **saldo kas = uang masuk − uang keluar − tabungan**.

Alat ini juga menangkap dua kesalahan asumsi dokumentasi lama: "laba" di aplikasi adalah **kas** (omzet − pengeluaran), bukan omzet − HPP; dan HPP disimpan terpisah di `cogs`.

---

## 4. Hasil uji akhir

```
db 148 · mappers 12 · backup 23 · rbac 9 · orders 9 · notif 20 · lan 10
customers 19 · outlets 18 · opname 11 · purchases 14 · suppliers 15
laporan 11 · reminders 12 · ekspor 14 · copy 8 · store 59
                                        ── total 412 pemeriksaan, semua hijau
typecheck 0 galat
```

Telusur layar (Playwright):

| Keadaan data | Rute diperiksa | Galat konsol | Layar gagal | Luapan |
| --- | --- | --- | --- | --- |
| Instalasi baru (kosong) | 27 | 0 | 0 | 0 |
| Data terisi (kasbon telat, pesanan, kulakan, retur, opname, 2 cabang) | 30 | 0 | 0 | 0 |
| Data ekstrem (nama panjang, nominal ratusan juta) @360 px | 30 | 0 | 0 | 0 |

Uji interaksi ronde lanjutan (Playwright, 412 px): penjualan tunai dengan nama pelanggan diketik → pelanggan baru masuk buku (3 pelanggan), transaksi bertaut `customerId`, stok cabang 54 → 53; pengeluaran ber-rincian → transaksi tersimpan dengan 1 item, seluruh stok tidak berubah; pesanan → transaksi → detail transaksi. **0 galat konsol.**

Screenshot bukti: `docs/screenshots/135`–`142` (ronde audit) dan `143`–`148` (ronde lanjutan: nama pelanggan di kasir, buku pelanggan, transaksi hasil pesanan, rincian pengeluaran).

---

## 5. Tindak lanjut: tiga butir yang semula ditahan — **sudah diperbaiki**

Ketiga butir ini semula ditahan karena mengubah perilaku yang mungkin sudah dipakai. Setelah pemilik menyetujui, ketiganya dikerjakan pada ronde lanjutan (20 November 2026).

### 5.1 Rincian barang pada pengeluaran tidak lagi menambah stok

Dulu: mencatat pengeluaran (mis. "beli gas 3 tabung") dengan rincian barang ikut menambah stok, tetapi **harga modal tidak diperbarui** — stok naik tanpa HPP, sehingga laporan laba per barang bisa menyesatkan.

Sekarang rincian barang pada pengeluaran dipakai sebagai **catatan** saja:

- `addTransaction` hanya menyentuh stok bila `type === 'sale'` (`applyStockDeltas(..., -1, outletId)`); jalur pengeluaran menyimpan `items` apa adanya tanpa mengubah `products`.
- `deleteTransaction` hanya mengembalikan stok untuk transaksi `sale`, jadi menghapus pengeluaran ber-rincian juga tidak menggeser stok.
- Penambahan stok yang benar tetap lewat **Catat kulakan** (harga modal ikut diperbarui, HPP rata-rata dihitung).
- Layar Catat menampilkan petunjuk: "Catatan barang yang dibeli. Stok tidak berubah di sini — pakai Catat kulakan."

Bukti: `docs/screenshots/147-pengeluaran-rincian-catatan.png`, `148-pengeluaran-item-sheet.png`.

### 5.2 Menghapus transaksi hasil pesanan membuka pesanan kembali

Dulu: transaksi hasil "Jadikan transaksi" dihapus, tetapi pesanan tetap berstatus **selesai** dengan tautan transaksi yang sudah tidak ada — pesanan tidak bisa diproses ulang dan hilang dari daftar kerja.

Sekarang `deleteTransaction` ikut memeriksa pesanan: setiap `Order` berstatus `selesai` yang `transactionId`-nya sama dengan transaksi yang dihapus dikembalikan ke `{ status: 'terbuka', transactionId: undefined }`, lalu disimpan ke antrean sinkron. Pesanan muncul lagi di daftar "Perlu ditindak" dengan tombol "Jadikan transaksi".

Bukti: `docs/screenshots/146-detail-transaksi-pesanan.png` (catatan "Pesanan Pak Budi" pada transaksi). Pengujian di tingkat store: "hapus transaksi pesanan → pesanan terbuka lagi" dan "transaksi biasa tidak membuat pesanan".

> Catatan pengujian web: tombol "Hapus transaksi" memakai konfirmasi bawaan Android (`Alert.alert`), yang **tidak diimplementasikan di react-native-web**. Karena itu alur hapus tidak bisa dipicu lewat pratinjau web; perilakunya diverifikasi pada uji store (logika murni) dan akan berjalan normal di aplikasi Android.

### 5.3 Nama pelanggan yang diketik manual langsung masuk buku pelanggan

Dulu: pelanggan harus dipilih dari buku agar poin & riwayat belanja terhitung. Nama yang diketik manual hanya menempel di catatan transaksi, sehingga pelanggan langganan yang namanya diketik tetap tidak punya poin.

Sekarang:

- Kolom nama pelanggan tersedia untuk **semua metode bayar** di layar Kasir (wajib untuk kasbon, opsional untuk tunai/QRIS/transfer), dengan petunjuk singkat di bawahnya.
- Saat menyimpan, `addTransaction` menerima `saveCustomer`. Bila nama diketik dan belum cocok dengan buku (`matchCustomer`), pelanggan baru dibuat (`uid('cus')`, nama dirapikan `validateCustomer`: spasi berlebih dibuang, maksimal 60 karakter) dan transaksi langsung tertaut lewat `customerId`.
- Bila nama sudah ada di buku, pelanggan lama yang dipakai — tidak ada duplikat.
- Layar Catat juga punya kartu "Pelanggan tetap (opsional)" untuk penjualan non-kasbon.
- Ejaan dibiarkan seperti yang diketik (mis. "bu sri" tersimpan "bu sri"); pencocokan nama tidak membedakan huruf besar/kecil.

Bukti: `docs/screenshots/143-kasir-nama-pelanggan.png`, `144-transaksi-tersimpan.png`, `145-buku-pelanggan.png`.

### 5.4 Pemeriksaan baru di `npm run test:store` (50 → 59)

1. rincian barang pada pengeluaran tidak mengubah stok
2. menghapus pengeluaran ber-rincian tidak menggeser stok
3. penjualan tetap mengurangi stok cabang yang dibuka
4. hapus transaksi hasil pesanan → pesanan kembali "terbuka" tanpa tautan transaksi
5. transaksi biasa (tanpa pesanan) tidak membuat pesanan baru
6. nama pelanggan baru tersimpan ke buku + transaksi tertaut
7. nama yang sudah ada di buku dipakai ulang (tanpa duplikat)
8. tanpa `saveCustomer` buku pelanggan tidak bertambah
9. kasbon tanpa nama pelanggan tetap ditolak

---

## 6. Yang belum diperbaiki (sengaja, beserta alasannya)

| Hal | Alasan |
| --- | --- |
| Tombol unduh PDF/CSV tidak menghasilkan berkas di pratinjau web | Keterbatasan web (pencetakan & berbagi berkas hanya ada di Android). Di aplikasi Android berjalan normal |
| Text panjang mengecil otomatis (`adjustsFontSizeToFit`) tidak berlaku di web | Hanya tampilan pratinjau; di Android nominal besar mengecil sendiri |
| Konfirmasi hapus memakai `Alert.alert` bawaan Android | Tidak ada padanannya di web; bukan bug aplikasi |

---

## 7. Cara mengulang audit ini

```bash
npm ci
npm run typecheck
npm run test:store        # alur uang end-to-end (59 pemeriksaan)
npm run test:db           # dan suite lainnya / lihat README
npx expo export --platform web --output-dir /tmp/web-audit
# lalu jalankan skrip Playwright yang menelusuri 30 rute pada 412 px dan 360 px
```
