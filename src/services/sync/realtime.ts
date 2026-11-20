/**
 * Supabase Realtime.
 *
 * Tanpa ini, perangkat kasir baru tahu ada transaksi dari perangkat lain
 * setelah interval sinkron (30 detik). Dengan langganan perubahan, aplikasi
 * memicu `syncSoon()` hampir seketika.
 *
 * Syarat di sisi Supabase: tabel sudah masuk publication `supabase_realtime`
 * (dilakukan migrasi 0004) dan RLS mengizinkan pembacaan.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

import { isCloudEnabled, requireSupabase } from '../supabase/client';

let channel: RealtimeChannel | null = null;

export function startRealtime(outletId: string, onChange: () => void): void {
  stopRealtime();
  if (!isCloudEnabled || !outletId) return;

  try {
    const sb = requireSupabase();
    channel = sb
      .channel(`outlet:${outletId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `outlet_id=eq.${outletId}` },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `outlet_id=eq.${outletId}` },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `outlet_id=eq.${outletId}` },
        () => onChange(),
      )
      .subscribe();
  } catch {
    channel = null;
  }
}

export function stopRealtime(): void {
  if (!channel) return;
  void channel.unsubscribe();
  channel = null;
}

export function realtimeActive(): boolean {
  return channel !== null;
}
