/**
 * Peta id lokal ↔ id server.
 *
 * Data lama memakai id buatan aplikasi (`prd_xxx`), sedangkan tabel di server
 * memakai UUID. Peta ini menyimpan pasangannya sekali, sehingga:
 *   - id lokal tidak perlu diubah (semua referensi lama tetap sah), dan
 *   - pengiriman ulang selalu memakai UUID yang sama (idempoten).
 *
 * Data baru tetap mendapat id berawalan, jadi peta ini dipakai untuk semuanya.
 */
import { randomUUID } from 'expo-crypto';
import { localStore } from '../db/local';

const key = (entity: string) => `idmap:${entity}`;

const KNOWN_ENTITIES = [
  'product',
  'stock_delta',
  'transaction',
  'receivable',
  'receivable_payment',
  'payable',
  'payable_payment',
  'category',
  'allocation',
  'shift',
  'order',
  'customer',
  'profile',
] as const;

const KNOWN_CURSORS = [
  'products',
  'transactions',
  'receivables',
  'payables',
  'categories',
  'capital_allocations',
  'orders',
] as const;

type Map = Record<string, string>;

async function readMap(entity: string): Promise<Map> {
  const raw = await localStore.kvGet(key(entity));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Map;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(entity: string, map: Map): Promise<void> {
  await localStore.kvSet(key(entity), JSON.stringify(map));
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** UUID v4 sederhana (tanpa dependensi tambahan). */
export function newUuid(): string {
  return randomUUID();
}

/** id lokal → id server (dibuat bila belum ada). */
export async function toRemoteId(entity: string, localId: string): Promise<string> {
  if (isUuid(localId)) return localId;
  const map = await readMap(entity);
  if (map[localId]) return map[localId];
  const remote = newUuid();
  map[localId] = remote;
  await writeMap(entity, map);
  return remote;
}

/** id server → id lokal (dipakai saat menarik data). */
export async function toLocalId(entity: string, remoteId: string): Promise<string> {
  const map = await readMap(entity);
  for (const [localId, remote] of Object.entries(map)) {
    if (remote === remoteId) return localId;
  }
  // Belum dikenal: pakai id server sebagai id lokal, lalu catat pasangannya.
  map[remoteId] = remoteId;
  await writeMap(entity, map);
  return remoteId;
}

/** Bersihkan seluruh peta ID & kursor sinkron saat keluar akun atau hapus data perangkat. */
export async function clearSyncMetadata(): Promise<void> {
  for (const entity of KNOWN_ENTITIES) {
    await localStore.kvDel(key(entity));
  }
  for (const table of KNOWN_CURSORS) {
    await localStore.kvDel(`sync:kursor:${table}`);
  }
}
