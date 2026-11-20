# Sprint 16 — Laporan selisih stok per periode & grafik harga beli

Tanggal: 20 November 2026
Status: **selesai**. Seluruh uji hijau (14 suite), 128 screenshot.

---

## 1. Masalah yang diselesaikan

Dua pertanyaan yang paling sering muncul setelah data mulai menumpuk:

1. **"Bulan ini berapa nilai barang yang hilang?"** Sebelumnya jawabannya harus dicari
   dengan membuka catatan hitung satu per satu. Pemilik tidak tahu apakah kerugiannya
   Rp 5 ribu atau Rp 500 ribu — padahal itu yang menentukan perlu tidaknya berbenah.
2. **"Agen memang naikkan harga, atau saya yang salah catat?"** Harga beli tersimpan di
   setiap kulakan, tetapi hanya bisa dilihat satu per satu di riwayat kulakan.

Sekarang keduanya terlihat sekali lihat: satu kartu di menu Laporan (mengikuti periode
yang sedang dipilih) dan satu layar grafik harga beli per barang.

---

## 2. Aturan yang dipegang

| Aturan | Alasan |
| --- | --- |
| **Selisih mengikuti periode Laporan** | Pilih "7 hari terakhir" / "bulan ini" / "bulan lalu" → kartu selisih ikut berubah. Tidak ada angka yang tertinggal di periode lain. |
| **Nilai kurang dihitung harga modal saat hitung** | Sama dengan aturan Sprint 13; kerugian tidak dibesar-besarkan oleh harga jual. |
| **Barang diurutkan dari yang paling merugikan** | Yang perlu ditindak lebih dulu adalah barang dengan nilai ruginya terbesar, bukan yang paling sering. |
| **Tren harga hanya dari kulakan nyata** | Tidak ada angka karangan: kalau baru sekali kulakan, layar bilang "belum ada tren". |
| **Grafik memakai harga beli, bukan HPP rata-rata** | Yang ingin dilihat adalah apa yang benar-benar ditagih agen. HPP rata-rata tetap ditampilkan terpisah ("modal sekarang"). |

---

## 3. Yang dibangun

### 3.1 Laporan selisih stok (`src/data/opname.ts`, ditambah)

```
opnameInRange(opnames, from, to, top = 3) → {
  sessions, lines, matched, over, under,
  gainValue, lossValue, netValue, unitsOff,
  losses: [{ name, unit, units, value, times }],   // urut nilai terbesar
  perSession: [{ id, at, lossValue, gainValue }]   // untuk rincian per hitungan
}
opnameRangeText(summary) → "2 hitungan • 3 barang kurang • 1 barang lebih"
```

Di menu **Laporan** muncul kartu **"Selisih hitung stok"**:

- kalimat ringkas + nilai barang kurang/lebih,
- tiga barang paling merugikan beserta jumlah unit dan nilainya,
- tombol **Rincian** → Sheet: nilai kurang, nilai lebih, selisih bersih, daftar tiap
  hitungan (tanggal + nilainya), daftar "barang paling sering kurang", dan tombol
  **Hitung stok lagi**;
- bila periode itu belum ada hitungan, tombolnya berubah menjadi **Hitung** agar tidak
  jadi jalan buntu.

### 3.2 Riwayat & grafik harga beli (`src/data/price-history.ts`, baru)

```
priceHistory(purchases, productId)        titik harga beli urut waktu
priceStats(points, fallback)              terakhir, pertama, terendah, tertinggi,
                                          rata-rata, perubahan %
priceTrendText(stats)                     "Harga beli naik 14,8% sejak kulakan pertama."
priceChartPoints(points, width, height)   titik grafik 0–100 (aman di tepi)
priceBoard(purchases, productId, cost)    gabungan siap tampil
```

Layar `app/harga-beli.tsx` (baru):

| Bagian | Isi |
| --- | --- |
| Pemilih barang | chip mendatar semua barang (bisa digulir) |
| Ringkasan | nama barang, modal sekarang & harga jual, kalimat tren |
| Grafik | garis SVG harga beli per kulakan, garis putus-putus harga tertinggi, titik terakhir disorot |
| Angka kunci | terakhir, rata-rata, jumlah kulakan; legenda tertinggi/terendah |
| Daftar kulakan | supplier, tanggal, jumlah unit, harga beli satuan |
| Tombol | Catat kulakan baru |

Pintu masuk: **Katalog & stok → Ubah (barang) → Riwayat harga beli**.

