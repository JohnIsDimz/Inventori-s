/**
 * Antrean keluar (outbox).
 *
 * Setiap mutasi di store memanggil `enqueue()` — termasuk saat mode lokal,
 * supaya data yang sudah ada tetap terkirim ketika pengguna kelak mengaktifkan
 * mode cloud. Pengiriman sebenarnya dilakukan `engine.ts`.
 */
import { localStore } from '../db/local';
import { newUuid } from './idmap';

export type SyncEntity =
  | 'product'
  /** Perubahan stok sebagai delta (sprint 2) — bukan angka absolut. */
  | 'stock_delta'
  | 'transaction'
  | 'receivable'
  | 'receivable_payment'
  | 'payable'
  | 'payable_payment'
  | 'category'
  | 'allocation'
  | 'shift'
  | 'order'
  | 'profile';

export interface EnqueuedRef {
  entity: SyncEntity;
  id: string;
}

/** Catat perubahan untuk dikirim nanti. Tidak pernah melempar error ke UI. */
export async function enqueue(
  entity: SyncEntity,
  op: 'upsert' | 'delete',
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await localStore.enqueue({
      id: `op_${newUuid()}`,
      entity,
      op,
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  } catch {
    // Penyimpanan penuh / tidak tersedia: aplikasi tetap jalan, perubahan
    // hanya belum terkirim.
  }
}

/** Id lokal yang masih punya perubahan belum terkirim (dipakai saat merge). */
export async function pendingLocalIds(): Promise<Set<string>> {
  try {
    const ops = await localStore.pending(500);
    const ids = new Set<string>();
    for (const op of ops) {
      try {
        const payload = JSON.parse(op.payload) as { id?: string };
        if (payload.id) ids.add(payload.id);
      } catch {
        // payload rusak: diabaikan
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

export async function clearOutbox(): Promise<void> {
  await localStore.clearOutbox();
}
