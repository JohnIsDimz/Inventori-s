/**
 * Klien sinkron (nonaktif pada rilis tanpa akun — lihat `src/config/release.ts`).
 *
 * Aplikasi tetap berjalan penuh tanpa backend:
 *   - Bila `EXPO_PUBLIC_SUPABASE_URL` dan `EXPO_PUBLIC_SUPABASE_ANON_KEY` kosong,
 *     `isCloudEnabled` = false dan aplikasi memakai mode lokal (seperti versi
 *     sebelumnya) tanpa memanggil jaringan sama sekali.
 *   - Bila diisi, aplikasi meminta login lalu menyinkronkan data ke Supabase.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ACCOUNTS_ENABLED } from '../../config/release';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/**
 * True hanya bila build ini memang memakai akun DAN kuncinya tersedia.
 * Rilis Play Store memakai `ACCOUNTS_ENABLED = false`, jadi aplikasi selalu
 * berjalan tanpa akun walau environment terisi.
 */
export const isCloudEnabled = ACCOUNTS_ENABLED && url.length > 0 && anonKey.length > 0;

export const supabase: SupabaseClient | null = isCloudEnabled
  ? createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
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
    throw new Error('Sinkronisasi belum tersedia di perangkat ini.');
  }
  return supabase;
}
