/**
 * Pesanan / kuotasi — hitungan & teks yang dipakai layar Pesanan.
 *
 * Semua fungsi di sini murni (tanpa state, tanpa jaringan) supaya bisa diuji di
 * Node (`npm run test:orders`) dan angkanya sama dengan yang dihitung server
 * (`sync_order` di `supabase/migrations/0010_sprint8.sql`).
 */
import type { Order, OrderItem } from './types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Total pesanan = Σ (qty × harga). Diskon & pajak menyusul saat jadi transaksi. */
export function orderTotal(items: OrderItem[]): number {
  return round2(
    items.reduce((sum, item) => {
      const qty = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 0;
      const price = Number.isFinite(item.price) && item.price > 0 ? item.price : 0;
      return sum + qty * price;
    }, 0),
  );
}

/** Buang baris yang tidak masuk akal; nama selalu diisi supaya struk tetap terbaca. */
export function normalizeOrderItems(items: OrderItem[]): OrderItem[] {
  const cleaned: OrderItem[] = [];
  for (const item of items) {
    const name = (item.name ?? '').trim().slice(0, 80);
    const qty = Number(item.qty);
    const price = Number(item.price);
    if (!name) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    cleaned.push({
      productId: item.productId || undefined,
      name,
      qty: round2(qty),
      price: round2(price),
      note: item.note?.trim().slice(0, 120) || undefined,
    });
  }
  return cleaned;
}

/** Sisa yang harus dibayar saat pesanan diambil (total − DP). */
export function orderRemaining(order: Pick<Order, 'total' | 'deposit'>): number {
  const deposit = Number(order.deposit ?? 0);
  if (!Number.isFinite(deposit) || deposit <= 0) return round2(order.total);
  return Math.max(0, round2(order.total - deposit));
}

/** DP dianggap lunas bila menutup seluruh total. */
export function orderIsPaidOff(order: Pick<Order, 'total' | 'deposit'>): boolean {
  return orderRemaining(order) <= 0;
}

/** "3 barang • 5 pcs" untuk kartu daftar pesanan. */
export function orderItemSummary(items: OrderItem[]): string {
  if (items.length === 0) return 'Tanpa barang';
  const units = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const lines = items.length === 1 ? items[0].name : `${items.length} jenis barang`;
  return `${lines} • ${round2(units)} unit`;
}

/**
 * Teks siap kirim ke WhatsApp: pesanan, jumlah, harga, dan total.
 * Tanpa emoji dan tanpa tabel — supaya rapi di semua aplikasi chat.
 */
export function orderShareText(order: Order, storeName: string): string {
  const lines: string[] = [];
  lines.push(`Pesanan dari ${storeName || 'toko kami'}`);
  lines.push(`Untuk: ${order.customerName || 'Pelanggan'}`);
  if (order.dueDate) {
    const date = new Date(order.dueDate);
    if (!Number.isNaN(date.getTime())) {
      lines.push(`Diambil/dikirim: ${date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })}`);
    }
  }
  lines.push('');
  for (const item of order.items) {
    lines.push(
      `- ${item.name} ${item.qty} x ${formatPlain(item.price)} = ${formatPlain(item.qty * item.price)}`,
    );
  }
  lines.push('');
  lines.push(`Total: ${formatPlain(orderTotal(order.items))}`);
  if (order.note) {
    lines.push('');
    lines.push(`Catatan: ${order.note}`);
  }
  lines.push('');
  lines.push('Barang belum dipesan sebelum dikonfirmasi. Terima kasih.');
  return lines.join('\n');
}

/** Format rupiah tanpa pemisah spasi setelah "Rp" agar aman di semua aplikasi chat. */
function formatPlain(value: number): string {
  const rounded = Math.round(Number(value) || 0);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return `${sign}Rp ${out}`;
}

export type OrderDueTone = 'aman' | 'dekat' | 'lewat' | 'tanpa';

/**
 * Status tenggat pesanan:
 * - `tanpa`  : tidak ada tanggal janji;
 * - `lewat`  : tanggalnya sudah lewat dan pesanan masih terbuka;
 * - `dekat`  : hari ini / besok;
 * - `aman`   : lebih dari besok.
 */
export function orderDueTone(order: Order, now = new Date()): OrderDueTone {
  if (!order.dueDate) return 'tanpa';
  const due = new Date(order.dueDate);
  if (Number.isNaN(due.getTime())) return 'tanpa';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(due) - startOf(now)) / 86_400_000);
  if (diffDays < 0) return order.status === 'terbuka' ? 'lewat' : 'aman';
  if (diffDays <= 1) return 'dekat';
  return 'aman';
}

export const ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  terbuka: 'Terbuka',
  selesai: 'Selesai',
  batal: 'Batal',
};
