# Inventori’s — Kasir & Pembukuan Warung (Expo / React Native)

Aplikasi native Android & iOS untuk **berjualan di kasir (POS)** sekaligus
mencatat pembukuan warung: penjualan, pengeluaran, kasbon, stok, dan laporan
laba rugi. **Offline-first, tanpa data demo** — semua angka dihitung dari
catatan Anda sendiri.

Fitur utama: kasir dengan **pemindai barcode**, **cetak struk ke printer thermal
Bluetooth**, **input suara Bahasa Indonesia**, harga modal/jual + margin & markup,
omzet harian, untung, dan peringkat kategori paling laku.

Aplikasi punya **dua mode**:
- **Mode lokal** (default, tanpa konfigurasi) — semua data di perangkat, tanpa akun, tanpa jaringan.
- **Mode cloud** (isi `.env`) — login, peran Owner/Admin/Kasir, dan sinkronisasi ke
  Postgres (Supabase) dengan RLS. Panduan: `supabase/README.md`.

Dokumen pendamping:
- `docs/FONDASI-FULLSTACK.md` — backend, login, sinkron offline-first, peran & izin
- `docs/SPRINT-2.md` — stok berbasis delta, realtime, deteksi offline, kategori & alokasi
- `docs/SPRINT-3.md` — shift kasir, undang anggota (kode undangan), audit log
- `docs/CLOUD-SKALA.md` — rencana cloud untuk banyak toko: biaya, kuota, retensi, backup, UU PDP
- `docs/SPRINT-4.md` — diskon & pajak, rekap/laporan shift, audit anggota & stok
- `docs/SPRINT-5.md` — harga grosir, diskon per barang, splash baru, penjelasan mode lokal
- `docs/SPRINT-11.md` — buku pelanggan, poin & tingkat kesetiaan, pengingat kasbon
- `docs/SPRINT-12.md` — cabang (multi-outlet), stok per cabang, migrasi toko satu lokasi
- `docs/SPRINT-13.md` — hitung stok fisik (opname), nilai selisih & riwayatnya
- `docs/SPRINT-14.md` — kulakan supplier, HPP rata-rata, utang kulakan & nota
- `docs/SPRINT-15.md` — buku supplier, retur barang & saldo retur
- `docs/SPRINT-16.md` — laporan selisih hitung stok per periode & grafik harga beli
- `docs/SPRINT-17.md` — tagih kasbon lewat WhatsApp, ekspor selisih stok & riwayat harga beli, notifikasi stok menipis & harga naik
- `docs/AUDIT-SPRINT-17.md` — audit menyeluruh: 11 temuan (4 di antaranya soal uang), 3 butir lanjutan yang sudah dikerjakan, + hasil telusur 30 layar
- `supabase/README.md` — setup Supabase, RLS, RPC, cara mengundang kasir
- `docs/ROADMAP-MVP-FULLSTACK.md` — peta jalan fitur sampai MVP full-stack
- `docs/FITUR-KASIR-PRINTER-VOICE.md` — kasir, barcode, printer BLE, voice input, cara build
- `docs/AUDIT-KODE.md` — audit kode, keamanan, dan UI
- `docs/AUDIT-DESAIN.md` — audit desain dari 6 prototipe HTML

**Lihat hasilnya dulu:** buka `docs/PREVIEW.html` (galeri screenshot semua layar,
kondisi kosong & berisi data) — tanpa perlu build apa pun.

---

## 1. Menjalankan proyek

**Prasyarat:** Node.js **22 LTS atau lebih baru** (React Native 0.88 meminta
`^22.13 || ^24.3 || >=26`), npm, Android Studio / Xcode untuk build lokal.

```bash
npm install

# Development build (disarankan — sesuai pilihan konfigurasi awal)
npx expo prebuild --clean
npx expo run:android      # atau: npx expo run:ios
```

> **Kenapa dev build, bukan Expo Go?** Printer thermal Bluetooth
> (`react-native-ble-plx`), pengenalan suara (`expo-speech-recognition`), dan
> kamera butuh binary sendiri. Expo Go tetap bisa dipakai untuk melihat UI
> (`npx expo start`), tetapi tombol cetak/mikrofon akan menampilkan pesan bahwa
> fitur itu butuh development build — bukan crash.

### Printer thermal BLE

