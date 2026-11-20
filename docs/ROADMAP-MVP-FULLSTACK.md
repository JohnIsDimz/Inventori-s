# Inventori's — Peta Jalan Menuju MVP Full-Stack

Dokumen ini menjawab satu pertanyaan: **fitur unggulan apa lagi yang perlu ditambahkan supaya Inventori's layak disebut "aplikasi MVP full-stack"?**

Status pelaksanaan:
- Sprint 1 (0.1 backend, 0.2 auth, 0.3 sinkron dasar, 0.4 peran) — selesai, lihat `docs/FONDASI-FULLSTACK.md`.
- Sprint 2 (stok delta, realtime, offline, kategori & alokasi) — selesai, lihat `docs/SPRINT-2.md`.
- Sprint 3 (shift kasir 1.1, undang anggota, audit log di UI 0.6) — selesai, lihat `docs/SPRINT-3.md`.
- Fondasi skala (indeks, retensi, pemakaian per outlet, bug `updated_at`) — selesai, lihat `docs/CLOUD-SKALA.md`.
- Sprint 4 (diskon & pajak 1.2, laporan shift, audit anggota & stok) — selesai, lihat `docs/SPRINT-4.md`.
- Sprint 5 (harga grosir 1.3, diskon per barang, splash & penjelasan mode lokal) — selesai, lihat `docs/SPRINT-5.md`.
- Sprint 6 (ekspor/impor cadangan lokal + audit UI mendalam) — selesai, lihat `docs/SPRINT-6.md` & `docs/AUDIT-UI-6.md`.
- Sprint 7 (kendali akun & privasi UU PDP, matriks izin per peran, pengingat cadangan) — selesai, lihat `docs/SPRINT-7.md`.
- Sprint 8 (pesanan/kuotasi + sinkron `sync_order`) — selesai, lihat `docs/SPRINT-8.md`.
- Sprint 9 (status cloud & diagnostik, batas paket, panduan cek cloud) — selesai, lihat `docs/SPRINT-9.md` & `docs/CEK-CLOUD.md`.
- Sprint 10 (pengingat jatuh tempo via notifikasi lokal, DP/uang muka pesanan, fondasi sinkron antar-HP) — selesai, lihat `docs/SPRINT-10.md` & `docs/RENCANA-SINKRON-LAN.md`.
- Sprint 10.1 (bersih-bersih teks rilis: semua istilah teknis dihapus dari UI, layar diagnostik dibuang, audit teks otomatis) — selesai, lihat `docs/UI-BERSIH-RILIS.md`.
- Sprint 10.2 (audit rilis Play Store: teks web/peramban dihapus, fitur yang belum aktif disembunyikan, pesan galat & login berbahasa Indonesia, checklist Play Console) — selesai, lihat `docs/AUDIT-RILIS-STORE.md`.
- Berikutnya: pengingat jatuh tempo otomatis (notifikasi lokal), uang muka (DP) pesanan, sinkron dua arah antar-HP tanpa server (LAN).

---

## 1. Posisi sekarang (jujur)

Inventori's hari ini adalah **aplikasi lokal satu perangkat** yang sudah kaya fitur operasional. Yang belum ada bukan "fitur jualan", tapi **lapisan server**-nya.

| Kapabilitas | Status sekarang |
| --- | --- |
| Katalog barang + barcode + harga modal/jual + margin | Ada |
| Kasir (POS) + keranjang + kembalian + struk ESC/POS Bluetooth | Ada |
| Pencatatan pemasukan/pengeluaran + foto bukti | Ada |
| Kasbon pelanggan & utang supplier | Ada (belum ada pengingat otomatis terkirim) |
| Laporan omzet, laba, kategori paling laku, grafik 7 hari/bulanan | Ada (dihitung di perangkat) |
| Input suara Bahasa Indonesia | Ada |
| Ekspor CSV/PDF | Ada |
| **Akun & login** | Belum — data milik siapa pun yang memegang HP |
| **Sinkron cloud / multi-perangkat** | Belum — 1 HP rusak = data hilang |
| **Peran pengguna (pemilik vs kasir)** | Belum — siapa pun bisa ubah harga & hapus transaksi |
| **Shift kasir + rekonsiliasi uang laci** | Belum |
| **Backup otomatis** | Belum (manual ekspor) |

