/**
 * Jembatan penyimpanan Zustand → SQLite, plus migrasi sekali jalan dari
 * AsyncStorage (versi aplikasi sebelumnya).
 *
 * Urutan yang dijaga:
 *   1. Saat pertama kali dibuka, data lama di AsyncStorage disalin ke SQLite.
 *   2. Baru setelah itu `persist` membaca state dari SQLite.
 * Ini mencegah layar sempat menampilkan 0 karena data lama belum tersalin.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { localStore } from './local';

const PRIMARY_KEY = 'inventoris-store-v1';
const LEGACY_KEYS = ['warunglui-store-v1'];
const MIGRATED_FLAG = 'migrasi:asyncstorage:v1';

let ready: Promise<void> | null = null;

async function migrateLegacy(): Promise<void> {
  try {
    if (await localStore.kvGet(MIGRATED_FLAG)) return;

    for (const key of [PRIMARY_KEY, ...LEGACY_KEYS]) {
      const already = await localStore.kvGet(key);
      if (already) continue;
      const raw = await AsyncStorage.getItem(key);
      if (raw) await localStore.kvSet(key, raw);
    }

    // Kunci baru selalu punya isi bila data lama ada, supaya pembacaan
    // berikutnya tidak perlu menyentuh AsyncStorage lagi.
    const primary = await localStore.kvGet(PRIMARY_KEY);
    if (!primary) {
      for (const key of LEGACY_KEYS) {
        const legacy = await AsyncStorage.getItem(key);
        if (legacy) {
          await localStore.kvSet(PRIMARY_KEY, legacy);
          break;
        }
      }
    }

    await localStore.kvSet(MIGRATED_FLAG, new Date().toISOString());
  } catch {
    // Jangan pernah mengunci aplikasi hanya karena migrasi gagal.
  }
}

export function ensureStorageReady(): Promise<void> {
  if (!ready) ready = migrateLegacy();
  return ready;
}

/** Adapter `createJSONStorage` yang dipakai store Zustand. */
export const localJsonStorage = {
  getItem: async (name: string): Promise<string | null> => {
    await ensureStorageReady();
    return localStore.kvGet(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await ensureStorageReady();
    await localStore.kvSet(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await ensureStorageReady();
    await localStore.kvDel(name);
  },
};
