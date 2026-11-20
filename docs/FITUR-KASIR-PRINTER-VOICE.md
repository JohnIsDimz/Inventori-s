# Inventori’s — Kasir (POS), Barcode, Printer BLE, dan Input Suara

Dokumen ini menjelaskan pekerjaan lanjutan setelah audit: mengaktifkan printer
Bluetooth sampai benar-benar mencetak, menambah modul kasir/POS dengan pemindai
barcode, mengganti nama aplikasi menjadi **Inventori’s**, serta menambah input
suara Bahasa Indonesia.

---

## 1. Cek fitur yang sudah ada (jawaban singkat)

| Fitur | Status | Di mana melihatnya |
| --- | --- | --- |
| Harga modal | **Ada** | Katalog & stok → ubah barang → “Harga modal” (per barang, dipakai untuk HPP) |
| Harga jual | **Ada** | Sama seperti di atas, tampil juga di kartu barang Kasir |
| Margin (+%) | **Ada, dilengkapi** | Form barang kini menampilkan **Untung per satuan**, **Margin %** (dari harga jual) dan **Markup %** (dari harga modal) sekaligus |
| Omzet harian | **Ada, ditambah** | Laporan → kartu **“Omzet harian (7 hari)”**: omzet + jumlah catatan + untung per hari |
| Untung | **Ada, ditambah** | Laporan hero “Laba bersih” (per periode) + untung harian & untung per kategori |
| Kategori paling laku | **Baru** | Laporan → **“Kategori paling laku”**: peringkat omzet, porsi %, jumlah nota, jumlah barang, untung |
| Voice input Bahasa Indonesia | **Baru** | Tombol mikrofon di layar Catat (nominal) dan Kasir (pencarian barang) |

Catatan: “margin” dan “markup” sengaja ditampilkan dua-duanya karena di warung
istilah “untung 20%” sering dipakai untuk keduanya, padahal angkanya berbeda
(margin dihitung dari harga jual, markup dari harga modal).

---

## 2. Ganti nama → Inventori’s

| Item | Sebelum | Sesudah |
| --- | --- | --- |
| Nama aplikasi | WarungLui | **Inventori’s** |
| Slug / scheme | warunglui | **inventoris** |
| Bundle ID (iOS & Android) | id.warunglui.app | **com.inventoris.app** |
| Brand di header, pengaturan, PDF, nama file ekspor | WarungLui | **Inventori’s** |

Data lama tidak hilang: kunci penyimpanan berpindah dari `warunglui-store-v1`
ke `inventoris-store-v1`, dan store membaca kunci lama sebagai cadangan
(`legacyAwareStorage` di `src/data/store.ts`). Jadi pengguna yang sudah memakai
versi sebelumnya tetap melihat catatannya.

> Ganti bundle ID berarti build baru akan terpasang sebagai aplikasi berbeda di
> perangkat. Untuk menjaga data saat uji coba, gunakan fitur ekspor CSV/PDF dulu
> atau tetap pasang versi lama sampai data dianggap tidak perlu.

---

## 3. Kasir (POS) + Barcode

Layar baru: `app/kasir.tsx` (ikon Kasir di Beranda dan di sheet “Mau catat apa?”).

Alur:
1. Ketuk kartu barang untuk menambah ke keranjang (badge jumlah muncul di kartu).
2. Atau tekan ikon **pindai**, arahkan kamera ke barcode (EAN-8/13, UPC-A/E,
   Code 39/93/128, ITF-14, Codabar, QR). Kode yang belum terdaftar langsung
   menawarkan form barang baru (nama, harga jual, harga modal, stok awal) —
   setelah disimpan, barang otomatis masuk keranjang.
3. Keranjang: ubah jumlah −/+, lihat total, kosongkan.
4. Bayar: **Tunai / QRIS / Transfer / Kasbon**.
   - Tunai: isi uang diterima (ada tombol “Uang pas”, 20rb, 50rb, 100rb) →
     **kembalian dihitung otomatis** dan ditampilkan besar di struk sukses.
   - Kasbon: wajib nama pelanggan, jatuh tempo default 7 hari, masuk Buku Kasbon,
     dan **tidak** menambah kas sampai dibayar.
