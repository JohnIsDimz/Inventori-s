# Bersih-bersih teks rilis (Sprint 10.1)

Tujuan: aplikasi ini **dipublikasikan** di Play Store, bukan dipakai sendiri.
Tidak boleh ada satu kalimat pun yang membuat pembeli merasa disuruh mengerjakan
hal teknis. Satu komplain "aplikasi ini minta saya isi kunci API" cukup untuk
menjatuhkan penilaian.

Aturan yang dipakai sekarang: **tidak ada istilah backend di layar mana pun.**

---

## 1. Yang dihapus

| Objek | Alasan |
| --- | --- |
| `app/status-cloud.tsx` (layar utuh) | Memuat `.env.example`, `EXPO_PUBLIC_SUPABASE_URL`, "migrasi 0001–0010 di SQL Editor", `docs/CEK-CLOUD.md`, `supabase/README.md`, dan tombol **Periksa database**. |
| Tombol **Periksa database** | Menyuruh pengguna memeriksa tabel basis data. |
| Tombol **Kosongkan antrean (debug)** | Kata "debug" di layar akun. |
| `src/services/cloud/readiness.ts` + `src/data/plan.ts` + `supabase/tests/cloud.test.mts` | Kode mati setelah layar diagnostik dibuang; isinya hanya teks developer. |
| Rute `status-cloud` di `app/_layout.tsx` | Tidak ada lagi tujuannya. |
| Baris Pengaturan "Buka status cloud dan sinkronisasi" | Diganti baris akun biasa. |

## 2. Kalimat yang ditulis ulang

| Sebelum (bocor istilah) | Sesudah (bahasa pemilik toko) |
| --- | --- |
| "Aplikasi tanpa server" | "Belum masuk akun" |
| "Tanpa server • ketuk untuk panduan cloud" | "Data hanya di HP ini • akun tidak wajib" |
| "Mode cloud — data naik ke server" | "Tersambung antar perangkat" |
| "Mode lokal — data di perangkat" | "Hanya tersimpan di HP ini" |
| "Menyalakan cloud (opsional) … isi dua variabel berikut lalu bangun ulang aplikasi: `EXPO_PUBLIC_SUPABASE_URL` …" | "Ingin dibuka dari HP lain? Masuk memakai akun toko Anda…" + tombol **Masuk atau daftar** |
| "Aplikasi sedang berjalan tanpa server (mode lokal) … Isi EXPO_PUBLIC_SUPABASE_URL dan kunci anon di berkas .env lalu bangun ulang aplikasi." | "Pendaftaran belum bisa dipakai di perangkat ini. Hubungi pemilik toko…" |
| "Anggota hanya bisa dikelola bila aplikasi terhubung ke server. Isi EXPO_PUBLIC_SUPABASE_URL dan kunci anon…" | "Daftar anggota, peran, dan kode undangan muncul setelah Anda masuk memakai akun toko." |
| "Akun dibuat oleh pemilik toko lewat dashboard Supabase (Authentication → Add user)." | "Akun dibuat oleh pemilik toko — minta kode undangan bila belum punya." |
| "Audit butuh mode cloud … dibuat oleh database (trigger & RPC) … terhubung ke Supabase." | "Log audit perlu akun toko … baru muncul setelah Anda masuk." |
| "…disalin ke server saat daring" | "…disalin ke perangkat toko Anda saat tersambung." |
| "Aplikasi berjalan tanpa server. Tidak ada akun yang tersimpan…" | "Anda belum masuk akun toko. Tidak ada akun yang tersimpan…" |
| "Data disimpan di SQLite perangkat (tabel app_kv + antrean outbox)." | "Semua catatan disimpan di HP ini. Perubahan yang belum sempat terkirim tetap aman…" |
| "Koneksi: Online / Offline (antrean ditahan)" | "Jaringan: Tersambung / Tidak tersambung — perubahan ditahan dulu" |
| "Total N catatan tersimpan di HP ini dan tidak pernah dikirim ke mana pun." | tetap, tetapi versi akun tidak lagi menyebut server |
| "Semua file dibuat di perangkat Anda. Tidak ada data yang diunggah ke server." | "Semua berkas dibuat di HP Anda dan tidak diunggah ke mana pun." |
| "Rekap dihitung dari shift … Untuk angka server, gunakan laporan…" | "Untuk angka lengkap satu bulan, buka halaman Laporan." |
| "Seluruh data disimpan di perangkat ini (AsyncStorage) dan tidak dikirim ke server mana pun." | "Seluruh data tersimpan di HP ini dan tidak dikirim ke mana pun." |
| "Pembukuan warung offline-first … dibuat untuk Android & iOS dengan Expo." | "Pembukuan warung yang siap dipakai tanpa internet. Versi 1.0.0." |
| "Tidak ada SDK iklan…" | "Tidak ada iklan, tidak ada pelacak…" |
| Badge "Mode lokal" / "Offline" | "Di HP ini" / "Tidak tersambung" |
| "Ekspor & pulihkan tanpa cloud" | "Simpan & pindahkan data toko" |
| "Pemakaian data" (kuota penyimpanan) | "Pemakaian toko" |
| "Notifikasi lokal mati" | "Belum aktif" |