Kalau didefinisikan "full-stack" = ada backend, akun, sinkronisasi, dan pembagian peran, maka jarak yang harus ditempuh ada di **Tier 0** di bawah. Fitur jualan (Tier 1) baru terasa efeknya setelah itu.

---

## 2. Tier 0 — Tulang punggung full-stack (wajib, tanpa ini bukan full-stack)

| # | Fitur | Kenapa krusial | Effort |
| --- | --- | --- | --- |
| 0.1 | **Backend + database** (Supabase: Postgres + RLS + Storage) | Sumber kebenaran tunggal; laporan bisa dihitung server, bukan di HP | 6–8 hari |
| 0.2 | **Auth**: login email/OTP + PIN perangkat | Menentukan pemilik data; HP hilang bisa dicabut aksesnya | 3–4 hari |
| 0.3 | **Sinkron offline-first**: outbox antrean + pull delta | Kasir harus tetap jalan tanpa internet, lalu naik saat online | 8–10 hari |
| 0.4 | **Peran & izin**: Owner / Admin / Kasir | Kasir tidak boleh lihat laba, ubah harga, atau hapus transaksi | 4–5 hari |
| 0.5 | **Multi-outlet + stok per outlet** — ✅ **selesai (Sprint 12)**: maks 3 cabang, stok/kasbon/shift/laporan terpisah, buku pelanggan bersama | Satu pintu bisnis sering buka cabang; stok tidak boleh campur | selesai |
| 0.6 | **Audit log** (siapa, kapan, apa, nilai sebelum→sesudah) | Penangkal fraud internal; syarat utama pemilik percaya aplikasi | 3 hari |
| 0.7 | **Backup otomatis terjadwal** (cloud + ekspor Drive) | "Data hilang" adalah alasan #1 UMKM tak mau pindah ke aplikasi | 2–3 hari |

**Total Tier 0: ± 32–40 hari kerja** (sekitar 6–8 minggu solo, 3–4 minggu kalau dikerjakan intensif dengan bantuan AI).

### Catatan teknis penting

1. **Stok harus dihitung server.** Kalau dua kasir menjual barang terakhir bersamaan, stok tidak boleh jadi −1. Pakai satu RPC transaksional, misalnya `apply_sale(payload)` yang mengunci baris stok (`SELECT ... FOR UPDATE`) lalu menolak bila stok kurang.
2. **Idempotency key** di setiap transaksi (`client_tx_id` UUID dari perangkat). Kalau HP mengirim ulang karena timeout, server tidak menggandakan nota.
3. **Konflik = last-write-wins per field**, kecuali stok yang selalu **delta** (`stock_moves` append-only), bukan angka absolut yang saling menimpa.
4. **Jangan pakai AsyncStorage untuk data besar.** Migrasi penyimpanan lokal ke `expo-sqlite` (dan `drizzle-orm` bila mau rapi) supaya 20 ribu transaksi tidak membuat app lambat. Zustand tetap dipakai sebagai cache di memori.
5. Pilihan backend lain: Firebase (cepat, tapi agregasi laporan & SQL lebih repot), PocketBase (self-host murah, tapi Anda yang jaga server), backend Node/Fastify milik sendiri (paling fleksibel, paling lama). **Rekomendasi: Supabase** karena SQL, RLS, realtime, dan storage foto dalam satu paket.

---

## 3. Tier 1 — Fitur unggulan yang membuat orang mau pindah (dampak jualan tertinggi)

Diurutkan berdasarkan rasio dampak/effort.

