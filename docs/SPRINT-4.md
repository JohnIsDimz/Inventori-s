# Sprint 4 — Diskon & Pajak, Laporan Shift, Audit Lebih Luas

Tanggal: 19 November 2026
Status: **selesai dan teruji** — 94 pemeriksaan database, 11 pemeriksaan mapper, uji alur kasir di browser (0 error konsol).

---

## 1. Ringkasan

| Fitur | Masalah nyata yang dijawab |
| --- | --- |
| **Diskon & pajak per transaksi** | "Boleh kurang Rp 2.000?" dan "Harga sudah termasuk pajak 10%?" — dua hal yang paling sering terjadi di warung & rumah makan, dan sebelumnya tidak bisa dicatat rapi |
| **Rekap & laporan shift per periode** | Pemilik butuh menagih setoran beberapa hari kerja sekaligus, bukan satu shift demi satu shift |
| **Audit lebih luas** | Sebelumnya hanya perubahan harga & void transaksi. Sekarang perubahan peran anggota dan penyesuaian stok manual juga tercatat |

---

## 2. Diskon & pajak

### Aturan hitung (satu rumus, tiga tempat)

```
subtotal = Σ (qty × harga) − diskon per baris
diskon   = persen ? subtotal × nilai / 100 : min(nilai, subtotal)
pajak    = (subtotal − diskon) × tarif / 100
total    = subtotal − diskon + pajak
```

Rumus ini hidup di **tiga** tempat dan dijaga agar hasilnya sama:

1. `computeTotals()` di `src/data/store.ts` — angka yang dilihat kasir & disimpan lokal.
2. `sync_transaction` (migrasi `0007`) — **server menghitung ulang sendiri**.
3. `docs` ini + uji otomatis yang membandingkan hasil keduanya.

### Celah keamanan yang ditutup

Sebelum sprint ini, `discount` dan `tax` dikirim dari HP lalu **dipercaya apa adanya**.
Artinya kasir yang paham teknis bisa mengirim `tax: 0` (menghilangkan pajak) atau
diskon sembarang tanpa jejak. Sekarang server mengabaikan nominal kiriman dan
menghitung dari **aturan**: `discount_kind` (`amount`/`percent`), `discount_value`,
dan `tax_rate`. Nilai di luar akal ditolak:

- diskon persen > 100 → `Diskon persen maksimal 100`
- tarif pajak > 100 → `Tarif pajak harus 0-100%`
- total jadi 0 setelah diskon → `Total transaksi harus lebih dari 0`
- diskon nominal melebihi subtotal → dipangkas ke subtotal

### Di layar kasir

Keranjang punya bagian **Diskon & pajak**:

- tiga tombol: **Tanpa diskon / Diskon Rp / Diskon %**
- isian tarif pajak (terisi otomatis dari **Pengaturan → Pajak penjualan**)
- rincian **Subtotal → Diskon → Pajak → Total** sebelum bayar

Struk (layar & printer thermal 58 mm) ikut menampilkan Sub total, Diskon, Pajak,
baru TOTAL — hanya bila memang ada diskon/pajak, jadi struk warung biasa tidak
bertambah panjang.

### Contoh yang diuji

| Kasus | Subtotal | Diskon | Pajak | Total |
| --- | --- | --- | --- | --- |
| Kopi 9.000, diskon 10%, PB1 10% | 9.000 | 900 | 810 | **8.910** |
| Kopi 9.000, diskon Rp 5.000, PB1 10% | 9.000 | 5.000 | 400 | **4.400** |
| Kopi 9.000, diskon Rp 3.000 | 9.000 | 3.000 | 0 | **6.000** |

---

## 3. Rekap & laporan shift per periode

- **Di aplikasi** (`app/shift.tsx`): kartu **Rekap periode** dengan pilihan 7 / 30 hari —
  jumlah shift dibuka & ditutup, total modal awal, akumulasi selisih, dan berapa
  shift yang kurang. Dihitung dari data lokal, jadi tetap jalan offline.
- **Di server** (migrasi `0007`): RPC `shift_report(p_outlet, p_from, p_to)`
  mengembalikan per shift: waktu buka/tutup, email pembuka, modal awal, penjualan
  tunai, pengeluaran tunai, kas seharusnya, uang fisik, selisih, dan jumlah transaksi.
  Hanya owner/admin (kasir ditolak — diuji).

Angka penjualan tunai dihitung dari `transactions` pada rentang `opened_at` s.d.
`closed_at`, jadi transaksi yang dikirim terlambat dari perangkat offline tetap
masuk ke shift yang benar.

---

## 4. Audit lebih luas

Dua trigger baru di migrasi `0007`:

