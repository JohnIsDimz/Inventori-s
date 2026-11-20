# Sprint 6 — Cadangan Lokal + Audit UI Mendalam

Status: **selesai** (19 November 2026)
Cakupan: (a) ekspor/impor cadangan lokal sebagai pengganti backup cloud untuk
mode tanpa server; (b) audit UI mendalam — kontras, ukuran huruf, spasi, hierarki,
konsistensi, dan teks yang membingungkan — berikut perbaikannya.

---

## 1. Cadangan lokal (tanpa server)

Masalah: pengguna mode lokal tidak punya backup apa pun. HP hilang, aplikasi
dipasang ulang, atau penyimpanan dibersihkan → seluruh data toko hilang. Cloud
backup tidak bisa dipakai karena memang tidak ada server.

Solusi: satu berkas JSON berisi **semua** data toko, dibuat dan dibaca sepenuhnya
di HP (tidak ada satu byte pun yang dikirim ke mana pun).

### Berkas

| Berkas | Isi |
|---|---|
| `src/services/backup.ts` | fungsi murni: `buildBackup`, `parseBackup`, `applyBackup`, `countPayload`, `backupFileName` |
| `app/cadangan.tsx` | layar `Cadangan data`: ringkasan isi, ekspor, pulihkan, pesan galat |
| `supabase/tests/backup.test.mts` | 13 pemeriksaan (`npm run test:backup`) |

### Format berkas

```json
{
  "app": "inventoris",
  "version": 1,
  "exportedAt": "2026-11-19T17:19:47.240Z",
  "storeName": "Warung Berkah",
  "counts": { "produk": 5, "transaksi": 6, "kasbon": 2, "utang": 0,
              "kategori": 5, "shift": 1, "alokasi": 2 },
  "data": { "profile": {…}, "settings": {…}, "categories": […], "products": […],
            "transactions": […], "receivables": […], "payables": […],
            "allocations": […], "shifts": […] }
}
```

Nama berkas: `cadangan-inventoris-<slug-toko>-<YYYYMMDDHHmm>.json`, misalnya
`cadangan-inventoris-warung-berkah-202611191719.json` — mudah dikenali di folder
Download atau Google Drive.

### Validasi saat memulihkan

`parseBackup` menolak dengan alasan berbahasa Indonesia (bukan pesan developer):

| Kondisi | Pesan |
|---|---|
| teks kosong | "Berkas cadangan kosong." |
| di atas 40 MB | "Berkas terlalu besar (di atas 40 MB)." |
| bukan JSON | "Berkas ini bukan cadangan Inventori's (bukan JSON yang sah)." |
| `app` bukan `inventoris` | "Berkas ini bukan cadangan Inventori's." |
| `version` lebih baru | "Cadangan dibuat versi aplikasi yang lebih baru. Perbarui aplikasi dulu." |
| semua daftar kosong | "Cadangan ini tidak berisi satu pun data." |

### Dua cara memulihkan

- **Gabungkan** (bawaan, "aman") — data digabung berdasarkan `id`; data yang sudah
  ada di perangkat **tidak pernah** dihapus. Untuk menggabung dua HP atau
  menambal data yang hilang sebagian.
- **Ganti semua** ("pindah HP") — isi perangkat diganti sepenuhnya dengan isi
  cadangan. Kategori bawaan dipertahankan bila cadangan tidak punya kategori.

Di **HP baru** (nama toko masih kosong), mode gabung ikut memulihkan identitas
toko dan pengaturan — kalau tidak, pengguna harus mengetik ulang nama toko setelah
memulihkan cadangan. Kalau toko sudah diisi, identitas di perangkat yang menang.

### Konfirmasi & jalur masuk

- Konfirmasi sebelum menimpa data memakai `Alert` bawaan di Android/iOS, dan
  `window.confirm` di web (`Alert.alert` di web tidak menampilkan apa pun, jadi
  tanpa ini tombol "Pulihkan" terasa tidak bereaksi).
- Jalur masuk: **Pengaturan → Cadangan data**, dan petak **Cadangan** di bagian
  *Aksi cepat* pada Beranda.

### Hasil uji

- `npm run test:backup` → **13/13** lulus.
- Uji ujung-ke-ujung di peramban (data contoh sementara, tidak ikut dirilis):
  ekspor 5 barang / 6 transaksi / 2 kasbon → kosongkan penyimpanan → pulihkan →
  5 barang, 6 transaksi, nama toko pulih; berkas asing ditolak dengan pesan yang
  benar; konsol bersih (0 error).

---

## 2. Audit UI mendalam

Rincian temuan dan perbaikannya ada di **`docs/AUDIT-UI-6.md`**. Ringkasnya:

| Kelas masalah | Temuan | Perbaikan |
|---|---|---|
| Huruf kurang jelas | jarak antarkata font Plus Jakarta Sans hanya 0,17 em (Inter 0,28 em) → kata tampak menempel, mis. "Bagikanberkas cadangan(.json)" | metrik `space`/`nbsp` kelima berkas font disetel ke 0,265 em |
| Kontras | `textFaint` hanya 4,00:1 di atas `cardHigh` (gagal WCAG AA) | `#7e8799` → `#8b95a8`, kini ≥4,9:1 di semua permukaan |
| Ukuran huruf | label 12 sp, caption 11 sp, micro 10 sp terlalu kecil di layar HP | skala huruf dinaikkan (h2 16,5 · h3 14,5 · body 14 · label 12,5 · caption 11,5 · micro 10,5) |
| Layout berantakan | rincian harga di daftar stok terpotong ("margi…", "10 p…") | harga & grosir dipindah ke baris penuh di bawah nama barang |
| Layout berantakan | FAB menutup petak terakhir Beranda | `paddingBottom` 104 → 150 |
| Teks membingungkan | "Laba hari ini"/"Margin 100%" pada penjualan tanpa HPP | diganti "Laba tunai" dengan keterangan "Masuk − keluar" |
| Teks membingungkan | "Mode lokal" muncul dua kali (judul + pil status) | judul jadi "Aplikasi tanpa server", pil status hanya tampil saat mode cloud |
| Konsistensi | "Rp3.500" vs "Rp 3.500" | semua `formatRupiah` memakai spasi |
| Konsistensi | label mingguan laporan tumpang tindih ("1–7", "7–13") | kursor minggu dimajukan satu hari |
| Informasi hilang | petak kasir tidak menandai stok menipis / harga grosir | badge amber "stok N unit • menipis" + baris "grosir Rp X · N+" |
| Layout berantakan | petak kasir bertinggi tetap → isi baru saling menimpa | `minHeight` + `alignItems: 'stretch'` |
| Teks membingungkan | "catatan" dipakai untuk transaksi & pengeluaran sekaligus | "nota" / "pengeluaran" / "transaksi" |

---

## 3. Status teknis

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run test:db` | 103/103 |
| `npm run test:mappers` | 12/12 |
| `npm run test:backup` | 13/13 |
| `npx expo export --platform web` | OK |
| Uji peramban (9 layar) | 0 error konsol |

Tangkapan layar baru: `docs/screenshots/32`–`39`.
Ekspor Android (Hermes) juga OK setelah semua perubahan UI.

## 4. Yang belum dikerjakan (usulan Sprint 7)

1. **Tingkat member** (kasir / admin / pemilik) beserta matriks izin yang tampil di UI.
2. **Batas paket + hapus akun** (kepatuhan UU PDP): ekspor data lalu tutup akun.
3. **Kuotasi / nota order** untuk pesanan yang belum dibayar.
4. **Jadwal cadangan otomatis**: pengingat mingguan "sudah 7 hari tidak mencadangkan".