| # | Fitur | Nilai bagi pemilik warung/toko | Effort |
| --- | --- | --- | --- |
| 1.1 | **Shift kasir**: buka shift dengan modal awal, tutup shift dengan hitung uang fisik, selisih otomatis | Deteksi uang laci kurang/lebih, tahu siapa yang bertanggung jawab | 4 hari |
| 1.2 | **Diskon & pajak per transaksi** (diskon nominal/%, pajak %, diskon per item) | Hampir semua toko butuh; sekarang belum ada | 2–3 hari |
| 1.3 | **Harga bertingkat**: harga umum / grosir / member | Warung kecil pun jual beda harga ke reseller | 3 hari |
| 1.4 | **Pembelian dari supplier + HPP rata-rata bergerak** — ✅ **selesai (Sprint 14)**: kulakan per cabang, HPP rata-rata tertimbang, bayar sebagian → utang supplier, nota siap dibagikan | Laba jadi akurat saat harga kulakan naik-turun | selesai |
| 1.4b | **Buku supplier + retur barang** — ✅ **selesai (Sprint 15)**: daftar agen + nomor HP, utang per supplier, retur memotong utang lalu jadi saldo kulakan | Barang rusak bisa dikembalikan tanpa mengacaukan kas | selesai |
| 1.5 | **Stok opname** — ✅ **selesai (Sprint 13)**: hitung fisik per cabang, selisih dinilai harga modal, riwayat + laporan siap dibagikan | Barang hilang/rusak akhirnya tercatat, bukan menggelembungkan laba | selesai |
| 1.6 | **Pelanggan + loyalitas** — ✅ **selesai (Sprint 11)**: buku pelanggan, riwayat belanja, poin, piutang per pelanggan | Kasbon tidak lagi tertukar; ketahuan siapa yang benar-benar langganan | selesai |
| 1.6b | **Laporan selisih stok per periode + grafik harga beli** — ✅ **selesai (Sprint 16)**: kartu selisih di menu Laporan (nilai kurang/lebih, barang paling merugikan, rincian per hitungan) dan grafik harga kulakan per barang | Pemilik tahu berapa nilai barang hilang dan kapan agen menaikkan harga | selesai |
| 1.7 | **Pengingat/tagih kasbon via WhatsApp** — ✅ **selesai (Sprint 17)**: layar Tagih kasbon (kasbon telat/hari ini/H+3, nomor HP dari buku pelanggan, pratinjau pesan, tombol buka WhatsApp, tanda sudah ditagih) | Piutang macet adalah masalah nomor satu toko kelontong | selesai (wa.me); Cloud API belum |
| 1.8 | **QRIS dinamis** (Midtrans/Xendit): buat QR sesuai nominal, status lunas otomatis | Menghapus salah input nominal & uang kembalian | 6–8 hari |
| 1.9 | **Notifikasi stok menipis & harga beli naik** — ✅ **selesai (Sprint 17)**: peringatan lokal pagi hari + daftar di layar Pengingat | Pemilik tahu tanpa harus buka aplikasi | selesai |
| 1.10 | **Struk digital** (kirim struk ke WhatsApp pelanggan, bukan hanya kertas) | Hemat kertas, pelanggan punya bukti | 2 hari |
| 1.11 | **Impor/ekspor Excel** + migrasi dari aplikasi lain | Hambatan pindah aplikasi jadi rendah | 3 hari |

> **Audit menyeluruh (20 Nov 2026):** 11 temuan diperbaiki — lihat `docs/AUDIT-SPRINT-17.md`. Yang paling penting: pesanan dibayar tunai tidak lagi tercatat sebagai kasbon, retur tidak lagi dihitung sebagai uang keluar, dan tutup shift tidak lagi mencampur kas antar-cabang.

**Total Tier 1: ± 40–45 hari kerja.** Jangan dikerjakan semua sebelum ada 5 pemakai nyata.

### Lima yang saya sarankan lebih dulu (paket "terasa premium")
1. Shift kasir + rekonsiliasi laci (1.1)
2. Diskon & pajak (1.2)
3. ~~Pembelian supplier + HPP rata-rata (1.4)~~ ✅ selesai Sprint 14
4. ~~Pelanggan & loyalitas (1.6)~~ ✅ selesai Sprint 11 + tagih kasbon WA (1.7) & notifikasi stok/harga (1.9) selesai Sprint 17
5. QRIS dinamis (1.8)

Alasan: empat di antaranya **langsung menyentuh uang** (kebocoran, laba salah, piutang macet), dan satu (QRIS) adalah fitur yang paling sering ditanyakan calon pengguna saat demo.

---

## 4. Tier 2 — Setelah ada pengguna (monetisasi & skala)

