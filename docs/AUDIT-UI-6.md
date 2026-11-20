# Audit UI Mendalam — Inventori's (Sprint 6)

Tanggal: 19 November 2026
Metode: bundel web (`npx expo export --platform web`) dijalankan di peramban
390 × 844 @3× dengan data contoh sementara di `localStorage` (fixture uji, tidak
pernah ikut dirilis), lalu setiap layar ditangkap dan diperiksa terhadap daftar
periksa: **kontras, ukuran huruf, spasi, hierarki, konsistensi, teks**.

Layar yang diperiksa: Beranda (atas & bawah), Laporan, Kasir, Katalog & stok,
Form barang, Pengaturan (atas & bawah), Cadangan data (atas & bawah),
Transaksi, Kasbon, Shift, Anggota, Log audit, Akun.

Ringkasan: **12 temuan, 12 diperbaiki, 0 dibiarkan**. Konsol peramban bersih
(0 error) di semua tangkapan.

---

## Temuan 1 — Jarak antarkata font terlalu rapat (paling terasa)

**Bukti.** Di layar Cadangan data, tombol tampil sebagai
`Bagikanberkas cadangan(.json)` dan `Eksportransaksi ke CSV`, padahal teks di DOM
sudah benar. Pengukuran `canvas.measureText`:

| Huruf | Lebar spasi (em) |
|---|---|
| PJS-Regular / Medium / SemiBold / Bold | **0,170** |
| Inter-Regular (pembanding) | 0,281 |

0,17 em berarti spasi selebar 2 px pada teks 14 px. Di layar HP, kata-kata
terlihat menempel dan pengguna harus membaca dua kali — persis keluhan
"font kurang jelas".

**Perbaikan.** Metrik glyph `space` (U+0020) dan `nbsp` (U+00A0) di kelima berkas
`assets/fonts/PlusJakartaSans-*.ttf` disetel dari 170–180 unit menjadi **265 unit
(0,265 em)** dengan `fontTools`, tanpa mengubah bentuk huruf. Efeknya di seluruh
aplikasi (Android, iOS, web), karena semua teks memakai kelima berkas itu.

**Verifikasi.** Spasi terukur 4 px pada 14 px; layar Beranda, Pengaturan, dan
Cadangan terbaca longgar tanpa ada baris yang jadi pecah.

---

## Temuan 2 — Kontras teks sekunder gagal WCAG AA

**Bukti.** `textFaint` `#7e8799` di atas `cardHigh` `#262937` = **4,00:1**,
di bawah ambang 4,5:1 untuk teks normal. Teks ini dipakai untuk satuan, jam,
keterangan di samping angka — informasi yang justru sering dibaca sambil lalu.

**Perbaikan.** `textFaint` → **`#8b95a8`**. Kontras baru: 5,6:1 di atas `card`,
4,9:1 di atas `cardHigh`. Seluruh kombinasi teks/permukaan kini ≥4,9:1.

---

## Temuan 3 — Skala huruf terlalu kecil di layar HP

**Bukti.** Label 12 sp dan caption 11 sp pada layar 390 pt membuat teks sekunder
(harga, satuan, keterangan petak) nyaris setipis garis rambut; micro 10 sp hanya
layak untuk badge, bukan untuk kalimat.

**Perbaikan.** `src/theme/tokens.ts`: h2 16 → **16,5**, h3 14 → **14,5**,
body 13,5 → **14**, label 12 → **12,5**, caption 11 → **11,5**, micro 10 → **10,5**.
Angka besar tidak diubah supaya hero saldo tetap dominan.

---

## Temuan 4 — Rincian harga di daftar stok terpotong

**Bukti.** Baris `Jual Rp 3.500 • modal Rp 2.900 • margin 17%` terpotong menjadi
`margi…`, dan baris `min 12 pcs • grosir Rp 3.300/10` terpotong menjadi `10 p…`
karena diletakkan di kolom sempit sebelah tombol − / +.

**Perbaikan.** Nama barang + chip *Menipis* + stepper di baris atas; rincian harga
dan baris kedua memakai **lebar penuh di bawah** baris (gaya `productMetaRow`,
`productMetaSecond`). Tidak ada lagi elipsis (`screenshots/37`).

---

## Temuan 5 — Tombol aksi melayang menutup konten

**Bukti.** Di Beranda, FAB "Catat" menutupi petak terakhir *Aksi cepat*.

**Perbaikan.** `content.paddingBottom` Beranda 104 → **150**; konten terakhir kini
berhenti di atas FAB dan bilah tab (`screenshots/35`).

---

## Temuan 6 — Angka "Laba hari ini / Margin 100%" menyesatkan

**Bukti.** Pada penjualan yang tidak menyimpan HPP per baris, `margin` dihitung
100% — pengguna membaca "untung 100%" padahal itu hanya artinya HPP belum diisi.