## 3. Pesan galat juga dibersihkan

Galat dari jaringan/penyimpanan datang dalam bahasa Inggris dan menyebut hal
internal ("JWT expired", "row-level security policy", "Failed to fetch").
Sekarang semuanya melewati `src/services/sync/errors.ts` →

| Kondisi | Yang dilihat pengguna |
| --- | --- |
| jaringan mati | "Tidak ada koneksi. Perubahan tetap tersimpan di HP ini dan dikirim otomatis saat online." |
| sesi habis | "Sesi masuk sudah berakhir. Masuk lagi supaya data bisa disinkronkan." |
| tanpa hak akses | "Akun ini tidak punya akses ke data toko tersebut. Minta pemilik toko menambahkan Anda." |
| bentrokan data | "Sebagian catatan sudah ada di perangkat lain. Data Anda tidak hilang — coba sinkron lagi." |
| lainnya | "Sinkron belum berhasil. Data tetap aman di HP ini — coba lagi sebentar lagi." |

Pesan asli tetap dicatat di log (`console.warn`) saat mode pengembang, jadi tetap
bisa didiagnosa tanpa membingungkan pembeli.

## 4. Penjaga otomatis: `npm run test:copy`

`supabase/tests/copy.test.mts` memindai **semua** string literal **dan** teks JSX
di `app/`, `src/components/`, `src/data/`, plus berkas layanan yang teksnya
tampil (cadangan, ekspor, struk, pesan galat, template pengingat). Kata terlarang:
`supabase`, `anon`, `api key`, `.env`, `EXPO_PUBLIC`, `migrasi/migration`,
`database`, `postgres`, `sql`, `sqlite`, `outbox`, `cloud`, `server`,
`dashboard`, `rpc`, `trigger`, `realtime`, `offline`, `debug`, `jwt`, `token`,
`kuota`.

Komentar kode dilewati, jadi catatan internal untuk pengembang tetap boleh
memakai istilah teknis di dalam `/* … */` atau `//`.

Selain pemindaian statis, audit visual dilakukan dengan menjelajahi 16 layar di
build web lalu memeriksa seluruh teks yang benar-benar tampil — hasil akhir:
**SEMUA BERSIH** (lihat `docs/screenshots/63`–`69`).

## 5. Yang belum/tidak diubah

- Nama merek "Inventori’s" dan istilah dagang tetap: **Kasbon**, **Opname**,
  **Kuotasi**, **Pulsa & Token** (kategori jualan), **Shift kasir**.
- Dokumen di `docs/` dan `supabase/` tetap teknis — itu untuk Anda sebagai
  pemilik produk, tidak pernah ikut tampil di layar.
- Fitur akun & sinkron tetap ada (keputusan Anda), hanya bahasanya diganti.
