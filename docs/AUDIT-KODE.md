# Audit Kode & Keamanan — WarungLui

> Audit terbaru: [`docs/AUDIT-SPRINT-17.md`](./AUDIT-SPRINT-17.md) (20 November 2026) — mencakup seluruh fitur sampai Sprint 17, termasuk uji alur uang end-to-end (`npm run test:store`).

Tanggal audit: 19 November 2026
Cakupan: seluruh kode aplikasi (`app/`, `src/`), alur data, penyimpanan lokal, ekspor berkas, dan tampilan.
Metode: pembacaan kode baris-per-baris, pemeriksaan tipe (`tsc --noEmit`), build nyata (`expo export` Android + Web), dan uji otomatis Playwright pada build web (viewport 390×844 @2x) dengan dua skenario: **instalasi baru tanpa data** dan **data terisi**.

Hasil akhir: **0 error TypeScript, 0 error runtime, 0 error konsol** pada kedua skenario.

---

## 1. Ringkasan

| Kategori | Ditemukan | Diperbaiki | Ditunda (dengan alasan) |
| --- | --- | --- | --- |
| Keamanan & integritas data | 6 | 6 | 0 |
| Bug logika / data | 7 | 7 | 0 |
| Fitur tidak jelas / setengah jalan | 5 | 5 | 0 |
| Kerapian UI | 9 | 9 | 0 |
| Sisa risiko (bukan bug) | 3 | — | 3 (lihat §7) |

Prinsip perbaikan: **validasi dipindah ke lapisan store**, bukan hanya di UI. Setiap mutasi sekarang mengembalikan `MutationResult` (`{ ok: true } | { ok: false, reason }`) sehingga pemanggil wajib menampilkan alasan penolakan. Sebelumnya kegagalan bisa lolos tanpa pesan dan data rusak tetap tersimpan.

---

## 2. Keamanan

### 2.1 PDF/HTML injection pada ekspor laporan — **diperbaiki**
`expo-print` merender laporan sebagai HTML. Nama toko, kode toko, nama kategori, dan nama barang sebelumnya disisipkan mentah, sehingga nama seperti `<img src=x onerror=...>` akan dieksekusi di dalam dokumen hasil cetak.
→ `src/utils/security.ts: escapeHtml()` dipakai untuk semua nilai yang berasal dari pengguna (`export.ts`).

### 2.2 Formula injection pada ekspor CSV — **diperbaiki**
Sel CSV yang dimulai `=`, `+`, `-`, `@` dieksekusi Excel/Google Sheets. Catatan transaksi bebas diketik pengguna.
→ `csvSafe()` memberi prefiks apostrof, membuang karakter kontrol, dan meng-escape `"`. Semua sel kini melewati fungsi ini.

### 2.3 Escape-sequence injection ke printer thermal — **diperbaiki**
Struk dikirim sebagai teks ESC/POS. Catatan/nama barang yang mengandung byte `0x1B`/`0x1D` bisa memerintahkan printer (potong kertas, ganti codepage, dsb).
→ `sanitizePrintText()` dipakai di `receipt.ts` (nama barang, catatan, dan payload akhir di `buildEscPos`), sambil tetap mempertahankan baris baru.

### 2.4 Nominal tidak tervalidasi (NaN, negatif, tak terhingga) — **diperbaiki**
`addTransaction`, `payReceivable`, `upsertProduct`, dan `adjustStock` menerima angka apa pun dari UI. Nominal `NaN`/negatif bisa merusak total saldo dan laporan.
→ `normalizeAmount()` (rentang 1 … Rp 1 triliun), `normalizeQty()` (1 … 100.000), dan `safeISODate()` (tolak tanggal sebelum 2000 atau > 1 tahun ke depan) dijalankan di store, bukan hanya di form.

### 2.5 Pembayaran melebihi sisa tagihan / kasbon lunas — **diperbaiki**
Pembayaran bisa melebihi sisa piutang dan tetap tersimpan (kas jadi "kembali").
→ `payReceivable`/`payPayable` menolak `amount > remaining` dan menolak pembayaran pada tagihan yang sudah lunas, dengan pesan berisi sisa tagihan sebenarnya.

### 2.6 Foto nota hilang & file yatim — **diperbaiki**
`expo-image-picker` mengembalikan URI di **cache**; OS bebas menghapusnya, sehingga foto nota di riwayat bisa hilang tanpa jejak. Sebaliknya, foto yang disalin permanen tidak pernah dihapus saat transaksi dihapus.
→ `src/services/photos.ts`: `persistPhoto()` menyalin ke `Paths.document/nota/`, `deletePhoto()` hanya menghapus file di dalam folder itu, `clearPhotos()` dipakai saat "Hapus semua data". Pemanggilan `deletePhoto` ditambahkan pada hapus transaksi, hapus foto di form, dan tutup form tanpa menyimpan (dengan penjaga agar foto milik transaksi yang sudah tersimpan tidak ikut terhapus).

---

## 3. Bug logika & integritas data

