# Audit rilis untuk Play Store / App Store (Sprint 10.2)

Sudut pandang audit ini bukan "apakah fitur jalan", tetapi **apa yang bisa membuat
pengguna memberi bintang 1, atau membuat peninjau menolak aplikasi.**

Aplikasi ini akan dirilis **sebagai aplikasi HP murni**, bukan web. Semua kalimat
yang menyebut peramban, web, atau alat pengembang sudah dibuang.

---

## 1. Temuan & perbaikan

| # | Temuan | Kenapa berbahaya | Perbaikan |
| --- | --- | --- | --- |
| 1 | `"Peramban tidak punya penjadwal notifikasi sistem. Fitur ini aktif di aplikasi Android/iOS."` | Di aplikasi HP kalimat ini tidak masuk akal dan terkesan belum jadi | Dihapus; pengganti netral: *"Perangkat ini belum bisa menjadwalkan pengingat otomatis."* |
| 2 | `"Di peramban, gunakan menu Notifikasi untuk melihat daftar yang sama."` | Menyebut peramban | Dihapus total |
| 3 | `"Peramban menolak mengunduh berkas."` | Menyebut peramban | *"Berkas gagal diunduh. Coba lagi."* |
| 4 | `"Cetak langsung hanya tersedia di aplikasi Android/iOS…"` | Menyebut web/OS | *"Struk bisa dipratinjau, disalin, dan dibagikan dari layar ini."* |
| 5 | `"Build ini belum memuat modul Bluetooth. Jalankan development build (npx expo run:android)…"` | Menyuruh pengguna menjalankan perintah developer | *"Printer Bluetooth tidak aktif di perangkat ini. Struk tetap bisa disalin dan dibagikan."* |
| 6 | `"…butuh printer Bluetooth yang sudah dipasangkan (build dev)"` | Istilah build | *"…butuh printer Bluetooth yang sudah dipasangkan."* |
| 7 | `"Pengenalan suara tidak bisa dimulai: <pesan asli Inggris>"` | Membocorkan error mentah | Log saja; pengguna melihat *"Pengenalan suara belum bisa dimulai. Coba lagi atau ketik manual."* |
| 8 | `"Dialog berbagi tidak tersedia"` (3 tempat) | Terkesan fitur rusak | *"Dialog berbagi belum terbuka. Coba lagi."* |
| 9 | Pesan login mentah bahasa Inggris (`Invalid login credentials`, `Email not confirmed`) | Pengguna bingung | `friendlyAuthError()` → Indonesia |
| 10 | `"Mode lokal: login tidak tersedia."` | Terkesan fitur hilang | *"Masuk belum bisa dipakai di perangkat ini."* |
| 11 | **Fitur yang belum aktif tetap ditampilkan** (Akun & sinkronisasi, Anggota toko, Log audit, bagian Akun di Privasi) | Pengguna menekan lalu dapat "belum bisa dipakai" → bintang 1 | Semua disembunyikan bila build tidak memakainya (`isCloudEnabled`). Tidak ada janji kosong. |
| 12 | Judul seksi "Tim & keamanan" padahal isinya shift/cadangan/pengingat | Membingungkan | Menjadi "Operasional toko" saat tanpa akun |
| 13 | Privasi menyebut "akun toko dihapus" & tautan log audit saat tidak ada akun | Kalimat menggantung | Disesuaikan per build |
| 14 | Layar Masuk & Daftar tanpa tombol kembali | Pengguna terjebak | Tombol kembali ditambahkan |
| 15 | Layar Akun menampilkan potongan UUID toko | Terlihat seperti data rusak | Diganti "Belum tersambung" |
| 16 | Izin `RECEIVE_BOOT_COMPLETED` dideklarasikan tanpa penerima | Manifest tidak jujur, bisa ditanya saat peninjauan | Dihapus |

## 2. Yang sudah baik dan sengaja dipertahankan

- **Tanpa akun pun semua fitur kasir jalan.** Peninjau Play tidak akan tertahan di layar masuk.
- **Tidak ada data contoh.** Semua toko mulai dari nol; angka Rp 0 disertai ajakan bertindak
  ("Lengkapi identitas toko", "Buka katalog", "Catat penjualan manual").