| # | Fitur | Catatan |
| --- | --- | --- |
| 2.1 | Dashboard web untuk pemilik | Laporan lintas cabang, lebih enak di laptop |
| 2.2 | Langganan berbayar (Midtrans/Xendit recurring) + masa uji coba | Model bisnis; jangan sebelum retensi terbukti |
| 2.3 | Rilis Play Store via EAS Build + OTA update | Sekarang masih jalur dev build lokal |
| 2.4 | Crash reporting & analytics produk (Sentry + PostHog) | Tanpa ini Anda buta saat app dipakai di lapangan |
| 2.5 | Kunci aplikasi: PIN + biometrik + enkripsi lokal (SQLCipher) | Perangkat dipakai bergantian oleh karyawan |
| 2.6 | Mode kiosk / layar pelanggan kedua | Untuk toko yang lebih besar |
| 2.7 | Prediksi stok & saran restock dari pola penjualan | Fitur "wow" untuk versi berbayar |
| 2.8 | Cetak label barcode & harga | Butuh printer label, bukan thermal 58 mm |

---

## 5. Arsitektur usulan

```
┌────────────────────────── HP (Expo) ──────────────────────────┐
│  UI (expo-router)  ──  Zustand (cache memori)                 │
│           │                                                   │
│           ▼                                                   │
│  expo-sqlite  ◄── outbox (antrean perubahan)                  │
│      │                                                        │
│      ▼                                                        │
│  Sync engine  ── push outbox ──► Supabase (Postgres + RLS)     │
│               ◄── pull delta ──  Edge Function: apply_sale,    │
│                                  close_shift, avg_cost         │
│  Storage: foto bukti ──────────► Supabase Storage              │
└───────────────────────────────────────────────────────────────┘
        │
        ├─► Midtrans/Xendit (QRIS dinamis, webhook → Edge Function)
        └─► WhatsApp Cloud API (pengingat kasbon, struk digital)
```

Prinsip yang dipegang:
- **Baca dari lokal, tulis ke lokal, sinkron di belakang.** UI tidak pernah menunggu jaringan.
- **Server yang menghitung uang & stok**, perangkat hanya mengusulkan. Ini yang mencegah dua kasir menjual barang yang sama.
- **Semua tabel bisnis punya `outlet_id`, `created_by`, `updated_at`, `deleted_at`** (soft delete agar sinkron tidak menghidupkan data yang dihapus).

### Skema ringkas (14 tabel inti)

| Tabel | Kolom kunci |
| --- | --- |
| `outlets` | id, name, code, timezone |
| `profiles` | id (=auth.uid), full_name, phone |
| `members` | outlet_id, user_id, role (owner/admin/kasir), active |
| `products` | id, outlet_id, name, unit, barcode, cost_price, sell_price, min_stock, deleted_at |
| `price_tiers` | product_id, tier (umum/grosir/member), price, min_qty |
| `stock_moves` | id, product_id, outlet_id, delta, reason (sale/purchase/opname/adjust), ref_id, created_by, created_at |
| `transactions` | id, outlet_id, client_tx_id (unik), shift_id, subtotal, discount, tax, total, method, created_by |
| `transaction_items` | tx_id, product_id, name, qty, price, cost_at_sale |
| `payments` | tx_id, method, amount, provider_ref, status |
| `shifts` | id, outlet_id, opened_by, opened_at, opening_cash, closed_at, closing_cash, expected_cash, difference |
| `customers` | id, outlet_id, name, phone, points, note |
| `receivables` | id, outlet_id, customer_id, amount, due_date, status |
| `receivable_payments` | receivable_id, amount, method, paid_at, received_by |
| `audit_logs` | id, outlet_id, actor, action, table, row_id, before, after, at |

Tambahan: `suppliers`, `purchases`, `purchase_items`, `opnames`, `devices` (untuk push token & cabut akses).

---

## 6. Definisi "MVP full-stack selesai" (kriteria penerimaan)

Anggap v1.0 full-stack selesai bila semua ini lulus:

1. Pemilik daftar akun, membuat 1 outlet, mengundang 1 kasir dengan peran terbatas.
2. Kasir login di HP kedua, **lihat katalog & transaksi, tidak bisa** melihat laba, harga modal, atau menghapus transaksi.
3. HP kasir mode pesawat: tetap bisa jual 20 transaksi; saat online kembali, semua naik tanpa duplikat (uji: cabut jaringan di tengah proses).
4. Dua kasir menjual sisa stok 1 barang bersamaan → satu berhasil, satu ditolak dengan pesan jelas.
5. Tutup shift: sistem menampilkan uang seharusnya vs uang fisik, selisih tercatat, muncul di laporan pemilik.
6. Pemilik membuka dashboard laporan di HP lain dan angkanya sama dengan kasir.
7. Audit log menampilkan "Kasir A mengubah harga Indomie 3.500 → 3.000" beserta waktu.
8. Backup harian berjalan otomatis; restore di perangkat baru memulihkan seluruh data.
9. Waktu muat layar utama < 1 detik dengan 10.000 transaksi (SQLite + indeks).
10. Semua endpoint dilindungi RLS: user outlet A tidak bisa membaca data outlet B (uji dengan token outlet B).

