# Cek Cloud — "Aplikasi sudah dibuild + Supabase, apakah otomatis terbaca?"

Jawaban singkat: **tidak otomatis.** Sambungannya bukan saklar, melainkan enam
langkah berurutan. Enam langkah itu sekarang bisa dilihat langsung di aplikasi:
**Pengaturan → Aplikasi tanpa server / Status cloud**.

| # | Langkah | Kalau belum beres |
|---|---|---|
| 1 | Kunci server terpasang **saat build** | Aplikasi tetap mode lokal walau `.env` sudah diisi |
| 2 | Sudah **masuk** (Supabase Auth) | Data server tidak bisa dibaca: RLS butuh identitas |
| 3 | Akun punya **toko** (`members`) | Bisa masuk, tetapi tidak ada data yang ditarik |
| 4 | **Migrasi 0001–0010** sudah dijalankan | Tabel/fungsi tidak ada → sinkron gagal dengan pesan jelas |
| 5 | **Antrean** kosong | Perubahan lokal belum sampai server |
| 6 | **Tarikan terakhir** | Kapan data server terakhir dibaca |

---

## 1. Kunci server dibaca saat BUILD, bukan saat aplikasi dibuka

```ts
// src/services/supabase/client.ts
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
export const isCloudEnabled = url.length > 0 && anonKey.length > 0;
```

`EXPO_PUBLIC_*` **dipanggang ke dalam bundel** ketika `expo export` /
`eas build` dijalankan. Konsekuensinya:

- Mengubah `.env` lalu membuka ulang aplikasi yang sudah terpasang → **tidak ada
  efek**. Harus build ulang dan pasang ulang.
- Kalau build dibuat tanpa `.env` (mis. build di CI tanpa secret), hasilnya
  aplikasi mode lokal — persis perilaku yang aman, tidak error.
- Kunci anon key memang aman ditaruh di aplikasi; **jangan pernah** memakai
  `service_role` di klien.

## 2. Masuk dulu — RLS butuh identitas

Tanpa sesi, Supabase menganggap permintaan datang sebagai `anon`. Semua tabel
memakai `is_member(outlet_id)`, jadi hasilnya kosong (bukan error). Itu sebabnya
"aplikasi tersambung" tapi terasa tidak ada data.

Alur di aplikasi:

```
_layout.tsx  →  auth.bootstrap()        // baca sesi tersimpan
             →  refreshMembership()     // baca outlet + peran dari `members`
             →  startSyncLoop(30_000)   // langsung syncNow(), lalu tiap 30 detik
```

Setelah login berhasil, `syncNow()` jalan **segera** (bukan menunggu 30 detik),
lalu berulang setiap 30 detik, setiap ada perubahan (`syncSoon`), dan saat
jaringan kembali (NetInfo).

## 3. Punya toko & peran

`members` menentukan outlet dan peran. Akun baru tanpa outlet akan melihat
layar Akun dengan pilihan **Buat toko** atau **Tukar kode undangan**. Tanpa ini,
tidak ada `outlet_id` yang bisa dipakai menarik data.

## 4. Migrasi 0001–0010

Urutan: `0001_init` → `0002_rls` → `0003_rpc` → `0004_sprint2` →
`0005_sprint3` → `0006_skala` → `0007_sprint4` → `0008_sprint5` →
`0009_sprint7` → `0010_sprint8`.

> **Catatan Sprint 10.1:** tombol **Periksa database** dan seluruh layar status
> sudah dihapus dari aplikasi karena memuat istilah teknis. Isi dokumen ini tetap
> berlaku sebagai panduan internal saat menyiapkan build.

Di aplikasi, tombol **Periksa database** mencoba `select id ... limit 1` pada
`outlets, members, products, transactions, orders`. Bila ada yang hilang,
layar menampilkan nama tabelnya.

## 5. Apa yang "otomatis" setelah keenam langkah beres

| Hal | Otomatis? | Keterangan |
|---|---|---|
| Perubahan lokal terkirim | ✅ | Antrean (outbox) dikirim tiap 30 detik; entitas: produk, delta stok, transaksi, kasbon, utang, kategori, alokasi, shift, **pesanan**, profil |
| Data server masuk ke HP | ✅ | Tarik bertahap per tabel memakai kursor `updated_at` (300 baris sekali jalan) |
| Data dari HP lain muncul tanpa buka aplikasi | ✅ | Realtime `postgres_changes` pada tabel utama |
| Data **sebelum** cloud diaktifkan ikut terkirim | ✅ | Setiap mutasi sudah masuk antrean sejak mode lokal, jadi saat login antrean itu dikirim |
| Akun kedua otomatis melihat data | ⚠️ | Hanya bila jadi **anggota outlet** yang sama (kode undangan) |
| Login otomatis | ✅ | Sesi disimpan di AsyncStorage dan diperbarui otomatis |
| Data contoh | ❌ | Tidak ada; semua angka berasal dari transaksi nyata |

## 6. Urutan uji cepat (10 menit)

1. Buat proyek Supabase, jalankan 10 migrasi.
2. `cp .env.example .env`, isi URL + anon key.
3. Build & pasang, buka **Status cloud**: langkah 1 dan 4 harus hijau.
4. Daftar akun → buat toko → catat satu penjualan.
5. Antrean kembali 0, "Tarikan terakhir" berubah → buka Table Editor:
   baris di `transactions` dan `transaction_items` sudah ada.
6. Pasang di HP kedua, masuk akun yang sama → data yang sama muncul.

## 7. Kalau macet

| Gejala | Penyebab paling sering |
|---|---|
| Selalu "Mode lokal" | `.env` diisi setelah build / build tanpa secret |
| Masuk gagal "Invalid login credentials" | Akun belum terdaftar atau email belum dikonfirmasi |
| Masuk sukses tapi semua kosong | Belum jadi anggota outlet (tidak ada baris di `members`) |
| "relation does not exist" | Migrasi belum lengkap |
| "new row violates row-level security" | Peran tidak berhak untuk aksi itu (mis. kasir mengubah harga) |
| Antrean tidak turun | Offline / kunci salah / RLS menolak — pesan ada di Status cloud |
