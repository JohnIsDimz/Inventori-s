# Rencana: Sinkron antar-HP lewat Wi-Fi lokal

Status: **fondasi selesai, transport menyusul.** Dokumen ini menjelaskan apa yang
sudah ada di Sprint 10, apa yang belum, dan bagaimana sisanya dikerjakan tanpa
merusak janji "tetap jalan tanpa server".

---

## 1. Masalah yang mau dipecahkan

Dua HP dipakai di satu toko (mis. pemilik + kasir) tetapi tidak berlangganan
cloud. Saat ini data dipindah dengan cara manual:

1. HP A → **Cadangan → Bagikan berkas (.json)**;
2. kirim lewat WhatsApp/kabel/USB;
3. HP B → **Cadangan → Pulihkan**.

Cara itu sudah berfungsi, tetapi (a) harus keluar aplikasi, dan (b) cara
"Gabungkan" tidak bisa memilih versi terbaru — data lokal selalu menang.

## 2. Yang sudah dikerjakan di Sprint 10

**Mesin gabung (inti dari sinkron apa pun).** `src/services/lan/merge.ts`:

```ts
mergeRecords<T>(current: T[], incoming: T[]): { rows: T[]; report: MergeReport }
mergeAll(current, incoming): { rows, report }      // semua entitas sekaligus
describeReport(report): string                      // "3 baru • 1 diperbarui"
```

Aturan *last-write-wins* berbasis `updatedAt` → `createdAt`:

| Kondisi | Hasil |
| --- | --- |
| id hanya ada di satu sisi | diambil |
| id di dua sisi, stempel masuk lebih baru | menimpa |
| id di dua sisi, stempel lokal lebih baru | lokal dipertahankan |
| tanpa stempel waktu | lokal dipertahankan (aman) |
| entri rusak / `id` kosong | dilewati, tidak melempar error |

**Sudah dipakai pengguna sekarang:** mode ketiga **"Terbaru"** di layar
Cadangan → Pulihkan (lihat `docs/screenshots/62-cadangan-tiga-mode.png`). Ini
jalur yang sama yang nanti dipakai sinkron Wi-Fi, hanya berbeda transport.

Diuji oleh `npm run test:lan` (10 pemeriksaan), termasuk kasus data lokal yang
lebih baru tidak boleh tertimpa data lama dari HP lain.

## 3. Yang belum: transport Wi-Fi

Mengapa belum masuk Sprint 10 (jujur, bukan karena malas):

1. **Butuh modul native.** Membuka soket TCP/UDP dari JavaScript perlu
   `react-native-tcp-socket` (atau `expo-network` + server HTTP lokal). Modul ini
   **tidak bisa dipakai di Expo Go** dan tidak jalan di web — artinya butuh
   *development build* (EAS/prebuild). Repo ini masih diandalkan lewat Expo Go +
   build web untuk audit visual, jadi menambahkannya akan mematikan alur kerja
   saat ini sampai pipeline dev build disiapkan.
2. **Penemuan perangkat (discovery)** di Android 13+ butuh izin
   `NEARBY_WIFI_DEVICES` + mDNS (`react-native-zeroconf`), satu modul native lagi.
   Alternatif tanpa modul tambahan: **QR berisi `ip:port` + 6 digit kode** yang
   dipindai kamera — `expo-camera` sudah terpasang, jadi ini jalur termurah.
3. **Keamanan.** Sinkron lewat Wi-Fi berarti ada server HTTP di HP. Tanpa
   autentikasi, siapa pun di jaringan kafe bisa membaca/menulis data toko. Perlu
   kode pairing + enkripsi payload sebelum fitur ini boleh dirilis.

## 4. Rancangan yang akan dijalankan (Sprint 11)

### 4.1 Protokol

```
HP A (sumber)                        HP B (penerima)
─────────────                        ───────────────
POST /pair   {code}                  verifikasi kode 6 digit, balas {token}
GET  /changes?since=<iso>            kirim baris yang berubah sejak `since`
POST /merge  {rows, token}           mergeRecords() → balas laporan
GET  /ack    ?upTo=<iso>             sumber maju-kan tanda `since`
```

- Satu arah per giliran (A→B lalu B→A) supaya kedua HP saling melengkapi.
- Payload = bentuk yang **sudah ada** di `BackupPayload` (produk, transaksi,
  kasbon, utang, kategori, alokasi, shift, pesanan) → tidak ada format baru.
- Ukuran: 3–5 MB/bulan/toko (lihat `docs/CLOUD-SKALA.md`), jadi sekali tukar
  selesai dalam hitungan detik di Wi-Fi 2,4 GHz.

### 4.2 Keamanan

- Kode pairing 6 digit, berlaku 5 menit, hanya sekali pakai.
- Header `X-Inventoris-Token` wajib untuk `/changes` dan `/merge`.
- Server hanya mendengarkan di antarmuka Wi-Fi lokal, ditutup otomatis 3 menit
  tanpa aktivitas.
- Tidak ada data yang keluar ke internet; tidak ada analitik.

### 4.3 Konflik

- Prinsip tetap *last-write-wins* per baris (sudah diuji).
- Uang tidak pernah "digabung": transaksi bersifat tambah-saja (immutable),
  sehingga konflik hanya terjadi pada produk, kasbon, pesanan, dan pengaturan.
- Stok: server mengirim **delta** (`apply_stock_delta`), bukan angka absolut,
  supaya dua HP yang sama-sama menjual barang tidak saling menimpa.

### 4.4 Yang perlu ditambahkan ke repo

| Berkas | Isi |
| --- | --- |
| `android/` atau `eas.json` | *development build* (prebuild) |
| `src/services/lan/server.ts` | server HTTP lokal (tcp-socket) |
| `src/services/lan/client.ts` | pemanggil `fetch()` ke `http://<ip>:<port>` |
| `app/sinkron-lokal.tsx` | layar: tombol "Jadi sumber"/"Terima data", QR pairing |
| `app.json` | `NEARBY_WIFI_DEVICES`, `ACCESS_WIFI_STATE` |
| `supabase/tests/lan.test.mts` | + kasus protokol (sudah ada untuk mesin gabung) |

## 5. Jalan pintas yang bisa dipakai hari ini

Kalau butuh memindahkan data antar-HP **sekarang**, alurnya sudah layak:

1. HP A: Pengaturan → Cadangan → **Bagikan berkas cadangan (.json)**.
2. Kirim ke HP B (WhatsApp/Bluetooth/USB), atau buka Wi-Fi Direct/hotspot untuk
   memindahkan berkas tanpa kuota.
3. HP B: Cadangan → Pulihkan → **Terbaru** → pilih berkas.
4. Ulangi arah sebaliknya bila HP B juga mencatat penjualan.

Hasilnya sama dengan sinkron Wi-Fi lokal (aturan gabung identik), hanya
transportnya manual. Ini sebabnya mesin gabung dikerjakan lebih dulu.