Modul **sudah terpasang** (`react-native-ble-plx@3.5.1`). Setelah
`npx expo prebuild --clean && npx expo run:android`:

1. Pengaturan → **Printer struk** → *Pindai printer* → pilih printer → *Uji cetak*.
2. Kasir/Catat → **Cetak ke printer**.

Printer yang didukung: thermal 58 mm BLE (RPP02N, GoojPRT, XP-58, MTP-II, dsb).
Izin Android (`BLUETOOTH_SCAN/CONNECT`) dan iOS
(`NSBluetoothAlwaysUsageDescription`) diurus otomatis oleh config plugin.

### Input suara Bahasa Indonesia

Tombol mikrofon di **Catat** (nominal) dan **Kasir** (pencarian). Contoh:
“jual indomie dua puluh lima ribu” → Rp 25.000 + catatan “indomie”.
Membutuhkan izin mikrofon; bila layanan suara perangkat tidak ada, UI memberi
pesan dan input manual tetap jalan.

### Perintah lain

| Perintah | Fungsi |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict, 0 error) |
| `npm start` | Metro untuk dev client |
| `npx expo export --platform android` | bundel produksi (Hermes) |
| `npm run test:db` | uji migrasi + RLS + RPC di Postgres asli (PGlite), 148 pemeriksaan |
| `npm run test:mappers` | uji bentuk data sinkron klien ↔ tabel, 12 pemeriksaan |
| `npm run test:backup` | uji ekspor/impor cadangan lokal (JSON) + pengingat, 23 pemeriksaan |
| `npm run test:orders` | uji hitungan & teks pesanan/kuotasi, 9 pemeriksaan |
| `npm run test:copy` | audit teks rilis: tidak ada istilah teknis di layar, 8 pemeriksaan |
| `npm run test:store` | uji alur uang end-to-end pada store (kasir, kasbon, kulakan, retur, opname, pesanan, shift, cabang, cadangan, pelanggan manual & hapus transaksi), 59 pemeriksaan |
| `npm run test:notif` | uji jadwal pengingat jatuh tempo + peringatan stok menipis & harga beli naik, 20 pemeriksaan |
| `npm run test:lan` | uji penggabungan data antar-HP, 10 pemeriksaan |
| `npm run test:customers` | uji buku pelanggan, poin & tingkat kesetiaan, 19 pemeriksaan |
| `npm run test:outlets` | uji cabang, stok per cabang & migrasi data lama, 18 pemeriksaan |
| `npm run test:opname` | uji hitung stok fisik, selisih & nilai kerugian, 11 pemeriksaan |
| `npm run test:purchases` | uji kulakan supplier, HPP rata-rata & utang, 14 pemeriksaan |
| `npm run test:suppliers` | uji buku supplier, retur & saldo retur, 15 pemeriksaan |
| `npm run test:laporan` | uji selisih hitung stok per periode & riwayat harga beli, 11 pemeriksaan |
| `npm run test:reminders` | uji daftar tagih kasbon WhatsApp & isi pesannya, 12 pemeriksaan |
| `npm run test:ekspor` | uji tambahan laporan PDF/CSV (selisih hitung stok + riwayat harga beli), 14 pemeriksaan |
| `npm run test:rbac` | uji matriks izin per peran (pemilik/admin/kasir), 9 pemeriksaan |

---

## 2. Struktur proyek

