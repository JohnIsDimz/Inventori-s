/**
 * Buku pelanggan & nilai kesetiaan (Sprint 11).
 *
 * Semua fungsi di sini MURNI: tanpa state, tanpa jaringan, tanpa UI. Diuji
 * lewat `npm run test:customers`, sehingga aturan poin dan pencocokan nama
 * tidak bisa diam-diam berubah saat layar dirapikan.
 *
 * Alasan desain:
 *   - Kasbon lama hanya menyimpan NAMA. Karena itu pelanggan dicocokkan lewat
 *     `customerId` bila ada, dan lewat nama yang dinormalkan bila belum —
 *     supaya riwayat belanja lama tetap ikut terbaca setelah buku pelanggan
 *     dibuat.
 *   - Poin dihitung dari nilai belanja (bukan disimpan), jadi tidak mungkin
 *     dobel saat data dipulihkan dari cadangan atau digabung antar-HP.
 */
import type { Customer, Order, Receivable, Transaction } from './types';

/** Rp 10.000 belanja = 1 poin. Angka bulat supaya mudah dijelaskan ke pembeli. */
export const POINT_PER_RUPIAH = 10_000;

export interface LoyaltyTier {
  /** 0 = baru, 1 = sering, 2 = langganan. */
  level: 0 | 1 | 2;
  label: string;
  /** Nilai belanja yang harus dicapai untuk naik tingkat (null = sudah puncak). */
  nextAt: number | null;
}

export const TIER_SERING = 150_000;
export const TIER_LANGGANAN = 1_000_000;