5. Simpan → transaksi memakai `addTransaction` yang sama dengan layar Catat,
   sehingga **stok berkurang**, omzet/laba/untung barang ikut terbarui, dan struk
   bisa langsung dicetak atau dibagikan.

Detail teknis:
- Barcode disimpan di `Product.barcode`, divalidasi unik di store
  (`upsertProduct` menolak barcode ganda), dan bisa dicari dari kolom pencarian.
- Kamera memakai `expo-camera` (`CameraView` + `barcodeScannerSettings`), dengan
  fallback input manual bila izin kamera ditolak atau perangkat (web) tidak
  punya pendeteksi barcode.
- Barang dengan stok 0 tidak bisa dijual sampai stok ditambah.

---

## 4. Printer BLE — aktif sampai benar-benar mencetak

Sekarang transport printer **nyata** (`src/services/printer/index.ts`) memakai
`react-native-ble-plx`, bukan lagi stub.

Yang terjadi saat mencetak:
1. `scanPrinters()` memindai BLE, menyaring nama khas printer thermal
   (RPP, GoojPRT, XP-, MTP, 58mm, “printer”, “pos”, dst). Ada opsi
   “Tampilkan semua perangkat” untuk printer dengan nama aneh.
2. `connectPrinter(id)` menyambung, menaikkan MTU (Android) agar pengiriman
   cepat, lalu mencari characteristic tulis: lebih dulu layanan standar printer
   `18F0/2AF1`, jika tidak ada menelusuri semua layanan.
3. `printReceiptText(text)` mengubah struk teks 32 kolom menjadi perintah
   ESC/POS (`buildEscPos`: init, center, potong kertas) dan mengirimnya per
   180 byte, sehingga struk 58 mm tercetak.
4. Saat printer mati/hilang, status koneksi otomatis kembali “belum tersambung”.

Pemakaian:
- **Pengaturan → Printer struk** → *Pindai printer* → pilih printer →
  **Uji cetak**. Printer yang dipilih disimpan (`printerAddress` +
  `printerName`).
- Kasir: setelah transaksi tersimpan, tekan **Cetak ke printer** (menyambung
  ulang otomatis bila perlu).
- Catat: pratinjau struk → **Cetak ke printer**.

