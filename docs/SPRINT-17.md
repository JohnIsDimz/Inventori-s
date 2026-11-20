# Sprint 17 — Tagih kasbon via WhatsApp, ekspor selisih stok & riwayat harga, notifikasi stok/harga

Tanggal: 20 November 2026
Status: **selesai**. Seluruh uji hijau (16 suite, 351 pemeriksaan), 134 screenshot.

---

## 1. Masalah yang diselesaikan

Tiga hal yang membuat pekerjaan Sprint 13–16 belum "menutup":

1. **Kasbon macet masih harus dikejar manual.** Data piutang sudah rapi, tetapi pemilik
   tetap harus membuka satu per satu kasbon, menyalin nomor HP pelanggan, lalu mengetik
   pesan. Yang akhirnya terjadi: kasbon yang telat dua minggu tidak pernah ditagih.
2. **Angka bagus di layar hilang begitu laporan dibagikan.** Selisih hitung stok dan
   riwayat harga beli hanya hidup di aplikasi. Begitu laporan PDF/CSV dikirim ke
   pemilik lain atau dicetak, dua bagian itu tidak ada lagi.
3. **Kenaikan harga agen dan stok habis tidak pernah dikabari.** Pemilik baru tahu
   setelah rak kosong atau setelah menghitung untung yang ternyata menipis.

---

## 2. Aturan yang dipegang

| Aturan | Alasan |
| --- | --- |
| **Yang masuk daftar tagih: kasbon belum lunas dengan jatuh tempo ≤ 3 hari ke depan** (termasuk yang sudah lewat) | Kasbon yang masih lama tidak perlu mengganggu; yang telat tetap muncul supaya tidak terlupakan |
| **Nomor HP selalu diambil dari buku pelanggan** (lewat id, lalu nama) | Nomor tidak diketik ulang di tiap penagihan, dan buku pelanggan tetap jadi satu-satunya sumber |
| **Pesan pratinjau bisa dibaca dulu sebelum dikirim** | Salah kirim nominal lebih memalukan daripada menagih telat |
| **Menandai "sudah ditagih" menyimpan waktu & jumlah penagihan** | Supaya tidak menagih dua kali di hari yang sama; tanda hilang sendiri setelah 3 hari |
| **Ekspor memakai hitungan yang sama dengan layar** | Tidak boleh ada dua versi angka; laporan yang dicetak harus sama dengan yang dilihat |
| **Selisih stok dinilai harga modal** | Kerugian tidak dibesar-besarkan harga jual (aturan Sprint 13 tetap) |
| **"Harga beli naik" dibandingkan kulakan terakhir vs sebelumnya, ambang 5%** | Naik Rp 50 tidak perlu jadi notifikasi; naik 6,9% perlu |
| **Barang yang baru sekali dikulak tidak pernah dianggap naik** | Tidak ada pembanding, jadi tidak ada kesimpulan |
| **Peringatan stok & harga dijadwalkan sekali sehari pada jam pengingat** | Empat notifikasi harga + lima notifikasi stok sekaligus akan langsung dimatikan pengguna |

---

## 3. Yang dibangun

### 3.1 Daftar tagih kasbon (`src/data/reminders.ts`, baru)

```ts
REMIND_WINDOW_DAYS = 3        // paling lama H+3
REMIND_GAP_DAYS   = 3         // jarak minimal antar penagihan

collectionRows(data, opts) → [{ receivable, customer, phone, remaining, days, tone, remindedRecently }]
collectionTotals(rows)     → { count, amount, overdueCount, overdueAmount, dueTodayCount, withoutPhone, pending }
collectionSummaryText(totals) → "3 kasbon • Rp 105.000 • 1 telat • 1 hari ini"
fillReminderTemplate({ template, customerName, storeName, amount, dueDate, itemCount })
waLink(phone, message)     → "https://wa.me/62812…?text=…" (null bila nomor kosong)
```

Urutan daftar: paling telat dulu, lalu nominal terbesar. Nomor dinormalkan
`0812…` → `62812…` supaya tautan WhatsApp langsung terbuka.

### 3.2 Layar Tagih kasbon (`app/tagih-kasbon.tsx`, baru)

