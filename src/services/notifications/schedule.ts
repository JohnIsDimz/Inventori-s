/**
 * Menyusun jadwal pengingat jatuh tempo — murni, tanpa notifikasi & tanpa state.
 *
 * Yang diingatkan:
 *   - kasbon pelanggan yang belum lunas, H-1 dan pada hari jatuh tempo;
 *   - pesanan yang belum diambil, H-1 dan pada hari janji;
 *   - stok barang yang sudah menyentuh batas minimum (Sprint 17);
 *   - harga beli yang naik ≥ 5% dibanding kulakan sebelumnya (Sprint 17).
 *
 * Kenapa dihitung sendiri, bukan "ulangi tiap hari"? Karena pengingat harus
 * berbunyi pada tanggal yang tepat (jam 08.00 pagi) walau aplikasi tidak dibuka.
 * Aplikasi cukup menjadwalkan ulang setiap kali data berubah atau dibuka.
 */
import type { Order, Product, Purchase, Receivable } from '../../data/types';
import { lowStockItems, lowStockNotice, priceRiseItems, priceRiseNotice } from '../../data/stock-alerts';

export interface ReminderPlan {
  /** Kunci unik untuk membatalkan/menjadwalkan ulang. */
  key: string;
  kind: 'kasbon' | 'pesanan' | 'stok' | 'harga';
  refId: string;
  title: string;
  body: string;
  /** Waktu notifikasi (ISO). */
  at: string;
}

export interface BuildInput {
  receivables: Receivable[];
  orders: Order[];
  /** Barang cabang aktif (opsional) — sumber peringatan stok menipis. */
  products?: Product[];
  /** Riwayat kulakan (opsional) — sumber peringatan harga beli naik. */
  purchases?: Purchase[];
  /** Jam pengingat (0–23), default 8 pagi. */
  hour?: number;
  now?: Date;
  /** Maksimal notifikasi yang dijadwalkan (sistem membatasi ±64 di iOS). */
  limit?: number;
}

const paidOf = (receivable: Receivable): number =>
  (receivable.payments ?? []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

const formatRupiahPlain = (value: number): string => {
  const rounded = Math.round(Number(value) || 0);
  return `Rp ${rounded.toLocaleString('id-ID')}`;
};

/** Pukul `hour:00` pada tanggal `date` (waktu lokal). */
function atHour(date: Date, hour: number): Date {
  const copy = new Date(date);
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Susun daftar notifikasi. Hasil selalu terurut berdasarkan waktu dan tidak
 * pernah berisi waktu yang sudah lewat.
 */
export function buildReminders(input: BuildInput): ReminderPlan[] {
  const now = input.now ?? new Date();
  const hour = typeof input.hour === 'number' ? Math.min(23, Math.max(0, Math.round(input.hour))) : 8;
  const limit = input.limit ?? 40;
  const plans: ReminderPlan[] = [];

  const push = (base: Date, daysBefore: number, factory: (at: Date) => ReminderPlan) => {
    const target = new Date(base);
    target.setDate(target.getDate() - daysBefore);
    const at = atHour(target, hour);
    if (at.getTime() <= now.getTime()) return;
    plans.push(factory(at));
  };

  for (const receivable of input.receivables) {
    const remaining = Math.max(0, (Number(receivable.amount) || 0) - paidOf(receivable));
    if (remaining <= 0) continue;
    const due = new Date(receivable.dueDate);
    if (Number.isNaN(due.getTime())) continue;

    const name = receivable.customerName?.trim() || 'Pelanggan';
    const amount = formatRupiahPlain(remaining);

    push(due, 1, (at) => ({
      key: `kasbon:${receivable.id}:h1:${dayKey(at)}`,
      kind: 'kasbon',
      refId: receivable.id,
      title: `Besok: kasbon ${name}`,
      body: `Sisa ${amount}. Siapkan pesan pengingat dari menu Kasbon.`,
      at: at.toISOString(),
    }));
    push(due, 0, (at) => ({
      key: `kasbon:${receivable.id}:due:${dayKey(at)}`,
      kind: 'kasbon',
      refId: receivable.id,
      title: `Hari ini jatuh tempo: ${name}`,
      body: `Sisa kasbon ${amount} seharusnya dibayar hari ini.`,
      at: at.toISOString(),
    }));
  }

  for (const order of input.orders) {
    if (order.status !== 'terbuka' || !order.dueDate) continue;
    const due = new Date(order.dueDate);
    if (Number.isNaN(due.getTime())) continue;

    const name = order.customerName?.trim() || 'Pelanggan';
    const remaining = Math.max(0, (Number(order.total) || 0) - (Number(order.deposit) || 0));
    const tail = remaining > 0 ? ` Sisa ${formatRupiahPlain(remaining)}.` : ' Sudah lunas (DP).';

    push(due, 1, (at) => ({
      key: `pesanan:${order.id}:h1:${dayKey(at)}`,
      kind: 'pesanan',
      refId: order.id,
      title: `Besok diambil: ${name}`,
      body: `Siapkan pesanan sebelum pelanggan datang.${tail}`,
      at: at.toISOString(),
    }));
    push(due, 0, (at) => ({
      key: `pesanan:${order.id}:due:${dayKey(at)}`,
      kind: 'pesanan',
      refId: order.id,
      title: `Hari ini diambil: ${name}`,
      body: `Jadikan transaksi saat barang diserahkan.${tail}`,
      at: at.toISOString(),
    }));
  }

  // Peringatan stok & harga beli dikirim pada jam pengingat berikutnya, sekali
  // sehari, supaya tidak menumpuk jadi banyak notifikasi.
  const nextSlot = ((): Date => {
    const today = atHour(now, hour);
    if (today.getTime() > now.getTime()) return today;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  })();
  const slotKey = dayKey(nextSlot);
  const atText = nextSlot.toISOString();

  const lowNotice = lowStockNotice(lowStockItems(input.products ?? []));
  if (lowNotice) {
    plans.push({
      key: `stok:sisa:${slotKey}`,
      kind: 'stok',
      refId: 'stok',
      title: lowNotice.title,
      body: lowNotice.body,
      at: atText,
    });
  }

  const riseNotice = priceRiseNotice(priceRiseItems(input.purchases ?? [], input.products ?? []));
  if (riseNotice) {
    plans.push({
      key: `harga:naik:${slotKey}`,
      kind: 'harga',
      refId: 'harga',
      title: riseNotice.title,
      body: riseNotice.body,
      at: atText,
    });
  }

  // Buang duplikat (satu pesanan bisa muncul dari dua sumber) & batasi jumlah.
  const seen = new Set<string>();
  return plans
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .filter((plan) => {
      if (seen.has(plan.key)) return false;
      seen.add(plan.key);
      return true;
    })
    .slice(0, limit);
}

/** Ringkasan singkat untuk layar: "3 pengingat • berikutnya besok 08.00". */
export function summarize(plans: ReminderPlan[], now = new Date()): string {
  if (plans.length === 0) return 'Tidak ada pengingat terjadwal.';
  const next = new Date(plans[0].at);
  const days = Math.round(
    (new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  const when =
    days <= 0 ? 'hari ini' : days === 1 ? 'besok' : days < 7 ? `${days} hari lagi` : next.toLocaleDateString('id-ID');
  const time = `${String(next.getHours()).padStart(2, '0')}.${String(next.getMinutes()).padStart(2, '0')}`;
  return `${plans.length} pengingat • berikutnya ${when} ${time}`;
}