Pola grafiknya juga diuji: titik tidak boleh keluar kotak, satu titik digambar di
tengah, harga datar digambar mendatar.

---

## 4. Berkas yang disentuh

```
src/data/opname.ts          # opnameInRange(), opnameRangeText(), tipe ringkasan periode
src/data/price-history.ts   # BARU — riwayat & grafik harga beli (murni)
app/(tabs)/laporan.tsx      # kartu "Selisih hitung stok" + Sheet rincian
app/harga-beli.tsx          # BARU — layar riwayat harga beli
app/stok.tsx                # tombol "Riwayat harga beli" di form ubah barang
app/_layout.tsx             # rute "harga-beli"
supabase/tests/laporan.test.mts  # BARU — 11 pemeriksaan
package.json                # skrip test:laporan
```

Tidak ada perubahan bentuk data: keduanya membaca `opnames` dan `purchases` yang sudah
ada, jadi cadangan lama tetap terbuka.

---

## 5. Uji

| Suite | Sebelum | Sesudah |
| --- | --- | --- |
| `test:db` | 148 | 148 |
| `test:mappers` | 12 | 12 |
| `test:backup` | 23 | 23 |
| `test:rbac` | 9 | 9 |
| `test:orders` | 9 | 9 |
| `test:notif` | 10 | 10 |
| `test:lan` | 10 | 10 |
| `test:customers` | 19 | 19 |
| `test:outlets` | 18 | 18 |
| `test:opname` | 11 | 11 |
| `test:purchases` | 14 | 14 |
| `test:suppliers` | 15 | 15 |
| `test:laporan` | — | **11** |
| `test:copy` | 8 | 8 |
| `typecheck` | 0 | 0 |

Pemeriksaan layar (Playwright 412×892, 0 galat konsol):

| Berkas | Isi |
| --- | --- |
| `124-laporan-selisih-stok.png` | Kartu di menu Laporan: "2 hitungan • 3 barang kurang • 1 barang lebih", nilai kurang Rp 93.000 • lebih Rp 3.700, Telur Ayam 3 kg Rp 81.000, Indomie 4 pcs Rp 12.000 |
| `125-rincian-selisih.png` | Sheet rincian: kurang Rp 93.000, lebih Rp 3.700, bersih −Rp 89.300, dua sesi (8 Nov −Rp 5.800, 17 Nov −Rp 87.200), barang paling sering kurang |
| `126-harga-beli-indomie.png` | Grafik: 2.700 (5 Okt) → 2.900 (20 Okt) → 3.100 (19 Nov), "Harga beli naik 14,8% sejak kulakan pertama" |
| `127-tombol-riwayat-harga.png` | Form ubah barang: tombol **Riwayat harga beli** |
| `128-harga-beli-dari-katalog.png` | Jalur dari katalog membuka layar yang sama dengan barang terpilih |

Pemeriksaan angka (dibaca dari layar):

```
selisih November  : kurang Rp 93.000 (Telur 3×27.000 + Indomie 2×3.100 + Indomie 2×2.900)
barang teratas    : Telur Ayam 3 kg Rp 81.000 (1x) • Indomie 4 pcs Rp 12.000 (2x)
harga beli Indomie: terakhir 3.100 • rata-rata 2.900 • 3 kali kulakan • naik 14,8%
```

---

## 6. Batas yang belum dikerjakan

| Hal | Alasan |
| --- | --- |
| Selisih opname masuk ke ekspor PDF/CSV Laporan | Ekspor sekarang fokus laba rugi; menambah bagian baru butuh format ulang berkas |
| Grafik harga beli per supplier (bandingkan agen) | Data sudah ada; tampilan menyusul bila diminta |
| Notifikasi "harga beli naik" | Bisa menyusul bersama pengingat lain |
| Grafik memakai sumbu waktu proporsional (bukan per kulakan) | Dengan sedikit titik, jarak per kulakan lebih mudah dibaca; sumbu tanggal bisa ditambahkan nanti |

---

## 7. Ringkasan untuk pemilik warung

- Buka **Laporan**. Pilih periode (7 hari / bulan ini / bulan lalu). Di bagian
  **Selisih hitung stok** langsung terlihat berapa nilai barang yang hilang dan barang apa
  yang paling banyak menyumbang. Ketuk **Rincian** untuk melihat per tanggal.
- Mau tahu harga kulakan naik atau tidak: **Katalog & stok → pilih barang → Ubah →
  Riwayat harga beli**. Grafiknya menunjukkan pergerakan harga dari agen ke agen.