Izin yang sudah disiapkan (diverifikasi lewat `expo prebuild`):
- Android: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH`,
  `BLUETOOTH_ADMIN` (Android ≤ 11 meminta izin lokasi untuk memindai).
- iOS: `NSBluetoothAlwaysUsageDescription`,
  `NSBluetoothPeripheralUsageDescription`.

**Kenapa perlu development build?** `react-native-ble-plx` adalah modul native.
Expo Go tidak memuatnya, jadi di Expo Go statusnya “tidak didukung” (aplikasi
tetap jalan, struk bisa dipratinjau/dibagikan). Untuk mencetak:

```bash
npx expo prebuild --clean
npx expo run:android      # atau: npx expo run:ios
```

Kalau kertas tidak keluar:
1. Pastikan printer menyala, kertas terpasang, dan **tidak** sedang tersambung ke
   aplikasi lain (printer murah hanya menerima satu koneksi).
2. Putuskan lalu sambungkan ulang dari panel Printer.
3. Coba “Uji cetak” lebih dulu — bila halaman uji tercetak, masalahnya di data
   struk, bukan koneksi.
4. Sebagian printer memakai nama generik; pakai “Tampilkan semua perangkat”.

---

## 5. Input suara Bahasa Indonesia

Modul: `expo-speech-recognition` (Speech framework di iOS, Google Speech
Services di Android, Web Speech API di browser) + pengurai sendiri
(`src/utils/speech.ts`).

Contoh ucapan yang dikenali:
| Ucapan | Hasil |
| --- | --- |
| “jual indomie dua puluh lima ribu” | nominal **Rp 25.000**, catatan “indomie” |
| “telur tiga puluh satu ribu” | nominal **Rp 31.000**, catatan “telur” |
| “dua belas ribu lima ratus” | Rp 12.500 |
| “seratus lima puluh ribu rupiah” | Rp 150.000 |
| “31 ribu”, “31rb”, “31000” | Rp 31.000 |
| “satu juta dua ratus ribu” | Rp 1.200.000 |

Pemakaian:
- **Catat → tombol mikrofon** di kartu nominal: mengisi angka, dan bila ada kata
  tersisa dipakai sebagai catatan.
- **Kasir → tombol mikrofon** di kolom pencarian: mengisi kata kunci barang.

Bila layanan suara perangkat tidak ada (atau izin ditolak), muncul pesan jelas
dan input manual tetap bisa dipakai. Ada pengaman 15 detik supaya tombol tidak
“mendengarkan” selamanya di perangkat yang tidak punya mikrofon.

Pengurai nominal diuji otomatis (14 kalimat, lihat riwayat audit) — semuanya
lulus, termasuk “31rb”, “seratus lima puluh ribu”, dan “tujuh juta lima ratus
ribu”.

---

## 6. Berkas baru/berubah

**Baru**
- `app/kasir.tsx` — layar kasir/POS
- `src/components/BarcodeScanner.tsx` — pemindai barcode + input manual
- `src/components/VoiceButton.tsx` — tombol mikrofon
- `src/components/PrinterSheet.tsx` — panel pindai/sambung/uji printer
- `src/services/voice.ts` — pembungkus pengenalan suara (id-ID)
- `src/utils/speech.ts` — pengurai ucapan Indonesia → nominal + catatan
- `docs/FITUR-KASIR-PRINTER-VOICE.md` — dokumen ini

**Ditulis ulang**
- `src/services/printer/index.ts` — transport BLE nyata (scan, connect, MTU,
  chunk 180 byte, auto-disconnect listener, halaman uji)

**Disentuh**
- `app.json` (nama, slug, bundle ID, izin BLE/kamera/mikrofon, plugin),
  `package.json` (nama + dependensi `react-native-ble-plx@3.5.1`,
  `expo-speech-recognition@58.0.1`)
- `app/_layout.tsx` (rute `/kasir`), `app/(tabs)/index.tsx` (aksi cepat Kasir),
  `app/pilih-transaksi.tsx` (menu Kasir),
  `app/(tabs)/laporan.tsx` (omzet harian + kategori paling laku),
  `app/catat.tsx` (mikrofon + tombol cetak),
  `app/stok.tsx` (barcode + margin/markup),
  `app/pengaturan.tsx` (panel printer + brand),
  `src/data/types.ts` (`Product.barcode`), `src/data/store.ts`
  (`findByBarcode`, validasi barcode unik, migrasi kunci penyimpanan),
  `src/data/selectors.ts` (`topSaleCategories`, `dailyFlow`),
  `src/utils/format.ts` (`marginPercent`, `markupPercent`),
  `src/components/AppHeader.tsx` & `src/services/export.ts` (brand),
  `src/components/Icon.tsx` (glyph `mic`)

---

## 7. Verifikasi

```
npx tsc --noEmit                          → 0 error
npx expo export --platform web            → sukses
npx expo export --platform android        → sukses
npx expo prebuild --platform android/ios  → AndroidManifest & Info.plist memuat
                                            izin BLE, kamera, mikrofon, speech
Playwright (web, data terisi)             → 0 pageerror / 0 console error
  · kasir: tambah 2 barang → keranjang → tunai Rp 200.000 → kembalian Rp 97.000
  · stok berkurang 14 → 13 setelah transaksi
  · barcode tak dikenal → form barang baru muncul
  · panel printer: penjelasan “hanya di aplikasi” saat dijalankan di web
```

Pengujian cetak fisik dan mikrofon **tidak bisa** dilakukan di lingkungan ini
(tidak ada perangkat Bluetooth/mikrofon), jadi dua hal itu perlu dicoba sekali
di HP setelah `npx expo run:android`. Seluruh jalur kode, izin, dan penanganan
galatnya sudah disiapkan supaya kegagalan muncul sebagai pesan, bukan crash.

---

## 8. Langkah lanjutan yang masuk akal

1. **Diskon & pajak** per transaksi kasir (sekarang harga langsung total).
2. **Mode offline kasir multi-perangkat** (satu HP kasir saja untuk sekarang).
3. **Struk berlogo** — perlu raster logo ke ESC/POS (GS v 0).
4. **Barcode dari kamera ke stok massal** (tambah banyak barang sekali jalan).
5. **Perintah suara tambahan** seperti “catat pengeluaran beli gas dua puluh
   ribu” langsung dari Beranda.