```
app/                          # rute (expo-router, file-based)
  _layout.tsx                 # font, splash, provider, stack + modal
  (tabs)/_layout.tsx          # 4 tab + FAB kustom
  (tabs)/index.tsx            # Beranda
  (tabs)/transaksi.tsx        # Daftar transaksi (grup per hari, cari, filter)
  (tabs)/kasbon.tsx           # Kasbon pelanggan & utang supplier
  (tabs)/laporan.tsx          # Laba rugi, grafik, top seller, ekspor
  kasir.tsx                   # Kasir/POS: keranjang, barcode, bayar, struk
  catat.tsx                   # Form catat (keypad, kategori, mik, printer, struk)
  pilih-transaksi.tsx         # Bottom sheet pilih jenis catatan
  kasbon/[id].tsx             # Detail kasbon + cicilan
  stok.tsx                    # Katalog & stok
  opname.tsx                  # Hitung stok fisik (opname)
  pembelian.tsx               # Catat kulakan supplier + HPP rata-rata
  supplier.tsx                # Buku supplier (nomor HP, utang, saldo retur)
  retur.tsx                   # Retur barang ke supplier
  harga-beli.tsx              # Riwayat & grafik harga beli per barang
  tagih-kasbon.tsx            # Daftar tagih kasbon + kirim WhatsApp
  notifikasi.tsx              # Pengingat jatuh tempo, stok menipis, harga naik
  pengaturan.tsx              # Identitas toko, template WA, printer, akun, reset
  masuk.tsx                   # Login (hanya muncul di mode cloud)
  daftar.tsx                  # Daftar akun + tukar kode undangan
  akun.tsx                    # Akun, peran, outlet, antrean & sinkron manual
  shift.tsx                   # Shift kasir: modal awal, uang fisik, selisih
  anggota.tsx                 # Kelola anggota & kode undangan (mode cloud)
  audit.tsx                   # Log audit harga/void (mode cloud)

supabase/
  migrations/                 # 0001 skema, 0002 RLS, 0003 RPC (sync_transaction, shift, dll)
  tests/                      # 17 suite uji (termasuk store/ untuk alur uang end-to-end)
  tests/                      # uji backend (PGlite) & uji mapper

src/
  components/                 # SyncBadge + Icon (SVG 60+ glyph), Primitives, Charts,
                              # TransactionRow, DebtCard, Keypad, TabBar, Field
  data/                       # types, store (Zustand+SQLite), auth (sesi & peran), selectors
  services/db/                # driver lokal: SQLite native / localStorage web + migrasi
  services/sync/              # outbox, idmap, mappers, engine (push/pull/merge),
                              # connectivity (NetInfo), realtime (Supabase)
  services/supabase/          # klien + saklar mode lokal/cloud
  utils/permissions.ts        # matriks izin Owner/Admin/Kasir
  services/printer/           # receipt.ts (ESC/POS 58mm), index.ts (transport BLE)
  services/export.ts          # PDF (expo-print) & CSV
  services/voice.ts           # pengenalan suara id-ID
  services/printer/           # receipt.ts (ESC/POS) + transport BLE nyata
  services/photos.ts          # penyimpanan permanen foto nota
  utils/security.ts           # validasi nominal, escape HTML/CSV/ESC-POS
  theme/tokens.ts             # warna, radius, tipografi, shadow
  utils/format.ts             # rupiah, tanggal Indonesia, mask nominal
assets/fonts                  # Plus Jakarta Sans + Inter (di-subset)
docs/AUDIT-DESAIN.md          # audit desain & keputusan
docs/AUDIT-KODE.md            # audit kode, keamanan, fitur setengah jalan, UI
docs/FITUR-KASIR-PRINTER-VOICE.md  # kasir, barcode, printer BLE, voice input
docs/PREVIEW.html             # galeri screenshot (self-contained)
docs/screenshots/             # screenshot PNG resolusi penuh
```

---

## 3. Model data

```ts
Transaction { type: 'sale'|'expense', amount, categoryId, method, note, photoUri, createdAt, items[] }
Receivable  { customerName, amount, dueDate, items[], payments[] }   // piutang/kasbon
Payable     { supplierName, amount, dueDate, payments[] }            // utang kulakan
Product     { name, unit, sellPrice, costPrice, stock, minStock, barcode? }
CapitalAllocation { amount, createdAt }                              // kas → tabungan modal
Profile / Settings / Category
```

**Tidak ada nilai awal selain kategori master.** Saldo, omzet, laba, margin,
top seller, dan pengingat semuanya fungsi turunan (`src/data/selectors.ts`),
sehingga tidak mungkin ada angka "demo" yang tertinggal.

### Rumus yang dipakai

- **Kas harian** = penjualan tunai/QRIS/transfer − pengeluaran + pembayaran kasbon − pembayaran utang − dana yang dipindah ke tabungan modal.
- **Tabungan modal** = Σ pemisahan kas (bukan pengeluaran, tidak mengurangi laba).
- **Laba bersih** = omzet (termasuk kasbon) − pengeluaran.
- **Margin** = laba / omzet.
- **Laba kotor per barang** = (harga jual − harga modal) × qty, bila rincian barang diisi.

---

## 4. Fitur per layar