- kepala ringkas + kalimat pengantar (pesan diisi dari template, nomor dari buku pelanggan);
- tiga angka: jumlah kasbon, total rupiah, jumlah yang telat;
- peringatan kuning bila ada kasbon tanpa nomor HP ("X kasbon belum punya nomor HP");
- saringan **Semua / Telat / Hari ini**;
- kartu per pelanggan: nama, jatuh tempo, nomor HP, sisa, chip status
  (Telat N hari / Jatuh tempo hari ini / N hari lagi), tombol **Kirim WhatsApp** &
  **Lihat pesan**;
- Sheet pratinjau: isi pesan utuh + tombol **Buka WhatsApp**, **Isi nomor pelanggan**,
  **Tandai sudah ditagih**;
- setelah dikirim: kartu berubah jadi **Tagih lagi** + catatan "Sudah ditagih 20 Nov
  2026 — tidak perlu ditagih lagi hari ini."

Pintasan masuk: tombol **Tagih kasbon lewat WhatsApp** di tab Kasbon dan kartu
**Tagih sekarang lewat WhatsApp** di layar Pengingat.

### 3.3 Selisih hitung stok & riwayat harga beli masuk ekspor (`src/data/export-extra.ts`, baru)

| Blok | Isi |
| --- | --- |
| **PDF — Selisih hitung stok** | kalimat ringkas ("2 hitungan • 3 barang kurang • nilai kurang Rp 93.000"), tabel tanggal/barang/tercatat/hasil hitung/selisih/nilai (hanya barang yang selisih) |
| **PDF — Riwayat harga beli** | kalimat ringkas ("2 barang punya riwayat harga beli • 1 naik • 1 turun"), tabel harga pertama/terakhir/terendah/tertinggi/perubahan (12 barang teratas, urut perubahan terbesar) |
| **CSV** | satu berkas berisi tiga bagian: `TRANSAKSI` (seperti sebelumnya), `SELISIH HITUNG STOK`, `RIWAYAT HARGA BELI` |

Sel CSV tetap dinetralkan (`csvSafe`) sehingga nama barang seperti
`=HYPERLINK("…")` tidak dieksekusi Excel. Bila bagian belum ada isinya, tertulis
kalimat biasa ("Belum ada selisih hitung stok di periode ini."), bukan tabel kosong.

### 3.4 Notifikasi stok menipis & harga beli naik (`src/data/stock-alerts.ts`, baru)

```ts
PRICE_RISE_PERCENT = 5
lowStockItems(products)                  → stok ≤ minimum, paling kritis di atas
priceRiseItems(purchases, products, 5)   → naik ≥ 5% vs kulakan sebelumnya
lowStockNotice(items)   → "Stok menipis: 2 barang" / "Kopi (0 pcs), Gula Pasir (1 kg). Catat kulakan…"
priceRiseNotice(items)  → "Harga beli naik: Indomie Goreng" / "naik 6,9% jadi Rp 3.100 (sebelumnya Rp 2.900)…"
stockAlertSummary(products, purchases) → "1 barang menipis • 1 harga beli naik"
```

Penjadwal (`src/services/notifications/schedule.ts`) kini punya dua jenis pengingat
baru — `stok` dan `harga` — yang dikirim pada jam pengingat berikutnya, sekali sehari.
Layar **Pengingat** menampilkan keduanya sebagai kartu, dengan tombol ke Katalog
(stok) dan ke riwayat harga (harga naik).

### 3.5 Layanan ekspor (`src/services/export.ts`, ditambah)

`buildTransactionsCsv` dan PDF laporan sekarang menyisipkan dua blok baru tanpa
mengubah format bagian lama, sehingga pemakai berkas lama tidak kaget.

---

## 4. Berkas yang berubah

