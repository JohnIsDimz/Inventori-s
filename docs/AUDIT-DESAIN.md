# Audit Desain → Aplikasi Expo Native

**Proyek:** WarungLui (pembukuan warung) · **Sumber:** 6 file prototipe HTML
**Tanggal audit:** 19 November 2026 · **Target:** Expo SDK 58 / React Native 0.88 (Android + iOS)

Dokumen ini mencatat apa yang saya temukan di desain HTML Anda, apa yang saya
bersihkan, dan bagaimana tiap layar dipetakan ke aplikasi native.

---

## 1. Ringkasan berkas yang diaudit

| File HTML | Isi | Route di aplikasi |
|---|---|---|
| `beranda_keuangan_center_fab.html` | Dashboard: saldo, aksi cepat, prioritas, transaksi terbaru, FAB | `app/(tabs)/index.tsx` |
| `modal_pilih_transaksi_catat.html` | Bottom sheet pilih jenis catatan (+ latar beranda) | `app/pilih-transaksi.tsx` |
| `catat_transaksi_vibrant_fintech.html` | Form catat: keypad, kategori, metode bayar, foto nota | `app/catat.tsx` |
| `catat_transaksi_cetak_struk_bluetooth.html` | Versi duplikat + blok printer thermal | digabung ke `app/catat.tsx` |
| `buku_kasbon_hutang_vibrant_fintech.html` | Kasbon pelanggan & utang supplier | `app/(tabs)/kasbon.tsx`, `app/kasbon/[id].tsx` |
| `laporan_keuangan_vibrant_fintech.html` | Laba rugi, grafik, top seller, ekspor | `app/(tabs)/laporan.tsx` |
| — (tidak ada di desain) | Daftar transaksi lengkap, katalog stok, pengingat, pengaturan | `app/(tabs)/transaksi.tsx`, `app/stok.tsx`, `app/notifikasi.tsx`, `app/pengaturan.tsx` |

---

## 2. Temuan kritis

### 2.1 Data demo/simulasi (sudah dibersihkan total)

Prototipe menampilkan angka dan nama yang tidak berasal dari mana pun, dan
**saling bertentangan antar layar**:

| Nilai di HTML | Masalah | Di aplikasi |
|---|---|---|
| Saldo `Rp 8.450.000`, "Kas Harian Rp 7.200.000", "Tabungan Modal Rp 1.250.000" | hardcoded; tidak sama dengan transaksi yang ditampilkan (185.000 + 74.000 − 190.000) | dihitung dari transaksi nyata, mulai `Rp 0` |
| "Omzet Rp 1.850.000 (34 Nota)" vs laporan "Rp 27.900.000 / 842 nota" | dua layar, dua angka | satu sumber data, satu perhitungan |
| "Laba Bersih Hari Ini +Rp 640.000 (+14%)" | persentase tidak punya pembanding | tren hanya tampil bila ada data pembanding |
| "3 Kasbon Jatuh Tempo — Rp 315.000 (Pak Joko, Ibu Maya, Mamat)" tapi daftar kasbon berisi Bu Dewi, Pak RT Bambang, Mas Doni, Ibu Halimah | nama saling tidak cocok | daftar & ringkasan dari record yang sama |
| "Kasbon Pelanggan (12)" dengan 4 kartu ditampilkan | angka tidak konsisten | jumlah = panjang array |
| "Top Seller: Minyak 142 pouch / Beras 86 karung" | tidak bisa dihitung dari transaksi mana pun | dihitung dari rincian barang yang diisi saat transaksi |
| Produk "Minyak Goreng Kita 2L (sisa 3 pouch)", "Gas 3kg (sisa 2)" | stok palsu | katalog kosong sampai pengguna menambah barang |
| Identitas "Toko Kelontong Berkah Lui / Bu Siti / ID W-8829 / 06:00–22:00" | hardcoded di setiap file | diisi di Pengaturan; header menampilkan "Atur nama toko" bila kosong |
| Tanggal "Selasa, 24 Oktober 2023" | statis & basi | tanggal sistem (19 Nov 2026 saat audit) |
| "8 dari 12 pelanggan selalu bayar tepat waktu" | statistik karangan | dihapus (tidak ada datanya) |

**Hasil:** seluruh seed data dihapus. Aplikasi mulai dari nol, punya empty state
yang mengarahkan, dan tidak ada satu angka pun yang bukan hasil hitungan dari
input pengguna. Data uji yang Anda lihat di screenshot QA hanya disuntikkan lewat
`localStorage` saat pengujian — tidak ada di dalam kode aplikasi.

Cara verifikasi: `grep -rn "8.450.000\|Berkah Lui\|Pak Joko\|842" src app` → kosong.

### 2.2 Emoji (dihapus)