**Beranda** — saldo kas + tabungan modal (bisa disembunyikan), ringkasan hari ini,
aksi cepat 6 tombol, kartu "perlu ditindak" (kasbon jatuh tempo/lewat, stok
menipis), transaksi terbaru, tips, sheet pisah tabungan.

**Catat transaksi** — pemasukan/pengeluaran, keypad, chip nominal cepat, kategori
(bisa ditambah), metode (tunai/QRIS/transfer/kasbon), detail kasbon (nama +
tempo), foto nota dari kamera/galeri, rincian barang (qty, harga jual, modal),
printer + saklar cetak otomatis, pratinjau & bagikan struk 58 mm, sheet sukses.

**Transaksi** — pencarian, filter Semua/Masuk/Keluar/Kasbon, grup per hari dengan
subtotal, detail transaksi (termasuk status kasbon) dan hapus dengan konfirmasi.

**Kasbon** — ringkasan piutang/utang, tab Pelanggan/Supplier/Lunas, kartu dengan
progress pembayaran, pengingat WhatsApp (template), pembayaran sebagian
(25%/50%/lunas), halaman detail + riwayat cicilan, dan **layar Tagih kasbon**
(kasbon telat/hari ini/paling lama 3 hari lagi, nomor HP diambil dari buku
pelanggan, pratinjau pesan, tombol buka WhatsApp, tanda sudah ditagih supaya
tidak menagih dua kali).

**Laporan** — periode 7 hari/bulan ini/bulan lalu, **selisih hitung stok** (nilai barang
kurang/lebih + barang paling merugikan), laba bersih & margin,
perbandingan bulan sebelumnya, arus kas mingguan, tren 6 bulan, alokasi
pengeluaran (donut), juara penjualan, ekspor PDF & CSV — berkasnya kini juga
memuat **selisih hitung stok** dan **riwayat harga beli**.

**Pengingat** — kasbon jatuh tempo (H-1 & hari-H), pesanan siap diambil, **stok
menipis**, dan **harga beli naik ≥ 5%** dibanding kulakan sebelumnya; peringatan
stok & harga juga dijadwalkan sebagai notifikasi pagi (sekali sehari).

**Stok** — nilai stok, penanda menipis, tambah/ubah barang, penyesuaian stok cepat
(+/−), margin per satuan, dan **hitung stok fisik** (opname): ketik jumlah nyata,
selisih dinilai harga modal, riwayat + laporan siap dibagikan.

**Kulakan** — catat belanja stok dari supplier: jumlah & harga beli, stok bertambah,
HPP jadi rata-rata tertimbang, uang yang dibayar tercatat sebagai pengeluaran, sisa
otomatis menjadi utang supplier, nota siap dibagikan.

**Riwayat harga beli** — grafik harga kulakan per barang (tertinggi/terendah/rata-rata,
naik atau turun berapa persen) — dibuka dari *Katalog & stok → Ubah → Riwayat harga beli*.

**Supplier** — buku agen dengan nomor HP, jumlah kulakan, utang berjalan, dan saldo
retur. **Retur barang**: stok berkurang, nilainya memotong utang kulakan lebih dulu,
sisanya jadi saldo yang otomatis memotong pembayaran kulakan berikutnya.

**Pengaturan** — identitas toko (dipakai di header, struk, pesan), jam buka,
template pengingat dengan pratinjau langsung, printer, bank data, hapus semua
data.

---

## 5. Ikon

`src/components/Icon.tsx` berisi 60+ glyph SVG gaya iOS (grid 24, stroke 1.8,
ujung membulat) — bukan emoji dan bukan font ikon, sehingga tampil identik di
Android & iOS:

```tsx
<Icon name="book" size={20} color={colors.amber} strokeWidth={1.9} />
```

Tambah ikon baru: tambahkan satu entri `Path` di objek `glyphs`; tipe `IconName`
otomatis ikut.

---

## 6. Privasi

- **Mode lokal:** semua data di perangkat (SQLite `inventoris.db`, tabel `app_kv`;
  data lama di AsyncStorage `inventoris-store-v1` / `warunglui-store-v1` disalin
  otomatis sekali saat aplikasi dibuka). Tidak ada akun, tidak ada request jaringan.
- **Mode cloud:** data naik ke proyek Supabase milik Anda, dilindungi RLS per
  outlet; kata sandi ditangani Supabase Auth (aplikasi tidak pernah menyimpannya).
  Antrean perubahan tersimpan lokal sehingga tetap aman saat sinyal putus.
