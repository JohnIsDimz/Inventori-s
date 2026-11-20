# Sprint 11 — Buku pelanggan & nilai kesetiaan

Tanggal: 19 November 2026
Status: **selesai** (kode, uji, tangkapan layar, dokumen)

---

## 1. Kenapa fitur ini didahulukan

Sebelum sprint ini, aplikasi hanya menyimpan kasbon sebagai **nama teks**. Akibatnya, di
warung yang punya dua "Bu Sri" atau "Pak RT" yang nomornya berganti, kasbon gampang
tertukar. Selain itu pemilik toko tidak pernah tahu siapa pelanggan yang benar-benar
sering belanja — padahal justru mereka yang paling perlu dipertahankan.

Sprint ini menjawab dua hal itu tanpa menambah beban kerja kasir:

1. **Buku pelanggan** — satu nama, satu nomor HP, satu catatan.
2. **Nilai kesetiaan** — poin dan tingkat yang dihitung sendiri dari transaksi.

Fitur ini **tidak butuh akun dan tidak butuh internet**. Semua tetap di HP pemilik toko,
sesuai keputusan rilis tanpa akun.

---

## 2. Yang dibangun

### 2.1 Data pelanggan

| Bagian | Isi |
| --- | --- |
| Nama | wajib, dirapikan (spasi ganda dirapatkan, maks 60 karakter) |
| Nomor HP | opsional, diseragamkan ke bentuk `62…` supaya tautan WhatsApp benar |
| Catatan | opsional, mis. "langganan kue basah tiap Sabtu" |

Nama ganda ditolak dengan pesan jelas: *"Pelanggan "Bu Sri" sudah ada di buku pelanggan."*

### 2.2 Poin & tingkat

- **Poin** = ⌊total belanja ÷ Rp 10.000⌋. Dihitung ulang setiap saat, **tidak disimpan**.
  Karena tidak disimpan, poin tidak mungkin dobel saat data dipulihkan dari cadangan atau
  digabung antar-HP.
- **Tingkat**: `Pelanggan baru` → `Sering belanja` (≥ Rp 150.000) → `Langganan setia`
  (≥ Rp 1.000.000). Kartu rincian menampilkan sisa belanja menuju tingkat berikutnya,
  mis. "Rp 90.650 lagi menuju Sering belanja".

### 2.3 Kasbon & riwayat menempel ke pelanggan

- Kasbon baru dapat `customerId`; transaksi ikut menyimpannya.
- **Kasbon lama tetap terbaca**: kalau kasbon belum punya `customerId`, pelanggan
  dicocokkan lewat nama (tanpa membedakan huruf besar/spasi). Transaksi kasbon lama
  dikenali lewat `receivableId`, jadi riwayat belanja setahun lalu ikut terhitung.
- Kasir punya **chip pelanggan tersimpan** saat memilih metode Kasbon — satu ketukan,
  nama langsung terisi dan tidak salah orang.

### 2.4 Layar

| Layar | Isi |
| --- | --- |
| `app/pelanggan.tsx` | daftar pelanggan + pencarian nama/nomor + ringkasan jumlah & total poin |
| Sheet rincian | total belanja, poin, kasbon belum lunas, progres tingkat, 5 belanja terakhir, tombol WhatsApp, Ubah, Hapus |
| Sheet isian | tambah/ubah pelanggan |
| `Pengaturan` | baris menu **Pelanggan** dengan jumlah nama tersimpan |
| `Kasir` | chip pelanggan tersimpan pada metode Kasbon |
| `Buku Kasbon` | chip pelanggan tersimpan pada form kasbon baru |

Aturan hapus: pelanggan **tidak bisa dihapus** bila masih punya kasbon belum lunas atau
pesanan yang belum diambil. Riwayat transaksi tetap utuh dengan namanya walau pelanggan
dihapus dari buku.

### 2.5 Cadangan

Buku pelanggan ikut di dalam berkas cadangan (`customers`). Cadangan lama (versi 1 tanpa
`customers`) tetap bisa dibuka dan dibaca sebagai daftar kosong — tidak ada pesan galat
yang membingungkan.

---

## 3. Berkas yang disentuh

