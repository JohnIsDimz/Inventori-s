/**
 * Buku supplier & retur barang (Sprint 15).
 *
 * Kenapa dipisah dari `purchases.ts`: di sana yang dihitung adalah **harga
 * modal**; di sini yang dihitung adalah **hubungan dengan orang** — siapa
 * suppliernya, berapa utang kita, berapa nilai barang yang kita kembalikan.
 *
 * Dua hal yang dipegang:
 *   - Supplier dicocokkan lewat NAMA yang dinormalkan (sama seperti buku
 *     pelanggan), karena kulakan lama hanya menyimpan nama. Jadi riwayat lama
 *     tetap ikut terhitung tanpa perlu diisi ulang.
 *   - Retur tidak pernah membuat uang tunai "muncul" di kas. Nilainya dipakai
 *     lebih dulu untuk memotong utang kulakan; sisanya menjadi saldo retur yang
 *     otomatis memotong pembayaran kulakan berikutnya dari supplier yang sama.
 *
 * Semua fungsi di sini MURNI (tanpa state & UI) dan diuji `npm run test:suppliers`.
 */
import { displayPhone, normalizePhone } from './customers';
import type { Payable, Product, Purchase, PurchaseReturn, ReturnItem, Supplier } from './types';

/** Batas aman isian retur. */
export const MAX_RETURN_QTY = 100_000;

/** Nama supplier dirapikan: spasi ganda dirapatkan, dipotong 60 karakter. */
export function cleanSupplierName(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Nomor HP supplier siap dibaca: 0812-3456-7890. */
export const displaySupplierPhone = (raw: string | undefined | null): string => displayPhone(raw);

/** Kunci pencocokan nama supplier: huruf kecil tanpa spasi/tanda baca. */
export function supplierKey(name: string | undefined | null): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export interface SupplierInput {
  name: string;
  phone?: string;
  address?: string;
  note?: string;
}

export type SupplierValidation =
  | { ok: true; value: { name: string; phone?: string; address?: string; note?: string } }
  | { ok: false; reason: string };

/** Validasi isian buku supplier. Pesan galat ditulis untuk pemilik warung. */
export function validateSupplier(
  input: SupplierInput,
  existing: Supplier[],
  editingId?: string,
): SupplierValidation {
  const name = cleanSupplierName(input.name);
  if (name.length < 2) return { ok: false, reason: 'Nama supplier minimal 2 huruf.' };
  if (name.length > 60) return { ok: false, reason: 'Nama supplier terlalu panjang.' };

  const key = supplierKey(name);
  const duplicate = existing.find(
    (supplier) => supplier.id !== editingId && !supplier.archivedAt && supplierKey(supplier.name) === key,
  );
  if (duplicate) {
    return { ok: false, reason: `Supplier "${duplicate.name}" sudah ada di buku supplier.` };
  }

  return {
    ok: true,
    value: {
      name,
      phone: normalizePhone(input.phone),
      address: cleanSupplierName(input.address).slice(0, 120) || undefined,
      note: cleanSupplierName(input.note).slice(0, 120) || undefined,
    },
  };
}

/**
 * Nama supplier yang sudah pernah dipakai di kulakan atau utang. Dipakai untuk
 * mengisi buku supplier pertama kali tanpa memaksa pengguna mengetik ulang.
 */
export function supplierNamesFrom(purchases: Purchase[], payables: Payable[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | undefined) => {
    const name = cleanSupplierName(raw);
    if (!name) return;
    const key = supplierKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };
  for (const purchase of purchases) push(purchase.supplierName);
  for (const payable of payables) push(payable.supplierName);
  return names;
}

/** Ringkasan satu supplier, dihitung dari data (bukan disimpan). */
export interface SupplierStats {
  purchaseCount: number;
  purchaseTotal: number;
  /** Utang yang belum dibayar pada supplier ini. */
  debtTotal: number;
  /** Nilai barang yang pernah diretur. */
  returnTotal: number;
  /** Saldo retur yang belum terpakai. */
  creditAvailable: number;
  lastPurchaseAt: string | null;
}

const remainingOf = (payable: Payable): number =>
  Math.max(0, payable.amount - payable.payments.reduce((sum, payment) => sum + payment.amount, 0));

/**
 * Saldo retur yang belum terpakai untuk satu supplier.
 *
 * Saldo = nilai retur yang tidak terpakai memotong utang − saldo yang sudah
 * dipakai membayar kulakan berikutnya.
 */
export function availableCredit(
  purchases: Purchase[],
  returns: PurchaseReturn[],
  supplierName: string,
): number {
  const key = supplierKey(supplierName);
  const credit = returns
    .filter((row) => supplierKey(row.supplierName) === key)
    .reduce((sum, row) => sum + Math.max(0, Math.round(row.creditValue)), 0);
  const used = purchases
    .filter((row) => supplierKey(row.supplierName) === key)
    .reduce((sum, row) => sum + Math.max(0, Math.round(row.creditUsed ?? 0)), 0);
  return Math.max(0, credit - used);
}

export function supplierStats(
  supplierName: string,
  purchases: Purchase[],
  payables: Payable[],
  returns: PurchaseReturn[],
): SupplierStats {
  const key = supplierKey(supplierName);
  const mine = purchases.filter((row) => supplierKey(row.supplierName) === key);
  const sorted = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    purchaseCount: mine.length,
    purchaseTotal: mine.reduce((sum, row) => sum + row.total, 0),
    debtTotal: payables
      .filter((row) => supplierKey(row.supplierName) === key)
      .reduce((sum, row) => sum + remainingOf(row), 0),
    returnTotal: returns
      .filter((row) => supplierKey(row.supplierName) === key)
      .reduce((sum, row) => sum + row.total, 0),
    creditAvailable: availableCredit(purchases, returns, supplierName),
    lastPurchaseAt: sorted[0]?.createdAt ?? null,
  };
}

