/**
 * Matriks izin per peran.
 *
 * Bila aplikasi berjalan tanpa backend (`role === null`), semua izin dibuka:
 * perangkat itu milik pemilik toko. Begitu login cloud aktif, peran diambil
 * dari tabel `members` dan UI menyembunyikan yang tidak menjadi haknya.
 */
export type Role = 'owner' | 'admin' | 'kasir';

export type Action =
  | 'profit.view'
  | 'product.manage'
  | 'product.delete'
  | 'tx.void'
  | 'kasbon.manage'
  | 'stock.adjust'
  | 'shift.manage'
  | 'member.manage'
  | 'audit.view'
  | 'report.export'
  | 'settings.manage';

const ALL: Action[] = [
  'profit.view',
  'product.manage',
  'product.delete',
  'tx.void',
  'kasbon.manage',
  'stock.adjust',
  'shift.manage',
  'member.manage',
  'audit.view',
  'report.export',
  'settings.manage',
];

const MATRIX: Record<Role, Action[]> = {
  owner: ALL,
  admin: [
    'profit.view',
    'product.manage',
    'product.delete',
    'tx.void',
    'kasbon.manage',
    'stock.adjust',
    'shift.manage',
    'audit.view',
    'report.export',
    'settings.manage',
  ],
  // Kasir: boleh menjual, mencatat kasbon, membuka/menutup shift sendiri, dan
  // melihat laporan tanpa laba. Tidak boleh melihat audit atau mengelola anggota.
  kasir: ['kasbon.manage', 'shift.manage', 'report.export'],
};

/** Role null = mode lokal (tanpa backend) → semua izin terbuka. */
export function can(role: Role | null, action: Action): boolean {
  if (role === null) return true;
  return MATRIX[role].includes(action);
}

/** Apakah peran ini boleh melihat harga modal, laba, dan margin. */
export function canSeeProfit(role: Role | null): boolean {
  return can(role, 'profit.view');
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Pemilik',
  admin: 'Admin',
  kasir: 'Kasir',
};

/** Kalimat izin yang bisa dibaca pemilik toko (bukan nama kode). */
export const ACTION_LABEL: Record<Action, string> = {
  'profit.view': 'Lihat modal, laba, dan margin',
  'product.manage': 'Tambah & ubah barang',
  'product.delete': 'Hapus barang',
  'tx.void': 'Batalkan (void) transaksi',
  'kasbon.manage': 'Catat kasbon & terima cicilan',
  'stock.adjust': 'Koreksi stok (barang rusak/salah hitung)',
  'shift.manage': 'Buka & tutup shift kasir',
  'member.manage': 'Undang & atur anggota toko',
  'audit.view': 'Buka log audit',
  'report.export': 'Lihat laporan & ekspor data',
  'settings.manage': 'Ubah identitas toko & pengaturan',
};

export const ALL_ACTIONS: Action[] = ALL;

/** Daftar izin satu peran, sudah berlabel dan urut seperti di matriks UI. */
export function permissionList(role: Role): { action: Action; label: string; allowed: boolean }[] {
  return ALL_ACTIONS.map((action) => ({
    action,
    label: ACTION_LABEL[action],
    allowed: can(role, action),
  }));
}

/**
 * Ringkasan satu baris untuk tiap peran — dipakai di layar Anggota supaya
 * pemilik langsung tahu bedanya sebelum mengundang orang.
 */
export const ROLE_SUMMARY: Record<Role, string> = {
  owner: 'Semua izin, termasuk mengundang anggota dan menghapus barang.',
  admin: 'Semua izin operasional; tidak bisa mengatur anggota toko.',
  kasir: 'Jual barang, catat kasbon, dan buka/tutup shift. Tidak melihat laba, modal, atau log audit.',
};

/** A missing membership is never treated as local-owner access. */
export function canSession(
  session: { role: Role | null; userId?: string | null; outletId?: string | null },
  action: Action,
  connected: boolean,
): boolean {
  if (!connected) return can(null, action);
  return Boolean(session.userId && session.outletId && session.role && can(session.role, action));
}