| # | Masalah | Dampak | Perbaikan |
| --- | --- | --- | --- |
| 3.1 | `deleteTransaction` diam-diam tidak melakukan apa pun saat ditolak | Pengguna mengira data terhapus | Mengembalikan `MutationResult`; UI menampilkan `Alert` berisi alasan |
| 3.2 | `deleteReceivable` menghapus kasbon tetapi meninggalkan transaksi terkait | Omzet "hantu" di laporan | Transaksi terkait ikut dihapus, pembayaran kasbon yang sudah ada memblokir penghapusan |
| 3.3 | Stok tidak pernah berubah saat penjualan dicatat | Katalog & peringatan stok menipu | `applyStockDeltas()` mengurangi stok saat penjualan dan mengembalikannya saat transaksi/kasbon dihapus |
| 3.4 | `deleteAllocation` bisa membuat kas negatif | Saldo tidak konsisten | Ditolak bila saldo tabungan tidak mencukupi; `moveCapital(amount)` bertanda (+/-) menggantikan `allocateCapital` sehingga penarikan dana pun sah dan tervalidasi |
| 3.5 | Kategori duplikat & kategori kosong bisa tersimpan | Daftar kategori berisi entri kembar | `addCategory` menolak label kosong/duplikat (case-insensitive) per tipe, maksimum 40 karakter |
| 3.6 | Kasbon bisa dibuat tanpa nama pelanggan / nominal 0 | Buku kasbon tidak bisa ditagih | Divalidasi di store dengan pesan jelas |
| 3.7 | Hitungan "Pengeluaran: 25 catatan" memakai `txCount` (semua transaksi) | Angka ringkasan bertentangan dengan filter (6 catatan) | Ditambah `expenseCount` di `summarize()`, dipakai di Transaksi & Laporan |

---

## 4. Fitur yang tidak jelas / setengah jalan

### 4.1 "Cetak otomatis setelah simpan" — **diperjelas**
Sakelar ini tidak mencetak; ia membuka pratinjau struk. Mencetak langsung butuh modul BLE (`react-native-ble-plx`) yang tidak dipasang pada build default.
→ Label diganti **"Pratinjau struk setelah simpan"** dengan keterangan bahwa cetak langsung butuh printer Bluetooth pada build dev. Perilaku kode tidak berubah (tidak ada janji palsu).

### 4.2 Halaman "Notifikasi" tanpa aksi hapus — **diperjelas**
Sebelumnya tidak jelas apakah daftar ini notifikasi tersimpan atau turunan data.
→ Judul layar **"Pengingat"**, plus penjelasan: pengingat dihitung dari data sendiri dan **hilang otomatis** saat kasbon dibayar atau stok ditambah. Tidak perlu tombol hapus karena tidak ada yang disimpan. Chip status juga diselaraskan (Telat / Segera / Stok / Info) dengan tone kartu.

### 4.3 Klaim "Siap dipakai untuk pengajuan KUR / pajak" — **dikoreksi**
Klaim berlebihan: laporan ini rekap internal, bukan dokumen resmi.
→ Diganti **"Laporan siap dibagikan (PDF & CSV)"** + catatan kecil "Rekap internal, bukan dokumen pajak resmi."

### 4.4 Penyesuaian stok vs rincian barang — **diperjelas**
Tombol −/+ di katalog tidak dijelaskan hubungannya dengan rincian barang pada penjualan.
→ Ditambah teks bantu: −/+ untuk koreksi manual (rusak/salah hitung/stok opname), sedangkan penjualan dengan rincian barang mengurangi stok otomatis. `adjustStock` kini menolak stok negatif dengan pesan.

### 4.5 Tabungan modal hanya bisa "menyisihkan" — **dilengkapi**
Dana yang sudah dipisah tidak bisa ditarik kembali; riwayat pemindahan tidak terlihat.
→ Sheet **Tabungan modal** kini punya dua mode (Sisihkan / Tarik ke kas), tombol "Semua" yang aman, daftar **Riwayat pemindahan** dengan pembatalan (dengan validasi saldo), dan pesan galat di dalam sheet.

---

## 5. Kerapian UI