| Lokasi | Isi | Tindakan |
|---|---|---|
| Beranda, sapaan | `Semangat Pagi, Bu Siti! 🌤️` | diganti sapaan berbasis jam tanpa emoji |
| Modal, scan nota | `📸 Scan Nota / Struk Otomatis (OCR)` | baris OCR dihapus (fitur tidak ada), emoji hilang |
| Template pengingat (buatan saya) | `Terima kasih 🙏` | dihapus — konsisten tanpa emoji |

Sisa karakter non-ASCII di kode hanya `•`, `−`, `→` (tipografi, bukan emoji).

### 2.3 Ikon: font ikon → SVG vektor gaya iOS

Prototipe memakai **Material Symbols Outlined** (font ikon dari Google Fonts,
di-load via CDN). Konsekuensinya di aplikasi native:

- butuh unduhan aset eksternal (tidak boleh untuk aplikasi offline warung),
- tampilan Material terasa Android-only, bukan gaya iPhone yang Anda minta,
- ikon font tidak bisa diberi stroke width/gradien, tajam-tidaknya tergantung font.

**Diganti dengan satu set ikon SVG sendiri** (`src/components/Icon.tsx`):
grid 24×24, stroke 1.8, ujung membulat, gaya *SF Symbols / iOS line*, 60+ glyph
(`store`, `wallet`, `book`, `trendUp`, `printer`, `whatsapp`, `backspace`, …).
Dirender `react-native-svg`, jadi: identik di Android & iOS, tajam di semua DPI,
bisa diwarnai dinamis, tanpa emoji dan tanpa font ikon.

### 2.4 Klaim fitur yang tidak bisa dipertanggungjawabkan

| Klaim di prototipe | Kenyataan | Keputusan |
|---|---|---|
| "Printer Thermal Kasir — Terhubung: RPP02N (Bluetooth 58mm)" | UI statis; tidak ada kode printer | dibuat pembuat struk ESC/POS 58mm yang **nyata** (`src/services/printer/receipt.ts`) + transport BLE opsional. Status jujur: "Belum terhubung" / "butuh dev build" |
| "Scan Nota — OCR Otomatis" | tidak ada OCR di prototipe | dihapus; lampiran foto nota tetap ada |
| "Ekspor Data Lengkap Excel (.xlsx)" | tidak ada implementasi | CSV (UTF-8 BOM, langsung terbuka di Excel/Sheets) + PDF laporan |
| "Dokumen telah terstandarisasi format pembukuan UMKM KemenkopUKM" | klaim sertifikasi tanpa dasar | dihapus, diganti keterangan netral "siap dipakai untuk pengajuan KUR/pajak" |
| "Mode Kasir POS" | tidak ada alur POS | dihapus dari aksi cepat |
| "Ubah Master" kategori | tombol tanpa tujuan | jadi sheet tambah kategori sungguhan |

### 2.5 Inkonsistensi navigasi

- Beranda: Beranda · Transaksi · **Catat** · Kasbon · Laporan
- Laporan: Beranda · **Hutang** · Catat · **Stok** · Laporan

Label berbeda untuk hal yang sama (Kasbon vs Hutang) dan Stok hanya muncul di
satu layar. **Distandarkan:** 4 tab tetap (Beranda, Transaksi, Kasbon, Laporan) +
FAB tengah "Catat" (seperti desain beranda). Katalog stok, pengingat, dan
pengaturan diakses dari aksi cepat/header.

### 2.6 Dua file "catat transaksi" duplikat

`catat_transaksi_vibrant_fintech.html` dan
`catat_transaksi_cetak_struk_bluetooth.html` ~95% sama; yang kedua menambah blok
printer. Disatukan menjadi satu layar `app/catat.tsx` (bagian printer memakai
saklar + pratinjau struk), sehingga tidak ada dua sumber kebenaran untuk form
yang sama.

### 2.7 Aksesibilitas & kenyamanan sentuh

| Temuan | Dampak | Perbaikan |
|---|---|---|
| Banyak label `text-[9px]`/`[10px]` uppercase | sulit dibaca, terutama di HP murah | minimum 10px + letter-spacing; label penting 11–13px |
| `text-white/30`, `#002816` di atas gradien neon | kontras < 3:1 | palet teks disesuaikan (`textDim`, `textFaint` ≥ 4.5:1 untuk teks normal) |
| Tombol ikon 26–32px (eye, notifikasi, chevron) | di bawah target sentuh 44px | hitSlop 8–10 + minimal 34px box |
| Tombol ikon tanpa nama | tidak terbaca screen reader | `accessibilityLabel` di notifikasi, profil, FAB, keypad |
| Tidak ada state disabled/empty/error | UI menipu saat data kosong | semua layar punya empty state + validasi |
| `min-height: 884px` + layout fixed | terpotong di HP kecil/large font | flex + SafeArea + ScrollView, teks `adjustsFontSizeToFit` |
| FAB & bottom nav menutupi kartu terakhir | konten tidak terbaca | padding bawah scroll 40–48px di semua layar |

