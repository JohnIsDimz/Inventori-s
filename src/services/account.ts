import { friendlySyncError } from './sync/errors';
/**
 * Kendali akun: keluar dari toko, serah terima, dan hapus akun.
 *
 * Semua aturan sebenarnya ada di server (fungsi `leave_outlet`,
 * `transfer_ownership`, `account_delete_preview`, `delete_my_account` di migrasi
 * 0009). Berkas ini hanya pembungkus tipis supaya layar tidak perlu tahu nama
 * parameter atau bentuk baris yang dikembalikan.
 *
 * Di mode lokal (tanpa server) tidak ada akun: fungsi di sini menolak dengan
 * pesan yang bisa dibaca pengguna, bukan melempar galat teknis.
 */
import { isCloudEnabled, supabase } from './supabase/client';

export interface DeletePreview {
  canDelete: boolean;
  outletsOwned: number;
  memberships: number;
  blockedOutlets: number;
  reason: string | null;
}

const CLOUD_ONLY = 'Fitur ini hanya berlaku untuk akun toko. Perangkat ini belum masuk akun.';

const fail = (message: string): never => {
  throw new Error(message);
};

const client = () => {
  if (!isCloudEnabled || !supabase) return null;
  return supabase;
};

/** Apa yang akan hilang bila akun dihapus — dipanggil sebelum konfirmasi. */
export async function previewAccountDelete(): Promise<DeletePreview> {
  const sb = client();
  if (!sb) fail(CLOUD_ONLY);

  const { data, error } = await sb!.rpc('account_delete_preview');
  if (error) fail(friendlySyncError(error));

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    canDelete: raw.can_delete === true,
    outletsOwned: Number(raw.outlets_owned ?? 0),
    memberships: Number(raw.memberships ?? 0),
    blockedOutlets: Number(raw.blocked_outlets ?? 0),
    reason: typeof raw.reason === 'string' && raw.reason ? raw.reason : null,
  };
}

/** Hapus akun: seluruh data toko milik sendiri + keanggotaan + profil. */
export async function deleteMyAccount(): Promise<{ outletsDeleted: number; membershipsRemoved: number }> {
  const sb = client();
  if (!sb) fail(CLOUD_ONLY);

  const { data, error } = await sb!.rpc('delete_my_account');
  if (error) fail(friendlySyncError(error));

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    outletsDeleted: Number(raw.outlets_deleted ?? 0),
    membershipsRemoved: Number(raw.memberships_removed ?? 0),
  };
}

/** Kasir/admin keluar dari toko. Pemilik harus menyerahkan toko lebih dulu. */
export async function leaveOutlet(outletId: string): Promise<void> {
  const sb = client();
  if (!sb) fail(CLOUD_ONLY);

  const { error } = await sb!.rpc('leave_outlet', { p_outlet: outletId });
  if (error) fail(friendlySyncError(error));
}

/** Serahkan kepemilikan toko ke anggota lain (pemilik lama menjadi admin). */
export async function transferOwnership(outletId: string, userId: string): Promise<void> {
  const sb = client();
  if (!sb) fail(CLOUD_ONLY);

  const { error } = await sb!.rpc('transfer_ownership', { p_outlet: outletId, p_to: userId });
  if (error) fail(friendlySyncError(error));
}