```
src/data/customers.ts          # BARU — semua aturan (murni, bisa diuji Node)
src/data/types.ts              # Customer, customerId pada Transaction/Order, PersistedState.customers
src/data/store.ts              # addCustomer/updateCustomer/deleteCustomer, tautan kasbon & pesanan
src/services/backup.ts         # customers ikut tercadangkan & tergabung
app/pelanggan.tsx              # BARU — daftar + rincian + isian
app/_layout.tsx                # rute "pelanggan"
app/pengaturan.tsx             # baris menu Pelanggan
app/kasir.tsx                  # chip pelanggan tersimpan (metode Kasbon)
app/(tabs)/kasbon.tsx          # chip pelanggan tersimpan (form kasbon baru)
app/cadangan.tsx, app/privasi.tsx  # jumlah data ikut menghitung pelanggan
supabase/tests/customers.test.mts  # BARU — 19 pemeriksaan
supabase/tests/backup.test.mts     # +2 pemeriksaan buku pelanggan
package.json                   # skrip test:customers
```

Catatan teknis: `customerId` **tidak** ikut dikirim ke backend. Buku pelanggan masih
tersimpan di HP ini saja, sehingga server tidak perlu tahu dan kiriman tetap diterima
apa adanya bila kelak akun dinyalakan.

---

## 4. Uji

| Suite | Sebelum | Sesudah |
| --- | --- | --- |
| `test:db` | 148 | 148 |
| `test:mappers` | 12 | 12 |
| `test:backup` | 21 | **23** |
| `test:rbac` | 9 | 9 |
| `test:orders` | 9 | 9 |
| `test:notif` | 10 | 10 |
| `test:lan` | 10 | 10 |
| `test:customers` | — | **19** |
| `test:copy` | 8 | 8 |
| `typecheck` | 0 error | 0 error |

Yang dijaga `test:customers`: nomor HP selalu jadi bentuk `62…`, nama dirapikan, isian
salah ditolak dengan kalimat manusia, poin dibulatkan ke bawah, tingkat naik tepat di
ambang, kasbon lama tanpa `customerId` tetap terhitung, kasbon yang dibayar sebagian tidak
dihitung penuh, dan daftar terurut dari yang paling banyak belanja.

Pemeriksaan layar (Playwright, 390×844, tanpa satu pun galat konsol):

1. `83-pelanggan-daftar.png` — 3 pelanggan, 2 punya kasbon, 6 poin
2. `84-pelanggan-rincian.png` — Bu Ratna: Rp 55.500, 5 poin, progres "Rp 94.500 lagi…"
3. `85-pelanggan-form.png` — isian pelanggan baru
4. `86-pelanggan-tersimpan.png` — Bu Sari masuk daftar, label "Belum pernah belanja"
5. `87-kasir-pelanggan-tersimpan.png` — chip pelanggan muncul saat memilih Kasbon
6. `88-kasir-pelanggan-dipilih.png` — chip aktif, nama terisi otomatis
7. `89-pelanggan-setelah-kasbon.png` — kasbon dari kasir menempel: belanja naik ke
   Rp 59.350, kasbon Rp 3.850, peringatan "Ada 1 kasbon belum lunas", riwayat bertambah

---

## 5. Batas yang dipegang

- Tidak ada kata teknis di layar (dijaga `test:copy`): tidak ada "database", "sinkron",
  "cloud", "poin API", dan sejenisnya.
- Tidak ada tombol mati: tombol WhatsApp hanya muncul bila nomor HP terisi; bila kosong
  yang tampil adalah tombol **Tambah nomor HP**.
- Pesan galat selalu explains apa yang harus dilakukan, contoh: *"Pelanggan ini masih
  punya kasbon belum lunas. Lunasi dulu di menu Kasbon."*

---

## 6. Belum termasuk (sengaja)

| Hal | Alasan |
| --- | --- |
| Pelanggan tersinkron antar-HP | Rilis tanpa akun; buku pelanggan ikut di berkas cadangan |
| Poin bisa ditukar hadiah | Butuh aturan bisnis pemilik toko; ditunda sampai ada masukan nyata |
| Kategori pelanggan manual (grosir/retail) | Bisa menyusul bersama harga khusus pelanggan |
| Impor buku pelanggan dari Excel | Menyusul bersama impor/ekspor penuh |

---

## 7. Langkah berikutnya

Sprint 12: **multi-outlet** (satu HP mengelola lebih dari satu lokasi) — lihat
`docs/RENCANA-MULTI-OUTLET.md`. Ini pekerjaan besar karena stok, laporan, shift, dan
cadangan saat ini menganggap toko hanya punya satu lokasi.
