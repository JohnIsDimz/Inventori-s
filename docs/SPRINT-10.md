# Sprint 10 — Pengingat jatuh tempo, DP pesanan, fondasi sinkron antar-HP

Tiga item yang Anda pilih sudah dikerjakan. Dua tuntas sampai bisa dipakai,
satu (sinkron Wi-Fi) selesai di bagian yang paling berisiko — mesin gabung data —
sementara transport jaringannya butuh *development build* dan direncanakan
tertulis di `docs/RENCANA-SINKRON-LAN.md`.

| Item | Status | Bukti |
| --- | --- | --- |
| 1. Pengingat jatuh tempo (notifikasi lokal) | **Selesai** | `app/pengingat.tsx`, `npm run test:notif` (10) |
| 2. DP / uang muka pesanan | **Selesai** | `src/data/orders.ts`, `npm run test:orders` (9), migrasi `0011` (§24, 5 uji) |
| 3. Sinkron antar-HP via Wi-Fi lokal | **Fondasi selesai**, transport menyusul | `src/services/lan/merge.ts`, `npm run test:lan` (10), `docs/RENCANA-SINKRON-LAN.md` |

---

## 1. Pengingat jatuh tempo otomatis

### Yang diingatkan
- **Kasbon pelanggan** yang belum lunas — H-1 dan pada hari jatuh tempo.
- **Pesanan** yang belum diambil — H-1 dan pada hari janji.

Masing-masing berbunyi pukul 08.00 (bisa diubah 06.00–20.00) dan menyebut sisa
tagihan yang benar: "Sisa kasbon Rp 25.000 seharusnya dibayar hari ini",
"Jadikan transaksi saat barang diserahkan. Sisa Rp 86.000."

### Cara kerjanya
- `src/services/notifications/schedule.ts` — **fungsi murni** `buildReminders()`
  yang mengubah kasbon + pesanan menjadi daftar notifikasi bertanggal. Tidak
  menyentuh API perangkat, jadi bisa diuji di Node.
- `src/services/notifications/local.ts` — pembungkus `expo-notifications`:
  minta izin, buat kanal Android (`pengingat`, importance HIGH), batalkan lalu
  jadwalkan ulang, kirim notifikasi uji. Semua `try/catch`; di web menjadi no-op
  sehingga aplikasi tidak pernah gagal karena fitur ini.
- `src/services/notifications/auto.ts` — penjadwalan ulang otomatis dengan jeda
  4 detik setelah data berubah (kasbon dibayar, pesanan diambil, tanggal
  digeser). Tidak ada notifikasi "hantu" untuk hal yang sudah selesai.
- `app/pengingat.tsx` — layar kendali: sakelar aktif, pilihan jam, ringkasan
  "4 pengingat • berikutnya besok 08.00", pratinjau 6 pengingat terdekat,
  tombol "Jadwalkan ulang sekarang" dan "Kirim notifikasi uji", plus panduan
  bila notifikasi tidak muncul (izin + optimasi baterai Android).
- `app/pengaturan.tsx` — baris "Pengingat jatuh tempo" dengan status
  "Aktif • 08.00" / "Notifikasi lokal mati".
- `app.json` — plugin `expo-notifications`, izin `POST_NOTIFICATIONS`,
  `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED` (Android), sehingga jadwal
  tetap hidup setelah HP dinyalakan ulang.

### Keputusan
- **Lokal, bukan push.** Push butuh server + token; itu melanggar janji "jalan
  tanpa server". Notifikasi lokal dijadwalkan OS di perangkat, tetap berbunyi
  walau aplikasi tertutup dan tanpa internet.
- **H-1 + hari-H, bukan satu kali.** Satu pengingat sering terlewat; H-1 memberi
  waktu menyiapkan uang/barang.
- **Batas 40 notifikasi.** iOS membatasi ±64 jadwal; lebih dari itu sistemnya
  membuang yang paling akhir tanpa pemberitahuan.
- **Tidak pernah menjadwalkan waktu yang sudah lewat** — diuji.

## 2. DP / uang muka pesanan

### Aturan uang
DP adalah **uang yang diterima lebih dulu**, bukan penjualan kedua. Karena itu:

- Pesanan menyimpan `deposit`, tidak menyentuh stok dan tidak masuk omzet.
- Saat pesanan diserahkan (`completeOrder`), seluruh nilai pesanan dicatat
  sebagai transaksi (stok berkurang, omzet bertambah **pada saat barang keluar**),
  lalu DP dicatat sebagai **pembayaran pertama** pada kasbon pesanan itu.
- Sisa tagihan otomatis menjadi kasbon pelanggan — pelanggan yang sama tetap
  punya satu kartu piutang, bukan dua.

Contoh nyata dari uji: pesanan Beras Rojolele 5 kg × 2 = Rp 136.000 dengan DP
Rp 50.000 → setelah diambil, kasbon Bu Ratna berisi **Rp 86.000 dari Rp 136.000**
dengan progres pembayaran 37%. (screenshot 56–58)

### Di layar
- **Pesanan baru** — kolom "Uang muka (DP)" + tombol cepat **Tanpa DP /
  Setengah / Lunas**, ringkasan `Total • DP • sisa saat diambil`, dan validasi
  DP tidak boleh melebihi total.