---

## 7. Rencana sprint (usulan 6 sprint, masing-masing 1 minggu)

| Sprint | Fokus | Deliverable yang bisa didemokan |
| --- | --- | --- |
| S1 | Fondasi: Supabase project, skema, RLS, auth email/OTP, migrasi `AsyncStorage → expo-sqlite` | Login, data lama tetap ada |
| S2 | Sinkron: outbox, pull delta, idempotency, konflik, indikator status sinkron | Matikan Wi-Fi, transaksi tetap jalan, naik saat online |
| S3 | Peran + multi-outlet + audit log | Undang kasir, batasi menu, lihat log |
| S4 | Shift kasir, diskon & pajak, harga bertingkat | Tutup shift dengan selisih, struk berdiskon |
| S5 | Pembelian supplier, HPP rata-rata, stok opname | Laba akurat setelah harga kulakan naik |
| S6 | Pelanggan & loyalitas, pengingat WA, QRIS dinamis, backup otomatis | Demo end-to-end "warung modern" |

Setelah itu: Play Store + OTA (EAS), Sentry, baru bicara langganan.

---

## 8. Perkiraan biaya infrastruktur

| Layanan | Perkiraan | Catatan |
| --- | --- | --- |
| Supabase | Rp 0 (Free: 500 MB DB, 50 rb MAU, proyek di-pause bila 7 hari idle) → **± Rp 420 rb/bulan** (Pro $25, 8 GB DB) | Free cukup untuk 20–50 toko uji coba. Sumber: halaman harga Supabase, Nov 2026 |
| EAS Build | Rp 0 (antrean gratis) → $99/bulan bila butuh build cepat & tak terbatas | Untuk rilis Play Store |
| Midtrans QRIS | MDR **0%** untuk transaksi ≤ Rp 100.000 (berlaku sejak 1 Okt 2026); 0,7% di atas Rp 100.000 untuk UKE/UME/UBE; UMI 0,3% hanya di atas Rp 500.000 | Verifikasi ulang tarif terbaru ke Midtrans sebelum rilis |
| WhatsApp Cloud API | Gratis untuk percakapan layanan dalam kuota bulanan, lalu per-percakapan | Alternatif gratis: tautan `wa.me` (tanpa API) |
| Sentry / PostHog | Rp 0 untuk skala awal | Pasang sebelum rilis publik |

Kesimpulan biaya: **di bawah Rp 1 juta/bulan** sampai ratusan toko — bukan penghalang.

---

## 9. Yang sengaja JANGAN dikerjakan sekarang

- Akuntansi double-entry penuh, neraca, jurnal umum → bikin rumit, bukan kebutuhan warung.
- Integrasi marketplace (Tokopedia/Shopee) → kompleks, butuh izin API.
- Aplikasi pelanggan (B2C) → beda produk.
- AI prediksi penjualan sebelum ada 3 bulan data bersih.
- Fitur cetak label barcode (butuh hardware lain).

---

## 10. Ringkasan jawaban

Kalau ditanya "fitur unggulan apa lagi?", jawabannya bertingkat:

1. **Wajib dulu (Tier 0):** backend + login + sinkron offline + peran + multi-outlet + audit log + backup. Tanpa ini label "full-stack" belum sah; aplikasi masih berisiko kehilangan data.
2. **Paling menjual (Tier 1):** shift kasir & rekonsiliasi laci, diskon/pajak, pembelian supplier + HPP rata-rata, pelanggan & pengingat kasbon WA, QRIS dinamis.
3. **Nanti (Tier 2):** dashboard web, langganan, rilis Play Store, keamanan perangkat, prediksi stok.

Estimasi realistis ke v1.0 full-stack: **± 12–16 minggu solo** untuk Tier 0 + paket unggulan Tier 1, atau **6–8 minggu** bila hanya Tier 0 + 2 fitur Tier 1.
