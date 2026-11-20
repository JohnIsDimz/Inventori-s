/**
 * Penjadwalan otomatis pengingat jatuh tempo.
 *
 * Dipanggil dari `app/_layout.tsx` setiap kali kasbon/pesanan berubah. Diberi
 * jeda (debounce) supaya input cepat — mis. menambah 5 barang ke pesanan — tidak
 * menjadwalkan ulang notifikasi 5 kali.
 */
import type { Order, Product, Purchase, Receivable } from '../../data/types';
import { cancelAll, remindersSupported, rescheduleAll } from './local';
import { buildReminders } from './schedule';

const DEBOUNCE_MS = 4_000;

/** Kembalikan fungsi pembatal untuk dipakai `useEffect`. */
export function remsyncReminders(input: {
  enabled: boolean;
  hour: number;
  receivables: Receivable[];
  orders: Order[];
  /** Barang cabang aktif — dipakai peringatan stok menipis. */
  products?: Product[];
  /** Riwayat kulakan — dipakai peringatan harga beli naik. */
  purchases?: Purchase[];
}): () => void {
  if (!remindersSupported) return () => {};

  const timer = setTimeout(() => {
    void (async () => {
      if (!input.enabled) {
        await cancelAll();
        return;
      }
      await rescheduleAll(
        buildReminders({
          receivables: input.receivables,
          orders: input.orders,
          products: input.products,
          purchases: input.purchases,
          hour: input.hour,
        }),
      );
    })();
  }, DEBOUNCE_MS);

  return () => clearTimeout(timer);
}
