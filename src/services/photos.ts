/**
 * Penyimpanan foto nota.
 *
 * Masalah yang diperbaiki: sebelumnya URI dari image picker menunjuk ke folder
 * *cache* yang bisa dihapus OS kapan saja — foto nota hilang tanpa jejak dan
 * gambar di riwayat transaksi menjadi rusak. Sekarang file disalin ke folder
 * dokumen aplikasi (persisten) dan dihapus saat transaksi dihapus.
 */
import { Directory, File, Paths } from 'expo-file-system';

const FOLDER = 'nota';

function fotoDir(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function extensionOf(uri: string): string {
  const match = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  return ext && ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
}

/** Salin foto dari cache kamera/galeri ke penyimpanan permanen aplikasi. */
export async function persistPhoto(sourceUri: string): Promise<string> {
  try {
    const target = new File(fotoDir(), `nota-${Date.now()}.${extensionOf(sourceUri)}`);
    await new File(sourceUri).copy(target);
    return target.uri;
  } catch {
    // Bila penyalinan gagal, minimal jangan sampai aplikasi crash.
    return sourceUri;
  }
}

/** Hapus seluruh folder nota — dipakai saat pengguna menghapus semua data. */
export function clearPhotos(): void {
  try {
    const dir = new Directory(Paths.document, FOLDER);
    if (dir.exists) dir.delete();
  } catch {
    // Abaikan: kegagalan hapus file tidak boleh memblokir reset data.
  }
}

/** Hapus foto milik aplikasi (abaikan file di luar folder nota). */
export function deletePhoto(uri?: string): void {
  if (!uri || !uri.includes(`/${FOLDER}/`)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // File sudah tidak ada — tidak perlu mengganggu pengguna.
  }
}
