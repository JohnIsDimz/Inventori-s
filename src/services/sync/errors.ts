/**
 * Mengubah galat teknis menjadi kalimat yang bisa dimengerti pemilik toko.
 *
 * Galat dari jaringan/penyimpanan datang dalam bahasa Inggris dan menyebut hal
 * internal ("JWT expired", "row-level security policy", "Failed to fetch").
 * Teks seperti itu tidak boleh muncul di layar pengguna — cukup disimpan di log
 * pengembang, sedangkan pengguna melihat penjelasan + langkah berikutnya.
 */

const hasCode = (error: unknown, codes: string[]): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && codes.includes(code);
};

const rawMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return error instanceof Error ? error.message : '';
};

/** Galat masuk/daftar: pesan layanan datang dalam bahasa Inggris. */
export function friendlyAuthError(error: unknown): string {
  const message = rawMessage(error).toLowerCase();

  if (/invalid login credentials|invalid_grant|wrong password|password.*incorrect/i.test(message)) {
    return 'Email atau kata sandi salah. Periksa lagi, lalu coba masuk.';
  }
  if (/email not confirmed|not confirmed/i.test(message)) {
    return 'Email belum dikonfirmasi. Hubungi pemilik toko untuk mengaktifkan akun Anda.';
  }
  if (/user already registered|already exists/i.test(message)) {
    return 'Email ini sudah terdaftar. Coba masuk saja.';
  }
  if (/password.*(6|short|at least)/i.test(message)) {
    return 'Kata sandi terlalu pendek — minimal 6 karakter.';
  }
  if (/network|fetch|timeout|offline/i.test(message)) {
    return 'Tidak ada koneksi. Sambungkan internet lalu coba lagi.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.';
  }
  return 'Masuk belum berhasil. Periksa email dan kata sandi Anda.';
}

export function friendlySyncError(error: unknown): string {
  const message = rawMessage(error).toLowerCase();

  // Sesi habis / token kedaluwarsa.
  if (
    hasCode(error, ['PGRST301', 'PGRST302']) ||
    /jwt|token|sesi|session|401|unauthorized/i.test(message)
  ) {
    return 'Sesi masuk sudah berakhir. Masuk lagi supaya data bisa disinkronkan.';
  }

  // Tidak ada internet.
  if (/network|fetch|timeout|offline|econn|enotfound|dns/i.test(message)) {
    return 'Tidak ada koneksi. Perubahan tetap tersimpan di HP ini dan dikirim otomatis saat online.';
  }

  // Tidak punya hak akses ke toko ini.
  if (hasCode(error, ['42501']) || /row-level security|permission|rls|policy/i.test(message)) {
    return 'Akun ini tidak punya akses ke data toko tersebut. Minta pemilik toko menambahkan Anda.';
  }

  // Bentrokan data yang wajar pada dua perangkat.
  if (hasCode(error, ['23505', '23503'])) {
    return 'Sebagian catatan sudah ada di perangkat lain. Data Anda tidak hilang — coba sinkron lagi.';
  }

  // Batas paket / kuota.
  if (/quota|limit|too many/i.test(message)) {
    return 'Pemakaian toko sudah mendekati batas paket. Data tetap aman di HP ini.';
  }

  return 'Sinkron belum berhasil. Data tetap aman di HP ini — coba lagi sebentar lagi.';
}
