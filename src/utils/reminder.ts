import { Share } from 'react-native';

import { fillReminderTemplate } from '../data/reminders';
import { formatTanggalSingkat } from './format';

export function buildReminderMessage({
  template,
  customerName,
  storeName,
  amount,
  itemCount,
  dueDate,
}: {
  template: string;
  customerName: string;
  storeName: string;
  amount: number;
  itemCount?: number;
  dueDate: string;
}): string {
  // Isi pesan disusun di `data/reminders.ts` supaya aturan yang sama dipakai
  // layar Tagih kasbon dan bisa diuji tanpa React Native.
  const filled = fillReminderTemplate({
    template,
    customerName,
    storeName,
    amount,
    dueDate,
    dateText: formatTanggalSingkat(dueDate),
    itemCount,
  });
  return filled;
}

/** Buka share sheet sistem (WhatsApp/Telegram/SMS) — tanpa perlu API key. */
export async function shareMessage(message: string, title = 'Kirim pengingat'): Promise<void> {
  try {
    await Share.share({ message, title });
  } catch {
    // pengguna membatalkan share sheet — bukan error
  }
}