| Berkas | Perubahan |
| --- | --- |
| `src/data/reminders.ts` | **baru** — aturan daftar tagih & isi pesan WhatsApp |
| `src/data/export-extra.ts` | **baru** — baris & blok CSV selisih stok dan riwayat harga |
| `src/data/stock-alerts.ts` | **baru** — aturan stok menipis & harga beli naik |
| `src/data/types.ts` | `Receivable.lastRemindedAt`, `remindCount` |
| `src/data/selectors.ts` | `BusinessData.opnames` & `BusinessData.purchases` (opsional) |
| `src/data/store.ts` | aksi `markReminded(id, at?)` |
| `src/services/export.ts` | blok selisih stok & riwayat harga di PDF dan CSV |
| `src/services/notifications/{schedule,auto}.ts` | pengingat `stok` & `harga`, terima `products`/`purchases` |
| `app/_layout.tsx` | rute `tagih-kasbon`, produk cabang aktif untuk peringatan stok |
| `app/tagih-kasbon.tsx` | **baru** — layar Tagih kasbon |
| `app/(tabs)/kasbon.tsx`, `app/pengingat.tsx` | tombol/kartu pintasan ke Tagih kasbon |
| `app/(tabs)/laporan.tsx` | keterangan isi berkas ekspor |
| `app/notifikasi.tsx` | kartu harga beli naik |
| `supabase/tests/{reminders,ekspor}.test.mts` | **baru** — 12 & 14 pemeriksaan |
| `supabase/tests/notifications.test.mts` | +10 pemeriksaan stok & harga |

---

## 5. Hasil uji

```
db          148   mappers  12   backup 23   rbac  9   orders  9
notif        20   lan      10   customers 19 outlets 18  opname 11
purchases    14   suppliers 15  laporan 11   reminders 12  ekspor 14
copy          8   ── total 351 pemeriksaan, semuanya lulus; typecheck 0 galat
```

QA layar (web, 412×892, data uji berisi kasbon telat/hari ini/dengan & tanpa nomor HP):

```
daftar tagih  : Bu Ratna (telat 4 hari), Bu Sari (hari ini), Pak Budi (2 hari lagi)
ringkasan     : "3 kasbon • Rp 105.000 • 1 telat • 1 hari ini"
tanpa nomor   : "1 kasbon belum punya nomor HP. Isi nomornya di buku pelanggan…"
tautan WA     : https://wa.me/6281234567890?text=Halo+Bu+Ratna%2C+kami+catat+kasbon…Rp+35.000…
setelah kirim : remindCount = 1, tanda "Sudah ditagih 20 Nov 2026"
pengingat     : kartu "Harga beli naik: Indomie Goreng — Naik 6,9% jadi Rp 3.100"
                kartu "Stok menipis: Telur Ayam — Sisa 1 kg dari minimum 2 kg"
galat konsol  : 0
```

Screenshot: `docs/screenshots/129`–`132` (tagih kasbon), `133` (notifikasi harga
naik), `134` (keterangan berkas ekspor di Laporan).

---

## 6. Batas yang belum dikerjakan

| Hal | Alasan |
| --- | --- |
| Kirim WhatsApp otomatis tanpa membuka aplikasi WhatsApp (Cloud API) | Butuh akun bisnis WhatsApp + biaya per pesan; tautan `wa.me` sudah menyelesaikan masalah utama |
| Menjadwalkan ulang pengingat per kasbon setelah ditagih (mis. H+3 otomatis) | Tanda "sudah ditagih" sudah ada; penjadwalan otomatis menyusul bila diminta |
| Ringkasan harian (omzet hari ini) dalam satu notifikasi | Termasuk sisa 1.9; baru stok & harga yang dikerjakan |
| Ekspor berkas terpisah khusus selisih stok / harga beli | Satu berkas lebih mudah dibagikan; pemisahan bisa ditambahkan bila berkas terasa panjang |

---

## 7. Ringkasan untuk pemilik warung

- Buka **Kasbon → Tagih kasbon lewat WhatsApp**. Yang telat dan yang jatuh tempo hari
  ini sudah di urutan atas, lengkap dengan nomor HP dari buku pelanggan. Ketuk
  **Lihat pesan** kalau ingin membaca dulu, lalu **Buka WhatsApp** — pesannya sudah
  terisi. Setelah itu kartu ditandai "sudah ditagih" supaya tidak menagih dua kali.
- Buka **Laporan → Unduh laporan PDF** atau **Ekspor data transaksi (CSV)**. Berkasnya
  sekarang memuat selisih hitung stok dan riwayat harga beli, bukan hanya laba rugi.
- Buka **Pengingat** (ikon lonceng). Stok yang menipis dan harga beli yang naik ≥ 5%
  muncul di sana, dan juga berbunyi sebagai notifikasi pagi.
