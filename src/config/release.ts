/**
 * Sakelar rilis.
 *
 * Aplikasi yang dipublikasikan di Play Store berjalan **tanpa akun**: orang yang
 * baru mengunduh langsung bisa memakai kasir, tanpa daftar atau masuk. Ini juga
 * menghilangkan risiko peninjau Play tertahan di layar login.
 *
 * Fitur akun/sinkron tetap ada di dalam kode (tabel, RPC, mesin sinkron, uji),
 * tetapi tidak akan pernah menyala selama sakelar ini `false` — bahkan bila
 * suatu saat kunci backend terpasang di environment. Untuk build khusus
 * (uji internal/multi-perangkat), ubah ke `true` secara sadar.
 */
export const ACCOUNTS_ENABLED = false;
