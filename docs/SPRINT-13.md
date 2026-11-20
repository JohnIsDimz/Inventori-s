# Sprint 13 — Hitung stok fisik (stok opname)

Tanggal: 19 November 2026
Status: **selesai**. Seluruh uji hijau, layar baru terhubung ke katalog & stok.

---

## 1. Masalah yang diselesaikan

Hampir semua warung pernah mengalami satu hal ini: **angka stok di catatan tidak sama
dengan jumlah barang di rak**. Penyebabnya macam-macam — barang pecah, hilang, salah
hitung saat kulakan, atau ada penjualan yang lupa dicatat.

Sebelum sprint ini pemilik hanya punya dua pilihan, dua-duanya buruk:

1. membiarkan angka catatan (lalu laba terlihat lebih besar dari kenyataan), atau
2. menekan tombol − satu per satu tanpa catatan, sehingga tidak ada jejak **kenapa**
   stok berubah.

Sekarang ada satu layar: ketik jumlah nyata, lihat selisihnya, simpan, dan tersimpan
riwayat "kapan, barang apa, berapa nilainya".

---

## 2. Aturan yang dipegang

| Aturan | Alasan |
| --- | --- |
| **Barang yang tidak diketik tidak diubah** | Kesalahan paling mahal adalah `0` yang tertulis tanpa sengaja. Isian kosong berarti "belum dihitung", bukan "habis". |
| **Opname tidak menyentuh uang kas** | Barang hilang bukan uang keluar. Kas hanya berubah karena penjualan, kulakan, atau biaya. |
| **Nilai selisih memakai harga modal** | Kerugian tidak dibesar-besarkan oleh harga jual. |
| **Isian negatif ditolak** | Mengetik `-5` tidak boleh berubah menjadi `+5`. |
| **Selisih memakai stok cabang yang sedang dibuka** | Toko bercabang menghitung rak cabangnya sendiri; rak cabang lain tidak tersentuh. |

Tambahan: angka yang diketik dibatasi 0–1.000.000 dan hanya angka (spasi atau satuan
seperti "12 pcs" tetap terbaca).

---

## 3. Yang dibangun

### 3.1 Data (`src/data/opname.ts`, baru — murni)

```
OpnameLine        { productId, name, unit, system, counted, cost, note? }
opnameDiff()      counted - system   (positif = lebih, negatif = kurang)
opnameLineValue() |selisih| × harga modal
opnameTone()      'lebih' | 'kurang' | 'cocok'  (+ OPNAME_TONE_LABEL)
summarizeOpname() { lines, matched, over, under, gainValue, lossValue, netValue, unitsOff }
parseCount()      ''/ngawur/negatif → null   (bukan 0)
buildOpnameLines() hanya barang yang diisi, stok dari stockFor(product, outletId)
OPNAME_REASON_HINTS  saran alasan: pecah/rusak, hilang, salah hitung, penjualan belum tercatat
opnameSummaryText() / opnameReportText()  kalimat siap dibaca & dibagikan
```

`StockOpname` disimpan di state: `{ id, outletId?, createdAt, note?, lines[], lossValue, gainValue }`.

### 3.2 Aksi `commitOpname({ counts, note })`

- menolak bila tidak ada satu pun barang terisi → "Isi jumlah nyata minimal satu barang
  dulu." (tidak ada tombol mati tanpa penjelasan);
- menulis stok per cabang dengan `setStockAt()` (satu-satunya pintu tulis);
- menyimpan satu catatan hitungan di depan riwayat (dibatasi 60 catatan terakhir);
- mengirim `stock_delta` per selisih dengan `reason: 'opname'`, supaya mesin sinkron
  memakai bahasa yang sama dengan koreksi manual.

### 3.3 Layar `app/opname.tsx` (baru)

| Bagian | Isi |
| --- | --- |
| Kepala | "Hitung stok" + nama cabang (bila lebih dari satu cabang) + "Kosongkan" |
| Penjelas | satu kartu: ketik jumlah nyata, barang lain tidak diubah, kas tidak tersentuh |
| Pencarian | nama atau barcode |
| Baris barang | nama, "Catatan 24 pcs", chip selisih (`−3` amber / `+3` biru / `cocok`), isian angka |
| Catatan | satu isian bebas + 4 tombol saran alasan |
| Riwayat | 6 hitungan terakhir + nilainya |
| Footer | ringkasan hidup: "2 barang dihitung • 1 kurang • 1 lebih" dan nilai kurang/lebih |
| Sheet hasil | dihitung / kurang / lebih, nilai rupiah, daftar barang yang selisih, "Bagikan laporan" |

Pintu masuk: tombol **Hitung stok fisik** di layar Katalog & stok (di atas pencarian),
dan ubin **Katalog Stok** di Beranda kini berlabel "Hitung fisik" bila stok aman.

### 3.4 Cadangan

