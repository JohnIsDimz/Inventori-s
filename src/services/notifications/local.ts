/**
 * Pengingat jatuh tempo memakai notifikasi LOKAL (bukan push).
 *
 * Kenapa lokal: aplikasi harus tetap berguna tanpa server. Notifikasi lokal
 * dijadwalkan oleh sistem operasi di perangkat, jadi tetap berbunyi walau
 * aplikasi tertutup, tanpa perlu internet maupun Supabase.
 *
 * Semua pemanggilan dibungkus try/catch dan no-op di web: di peramban tidak ada
 * penjadwal notifikasi sistem, dan aplikasi tidak boleh gagal karena itu.
 */
import { Platform } from 'react-native';

import type { ReminderPlan } from './schedule';

/** Notifikasi lokal tidak tersedia di web. */
export const remindersSupported = Platform.OS !== 'web';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

async function load(): Promise<NotificationsModule | null> {
  if (!remindersSupported) return null;
  if (cached !== undefined) return cached;
  try {
    const module = await import('expo-notifications');
    // Android 8+ butuh kanal sebelum notifikasi bisa tampil.
    if (Platform.OS === 'android') {
      await module.setNotificationChannelAsync('pengingat', {
        name: 'Pengingat jatuh tempo',
        importance: module.AndroidImportance.HIGH,
        vibrationPattern: [0, 220, 120, 220],
        lightColor: '#00F5A0',
      });
    }
    module.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    cached = module;
    return module;
  } catch {
    cached = null;
    return null;
  }
}

export type PermissionState = 'granted' | 'denied' | 'unsupported';

export async function ensurePermission(): Promise<PermissionState> {
  const module = await load();
  if (!module) return 'unsupported';
  try {
    const current = await module.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const asked = await module.requestPermissionsAsync();
    return asked.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Batalkan semua pengingat lalu jadwalkan ulang dari daftar terbaru.
 * Mengembalikan jumlah yang benar-benar terjadwal.
 */
export async function rescheduleAll(plans: ReminderPlan[]): Promise<number> {
  const module = await load();
  if (!module) return 0;
  try {
    const state = await ensurePermission();
    if (state !== 'granted') return 0;

    await module.cancelAllScheduledNotificationsAsync();

    let scheduled = 0;
    for (const plan of plans) {
      const at = new Date(plan.at);
      if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) continue;
      await module.scheduleNotificationAsync({
        content: {
          title: plan.title,
          body: plan.body,
          data: { kind: plan.kind, refId: plan.refId, key: plan.key },
        },
        trigger: { type: 'date', date: at, channelId: 'pengingat' } as never,
      });
      scheduled += 1;
    }
    return scheduled;
  } catch {
    return 0;
  }
}

/** Batalkan semua pengingat (dipakai saat pengguna mematikan pengingat). */
export async function cancelAll(): Promise<void> {
  const module = await load();
  if (!module) return;
  try {
    await module.cancelAllScheduledNotificationsAsync();
  } catch {
    // diabaikan: tidak ada yang perlu dibatalkan
  }
}

/** Notifikasi uji untuk memastikan izin & pengaturan baterai benar. */
export async function sendTest(): Promise<boolean> {
  const module = await load();
  if (!module) return false;
  try {
    const state = await ensurePermission();
    if (state !== 'granted') return false;
    await module.scheduleNotificationAsync({
      content: {
        title: 'Pengingat Inventori’s aktif',
        body: 'Beginilah bentuk pengingat jatuh tempo kasbon dan pesanan Anda.',
        data: { kind: 'test' },
      },
      trigger: { type: 'timeInterval', seconds: 3, channelId: 'pengingat' } as never,
    });
    return true;
  } catch {
    return false;
  }
}

/** Jumlah notifikasi yang sedang terjadwal (untuk ditampilkan di layar). */
export async function scheduledCount(): Promise<number> {
  const module = await load();
  if (!module) return 0;
  try {
    const list = await module.getAllScheduledNotificationsAsync();
    return list.length;
  } catch {
    return 0;
  }
}
