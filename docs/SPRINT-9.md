# Sprint 9 — Status Cloud & Batas Paket

Status: **selesai** (19 November 2026)

Pemicu sprint ini adalah pertanyaan yang wajar dari pemilik toko: *"kalau
aplikasinya sudah dibuild dan sudah disambungkan ke Supabase, apakah datanya
otomatis terbaca?"* Jawaban jujurnya: **tidak otomatis** — ada enam langkah yang
harus beres. Sebelum sprint ini, aplikasi hanya bisa bilang "Mode lokal" atau
"Tersinkron" tanpa menjelaskan langkah mana yang belum beres.

---

## 1. Layar "Status cloud" (`app/status-cloud.tsx`)

> **Dihapus di Sprint 10.1.** Layar ini penuh istilah developer (`.env`, migrasi,
> "Periksa database") dan tidak boleh ada di aplikasi yang dipublikasikan. Lihat
> `docs/UI-BERSIH-RILIS.md`.

Jalur: **Pengaturan → Aplikasi tanpa server / Status cloud**.

1. **Kartu headline** — satu kalimat sesuai keadaan, mis.
   *"Aplikasi berjalan tanpa server. Semua data hanya ada di perangkat ini."*
2. **Enam langkah** dengan ikon keadaan (selesai / menunggu / perlu aksi / info):
   `env` → `sesi` → `outlet` → `migrasi` → `antrean` → `sinkron`.
   Langkah yang gagal selalu menyebutkan tindakan berikutnya, bukan kode error.
3. **Tombol** *Sinkron sekarang* (memanggil `syncNow()` dan melaporkan
   `X terkirim, Y diterima`) dan *Periksa database* (probe tabel
   `outlets, members, products, transactions, orders`).
4. **Paket & pemakaian** — paket aktif, harga, dan pemakaian terhadap batas.
5. **Cara mengaktifkan cloud** — 4 langkah ringkas untuk pengguna mode lokal.
6. **Ringkasan sesi** — email, toko, peran, antrean, sinkron terakhir.

### Logika yang diuji (`src/services/cloud/readiness.ts`)

```ts
cloudReadiness({ hasUrl, hasKey, session, outlet, migrationOk, pending, online, lastSyncAt })
→ { ready, headline, blockedBy, steps[] }
```

Sepuluh pemeriksaan (`npm run test:cloud`) menjaga pesan-pesannya, termasuk dua
yang paling sering menyesatkan:

- `.env` diisi **setelah** build → tetap mode lokal, dan UI harus bilang
  "kunci dibaca saat build".
- Sudah masuk tapi belum jadi anggota outlet → bukan error jaringan, tapi
  "akun ini belum terhubung ke toko".

---

## 2. Batas paket (`src/data/plan.ts`)

| Paket | Harga | Transaksi/bulan | Anggota | Outlet |
|---|---|---|---|---|
| Lokal (tanpa server) | Gratis | tanpa batas | tanpa batas | tanpa batas |
| Cloud uji coba | Gratis | 300 | 2 | 1 |
| Cloud toko | Rp 49.000/bln | 2.000 | 5 | 1 |

Aturan yang disengaja:

- **Mode lokal tidak dibatasi sama sekali** — sesuai keputusan bahwa mode lokal
  adalah pilihan kelas satu, bukan versi coba-coba.
- Batas adalah **peringatan, bukan kunci**: penjualan tidak pernah ditolak di
  tengah transaksi. Keadaan `mendekati` (≥80%) berwarna amber, `lewat` merah,
  dan kartu menyarankan menghubungi admin untuk menaikkan paket.
- `limit` berarti **angka maksimum yang masih boleh**; "lewat" baru ketika
  pemakaian lebih besar dari batas (mis. outlet ke-2 pada paket 1 outlet).

---

## 3. Perbaikan kontras tombol nonaktif (temuan sampingan)

Saat memotret layar baru terlihat tombol *Sinkron sekarang* yang nonaktif
memakai label gelap (`onPrimary`) di atas latar abu — nyaris tak terbaca.
Diperbaiki di `src/components/Primitives.tsx`: label & ikon tombol nonaktif
memakai `textDim`, dan opasitas ganda untuk tombol utama dihapus. Berlaku untuk
seluruh aplikasi (termasuk "Pulihkan dari teks" di layar Cadangan).

---

## 4. Dokumentasi baru: `docs/CEK-CLOUD.md`

Menjawab pertanyaan di atas secara lengkap: kunci dibaca saat **build**, RLS butuh
**sesi**, rute kode `bootstrap → refreshMembership → startSyncLoop(30s)`, apa saja
yang otomatis setelah itu (antrean, tarik bertahap 300 baris, realtime, data lama
ikut terkirim), urutan uji 10 menit, dan tabel gejala → penyebab.

---

## 5. Status uji

| Pemeriksaan | Sebelum | Sesudah |
|---|---|---|
| `npm run test:cloud` | – | **11** (baru) |
| `npm run test:db` | 143 | 143 |
| `npm run test:backup` | 21 | 21 |
| `npm run test:orders` | 7 | 7 |
| `npm run test:rbac` | 9 | 9 |
| `npm run test:mappers` | 12 | 12 |
| `npm run typecheck` | 0 error | 0 error |
| Ekspor web & Android | OK | OK |

Diuji di peramban (mode lokal): seluruh enam langkah tampil dengan label yang
benar, tombol aksi nonaktif dengan jelas, 0 error konsol.
Tangkapan layar: `docs/screenshots/50`–`52`.

---

## 6. Berkas yang disentuh

```
src/services/cloud/readiness.ts     logika enam langkah + relativeTime (baru)
src/data/plan.ts                    paket, batas, peringatan pemakaian (baru)
app/status-cloud.tsx                layar diagnostik (baru)
app/pengaturan.tsx                  baris akun → Status cloud
app/_layout.tsx                     rute status-cloud
src/components/Primitives.tsx       kontras tombol nonaktif
supabase/tests/cloud.test.mts       uji kesiapan & paket (baru)
docs/CEK-CLOUD.md                   panduan lengkap "apakah otomatis terbaca?"
```

## 7. Usulan Sprint 10

1. **Pengingat jatuh tempo otomatis** — notifikasi lokal H-1 untuk kasbon & pesanan.
2. **Uang muka (DP) pesanan** — sisa tagihan otomatis jadi kasbon saat diambil.
3. **Sinkron antar-HP lewat Wi-Fi lokal** — untuk toko tanpa internet.
4. **Halaman status untuk admin SaaS** — paket, pemakaian, dan tagihan per toko.
