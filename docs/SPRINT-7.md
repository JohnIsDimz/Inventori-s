# Sprint 7 — Kendali Akun, Privasi (UU PDP), dan Pengingat Cadangan

Status: **selesai** (19 November 2026)

Tema sprint ini: **pemilik toko dan karyawannya harus tahu persis apa yang boleh
mereka lakukan, dan harus bisa keluar/menghapus data tanpa bantuan siapa pun.**
Semuanya tetap jalan tanpa server; bagian yang memang butuh server memakai fungsi
SQL yang aturannya ditegakkan di database, bukan di aplikasi.

---

## 1. Serah terima & keluar toko (`0009_sprint7.sql`)

| Fungsi | Siapa yang boleh | Perilakunya |
|---|---|---|
| `transfer_ownership(p_outlet, p_to)` | pemilik aktif | Pemilik lama otomatis jadi **admin**, anggota tujuan jadi **pemilik**. Ditolak bila tujuan bukan anggota aktif. |
| `leave_outlet(p_outlet)` | admin / kasir | Keanggotaan dihapus. Pemilik **tidak bisa** keluar sebelum menyerahkan toko — supaya tidak ada toko tanpa pemilik. |
| `account_delete_preview()` | semua anggota | Ringkasan: jumlah toko yang dimiliki, keanggotaan, dan alasan bila belum boleh dihapus. |
| `delete_my_account()` | semua anggota | Menghapus toko yang tinggal dia satu-satunya (beserta seluruh barang, transaksi, kasbon), semua keanggotaan, dan profilnya. |

Ketiganya menulis jejak audit: `ownership.transfer`, `member.leave`,
`account.delete`. Jejak `account.delete` sengaja disimpan **tanpa `outlet_id`**
karena baris outlet-nya ikut terhapus (`on delete cascade`), dan ditulis sebelum
penghapusan supaya tetap ada setelah data hilang.

### Kenapa "hapus" bukan sekadar tanda

`transaction_items.product_id` dan `purchase_items.product_id` tidak memakai
`on delete cascade`, jadi penghapusan barang akan ditolak foreign key bila tidak
diurus. `delete_my_account` menghapus baris item lebih dulu, baru outletnya —
hasilnya benar-benar bersih (diuji: 0 baris tersisa di `outlets` dan `products`).

### Batas yang jujur

Baris di `auth.users` hanya bisa dihapus dengan `service_role`, yang **tidak
boleh** ada di klien. Jadi yang dihapus adalah seluruh data toko + profil; akun
login menjadi kosong dan bisa dipakai membuat toko baru. Penghapusan baris auth
dijadwalkan di sisi server (dicatat di README Supabase).

---

## 2. Layar "Data & privasi" (`app/privasi.tsx`)

Jalur: **Pengaturan → Data & privasi**.

1. **Data di perangkat ini** — jumlah barang, transaksi, kasbon/utang, status
   cadangan; tombol *Buka Cadangan data* dan *Hapus semua data di perangkat*
   (konfirmasi dialog, lalu data direset dan aplikasi siap dipakai dari nol).
2. **Akun** — email + peran. Kasir/admin bisa *Keluar dari toko ini*. Pemilik
   diberi penjelasan bahwa ia harus menyerahkan toko dulu. Penghapusan akun
   memakai konfirmasi **ketik `HAPUS`**, dan tombolnya mati bila server masih
   melaporkan penghalang (mis. toko masih punya anggota lain).
3. **Cara kami memperlakukan data** — tanpa iklan/pelacakan, log audit disimpan
   maksimal 90 hari, hapus berarti benar-benar dihapus.

Di mode lokal, bagian akun berubah menjadi penjelasan singkat: tidak ada akun
yang tersimpan, semua data hanya di perangkat ini.

---

## 3. Matriks izin yang bisa dibaca manusia (`app/anggota.tsx`)

Sebelumnya peran hanya tampil sebagai chip "Kasir/Admin/Pemilik" tanpa penjelasan.
Sekarang ada kartu **"Apa yang boleh dilakukan"** dengan pilihan peran dan daftar
11 izin yang bisa dibuka:

| Izin | Pemilik | Admin | Kasir |
|---|:--:|:--:|:--:|
| Lihat modal, laba, dan margin | ✓ | ✓ | – |
| Tambah & ubah barang | ✓ | ✓ | – |
| Hapus barang | ✓ | ✓ | – |
| Batalkan (void) transaksi | ✓ | ✓ | – |
| Catat kasbon & terima cicilan | ✓ | ✓ | ✓ |
| Koreksi stok | ✓ | ✓ | – |
| Buka & tutup shift kasir | ✓ | ✓ | ✓ |
| Undang & atur anggota toko | ✓ | – | – |
| Buka log audit | ✓ | ✓ | – |
| Lihat laporan & ekspor data | ✓ | ✓ | ✓ |
| Ubah identitas toko & pengaturan | ✓ | ✓ | – |

Kartu ini tampil juga di mode lokal (supaya pemilik tahu apa yang nanti dibatasi
saat mengundang orang), di atas penjelasan "Butuh mode cloud".

### Berkas baru: `supabase/tests/permissions.test.mts` (`npm run test:rbac`)

9 pemeriksaan yang menjaga agar matriks UI tetap sama dengan yang ditegakkan
server (kasir tanpa laba/audit/harga, admin tanpa kelola anggota, mode lokal
membuka semua izin).

---

## 4. Pengingat cadangan

- `settings.lastBackupAt` dicatat setiap cadangan berhasil dibuat.
- `backupReminder()` (murni, 5 pemeriksaan) mengembalikan salah satu keadaan:
  `kosong`, `belum-pernah`, `aman`, `waktunya` (≥ 7 hari).
- **Beranda** menampilkan kartu "Cadangkan data toko" di bagian *Perlu ditindak*
  bila data ada tapi belum pernah/lewat 7 hari dicadangkan.
- **Cadangan data** menampilkan baris "Cadangan terakhir 10 Nov 2026 • 17:48 WIB"
  plus kotak amber berisi pengingatnya.

### Bonus: ekspor benar-benar mengunduh di web

Sebelumnya di peramban `Sharing.isAvailableAsync()` selalu `false`, sehingga
tombol hanya menampilkan teks JSON. Sekarang web memakai `Blob` + `<a download>`,
jadi berkas `.json`/`.csv` benar-benar terunduh (diuji: nama berkas
`cadangan-inventoris-warung-berkah-202611191748.json`).

---

## 5. Status uji

| Pemeriksaan | Sebelum | Sesudah |
|---|---|---|
| `npm run test:db` | 103 | **124** (+21: serah terima, keluar toko, pratinjau, hapus akun) |
| `npm run test:mappers` | 12 | 12 |
| `npm run test:backup` | 13 | **18** (+5 pengingat) |
| `npm run test:rbac` | – | **9** (baru) |
| `npm run typecheck` | 0 error | 0 error |
| Ekspor web & Android | OK | OK |
| Uji peramban (9 layar) | – | 0 error konsol |

Tangkapan layar: `docs/screenshots/40`–`44`.

## 6. Berkas yang disentuh

```
supabase/migrations/0009_sprint7.sql   transfer/leave/preview/delete + audit
src/services/account.ts                pembungkus RPC (baru)
app/privasi.tsx                        layar Data & privasi (baru)
app/pengaturan.tsx                     baris menu Data & privasi
app/anggota.tsx                        kartu matriks izin
app/audit.tsx                          label & ikon aksi baru
app/(tabs)/index.tsx                   kartu pengingat cadangan
app/cadangan.tsx                       "cadangan terakhir", unduhan web
src/services/backup.ts                 backupReminder()
src/utils/permissions.ts               ACTION_LABEL, permissionList, ROLE_SUMMARY
src/data/{types,store}.ts              settings.lastBackupAt + markBackupDone
supabase/tests/permissions.test.mts    uji matriks izin (baru)
```

## 7. Usulan Sprint 8

1. **Kuotasi / nota order** — pesanan belum dibayar, diubah jadi transaksi saat lunas.
2. **Batas paket berbayar** — kunci fitur setelah N transaksi/bulan (Rp 49.000/toko).
3. **Sinkron antar-HP lewat Wi-Fi lokal** — untuk toko tanpa internet sama sekali.
4. **Pengingat jatuh tempo otomatis** — notifikasi lokal 1 hari sebelum jatuh tempo.