- Tidak ada analytics dan tidak ada server pihak ketiga selain proyek Supabase Anda.
- File ekspor dibuat lokal lalu dibagikan lewat dialog sistem.
- "Hapus semua data" mengosongkan seluruh catatan (pengaturan printer dipertahankan).

---

## 7. Checklist uji manual

1. Kosongkan data → semua layar harus menampilkan empty state, bukan `Rp 0` yang membingungkan.
2. Catat penjualan tunai → saldo & omzet hari ini naik, transaksi muncul di Beranda.
3. Catat penjualan kasbon tanpa nama → ditolak dengan pesan yang jelas.
4. Bayar kasbon 50% → status "Sisa …", progress bertambah, kas masuk ikut naik.
5. Isi rincian barang + harga modal → Juara Penjualan & laba kotor terisi.
6. Ekspor PDF/CSV → file terbuka di aplikasi lain.
7. Matikan lalu buka aplikasi → data tetap ada (persistensi).
8. Ganti bahasa perangkat ke ukuran font besar → layout tidak terpotong.
9. Kasir: pindai barcode barang → masuk keranjang; bayar tunai Rp 200.000 → kembalian benar; stok berkurang.
10. Mode lokal: buka **Pengaturan → Akun & sinkronisasi** → status "Mode lokal" dan panduan `.env` muncul.
11. Mode cloud: login → **Akun** → status "Tersinkron", antrean 0; matikan internet, catat 3 transaksi (antrean naik), nyalakan lagi → antrean kembali 0 tanpa nota berganda.
12. Peran kasir: menu laba menampilkan "Akses terbatas"; mengubah harga ditolak server (bukan hanya disembunyikan).
13. Dua perangkat: produk yang sama, stok 1; jual bersamaan → satu berhasil, satu menerima pesan stok tidak cukup.
14. Hapus transaksi sebagai kasir → ditolak; sebagai owner → stok kembali dan audit log tercatat.
15. Tambah barang stok 7 → antrean berisi `product` dengan `stockDelta 7` (tanpa stok absolut); tombol + menjadi op `stock_delta`.
16. Mode pesawat saat mencatat transaksi → status "Offline · N menunggu"; internet kembali → antrean kosong tanpa nota berganda.
17. Dua perangkat menjual barang yang sama → stok akhir = stok awal − jumlah keduanya (bukan salah satu menimpa).
18. Shift: buka 50.000 → jual tunai 30.000 → tutup dengan uang fisik 80.000 → selisih Rp 0, riwayat tercatat.
19. Undang kasir: buat kode di **Anggota**, daftar dengan kode itu di HP lain → langsung jadi kasir; kode yang sama ditolak bila dipakai dua kali.
20. Audit: ubah harga barang → **Log audit** menampilkan perubahan + email pelaku; kasir tidak bisa membuka layar itu.
21. Mode cloud: **Pengaturan → Pemakaian data** menampilkan jumlah transaksi, barang, anggota, dan perkiraan MB untuk toko tersebut (kasir tidak melihat kartu ini / ditolak server).
22. Diskon & pajak: Pengaturan → Pajak penjualan 10% → Kasir → keranjang → **Diskon %** 10 → tampil Subtotal Rp 9.000, Diskon −Rp 900, Pajak Rp 810, Total **Rp 8.910** → struk memuat rincian yang sama.
23. Audit: ubah peran anggota atau koreksi stok manual → **Log audit** mencatat "Peran Kasir → Admin" / "Stok 20 → 25 (+5)".
24. Harga grosir: barang jual Rp 9.000 dengan grosir Rp 8.000 minimal 3 → keranjang 3 pcs otomatis Rp 8.000 dan bertanda "harga grosir"; turunkan ke 2 pcs → kembali Rp 9.000.
25. Diskon per barang: isi "Diskon <nama barang>" Rp 2.000 di keranjang → subtotal berkurang sebelum diskon nota & pajak dihitung.
10. Kasir: pindai barcode yang belum terdaftar → form barang baru muncul, simpan, barang masuk keranjang.
11. Pengaturan → Printer struk → pindai printer → uji cetak (butuh dev build + printer 58 mm).
12. Catat → tombol mikrofon → ucapkan "dua puluh lima ribu" → nominal terisi Rp 25.000.