/** Utang terbuka milik satu supplier, yang paling lama di atas. */
export function openPayablesFor(payables: Payable[], supplierName: string): Payable[] {
  const key = supplierKey(supplierName);
  return payables
    .filter((row) => supplierKey(row.supplierName) === key && remainingOf(row) > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Nilai rupiah satu baris retur. */
export const returnLineValue = (item: { qty: number; unitCost: number }): number =>
  Math.max(0, Math.round(item.qty)) * Math.max(0, Math.round(item.unitCost));

export const returnTotal = (items: { qty: number; unitCost: number }[]): number =>
  items.reduce((sum, item) => sum + returnLineValue(item), 0);

/** Angka jumlah retur; kosong / nol / ngawur → null. */
export function parseReturnQty(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw);
  if (text.includes('-')) return null;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value < 1 || value > MAX_RETURN_QTY) return null;
  return Math.round(value);
}

export interface ReturnCandidate extends ReturnItem {
  /** Jumlah yang pernah dibeli dari supplier ini. */
  bought: number;
  /** Jumlah yang masih ada di rak cabang ini. */
  stock: number;
  /** Batas jumlah yang boleh diretur. */
  maxQty: number;
}

/**
 * Barang yang bisa diretur dari satu supplier: gabungan barang pada kulakan
 * terakhirnya, dengan batas jumlah = yang dibeli **dan** yang masih ada di rak.
 */
export function returnCandidates(
  purchases: Purchase[],
  products: Product[],
  supplierName: string,
  stockOf: (product: Product) => number,
): ReturnCandidate[] {
  const key = supplierKey(supplierName);
  const bought = new Map<string, ReturnItem>();

  for (const purchase of purchases) {
    if (supplierKey(purchase.supplierName) !== key) continue;
    for (const item of purchase.items) {
      const current = bought.get(item.productId);
      if (current) {
        current.qty += item.qty;
      } else {
        bought.set(item.productId, { ...item });
      }
    }
  }

  const rows: ReturnCandidate[] = [];
  for (const item of bought.values()) {
    const product = products.find((row) => row.id === item.productId);
    if (!product) continue;
    const stock = Math.max(0, stockOf(product));
    const maxQty = Math.max(0, Math.min(item.qty, stock));
    if (maxQty <= 0) continue;
    rows.push({ ...item, bought: item.qty, stock, maxQty });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Baris retur siap simpan dari isian kasir. */
export function buildReturnItems(
  candidates: ReturnCandidate[],
  counts: Record<string, string | number | undefined>,
): ReturnItem[] {
  const items: ReturnItem[] = [];
  for (const candidate of candidates) {
    const qty = parseReturnQty(counts[candidate.productId]);
    if (qty === null) continue;
    const real = Math.min(qty, candidate.maxQty);
    if (real <= 0) continue;
    items.push({
      productId: candidate.productId,
      name: candidate.name,
      unit: candidate.unit,
      qty: real,
      unitCost: candidate.unitCost,
    });
  }
  return items;
}

export type ReturnCheck =
  | { ok: true; value: { total: number; appliedAmount: number; creditValue: number; payableId?: string } }
  | { ok: false; reason: string };

/**
 * Pemeriksaan sebelum retur disimpan, sekaligus menghitung pembagian nilainya:
 * berapa yang memotong utang dan berapa yang menjadi saldo.
 */
export function validateReturn(input: {
  supplierName: string;
  items: ReturnItem[];
  payables: Payable[];
}): ReturnCheck {
  const name = cleanSupplierName(input.supplierName);
  if (!name) return { ok: false, reason: 'Pilih supplier yang barangnya mau diretur.' };
  if (input.items.length === 0) {
    return { ok: false, reason: 'Isi jumlah barang yang diretur dulu.' };
  }
  const total = returnTotal(input.items);
  if (total <= 0) return { ok: false, reason: 'Nilai retur masih nol. Periksa harganya.' };

  const open = openPayablesFor(input.payables, name);
  const appliedAmount = Math.min(total, open.length > 0 ? remainingOf(open[0]) : 0);
  return {
    ok: true,
    value: {
      total,
      appliedAmount,
      creditValue: total - appliedAmount,
      payableId: appliedAmount > 0 ? open[0].id : undefined,
    },
  };
}

/** Kalimat ringkas untuk daftar riwayat retur. */
export function returnSummaryText(
  row: Pick<PurchaseReturn, 'items' | 'total'>,
  money: (value: number) => string,
): string {
  const units = row.items.reduce((sum, item) => sum + item.qty, 0);
  return `${row.items.length} barang • ${units} unit • ${money(row.total)}`;
}

/** Laporan retur siap dibagikan ke supplier. */
export function returnReportText(
  row: PurchaseReturn,
  storeName: string,
  money: (value: number) => string,
  date: (iso: string) => string,
): string {
  const lines = [
    `Retur barang — ${storeName}`,
    `${date(row.createdAt)} • ${row.supplierName}`,
    '',
    ...row.items.map(
      (item) => `${item.name}: ${item.qty} ${item.unit} × ${money(item.unitCost)} = ${money(item.qty * item.unitCost)}`,
    ),
    '',
    `Total retur: ${money(row.total)}`,
  ];
  if (row.appliedAmount > 0) {
    lines.push(`Dipotong ke utang: ${money(row.appliedAmount)}`);
  }
  if (row.creditValue > 0) {
    lines.push(`Saldo untuk kulakan berikutnya: ${money(row.creditValue)}`);
  }
  if (row.note?.trim()) lines.push(`Catatan: ${row.note.trim()}`);
  return lines.join('\n');
}
