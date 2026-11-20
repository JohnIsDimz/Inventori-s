# Rencana Sprint 12 — Multi-outlet

Status: **rencana** (belum dikerjakan). Disusun 19 November 2026 setelah Sprint 11
(buku pelanggan) selesai.

---

## 1. Masalahnya dulu, bukan solusinya

Hari ini aplikasi menganggap **satu HP = satu toko di satu lokasi**. Semua daftar
(produk, transaksi, kasbon, utang, shift, pesanan, pelanggan) tersimpan sebagai satu
wadah datar di `PersistedState`. Membuka cabang kedua berarti:

- stok tercampur antar lokasi — barang yang "ada" di catatan belum tentu ada di rak cabang;
- laporan harian tidak bisa dipisah per lokasi;
- kas laci satu shift bisa tercampur dua kasir dari dua tempat.

Karena itu multi-outlet **bukan** sekadar menambah tombol "pilih cabang". Yang berubah
adalah arti setiap baris data.

---

## 2. Keputusan desain yang diusulkan

| Pertanyaan | Usulan | Alasan |
| --- | --- | --- |
| Stok per cabang atau digabung? | **Per cabang**, dengan angka "semua cabang" hanya untuk laporan | Kalau digabung, kasir cabang A bisa menjual barang yang sebenarnya ada di cabang B |
| Data mana yang ikut cabang? | transaksi, kasbon, utang, shift, pesanan, **stok** | Semua yang menyangkut uang & barang fisik |
| Data mana yang berlaku toko-wide? | profil toko, kategori, template pesan, pengaturan printer, **daftar pelanggan** | Pelanggan boleh belanja di cabang mana saja |
| Harga barang per cabang? | **Toko-wide** dulu (harga jual & modal sama) | Agar sederhana; harga beda per cabang bisa menyusul |
| Berapa cabang maksimum? | 3 untuk rilis pertama | Lebih dari itu butuh laporan konsolidasi yang jauh lebih rumit |

Bentuk data yang diusulkan:

```ts
export interface Outlet {
  id: string;
  name: string;        // "Cabang Pasar Baru"
  code: string;        // kode singkat untuk struk
  address?: string;
  createdAt: string;
  archivedAt?: string;
}

// di tiap baris yang menyangkut cabang
outletId: string;
```

Migrasi data lama: seluruh baris yang belum punya `outletId` dianggap milik
**cabang pertama** yang dibuat otomatis dari nama toko saat aplikasi dibuka. Ini
membuat pengguna lama tidak kehilangan apa pun dan tidak melihat layar baru sama sekali.

### Stok: satu angka per cabang

`Product.stock` dipertahankan sebagai **stok cabang yang sedang aktif** (dihitung saat
dibaca), sedangkan sumber kebenarannya:

```ts
product.stockByOutlet: Record<string /* outletId */, number>;
```

Semua pembacaan stok (kasir, katalog, peringatan stok menipis) memakai selector
`stockFor(product, outletId)`. Semua penulisan (jual, koreksi, opname nanti) memakai
`applyStockDelta(product, outletId, delta)`. Ini titik paling rawan: **satu tempat lupa
memakai selector = stok tercampur**. Karena itu seluruh akses stok harus lewat dua fungsi
itu, dan `test:outlets` memeriksa bahwa tidak ada kode lain yang menyentuh `stock` langsung.

---

## 3. Urutan pekerjaan (5 tahap, tiap tahap harus hijau)

| Tahap | Isi | Uji |
| --- | --- | --- |
| 12.1 | Modul murni `src/data/outlets.ts`: `normalizeOutlet`, `stockFor`, `applyStockDelta`, `assignOutlet` (migrasi baris lama), `summarizeByOutlet` | `test:outlets` ± 20 pemeriksaan |
| 12.2 | Store: `outlets`, `activeOutletId`, aksi `addOutlet` / `renameOutlet` / `archiveOutlet` / `switchOutlet`; semua mutasi menulis `outletId` | `test:outlets` + `typecheck` |
| 12.3 | Cadangan: `outlets` ikut tercadangkan; pulihkan menolak berkas yang `outletId`-nya tidak dikenal (dibuatkan cabang "Dipulihkan") | `test:backup` |
| 12.4 | Layar: pemilih cabang di Beranda + `app/cabang.tsx` (tambah/ubah/arsip), semua daftar & laporan memfilter cabang aktif, struk mencetak nama cabang | Playwright (tangkap 6 layar) |
| 12.5 | Sinkron (bila akun dinyalakan nanti): `sync_*` wajib membawa `outletId`; RLS memeriksa keanggotaan cabang, bukan hanya toko | `test:db` + `test:rbac` |

Perkiraan: **4–5 hari kerja** untuk 12.1–12.4, +2 hari untuk 12.5.

---

## 4. Risiko dan cara menutupnya

| Risiko | Dampak | Penutup |
| --- | --- | --- |
| Ada tempat yang masih membaca `product.stock` langsung | stok tercampur antar cabang | `test:outlets` memindai `src/` dan `app/` untuk pemakaian langsung |
| Laporan berubah tanpa disadari | angka omzet terlihat beda dari sebelumnya | uji pembanding: satu cabang harus menghasilkan angka **identik** dengan sebelum Sprint 12 |
| Pengguna lama bingung melihat layar cabang | rating turun | Pemilih cabang hanya muncul bila jumlah cabang > 1 |
| Cadangan lama tanpa `outletId` | data hilang saat pulih | uji khusus: berkas versi 1 dipulihkan ke cabang pertama |
| Shift kasir lintas cabang | uang laci tercampur | `openShift` menolak bila masih ada shift terbuka **di cabang mana pun** |

---

## 5. Yang tidak dikerjakan di Sprint 12

- Harga jual berbeda per cabang.
- Laporan konsolidasi seluruh cabang dalam satu grafik (cukup daftar angka per cabang).
- Pemindahan stok antar cabang (mutasi barang).
- Hak akses per cabang (siapa boleh buka cabang mana) — menyusul bersama akun.

---

## 6. Syarat mulai

Sprint 12 sebaiknya dimulai **setelah zip rilis Sprint 11 diunggah**, supaya ada titik
kembali yang bersih. Setiap akhir tahap: `typecheck` 0 error, 10 suite hijau, tangkapan
layar baru, dan zip ulang.