### 2.8 Alur bisnis yang belum ada di desain

Desain menampilkan kasbon tapi tidak punya cara membayarnya; tidak ada
pencatatan cicilan, sisa tagihan, atau riwayat. Tidak ada pula konsep
"KAS HARIAN vs TABUNGAN MODAL" yang bisa dijalankan (di desain hanya angka).

Ditambahkan:
- pembayaran kasbon/utang **sebagian** (25% / 50% / lunas) + riwayat + sisa tagihan,
- pemisahan kas → tabungan modal sebagai transaksi internal (tidak mengganggu laba),
- pengingat WhatsApp via share sheet (template bisa diedit, variabel `{nama} {toko} {nominal} {tanggal}`),
- validasi: nominal 0, kasbon tanpa nama, pembayaran melebihi sisa tagihan,
- penghapusan transaksi dengan konfirmasi (kasbon yang sudah dicicil tidak bisa dihapus diam-diam).

---

## 3. Yang dipertahankan dari desain

- Palet dark-neon: `#101320` surface, primary `#00f5a0`, secondary `#00d2ff`, tertiary `#ff6b4a`, amber untuk kasbon.
- Kartu saldo bergradien dengan pemisahan **Kas Harian** & **Tabungan Modal**.
- FAB tengah + bottom navigation 5 slot.
- Aksi cepat 3 kolom berikon, kartu prioritas, daftar transaksi dengan chip status.
- Keypad numerik besar dengan chip nominal cepat.
- Gaya tipografi: Plus Jakarta Sans (UI) + Inter (angka) — font di-*bundle* di `assets/fonts` (bukan CDN), di-subset agar APK ringan.
- Kartu ekspor laporan dan blok printer dengan pratinjau struk 58mm.

---

## 4. Keputusan teknis

| Aspek | Keputusan | Alasan |
|---|---|---|
| Framework | Expo SDK 58 + expo-router (file-based) | rute = struktur file, mudah tumbuh |
| Bahasa | TypeScript strict, `tsc --noEmit` bersih | menghindari bug data uang |
| State | Zustand + AsyncStorage (offline-first) | cepat, tanpa server, tahan mati lampu |
| Angka | semua *derived selector* (`src/data/selectors.ts`) | mustahil ada saldo yang tidak sinkron |
| Ikon | SVG sendiri (react-native-svg) | tanpa emoji, tanpa font ikon, konsisten 2 platform |
| Grafik | SVG buatan sendiri | tanpa library chart, ukuran kecil |
| Cetak | ESC/POS 58mm + BLE opsional | jujur: fitur native butuh dev build |
| Ekspor | expo-print (PDF) + CSV UTF-8 | tidak butuh backend |
| Build | Development build (pilihan Anda) | printer BLE & kamera butuh modul native |

---

## 5. Catatan QA

Diuji dengan: `tsc --noEmit` (0 error), `expo export --platform android`
(bundle 4.4 MB Hermes) dan `expo export --platform web` + Playwright untuk
screenshot seluruh layar (390×844, DPR 2), baik kondisi kosong maupun berisi
data. Tidak ada error runtime di console.

Temuan yang sudah diperbaiki dari hasil QA:
1. Tombol "Simpan & lihat pratinjau struk" men-save transaksi (seharusnya hanya pratinjau).
2. Sukses simpan memakai `Alert` → diganti sheet sukses (konsisten di Android/iOS, bisa "Lihat struk"/"Catat lagi").
3. Teks struk terpotong di 32 karakter → sekarang di-*wrap*.
4. Saldo negatif tampil warna netral → sekarang merah.
5. Label tombol "Kasbon baru" terpotong pada layar 360px.
6. Chip nominal cepat membungkus ke dua baris → dibuat 4 chip `+5rb … +100rb` satu baris.
7. Nilai rupiah panjang terpotong "Rp 1.628.5…" di kartu stok → format ringkas.
8. Button disabled masih menampilkan gradien neon transparan → jadi flat.

---

## 6. Sisa pekerjaan / roadmap

- [ ] OCR nota (butuh ML Kit / layanan vision — sengaja tidak dipalsukan)
- [ ] Sinkronisasi cloud multi-perangkat (Supabase) — layer repository sudah dipisah, tinggal tambah adapter
- [ ] Cetak langsung: `npx expo install react-native-ble-plx` lalu `expo prebuild`
- [ ] Notifikasi lokal pengingat jatuh tempo (expo-notifications)
- [ ] Barcode/scan barang untuk mode kasir cepat
- [ ] Ekspor `.xlsx` asli (SheetJS) bila CSV dirasa kurang
- [ ] Multi-kasir & shift kas (data model sudah mendukung penambahan `cashierId`)