| Aksi | Kapan | Isi |
| --- | --- | --- |
| `stock.adjust` | Baris `stock_moves` dengan alasan `adjust`/`opname` (koreksi manual, barang rusak) | stok sebelum → sesudah, delta, catatan |
| `member.add` / `member.role` / `member.active` | Anggota bergabung, peran berubah, diaktifkan/dinonaktifkan | peran/status sebelum → sesudah |

Penjualan **tidak** dicatat di audit supaya log tidak tenggelam oleh transaksi
harian — yang dicatat adalah perbuatan yang mengubah angka secara manual.

Layar `app/audit.tsx` kini mengenali aksi-aksi itu dengan kalimat manusia:
"Stok 20 → 25 (+5) • kiriman susulan", "Peran Kasir → Admin", "Anggota dinonaktifkan".

---

## 5. Berkas yang berubah

| Berkas | Isi |
| --- | --- |
| `supabase/migrations/0007_sprint4.sql` | **baru** — kolom diskon/pajak, `sync_transaction` versi baru, trigger audit anggota & stok, `shift_report` |
| `supabase/tests/backend.test.mjs` | +18 pemeriksaan (total **94**) |
| `supabase/tests/mappers.test.mts` | +1 pemeriksaan (total **11**) |
| `src/data/types.ts` | `Transaction` dapat `subtotal`, `discount`, `discountKind`, `discountValue`, `tax`, `taxRate`; `AppSettings.taxPercent` |
| `src/data/store.ts` | `computeTotals()`, hitung ulang total di `addTransaction`, simpan rincian |
| `src/services/sync/mappers.ts` | kirim & baca kolom diskon/pajak |
| `src/services/printer/receipt.ts` | struk menampilkan Sub total / Diskon / Pajak |
| `app/kasir.tsx` | bagian Diskon & pajak di keranjang + rincian total |
| `app/pengaturan.tsx` | bagian **Pajak penjualan** (tarif bawaan 0–100%) |
| `app/shift.tsx` | kartu **Rekap periode** (7/30 hari) |
| `app/audit.tsx` | label & rincian aksi baru |

---

## 6. Hasil verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run test:db` | **94/94 lulus** |
| `npm run test:mappers` | **11/11 lulus** |
| `npx tsc --noEmit` | bersih |
| `npx expo export` web & android | berhasil |
| Alur kasir di browser | 8 pemeriksaan, **0 error konsol** |

Bukti dari aplikasi yang dijalankan: barang Kopi Susu Rp 9.000 → keranjang → **Diskon %**
10 → pajak 10 (dari pengaturan) → tampil Subtotal Rp 9.000, Diskon −Rp 900, Pajak
Rp 810, **Total Rp 8.910** → bayar → struk memuat rincian yang sama → data tersimpan
`{amount: 8910, subtotal: 9000, discount: 900, discountKind: 'percent', discountValue: 10, tax: 810, taxRate: 10}`.

Tangkapan layar: `docs/screenshots/26-keranjang-diskon-pajak.png`,
`27-struk-diskon-pajak.png`, `28-pengaturan-pajak.png`.

---

## 7. Menerapkan di Supabase

1. Jalankan **`0007_sprint4.sql`** saja (0001–0006 tidak perlu diulang).
2. Transaksi lama otomatis dianggap diskon nominal; tidak ada data yang berubah.
3. Uji cepat: kasir → keranjang → Diskon % 10 → pajak 10 → simpan →
   di SQL Editor: `select subtotal, discount, tax, total, tax_rate from transactions order by created_at desc limit 1;`
   Hasil: `9000 | 900 | 810 | 8910 | 10`.

---

## 8. Batasan yang masih ada

1. **Belum ada harga bertingkat** (umum/grosir/member). Tabel `price_tiers` sudah ada
   di skema, tapi belum dipakai aplikasi — ini kandidat sprint 5 nomor satu.
2. **Diskon belum per barang.** Yang ada diskon tingkat nota; diskon per baris
   sudah didukung skema (`transaction_items.discount`) tapi belum ada UI-nya.
3. **Pajak belum bisa dibebaskan per barang** (mis. sembako bebas PB1).
4. **Rekap shift di aplikasi hanya dari data lokal**; angka resmi tetap dari
   `shift_report` di server.
5. **Belum diuji ke Supabase hidup** — semua uji memakai Postgres asli (PGlite).

---

## 9. Usulan sprint 5

1. Harga bertingkat: grosir & member, otomatis saat jumlah melewati batas.
2. Diskon per barang + tombol "diskon cepat" (5/10/20%).
3. Pemilihan pelanggan tetap (member) di kasir, riwayat belanjanya.
4. Laporan laba per kategori & per shift (pakai `shift_report` + agregat lokal).