`opnames` ikut tercadangkan, tergabung, dan dipulihkan. Penghitung data bertambah satu
baris menjadi **11** (sebelas jenis data + pesanan). Berkas cadangan lama tanpa
`opnames` tetap terbuka.

---

## 4. Berkas yang disentuh

```
src/data/opname.ts            # BARU — seluruh aturan hitung fisik (murni, diuji Node)
src/data/types.ts             # StockOpname, opnames di PersistedState & RemotePatch
src/data/store.ts             # field opnames, aksi commitOpname, partialize/backup/restore
src/data/outlets.ts           # ScopedData.opnames → riwayat ikut tersaring per cabang
src/services/backup.ts        # opnames di bangun/parse/terapkan/gabung, penghitung "opname"
app/opname.tsx                # BARU — layar Hitung stok
app/_layout.tsx               # rute "opname"
app/stok.tsx                  # tombol Hitung stok fisik + teks bantuan diganti
app/(tabs)/index.tsx          # ubin Katalog Stok: keterangan "Hitung fisik"
app/cadangan.tsx, app/privasi.tsx  # ikut menyebut data hitung stok
supabase/tests/opname.test.mts     # BARU — 11 pemeriksaan
supabase/tests/backup.test.mts     # penghitung data 10 → 11
package.json                  # skrip test:opname
```

---

## 5. Uji

| Suite | Sebelum | Sesudah |
| --- | --- | --- |
| `test:db` | 148 | 148 |
| `test:mappers` | 12 | 12 |
| `test:backup` | 23 | 23 (kunci "hitung stok" bertambah) |
| `test:rbac` | 9 | 9 |
| `test:orders` | 9 | 9 |
| `test:notif` | 10 | 10 |
| `test:lan` | 10 | 10 |
| `test:customers` | 19 | 19 |
| `test:outlets` | 18 | 18 |
| `test:opname` | — | **11** |
| `test:copy` | 8 | 8 |
| `typecheck` | 0 | 0 |

Pemeriksaan layar (Playwright 412×892, 0 galat konsol):

| Berkas | Isi |
| --- | --- |
| `98-beranda.png` | Beranda, ubin Katalog Stok berketerangan "Hitung fisik" |
| `99-katalog-tombol-hitung.png` | Tombol **Hitung stok fisik** di atas pencarian |
| `100-hitung-kosong.png` | Layar baru: footer "Belum ada yang dihitung", Simpan tidak aktif |
| `101-hitung-terisi.png` | Indomie 24 → 21 (chip −3), Teh Botol 12 → 15 (chip +3), catatan "Barang pecah / rusak", footer "Kurang Rp 8.700 • Lebih Rp 11.400" |
| `102-hasil.png` | Sheet hasil: dihitung 2, kurang 1, lebih 1, nilai kurang Rp 8.700, nilai lebih Rp 11.400 |
| `103-riwayat.png` | Riwayat: hitungan hari ini (2 barang, −Rp 8.700) di atas hitungan 12 Nov |
| `104-stok-sesudah.png` | Katalog: Indomie 21, Teh Botol 15 — stok benar-benar ikut berubah |
| `105-pilih-cabang.png` | Pindah ke cabang kedua |
| `105b-cabang-pasar-baru.png` | Cabang Pasar Baru jadi cabang yang dibuka |
| `106-hitung-cabang-lain.png` | Cabang Pasar Baru: "Catatan 6 pcs" untuk Indomie, Gula "Catatan 0 kg" — angka cabang sendiri |

Pemeriksaan data setelah menyimpan (dibaca langsung dari penyimpanan):

```
cabang pertama : { out_a: 24, out_b: 6 }  → Indomie out_b 6 → 4
cabang lain    : out_a tetap 24 (tidak tersentuh)
catatan hitung : 2 (berkas cabang out_b tercatat sebagai out_b)
```

---

## 6. Batas yang belum dikerjakan

| Hal | Alasan |
| --- | --- |
| Hitung bertahap (simpan sebagian, lanjut nanti) | Satu sesi dianggap selesai sekali simpan; bisa menyusul bila diminta |
| Pindai barcode untuk mengisi baris | Perlu modul pemindai native; pencarian teks sudah cukup |
| Foto barang rusak sebagai bukti | Ditunda bersama lampiran foto |
| Laporan selisih per periode di menu Laporan | Riwayat 6 terakhir di layar Hitung stok sudah menjawab "kemarin berapa" |

---

## 7. Ringkasan untuk pemilik warung

- Buka **Katalog & stok** → **Hitung stok fisik**.
- Ketik jumlah yang benar-benar ada di rak. Barang yang tidak diketik dibiarkan.
- Tekan **Simpan**. Stok langsung menyesuaikan, dan tercatat berapa nilai barang yang
  kurang — memakai harga modal, bukan harga jual.
- Hitungan lama tetap bisa dilihat di bagian bawah layar, lengkap dengan nilainya.
