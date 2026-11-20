# Cloud untuk Banyak Toko — Rencana Skala & Biaya

Dokumen ini menjawab satu pertanyaan: **kalau aplikasi ini dipakai ratusan toko,
cloud-nya diatur bagaimana, dan berapa biayanya?**

Ditulis 19 November 2026. Harga mengacu ke daftar harga Supabase yang berlaku saat itu
(Pro $25/bulan per organisasi + pemakaian; perincian di §3).

---

## 1. Keputusan arsitektur (yang sudah dipakai sekarang)

**Satu database, banyak toko, dipisah oleh RLS.** Bukan satu database per toko.

```
                    ┌─────────────────────────────────────┐
   HP kasir ──┐     │  Supabase (region Singapore)        │
   HP owner ──┼────►│  Postgres + RLS per outlet_id       │
   Tablet   ──┘     │  Auth (email + kode undangan)       │
                    │  Realtime (channel per outlet)      │
                    │  Backups harian                     │
                    └─────────────────────────────────────┘
```

Kenapa begitu:

- **Isolasi sudah ada**: setiap tabel punya `outlet_id`, setiap policy memeriksa
  `members` + `active`. Toko A tidak bisa melihat satu baris pun milik toko B —
  ini diuji di `npm run test:db` (bagian RLS, outsider ditolak).
- **Satu database = satu tagihan, satu backup, satu migrasi.** Database-per-toko
  berarti 100 tagihan, 100 backup, 100 kali menjalankan migrasi.
- **Aplikasi ini offline-first**: HP tetap jalan tanpa server. Cloud hanya lapisan
  sinkron, jadi server boleh lambat/putus tanpa menghentikan jualan.

Konsekuensi yang harus diterima: **satu toko "berisik" bisa mengganggu yang lain**
(gangguan bukan isolasi). Mitigasinya di §5.

---

## 2. Batas nyata: kapan sesuatu mulai mentok

Perkiraan pemakaian satu toko aktif (warung, 80–120 transaksi/hari):

| Data | Ukuran | Per bulan |
| --- | --- | --- |
| Transaksi + item | ~700 byte/transaksi | ~2,1 MB |
| Gerak stok (`stock_moves`) | ~220 byte/gerakan | ~0,6 MB (dipangkas 180 hari) |
| Audit log | ~400 byte/catatan | ~0,1 MB (dipangkas 365 hari) |
| Barang & pelanggan | ~900 byte/barang | kecil |
| **Total** | | **≈ 3–5 MB/toko/bulan** |

Artinya:

| Sumber daya | Kuota Pro | Cukup untuk | Yang mentok lebih dulu |
| --- | --- | --- | --- |
| Disk database | 8 GB | **± 1.600 toko-tahun** | hampir tidak pernah |
| Realtime bersamaan | 500 koneksi | **± 150–200 toko** online serentak | **ya, ini yang pertama** |
| Auth MAU | 100.000/bulan | ± 25.000 toko aktif | tidak |
| Egress | 250 GB/bulan | ribuan toko (payload sinkron kecil) | tidak |
| Compute Micro (1 GB RAM) | — | puluhan–ratusan toko | **ya, saat ramai** |

Kesimpulan praktis: **disk bukan masalah; koneksi Realtime dan RAM compute yang
menentukan kapan harus naik kelas.** Itu dua hal yang dipantau di §6.

---

## 3. Biaya berjenjang (dan harga jual yang menutupinya)

| Tahap | Jumlah toko | Yang dipakai | Perkiraan biaya/bulan |
| --- | --- | --- | --- |
| Uji coba | 1–20 | Free | $0 — **tapi project dipause setelah 7 hari nganggur**, jangan untuk produksi |
| Awal | 1–100 | Pro + Micro (kredit $10 menutup Micro) | **$25–30** (≈ Rp 400–480 rb) |
| Tumbuh | 100–400 | Pro + Small/Medium compute | **$45–90** |
| Serius | 400–1.500 | Pro/Team + Medium/Large + read replica + PITR | **$150–450** |
| Besar | 1.500+ | Team + dua project (pecah per wilayah) atau Enterprise | $600+ |

Ongkos tambahan bila melewati kuota (harga resmi 2026):

- Disk $0,125/GB/bulan, Egress $0,09/GB, Storage $0,0213/GB/bulan
- Realtime: $10 per 1.000 koneksi puncak, $2,50 per juta pesan
- MAU $0,00325/orang setelah 100.000

**Harga jual yang disarankan:** paket cloud **Rp 49.000/toko/bulan** (atau
Rp 490.000/tahun) dengan gratis 1 bulan.