1. **Kontras teks**: `textFaint` #5F6A7D hanya 3,0:1 di atas kartu (di bawah WCAG AA 4,5:1) → #7E8799 (4,53:1); `textDim` → #9AA4B6 (7,4:1).
2. **Header**: nama toko terpotong ("Warung Berkah L…") karena badge jam berebut ruang → jam operasional pindah ke baris kedua, nama memakai lebar penuh.
3. **Catat — footer**: dua tombol penuh bertumpuk → tombol utama + tautan sekunder ringkas "Simpan & catat lagi".
4. **Catat — kategori**: tinggi chip tidak seragam saat label 2 baris → `minHeight` 46 sehingga grid rapi; label "Ubah master" (jargon) → **"Kelola kategori"**; chip jam diberi chevron + label aksesibilitas "Ubah jam transaksi" agar jelas bisa ditekan.
5. **Kasbon**: nominal tidak konsisten (`Rp145.000` vs `Rp 180.000`) → semua memakai format ber-spasi; keterangan "dari Rp…" tidak lagi muncul saat belum ada pembayaran ("Belum dibayar"); progress bar 0% disembunyikan; tombol "Catat pembayaran" ganda dihapus (tinggal satu di bawah).
6. **Stok**: kartu statistik tidak sama lebar (`flexBasis: 0`), meta barang dibatasi satu baris agar tinggi kartu seragam, area tekan Ubah/Hapus dinaikkan.
7. **Laporan**: bulan tanpa data pada grafik "Tren 6 bulan" kini punya penanda garis dasar tipis + label lebih redup, supaya tidak terbaca sebagai grafik rusak.
8. **Beranda**: chip "Siap pakai" berubah menjadi **"Kas minus"** (merah) saat saldo negatif — sebelumnya kontradiktif.
9. **Tap target**: tombol kecil (Ubah/Hapus stok, −/+, aksi pengingat, hapus riwayat pemindahan) dinaikkan ke `hitSlop` 4–12 dan padding tambahan; konten tab diberi `paddingBottom: 104` agar item terakhir tidak tertutup FAB.
10. **Struk**: pratinjau memakai font monospace agar kolom 32 karakter rata seperti hasil cetak sebenarnya.
11. **Ikon**: `flame` untuk "Makanan & Minuman", `qr` untuk "Pulsa & Token", dan `wallet` untuk "Listrik & Air" membingungkan → ditambah glyph `cup`, `phone`, `bolt` (gaya line 1,8 px) dan kategorinya dipetakan ulang.
12. **Kode mati dihapus**: `MiniTrend`, `ChartEmptyHint`, `chartValue`, `groupTransactionsByDay`, `dayDiff`, beserta style-nya — mengurangi permukaan bug dan ukuran bundle.
13. **Pratinjau template pengingat** memakai nama contoh "Bu Sri" → memakai nama kasbon nyata bila ada, jika tidak label netral "Pelanggan", dengan judul "Pratinjau (contoh pengisian)".

---

## 6. Verifikasi

```
npx tsc --noEmit                        → 0 error
npx expo export --platform android      → sukses
npx expo export --platform web          → sukses
Playwright: skenario kosong + terisi    → 0 pageerror, 0 console error
```

Uji manual pada build web: catat penjualan (tunai/QRIS/kasbon), rincian barang, foto nota, simpan + pratinjau struk, pembayaran kasbon (sebagian & lunas), penolakan pembayaran melebihi sisa, validasi jam pengaturan (`99:99` → pesan galat), tambah/ubah/hapus barang, tarik/sisihkan tabungan, ekspor PDF & CSV, hapus semua data.

Kontras warna (WCAG 2.1):
| Warna | Di atas latar | Di atas kartu |
| --- | --- | --- |
| text #E0E1F4 | 14,3:1 | 12,7:1 |
| textMuted #B9CBBD | 10,9:1 | 9,6:1 |
| textDim #9AA4B6 | 7,4:1 | 7,4:1 |
| textFaint #7E8799 | 5,1:1 | 4,5:1 |
| primary #00F5A0 | 12,8:1 | 11,4:1 |
| danger #FF6B6B | 6,7:1 | 5,9:1 |

---

## 7. Sisa risiko yang sengaja dibiarkan (bukan bug)

1. **Penyimpanan lokal tanpa enkripsi.** Data (termasuk nama pelanggan dan nominal kasbon) tersimpan di AsyncStorage perangkat. Enkripsi akan butuh `expo-secure-store`/SQLCipher dan menambah kompleksitas migrasi; untuk warung dengan satu perangkat, risiko utamanya adalah akses fisik. Rekomendasi lanjutan: PIN/biometrik + `expo-secure-store` untuk kunci.
2. **Tidak ada cadangan/restore otomatis.** Ekspor CSV/PDF bersifat satu arah. Rekomendasi lanjutan: menu "Cadangkan data" (JSON) + impor dengan validasi versi.
3. **Cetak langsung via BLE belum aktif** pada build default (modul opsional, sesuai keputusan desain). Semua jalur lain (pratinjau, salin, bagikan) berfungsi penuh dan tidak pernah menyentuh kode native yang tidak ada.

Tidak ada telemetri, tidak ada panggilan jaringan: aplikasi sepenuhnya offline (kecuali dialog "bagikan" milik OS).

---

## 8. Berkas yang berubah pada audit ini

- **Baru**: `src/utils/security.ts`, `src/services/photos.ts`, `docs/AUDIT-KODE.md`
- **Ditulis ulang**: `src/data/store.ts` (validasi + `MutationResult` + delta stok + `moveCapital`)
- **Disentuh**: `app/_layout.tsx`, `app/catat.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/kasbon.tsx`, `app/(tabs)/transaksi.tsx`, `app/(tabs)/laporan.tsx`, `app/kasbon/[id].tsx`, `app/stok.tsx`, `app/pengaturan.tsx`, `app/notifikasi.tsx`, `app/pilih-transaksi.tsx`, `src/components/{AppHeader,Charts,DebtCard,DebtPaymentSheet}.tsx`, `src/data/{selectors,types,categories}.ts`, `src/services/{export,printer/receipt}.ts`, `src/theme/tokens.ts`, `src/utils/format.ts`