- **Hapus akun tersedia di dalam aplikasi** (wajib untuk Play bila aplikasi punya akun).
- **Tanpa iklan, tanpa pelacak, tanpa SDK pihak ketiga** untuk analitik.
- **Semua tombol penting punya label aksesibilitas** (`aria-label` sudah diuji).
- Tata letak aman di layar 360 px (lihat `docs/screenshots/74`–`75`).
- Tidak ada teks bahasa Inggris yang tampil ke pengguna.

## 3. Bukti audit

| Pemeriksaan | Hasil |
| --- | --- |
| Pemindaian teks statis (`npm run test:copy`) | **7 pemeriksaan lulus** — 24 pola terlarang (istilah backend, web, build, "belum tersedia") |
| Penjelajahan 17 layar di build web, membaca **seluruh** teks yang tampil | **TIDAK ADA TEKS BERISIKO** |
| Kondisi instal pertama (data kosong) 7 layar | semua punya arahan jelas (screenshot 76–82) |
| Suites lain | db 148, mappers 12, backup 21, rbac 9, orders 9, notif 10, lan 10, tsc 0 error |

## 4. Yang harus Anda urus di Play Console (di luar aplikasi)

Ini tidak bisa dikerjakan dari kode, tetapi menentukan rating dan kelulusan:

1. **Kebijakan privasi (URL wajib).** Isi mengikuti layar **Data & privasi** di
   aplikasi: data disimpan di HP, tidak ada iklan/pelacak, cara menghapus data.
2. **Data safety form.** Jawab: tidak ada data dikirim ke pihak ketiga; tidak ada
   iklan; pengguna bisa menghapus seluruh data dari dalam aplikasi.
3. **Deklarasi izin *exact alarm*** (`SCHEDULE_EXACT_ALARM`). Alasan yang dipakai:
   pengingat jatuh tempo kasbon/pesanan yang dijadwalkan pengguna sendiri.
   Jika tidak ingin mengurus deklarasi ini, hapus izin tersebut dari `app.json` —
   pengingat tetap jalan, hanya bisa tertunda beberapa menit.
4. **Izin kamera, mikrofon, Bluetooth.** Sertakan penjelasan di listing:
   kamera untuk pindai barcode/foto nota, mikrofon untuk catat nominal dengan suara,
   Bluetooth untuk printer struk.
5. **Listing:** jangan menulis "uji coba", "beta", "segera hadir", atau menyebut
   sinkronisasi/akun sebagai syarat. Tekankan: bisa dipakai tanpa internet & tanpa akun.
6. **Screenshot listing:** pakai tangkapan 76–82 (kondisi bersih) dan 53–58
   (pesanan + DP). Jangan memakai screenshot bertanda "mode lokal".
7. **App access:** pilih "semua fungsi tersedia tanpa login" agar peninjau tidak
   meminta akun demo.

## 5. Keputusan rilis: TANPA AKUN (dikunci di kode)

Pengguna yang baru mengunduh tidak akan pernah bertemu layar masuk. Ini bukan
sekadar "kunci tidak dipasang" — ada sakelar eksplisit di
`src/config/release.ts`:

```ts
export const ACCOUNTS_ENABLED = false;
```

`isCloudEnabled` menghitung `ACCOUNTS_ENABLED && url && kunci`, jadi walau suatu
saat kunci backend tidak sengaja terpasang di environment, rilis tetap berjalan
tanpa akun. Fitur akun/anggota/log-audit/pemakaian otomatis tidak muncul, dan
peninjau Play tidak perlu akun demo. `npm run test:copy` gagal bila sakelar ini
dinyalakan tanpa sengaja.

## 6. Risiko yang masih ada (jujur)

| Risiko | Dampak | Saran |
| --- | --- | --- |
| Pengingat hanya diuji di web/unit test | Belum ada bukti notifikasi benar-benar berbunyi | Uji sekali di HP fisik sebelum rilis |
| Printer Bluetooth butuh BLE asli | Di perangkat tanpa BLE, struk hanya bisa dibagikan | Sudah ada pesan netral, tidak mengklaim bisa cetak |
| Sinkron Wi-Fi antar-HP belum ada | Fitur yang Anda minta belum tuntas | Lihat `docs/RENCANA-SINKRON-LAN.md` |
| Aplikasi masih menampilkan fitur akun bila build memakai kunci akun | Perlu dipastikan build rilis memakai konfigurasi yang Anda pilih | Tentukan sekali: rilis **tanpa akun** (paling aman untuk rating) atau **dengan akun** |
| Tema hanya gelap | Sebagian pengguna mengeluh | Pertimbangkan tema terang di sprint berikutnya |