| Jumlah toko | Biaya infra | Pendapatan (Rp 49 rb) | Margin |
| --- | --- | --- | --- |
| 100 | ± Rp 480 rb | Rp 4,9 jt | 90% |
| 400 | ± Rp 1,4 jt | Rp 19,6 jt | 93% |
| 1.000 | ± Rp 3,5 jt | Rp 49 jt | 93% |

Biaya infra per toko di tahap tumbuh hanya **Rp 3.500–5.000/bulan**. Yang mahal
bukan server, tapi dukungan pengguna.

> Catatan penting: **mode lokal tetap gratis selamanya.** Pengguna yang tidak mau
> bayar cloud tetap memakai aplikasi penuh di satu HP. Cloud dijual sebagai
> "data aman, bisa dilihat dari HP lain, ada log audit" — bukan sebagai syarat
> memakai aplikasi.

---

## 4. Yang sudah saya kerjakan di kode untuk skala ini

Migrasi baru `supabase/migrations/0006_skala.sql`:

| Isi | Alasan |
| --- | --- |
| **Perbaikan bug**: `updated_at` ditambahkan ke `capital_allocations` & `shifts` | Klien menarik data dengan `updated_at > cursor`. Dua tabel ini tidak punya kolom itu → tarikan gagal `42703` dan **seluruh putaran sinkron berhenti** begitu mode cloud dipakai. Ini bug yang hanya muncul di mode cloud, jadi tidak terlihat saat uji lokal. Kini diuji di bagian 21 |
| Indeks `(outlet_id, updated_at)` di 7 tabel | Pola tarik `outlet_id = ? and updated_at > ? order by updated_at limit 300` jadi index scan, bukan sort seluruh tabel. Bedanya terasa saat satu tabel berisi ratusan ribu baris |
| `prune_old_data(stock_days, audit_days)` | Retensi: gerak stok 180 hari, audit 365 hari, kode undangan kedaluwarsa 30 hari. **Transaksi, kasbon, dan shift tidak pernah dihapus.** Bisa dijadwalkan `pg_cron`. Hanya `service_role` yang boleh memanggil |
| `outlet_usage(outlet)` | Angka pemakaian per toko (transaksi, barang, anggota, perkiraan MB, data sejak kapan) — dipakai layar **Pengaturan → Pemakaian data** dan nanti untuk penagihan |

Hasil: `npm run test:db` → **76 pemeriksaan lulus** (naik dari 56).

---

## 5. Menjaga agar satu toko tidak mengganggu yang lain

| Risiko | Penanganan |
| --- | --- |
| Satu toko mengirim ribuan transaksi (import berantai) | Klien sudah mengirim antrean **satu per satu**; tambahkan batas per menit di RPC `sync_transaction` (token bucket tabel) saat pengguna banyak |
| Sinkron menarik data berulang | Tarikan dibatasi 300 baris + kursor; indeks 0006 membuatnya murah |
| Realtime terlalu banyak pesan | Satu kanal per outlet, bukan per tabel; klien hanya berlangganan tabel yang tampil |
| Penyalahgunaan RPC | Supabase Auth punya rate limit bawaan; tambah kuota per `user_id` di RPC tulis |
| Toko "tidur" menyimpan data 3 tahun | Retensi gerak stok + audit (0006); ringkas laporan bulanan ke tabel agregat bila perlu |
| Anggota nakal | Peran + `set_member_active`, audit log, `audit_feed` untuk owner |

Batas keras per toko (rencana sprint berikutnya): tabel `outlet_limits`
(`max_products`, `max_members`, `max_tx_month`) diperiksa di RPC. Kalau lewat,
RPC mengembalikan pesan jelas — bukan error 500 yang membingungkan.

---

## 6. Pemantauan & alarm (minimum yang wajib ada)

| Yang dipantau | Ambang | Tindakan |
| --- | --- | --- |
| Disk database | > 70% kuota | jalankan `prune_old_data`, evaluasi pertumbuhan |
| RAM / CPU compute | > 70% selama 1 jam | naik kelas compute |
| Koneksi Realtime puncak | > 80% (400/500) | naik kelas atau ubah ke broadcast |
| Error rate RPC | > 2% | lihat log PostgREST |
| Sinkron gagal beruntun | ada laporan pengguna | cek kursor & `updated_at` (kelas bug §4) |
| Uptime | 1 cek/menit | alert WhatsApp/Telegram |

Alat: metrik bawaan Supabase + log drain (Pro) + uptime checker gratisan.
Cukup satu dashboard dan satu saluran alert — jangan bikin yang tidak dibaca.

---

## 7. Backup, dan uji restore