**Perbaikan.** Kartu diganti **"Laba tunai"** dengan keterangan **"Masuk − keluar"**:
angka yang benar-benar bisa dipertanggungjawabkan dari data yang ada (uang masuk
hari ini dikurangi uang keluar), tanpa klaim margin.

---

## Temuan 7 — "Mode lokal" muncul dua kali dan membingungkan

**Bukti.** Baris di Pengaturan berjudul "Mode lokal" dengan subjudul "Data
tersimpan di perangkat ini saja" **dan** pil status "● Mode lokal" — dua kali
kata yang sama, dan "mode" adalah istilah teknis yang tidak dipakai pengguna.

**Perbaikan.** Judul menjadi **"Aplikasi tanpa server"**; pil status disembunyikan
saat mode lokal (hanya tampil saat cloud aktif, untuk antrean sinkron). Pengguna
kini membaca satu kalimat utuh: *Aplikasi tanpa server — Data tersimpan di
perangkat ini saja* (`screenshots/36`).

---

## Temuan 8 — Format rupiah tidak konsisten

**Bukti.** Sebagian layar menulis `Rp3.500`, sebagian `Rp 3.500` (parameter
`space: false` pada `formatRupiah`).

**Perbaikan.** Parameter dihapus dari 9 berkas; semua rupiah kini `Rp 3.500`.

---

## Temuan 9 — Label minggu di Laporan tumpang tindih

**Bukti.** Grafik arus kas mingguan memberi label "1–7", "7–13", … karena kursor
minggu tidak dimajukan satu hari (hari terakhir ikut dihitung di dua rentang).

**Perbaikan.** `weeklyFlow` di `src/data/selectors.ts`: kursor dimajukan
`weekEnd + 1 hari`, label menjadi "1–7", "8–14", "15–21", "22–28".

---

## Temuan 10 — Petak kasir tidak memberi peringatan yang dibutuhkan saat menjual

**Bukti.** Di layar Kasir, petak barang hanya menampilkan nama dan harga. Kasir
tidak tahu barang tinggal sedikit, dan tidak tahu ada harga grosir yang bisa
dipakai untuk pembelian banyak.

**Perbaikan.** Baris stok jadi amber **"stok 9 unit • menipis"** bila di bawah
minimum, dan baris baru **"grosir Rp 4.600 · 6+"** pada petak yang punya harga grosir.

---

## Temuan 11 — Isi petak kasir saling menimpa

**Bukti.** Petak barang ber-tinggi tetap 96 pt. Begitu nama barang jadi dua baris
("Teh Botol Sosro 350ml") dan petak punya harga grosir, baris "grosir Rp 4.600 ·
6+" tertimpa harga dan terpotong — informasi yang baru ditambahkan justru tidak
terbaca.

**Perbaikan.** Tinggi petak diganti `minHeight: 96` dan grid memakai
`alignItems: 'stretch'`, sehingga petak dalam satu baris tetap sama tinggi tetapi
bisa tumbuh bila isinya lebih banyak (`screenshots/38`).

---

## Temuan 12 — Istilah tidak konsisten: "catatan" vs "transaksi"

**Bukti.** Di Laporan, satu layar memakai "4 nota", "2 catatan", "6 catatan
transaksi", dan "Tidak ada catatan" untuk hal yang sama; Beranda memakai
"penjualan". Pengguna harus menebak apakah "catatan" itu transaksi atau utang.

**Perbaikan.** Semua hitungan memakai istilah yang sudah dipakai di seluruh
aplikasi: **"nota"** untuk penjualan, **"pengeluaran"** untuk biaya/kulakan,
**"transaksi"** untuk gabungan. Contoh: "4 nota", "2 pengeluaran", "6 transaksi
tercatat".

---

## Catatan tambahan (bukan cacat, sengaja dibiarkan)

- **"Kas minus"** pada Beranda: muncul karena fixture uji mencatat kulakan lebih
  besar daripada penjualan. Bukan data palsu yang dikirim ke aplikasi — pada
  pemakaian nyata chip ini hanya tampil saat kas memang minus.
- **Ellipsis pada judul panjang** ("Stok menipis: Teh Botol Sosro 35…"): judul
  peringatan dibuat maksimal 2 baris; nama barang yang lebih panjang tetap dipotong
  dengan elipsis agar tinggi kartu seragam.

## Berkas yang disentuh

```
src/theme/tokens.ts                 kontras + skala huruf
assets/fonts/PlusJakartaSans-*.ttf  metrik spasi (5 berkas)
src/data/selectors.ts               label minggu
src/utils/format.ts + 9 layar       format rupiah
app/(tabs)/index.tsx                Laba tunai, padding, petak Cadangan, judul 2 baris
app/stok.tsx                        rincian harga lebar penuh
app/kasir.tsx                       badge stok menipis + baris grosir
app/pengaturan.tsx                  teks "Aplikasi tanpa server", pil status
app/(tabs)/laporan.tsx              istilah nota/pengeluaran/transaksi
app/kasir.tsx                       tinggi petak tidak dikunci
app/cadangan.tsx                    konfirmasi lintas platform
```
