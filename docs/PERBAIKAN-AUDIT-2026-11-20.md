# Perbaikan audit — 20 November 2026

Perubahan diterapkan di repositori, bukan di layanan produksi. Migrasi tambahan: `supabase/migrations/0012_audit_fixes.sql`. Tidak ada kredensial produksi yang ditambahkan ke aplikasi.

## Cakupan perubahan

Nomor mengikuti daftar temuan pada percakapan audit. “Diterapkan” berarti perubahan kode tersedia; bukan klaim bahwa layanan produksi sudah diperbarui atau semua perangkat sudah diuji.

| Temuan | Perubahan di repositori |
|---|---|
| 1 | Hak pemanggilan fungsi internal perubahan stok dicabut dari peran aplikasi. |
| 2 | `sync_order` memeriksa kepemilikan outlet sebelum memperbarui pesanan dan rinciannya. |
| 3 | Penjaga rute mengizinkan masuk/daftar; akun tanpa keanggotaan diarahkan ke pengaturan akun. |
| 4 | Pembersihan perangkat menyatukan penghapusan data, foto, antrean, peta ID dan kursor; pergantian pengguna/keanggotaan memeriksa identitas sebelumnya. Sinkronisasi dan mutasi ditahan selama pembersihan. |
| 5 | Kebijakan akses dan validasi mutasi produk, utang/kasbon, serta penghapusan pesanan diperketat di SQL. |
| 6 | Kode undangan menggunakan sumber acak kriptografis; anggota nonaktif tidak dapat mengaktifkan diri sendiri; pemilik tidak dapat menurunkan perannya sendiri lewat undangan. Percobaan kode tak cocok dibatasi, termasuk panggilan paralel per pengguna. |
| 7 | Hak akses diperiksa di store dan rute sensitif, bukan hanya tombol. Sesi tanpa peran ditolak pada mode akun. Tampilan dan ekspor CSV/PDF membatasi bagian laba/modal. Ini pembatasan aplikasi, bukan jaminan kerahasiaan seluruh angka terhadap pengguna yang sudah dapat membaca data mentah perangkat. |
| 8 | SQL memeriksa diskon baris, referensi lintas outlet, stok hanya untuk penjualan, dan mencatat pengubahan harga penjualan dari katalog. |
| 9 | Sinkronisasi memakai paginasi pasangan waktu-ID, menerapkan penanda penghapusan, menyimpan kursor setelah data, memperingatkan perubahan yang ditolak, dan mempertahankan operasi yang gagal sementara. UUID memakai `expo-crypto`. |
| 10 | Penyaringan cabang tidak lagi menampilkan baris lama di semua cabang; pemindahan modal memakai saldo cabang terkait. Data lama tanpa cabang dianggap milik cabang pertama. |
| 11 | Keranjang menolak stok nol/berlebih, store memeriksa jumlah gabungan barang duplikat sebelum menyimpan, dan penjaga simpan mencegah pengetukan ganda pada formulir yang sama. |
| 12 | Rekap shift menghitung cicilan kasbon/utang tunai dan mengabaikan kredit retur/penyesuaian uang muka; shift tertutup tidak bisa dibuka ulang melalui sinkronisasi. |
| 13 | Sesi native berpindah ke SecureStore dengan migrasi sesi lama; tidak beralih ke penyimpanan teks biasa bila penyimpanan aman gagal. Web memakai penyimpanan sesi tab. |
| 14 | Pembersihan data akun mencakup residu perangkat dan metadata profil; teks aplikasi menjelaskan batas penghapusan secara jujur. **Identitas autentikasi/email belum dihapus otomatis — masih memerlukan tindakan pengelola layanan.** Salinan cadangan/perangkat lain tidak dijanjikan terhapus otomatis. |
| 15 | Impor cadangan memvalidasi elemen dan struktur bersarang, membuang kunci prototipe, menolak isi rusak/berkas berlebihan, dan membatasi URI foto. |
| 16 | Struk mencetak diskon barang/nilai neto/kembalian, membedakan kasbon dan pengeluaran, menggunakan ID transaksi tersimpan, dan tidak memangkas struk panjang pada 2.000 karakter. Pengiriman BLE mengikuti jenis kanal tulis dengan paket konservatif. |
| 17 | Layar cadangan menjelaskan bahwa berkas tidak terenkripsi dan foto nota tidak disertakan; teks cadangan diperbarui saat data berubah; dialog berbagi tidak lagi dianggap bukti berkas berhasil disimpan. |
| 18 | Katalog POS memakai FlatList dan riwayat memakai SectionList, sehingga tidak seluruh kartu dibuat sekaligus. Pencarian barang di keranjang memakai peta ID. |
| 19 | Tombol bersama memiliki peran/label/status sibuk, input memiliki label aksesibilitas, tab menandai pilihan aktif, dialog memiliki tombol tutup berlabel, dan kamera pemindai tidak aktif saat modal ditutup. |
| 20 | Penghapusan foto hanya membentuk path di direktori nota milik aplikasi; izin alarm presisi yang tidak diperlukan dihapus; pola berkas rahasia ditambahkan ke gitignore. |
| 21 | Dependensi diperbarui, termasuk override minimatch; audit npm tidak menemukan kerentanan pada saat pemeriksaan. |
| 22 | Galat layanan dibungkus menjadi pesan Indonesia yang dapat ditindaklanjuti; konfirmasi destruktif memakai pengganti yang berfungsi di web. |