| Lapisan | Isi | Frekuensi |
| --- | --- | --- |
| Bawaan Pro | Backup harian, retensi 7 hari | otomatis |
| Tambahan | `pg_dump` mingguan ke storage lain (S3/Drive) | cron 1×/minggu |
| Penting | **PITR** (point-in-time recovery) saat sudah berbayar pelanggan | $ tambahan |
| Wajib | **Latihan restore** ke project percobaan, 1×/kuartal | manual |

Data di HP bukan backup: HP hilang = data lokal hilang, tapi cloud tetap punya.
Itu justru alasan kuat menjual cloud.

---

## 8. Regulasi (UU PDP 27/2022) — ringkas, bukan nasihat hukum

Yang diproses aplikasi ini: email pemilik/kasir, nama & nomor HP pelanggan kasbon,
riwayat belanja. Tidak ada NIK, tidak ada data pembayaran kartu.

| Kewajiban | Cara memenuhi |
| --- | --- |
| Dasar pemrosesan & transparansi | Layar privasi singkat saat pertama pakai cloud + kebijakan privasi tertulis |
| Hak akses & hapus | Sudah ada: ekspor data per toko; tambahkan "hapus akun & data" (soft delete lalu purge 30 hari) |
| Keamanan | RLS, peran, audit log, transport TLS, enkripsi at-rest bawaan Supabase |
| Notifikasi insiden | Prosedur tertulis: lapor ≤ 3×24 jam ke subjek data & otoritas |
| Lokasi data | Pilih region **Singapore** (terdekat, latensi ± 20 ms). Transfer lintas negara sah dengan pengamanan kontraktual (DPA Supabase) |

Untuk toko besar/koperasi yang menuntut data di Indonesia, jalur yang tersedia:
**Supabase self-host di VPS Jakarta** (§9).

---

## 9. Jalan keluar (supaya tidak terkunci pada satu penyedia)

| Skenario | Pilihan | Catatan |
| --- | --- | --- |
| Tagihan > $200/bulan | Self-host Supabase di VPS (Hetzner/IDCloudHost) | Hemat biaya, tapi Anda yang jaga backup, upgrade, keamanan. Butuh ± 4 GB RAM |
| Butuh data residency Indonesia | Self-host di Jakarta / Supabase Enterprise | Latensi turun, tanggung jawab ops naik |
| Ingin tanpa Postgres | Neon (Postgres) + Auth terpisah, atau Turso/D1 (SQLite) | Harus menulis ulang auth, RLS, dan RPC — bukan pekerjaan kecil |
| Ingin tanpa vendor | VPS + Postgres + PostgREST + GoTrue (Docker Compose) | Paling mirip sekarang; Supabase menyediakan compose resmi |

Karena aplikasi memakai Postgres biasa + SQL polos (bukan fitur eksklusif), pindah
penyedia = `pg_dump` lalu restore, tanpa mengubah aplikasi. Itu keputusan sadar
sejak awal.

---

## 10. Checklist sebelum dipakai orang banyak

- [ ] Project **Pro** (bukan Free), region **Singapore**
- [ ] **Spend cap ON** — supaya tagihan tidak melonjak tanpa kabar
- [ ] Jalankan `0001`–`0006`; aktifkan `pg_cron` untuk `prune_old_data()`
- [ ] Backups harian menyala + satu kali uji restore
- [ ] Kunci `service_role` **tidak** ada di aplikasi (hanya anon key)
- [ ] Email konfirmasi & template undangan dirapikan
- [ ] Dashboard pemantauan + 1 saluran alert
- [ ] Kebijakan privasi & prosedur insiden tertulis
- [ ] Harga jual & batas paket ditetapkan (Rp 49 rb/bulan usulan)

---

## 11. Urutan pengerjaan yang saya sarankan

1. **Sekarang (sudah)**: 0006 — bug `updated_at`, indeks, retensi, pemakaian.
2. **Sprint 4**: batas paket per toko (`outlet_limits` + pesan jelas), "hapus akun
   & data" untuk UU PDP, ekspor semua data per toko (JSON/CSV).
3. **Saat pengguna pertama bayar**: PITR + log drain + dashboard alert.
4. **Saat ± 150 toko online bersamaan**: evaluasi koneksi Realtime → pertimbangkan
   broadcast/polling adaptif.
5. **Saat ± 400 toko**: naikkan compute, pindahkan laporan berat ke materialized
   view yang disegarkan per jam.
6. **Saat 1.000+ toko**: pecah per wilayah (dua project) dengan tabel routing
   `tenant → project`; aplikasi hanya perlu membaca URL dari `members`.
