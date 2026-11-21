/**
 * Klien sinkron (nonaktif pada rilis tanpa akun — lihat `src/config/release.ts`).
 *
 * Aplikasi tetap berjalan penuh tanpa backend:
 *   - Bila `EXPO_PUBLIC_SUPABASE_URL` dan `EXPO_PUBLIC_SUPABASE_ANON_KEY` kosong,
 *     `isCloudEnabled` = false dan aplikasi memakai mode lokal (seperti versi
 *     sebelumnya) tanpa memanggil jaringan sama sekali.
 *   - Bila diisi, aplikasi meminta login lalu menyinkronkan data ke Supabase.
 *
 * Penyimpanan sesi memakai Keychain / EncryptedSharedPreferences melalui
 * `expo-secure-store` (dipecah per potongan bila melebihi batas 2 KB Android),
 * dengan `sessionStorage` di web; penyimpanan tidak aman tidak dipakai
 * sebagai cadangan bila modul penyimpanan aman gagal.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { ACCOUNTS_ENABLED } from '../../config/release';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

type SecureStoreModule = typeof import('expo-secure-store');
const CHUNK_LEN = 1800;
const COUNT_SUFFIX = '__chunks';

let secureMod: SecureStoreModule | null | undefined;

function getSecureStore(): SecureStoreModule | null {
  if (secureMod !== undefined) return secureMod;
  if (Platform.OS === 'web') {
    secureMod = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    secureMod = require('expo-secure-store') as SecureStoreModule;
    return secureMod;
  } catch {
    secureMod = null;
    return null;
  }
}

function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const secureAuthStorage = {
  async getItem(rawKey: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        const session = window.sessionStorage.getItem(rawKey);
        await AsyncStorage.removeItem(rawKey);
        return session;
      } catch {
        return null;
      }
    }
    const sec = getSecureStore();
    if (!sec) throw new Error('Penyimpanan aman tidak tersedia. Perbarui aplikasi.');

    try {
      const key = safeKey(rawKey);
      const countRaw = await sec.getItemAsync(`${key}${COUNT_SUFFIX}`);
      if (countRaw) {
        const count = Number(countRaw);
        if (Number.isInteger(count) && count > 0 && count <= 64) {
          const parts: string[] = [];
          for (let i = 0; i < count; i += 1) {
            const part = await sec.getItemAsync(`${key}__${i}`);
            if (part === null) return null;
            parts.push(part);
          }
          return parts.join('');
        }
      }
      const direct = await sec.getItemAsync(key);
      if (direct !== null) return direct;

      // Migrasi satu arah bila sesi lama masih tersimpan di AsyncStorage
      const legacy = await AsyncStorage.getItem(rawKey);
      if (legacy !== null) {
        await secureAuthStorage.setItem(rawKey, legacy);
        await AsyncStorage.removeItem(rawKey).catch(() => {});
      }
      return legacy;
    } catch {
      throw new Error('Sesi tidak bisa dibaca dengan aman. Coba masuk lagi.');
    }
  },

  async setItem(rawKey: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        window.sessionStorage.setItem(rawKey, value);
        await AsyncStorage.removeItem(rawKey);
        return;
      } catch {
        throw new Error('Penyimpanan sesi tidak tersedia. Izinkan penyimpanan untuk masuk.');
      }
    }
    const sec = getSecureStore();
    if (!sec) throw new Error('Penyimpanan aman tidak tersedia. Perbarui aplikasi.');

    try {
      const key = safeKey(rawKey);
      await secureAuthStorage.removeItem(rawKey);
      if (value.length <= CHUNK_LEN) {
        await sec.setItemAsync(key, value);
        return;
      }
      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += CHUNK_LEN) {
        chunks.push(value.slice(offset, offset + CHUNK_LEN));
      }
      for (let i = 0; i < chunks.length; i += 1) {
        await sec.setItemAsync(`${key}__${i}`, chunks[i]);
      }
      await sec.setItemAsync(`${key}${COUNT_SUFFIX}`, String(chunks.length));
    } catch {
      throw new Error('Sesi tidak bisa disimpan dengan aman. Coba masuk lagi.');
    }
  },

  async removeItem(rawKey: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        window.sessionStorage.removeItem(rawKey);
      } catch {
        // abaikan
      }
    }
    const sec = getSecureStore();
    if (sec) {
      try {
        const key = safeKey(rawKey);
        const countRaw = await sec.getItemAsync(`${key}${COUNT_SUFFIX}`);
        const parsed = countRaw ? Number(countRaw) : 0;
        const count = Number.isInteger(parsed) && parsed >= 0 && parsed <= 64 ? parsed : 0;
        for (let i = 0; i < count; i += 1) {
          await sec.deleteItemAsync(`${key}__${i}`).catch(() => {});
        }
        await sec.deleteItemAsync(`${key}${COUNT_SUFFIX}`).catch(() => {});
        await sec.deleteItemAsync(key).catch(() => {});
      } catch {
        // abaikan
      }
    }
    await AsyncStorage.removeItem(rawKey).catch(() => {});
  },
};

/**
 * True hanya bila build ini memang memakai akun DAN kuncinya tersedia.
 * Rilis Play Store memakai `ACCOUNTS_ENABLED = false`, jadi aplikasi selalu
 * berjalan tanpa akun walau environment terisi.
 */
export const isCloudEnabled = ACCOUNTS_ENABLED && url.length > 0 && anonKey.length > 0;

export const supabase: SupabaseClient | null = isCloudEnabled
  ? createClient(url, anonKey, {
      auth: {
        storage: secureAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: { headers: { 'x-application-name': 'inventoris-app' } },
    })
  : null;

/** Ambil klien atau lempar error yang jelas (dipakai mesin sinkron). */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Sinkronisasi belum diaktifkan di perangkat ini.');
  }
  return supabase;
}