/** Nama disimpan rapi: spasi ganda dirapatkan, dipotong 60 karakter. */
export function cleanCustomerName(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Kunci pencocokan nama: huruf kecil tanpa spasi/tanda baca. */
export function customerKey(name: string | undefined | null): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Nomor HP diseragamkan ke bentuk 62… supaya tautan WhatsApp selalu benar,
 * baik pengguna mengetik 0812…, +62 812…, maupun 812… .
 */
export function normalizePhone(raw: string | undefined | null): string | undefined {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return undefined;
  let value = digits;
  if (value.startsWith('620')) value = `62${value.slice(3)}`;
  else if (value.startsWith('62')) value = value;
  else if (value.startsWith('0')) value = `62${value.slice(1)}`;
  else if (value.startsWith('8')) value = `62${value}`;
  return value.slice(0, 15);
}

/** Nomor siap dibaca kasir: 0812-3456-7890. */
export function displayPhone(raw: string | undefined | null): string {
  const normalized = normalizePhone(raw);
  if (!normalized) return '';
  const local = normalized.startsWith('62') ? `0${normalized.slice(2)}` : normalized;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

export interface CustomerInput {
  name: string;
  phone?: string;
  note?: string;
}

export type CustomerValidation =
  | { ok: true; value: { name: string; phone?: string; note?: string } }
  | { ok: false; reason: string };

/** Validasi isian buku pelanggan. Pesan galat ditulis untuk pemilik warung. */
export function validateCustomer(input: CustomerInput): CustomerValidation {
  const name = cleanCustomerName(input.name);
  if (!name) return { ok: false, reason: 'Nama pelanggan wajib diisi.' };
  if (name.length < 2) return { ok: false, reason: 'Nama pelanggan terlalu pendek.' };

  const phone = normalizePhone(input.phone);
  if (input.phone && input.phone.trim() && phone && (phone.length < 9 || phone.length > 15)) {
    return { ok: false, reason: 'Nomor HP belum benar. Contoh: 0812 3456 7890.' };
  }
  if (input.phone && input.phone.trim() && !phone) {
    return { ok: false, reason: 'Nomor HP hanya boleh berisi angka.' };
  }

  const note = String(input.note ?? '').trim().slice(0, 160) || undefined;
  return { ok: true, value: { name, phone, note } };
}

/** Cari pelanggan yang namanya sama (tanpa membedakan huruf besar/spasi). */
export function matchCustomer(
  customers: Customer[] | undefined,
  name: string | undefined | null,
): Customer | undefined {
  const key = customerKey(name);
  if (!key) return undefined;
  return (customers ?? []).find((customer) => customerKey(customer.name) === key);
}

/** Pencarian di daftar pelanggan: nama atau nomor HP. */
export function searchCustomers(customers: Customer[], query: string): Customer[] {
  const text = query.trim().toLowerCase();
  if (!text) return customers;
  const typed = text.replace(/[^\d]/g, '');
  // Kasir bisa mengetik 0812… maupun 62812…; keduanya harus ketemu.
  const normalized = normalizePhone(typed) ?? '';
  return customers.filter((customer) => {
    if (customer.name.toLowerCase().includes(text)) return true;
    if (!typed) return false;
    const phone = normalizePhone(customer.phone) ?? '';
    return phone.includes(typed) || (normalized !== '' && phone.includes(normalized));
  });
}

export function loyaltyPoints(totalSpend: number): number {
  if (!Number.isFinite(totalSpend) || totalSpend <= 0) return 0;
  return Math.floor(totalSpend / POINT_PER_RUPIAH);
}

export function loyaltyTier(totalSpend: number): LoyaltyTier {
  const spend = Number.isFinite(totalSpend) ? Math.max(0, totalSpend) : 0;
  if (spend >= TIER_LANGGANAN) return { level: 2, label: 'Langganan setia', nextAt: null };
  if (spend >= TIER_SERING) return { level: 1, label: 'Sering belanja', nextAt: TIER_LANGGANAN };
  return { level: 0, label: 'Pelanggan baru', nextAt: TIER_SERING };
}

export interface CustomerStats {
  /** Total nilai belanja (semua penjualan yang tercatat untuk pelanggan ini). */
  totalSpend: number;
  /** Jumlah kali belanja. */
  visits: number;
  points: number;
  tier: LoyaltyTier;
  /** Sisa kasbon yang belum dibayar. */
  kasbonOpen: number;
  /** Jumlah kasbon yang belum lunas. */
  kasbonCount: number;
  /** Waktu belanja terakhir (ISO) atau null. */
  lastVisitAt: string | null;
}

interface HistorySource {
  transactions: Transaction[];
  receivables?: Receivable[];
  orders?: Order[];
}

/**
 * Riwayat satu pelanggan.
 *
 * Transaksi kasbon lama tidak menyimpan nama, tetapi menyimpan `receivableId`.
 * Jadi transaksi dihitung sebagai milik pelanggan bila: `customerId` sama,
 * atau kasbonnya milik pelanggan ini (id maupun nama).
 */
export function customerHistory(
  source: HistorySource,
  customer: Pick<Customer, 'id' | 'name'>,
): { transactions: Transaction[]; receivables: Receivable[]; orders: Order[] } {
  const key = customerKey(customer.name);

  const receivables = (source.receivables ?? []).filter(
    (receivable) =>
      receivable.customerId === customer.id || customerKey(receivable.customerName) === key,
  );
  const receivableIds = new Set(receivables.map((receivable) => receivable.id));

  const transactions = source.transactions.filter((tx) => {
    if (tx.customerId === customer.id) return true;
    if (tx.receivableId && receivableIds.has(tx.receivableId)) return true;
    return false;
  });

  const orders = (source.orders ?? []).filter(
    (order) => order.customerId === customer.id || customerKey(order.customerName) === key,
  );

  return { transactions, receivables, orders };
}

export function customerStats(
  source: HistorySource,
  customer: Pick<Customer, 'id' | 'name'>,
): CustomerStats {
  const history = customerHistory(source, customer);

  let totalSpend = 0;
  let visits = 0;
  let lastVisitAt: string | null = null;

  for (const tx of history.transactions) {
    if (tx.type !== 'sale') continue;
    totalSpend += tx.amount;
    visits += 1;
    if (!lastVisitAt || new Date(tx.createdAt).getTime() > new Date(lastVisitAt).getTime()) {
      lastVisitAt = tx.createdAt;
    }
  }

  let kasbonOpen = 0;
  let kasbonCount = 0;
  for (const receivable of history.receivables) {
    const paid = receivable.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const remaining = Math.max(0, receivable.amount - paid);
    if (remaining > 0) {
      kasbonOpen += remaining;
      kasbonCount += 1;
    }
  }

  return {
    totalSpend,
    visits,
    points: loyaltyPoints(totalSpend),
    tier: loyaltyTier(totalSpend),
    kasbonOpen,
    kasbonCount,
    lastVisitAt,
  };
}

export interface CustomerRow {
  customer: Customer;
  stats: CustomerStats;
}

/** Daftar pelanggan + ringkasannya, diurutkan dari yang paling sering belanja. */
export function customerRows(source: HistorySource & { customers?: Customer[] }): CustomerRow[] {
  return (source.customers ?? [])
    .map((customer) => ({ customer, stats: customerStats(source, customer) }))
    .sort((a, b) => {
      if (b.stats.totalSpend !== a.stats.totalSpend) return b.stats.totalSpend - a.stats.totalSpend;
      return a.customer.name.localeCompare(b.customer.name);
    });
}

/** Sisa belanja untuk naik tingkat; 0 bila sudah di puncak. */
export function spendToNextTier(stats: CustomerStats): number {
  if (stats.tier.nextAt === null) return 0;
  return Math.max(0, stats.tier.nextAt - stats.totalSpend);
}

/** Kalimat singkat untuk kartu pelanggan — siap tampil apa adanya. */
export function customerBadge(stats: CustomerStats): string {
  if (stats.kasbonOpen > 0) return 'Ada kasbon';
  if (stats.visits === 0) return 'Belum pernah belanja';
  if (stats.points > 0) return `${stats.points} poin`;
  return 'Pelanggan';
}

/**
 * Nomor yang dipakai untuk membuka WhatsApp. Bila nomor belum diisi, UI wajib
 * menyembunyikan tombolnya — jangan sampai tombol mati dipajang.
 */
export function whatsappNumber(customer: Pick<Customer, 'phone'>): string | undefined {
  return normalizePhone(customer.phone);
}