## Pengujian otomatis

- `npm run typecheck`: lulus.
- Seluruh **18 skrip `test:*`**: lulus; **451 pemeriksaan** (170 SQL/PGlite dan 281 lainnya).
- `npm audit`: **0 kerentanan** saat pemeriksaan.
- `npx expo export --platform web --output-dir dist`: berhasil.
- Ekspor bundel Android: berhasil. Ini **bukan** pembuatan APK/AAB atau pengujian perangkat fisik.
- `git diff --check`: bersih.

Regresi baru mencakup penolakan akses sesi tanpa peran, mutasi langsung yang dilarang, ekspor tanpa modal/laba, elemen cadangan rusak, pemulihan pembelian/retur/opname, keamanan path foto, stok berlebih/duplikat, perhitungan cicilan pada shift, penghapusan hasil sinkron, isolasi tabungan cabang, batas percobaan undangan, serta struk.

## Tindakan di luar repositori / perlu verifikasi manual

1. **Terapkan migrasi 0012** ke proyek Supabase sesudah membuat cadangan produksi dan mengujinya di lingkungan percobaan. Deploy aplikasi yang cocok sesudah migrasi; klien baru memakai kolom sumber penyesuaian pembayaran.
2. **Bangun ulang aplikasi native**, karena SecureStore dan Crypto merupakan dependensi native. Pembaruan JavaScript saja tidak cukup untuk pemasangan lama.
3. **Penghapusan identitas masuk belum otomatis.** RPC membersihkan data bisnis/profil/metadata, tetapi mempertahankan `auth.users`. Pengelola layanan perlu menerapkan proses penghapusan melalui fasilitas admin yang tepercaya, memperhatikan referensi riwayat/audit di toko lain dan sesi yang masih berlaku. Jangan meletakkan kunci admin di aplikasi. Jangan menyebut alur ini sebagai penghapusan identitas lengkap sebelum langkah tersebut diterapkan dan diuji.
4. **Pengaturan autentikasi produksi:** periksa konfirmasi email, batas permintaan, CAPTCHA untuk pendaftaran, aturan kata sandi, dan masa sesi di dashboard. Pembatasan undangan per pengguna tidak menggantikan perlindungan pembuatan banyak akun.
5. **Retensi dan salinan data:** verifikasi jadwal pembersihan log/percobaan undangan, retensi cadangan layanan, serta kebijakan penghapusan pada perangkat lain. Tidak ada klaim bahwa jadwal produksi telah diaktifkan. Rekap historis dari versi lama juga perlu direkonsiliasi bila pernah salah mencatat DP/retur sebagai tunai.
6. **Perangkat nyata:** perlu verifikasi manual terhadap penyimpanan sesi setelah naik versi, keluar/berpindah akun saat koneksi putus, izin kamera/mikrofon/Bluetooth, printer dengan/tanpa respons, dialog web, ukuran huruf besar, TalkBack/VoiceOver, dan navigasi keyboard. Lingkungan ini tidak menyediakan perangkat fisik atau pembaca layar.
7. **Mode akun tetap tidak diaktifkan pada rilis lokal** (`ACCOUNTS_ENABLED = false`). Sebelum mengaktifkannya, uji alur masuk/daftar, undangan setelah konfirmasi email, pencabutan keanggotaan, dan penggunaan cabang pada layanan percobaan. Pembatasan tampilan laba bukan enkripsi data lokal dan bukan pemisahan kolom sensitif pada API.

Tidak ada migrasi yang dijalankan terhadap produksi dan tidak ada pengaturan dashboard yang diubah dari sesi ini.