- **Daftar pesanan** — baris `DP Rp 50.000 diterima • sisa Rp 86.000` di kartu.
- **Sheet "Jadikan transaksi"** — kotak penjelas: "DP Rp 50.000 dicatat sebagai
  pembayaran pertama. Sisa Rp 86.000 masuk kasbon otomatis."
- **Kasbon** — kartu baru muncul lengkap dengan catatan pesanan asal.

### Server
`supabase/migrations/0011_sprint10.sql`:
- kolom `orders.deposit numeric(14,2) default 0`;
- constraint `orders_deposit_chk` → `0 ≤ deposit ≤ total`;
- partial index `orders_deposit_idx` untuk pesanan yang punya DP;
- `sync_order` v2 memvalidasi DP (negatif dan melebihi total ditolak) dan
  memperbaruinya saat rincian dikirim ulang.

Diuji di PGlite: DP tersimpan, DP > total ditolak, DP negatif ditolak, kiriman
ulang memperbarui DP.

## 3. Fondasi sinkron antar-HP (Wi-Fi lokal)

Yang selesai: **mesin gabung data** `src/services/lan/merge.ts` — inti dari
sinkron apa pun, dan satu-satunya bagian yang bisa salah tanpa terlihat.

- `mergeRecords()` — last-write-wins per baris (`updatedAt` → `createdAt`),
  aman untuk entri rusak, hasil terurut dari yang terbaru.
- `mergeAll()` — semua entitas sekaligus + laporan per entitas.
- `describeReport()` — "3 baru • 1 diperbarui • 2 lokal dipertahankan".

**Sudah bisa dipakai sekarang:** mode ketiga **"Terbaru"** di Cadangan →
Pulihkan. Sebelumnya pengguna hanya punya "Gabungkan" (lokal selalu menang) dan
"Ganti semua" (berisiko). Sekarang ada pilihan tengah yang benar untuk menukar
data antar-HP lewat berkas.

Yang **belum**: transport Wi-Fi (soket lokal). Butuh `react-native-tcp-socket` +
izin `NEARBY_WIFI_DEVICES`, yang berarti *development build* — tidak bisa lewat
Expo Go, dan mematikannya akan menghentikan alur audit visual (web) yang kita
pakai tiap sprint. Rancangan lengkap, termasuk protokol 4 endpoint, skema kode
pairing, dan daftar berkas yang akan ditambah: `docs/RENCANA-SINKRON-LAN.md`.

## 4. Bug & perbaikan yang ditemukan saat audit visual

| Temuan | Perbaikan |
| --- | --- |
| Tanggal pengingat ("20 Nov 2026 • 08:00 WIB") pecah dua baris di kartu | format ringkas `20 Nov, 08.00` |
| Tiga tombol mode pulihkan tidak sama lebar; label "Terbaru menang" membuat kartu lebih tinggi | `flexBasis: 0`, `minWidth: 0`, `minHeight: 64`, label dipendekkan jadi "Terbaru" |
| `mergeRecords` meloloskan baris dengan `id` string kosong | guard `id.trim() === ''` (ditemukan oleh tes, bukan oleh mata) |
| Kanal notifikasi Android tidak dibuat sebelum penjadwalan | `setNotificationChannelAsync('pengingat', importance HIGH)` saat modul dimuat |

## 5. Verifikasi

```
npm run test:db        148 pemeriksaan   (§24 DP: 5 uji baru)
npm run test:mappers    12
npm run test:backup     21
npm run test:rbac        9
npm run test:orders      9   (2 uji DP baru)
npm run test:cloud      11
npm run test:notif      10   (baru)
npm run test:lan        10   (baru)
npm run typecheck        0 error
```

Ekspor `expo export` untuk **web** dan **android** berhasil; 0 error konsol pada
seluruh alur yang dipotret.

## 6. Tangkapan layar

| Berkas | Isi |
| --- | --- |
| `53-pesanan-daftar-dp.png` | daftar pesanan dengan baris DP + sisa |
| `54-pesanan-baru-kosong.png` | form pesanan baru |
| `55-pesanan-baru-dp-setengah.png` | DP 50% dipilih, ringkasan sisa |
| `56-sheet-selesaikan-dp.png` | sheet "Jadikan transaksi" + kotak penjelas DP |
| `57-pesanan-setelah-selesai.png` | pesanan jadi transaksi, masuk riwayat |
| `58-kasbon-hasil-dp.png` | kasbon otomatis berisi sisa tagihan |
| `59-pengaturan-pengingat-row.png` | baris Pengingat di Pengaturan |
| `60-pengingat-atas.png` / `61-pengingat-daftar.png` | layar pengingat + pratinjau jadwal |
| `62-cadangan-tiga-mode.png` | tiga cara memulihkan, termasuk "Terbaru" |

## 7. Catatan jujur

- Notifikasi hanya bisa dibuktikan penuh di HP: peramban tidak punya penjadwal
  sistem, dan emulator tidak menunjukkan laci notifikasi. Yang diuji otomatis
  adalah **isi & waktu jadwal** (fungsi murni, 10 pemeriksaan) serta perilaku
  izin/kanal (kode). Tangkapan layar web menampilkan banner
  "Peramban tidak punya penjadwal notifikasi sistem" — itu memang perilaku yang
  diinginkan.
- Sinkron Wi-Fi belum bisa dicoba. Jangan menganggapnya sudah ada: yang ada
  adalah mesin gabung + alur berkas "Terbaru".
