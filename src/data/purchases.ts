/**
 * Pembelian / kulakan dari supplier + HPP rata-rata (Sprint 14).
 *
 * Kenapa ini penting: selama harga kulakan hanya bisa diubah satu per satu di
 * katalog, pemilik warung tidak pernah tahu **berapa sebenarnya untungnya**
 * setelah agen menaikkan harga. Laba terlihat besar padahal uangnya habis untuk
 * kulakan berikutnya.
 *
 * Yang dipegang di sini:
 *   - satu kulakan = satu catatan (supplier, tanggal, daftar barang, dibayar,
 *     sisa utang);
 *   - kulakan menambah stok cabang yang sedang dibuka;
 *   - **harga modal barang menjadi rata-rata tertimbang** dari sisa stok lama
 *     dan barang yang baru masuk — bukan sekadar harga terakhir. Dengan begitu
 *     laba tidak melompat hanya karena baru kulakan;
 *   - uang yang benar-benar keluar hari ini = jumlah "dibayar". Sisanya menjadi
 *     utang supplier dan baru tercatat saat dibayar.
 *
 * Semua fungsi di sini MURNI (tanpa state & UI) dan diuji `npm run test:purchases`.
 */
import type { Payable, PayMethod, Product, Purchase, PurchaseItem } from './types';

/** Batas aman supaya salah ketik tidak merusak data. */
export const MAX_QTY = 100_000;
export const MAX_UNIT_COST = 100_000_000;

const clampInt = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

/**
 * HPP rata-rata tertimbang setelah barang masuk.
 *
 * Contoh: sisa 10 bungkus @2.900 lalu beli 30 @3.100 →
 * (10×2.900 + 30×3.100) / 40 = 3.050.
 *
 * Bila stok lama kosong (atau minus), harga beli terbaru langsung dipakai —
 * tidak ada gunanya merata-ratakan dengan angka yang sudah tidak ada.
 */
export function averageCost(input: {
  stock: number;
  cost: number;
  qty: number;
  unitCost: number;
}): number {
  const qty = clampInt(input.qty, MAX_QTY);
  const unitCost = clampInt(input.unitCost, MAX_UNIT_COST);
  const cost = clampInt(input.cost, MAX_UNIT_COST);
  if (qty <= 0) return cost;
  const stock = clampInt(input.stock, MAX_QTY);
  if (stock <= 0) return unitCost;
  const value = stock * cost + qty * unitCost;
  return Math.round(value / (stock + qty));
}

/** Total rupiah satu kulakan. */
export const purchaseTotal = (items: { qty: number; unitCost: number }[]): number =>
  items.reduce(
    (sum, item) =>
      sum + clampInt(item.qty, MAX_QTY) * clampInt(item.unitCost, MAX_UNIT_COST),
    0,
  );

/**
 * Sisa yang belum dibayar (menjadi utang supplier). Saldo retur yang dipakai
 * (`creditUsed`, Sprint 15) ikut dihitung sebagai bagian yang sudah tertutup.
 */
export const purchaseRemaining = (purchase: {
  total: number;
  paid: number;
  creditUsed?: number;
}): number =>
  Math.max(
    0,
    Math.round(purchase.total) - Math.round(purchase.paid) - Math.round(purchase.creditUsed ?? 0),
  );

/** Angka jumlah barang; kosong / ngawur / negatif → null (bukan 0). */
export function parseQty(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw);
  if (text.includes('-')) return null;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value < 1 || value > MAX_QTY) return null;
  return Math.round(value);
}

/**
 * Angka rupiah. Boleh 0 (mis. barang bonus dari supplier), kosong → null.
 * Titik dan spasi dibuang supaya "2.900" dan "Rp 2.900" sama-sama terbaca.
 */
export function parseMoney(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw);
  if (text.includes('-')) return null;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value < 0 || value > MAX_UNIT_COST) return null;
  return Math.round(value);
}

/** Satu baris isian kasir → baris kulakan (null bila belum lengkap). */
export interface PurchaseEntry {
  productId: string;
  qty: string | number;
  unitCost: string | number;
}

/** Baris kulakan siap simpan, hanya barang yang jumlahnya diisi. */
export function buildPurchaseItems(
  products: Product[],
  outletId: string | null | undefined,
  entries: Record<string, PurchaseEntry | undefined>,
): PurchaseItem[] {
  const items: PurchaseItem[] = [];
  for (const product of products) {
    const entry = entries[product.id];
    if (!entry) continue;
    const qty = parseQty(entry.qty);
    if (qty === null) continue;
    const unitCost = parseMoney(entry.unitCost) ?? Math.max(0, Math.round(product.costPrice));
    items.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      qty,
      unitCost,
    });
  }
  // `outletId` ikut di parameter supaya pemanggil tidak lupa menyiapkan stok
  // per cabang; stok dibaca lewat `stockFor()` di layar.
  void outletId;
  return items;
}

export interface PurchaseCheck {
  ok: boolean;
  reason?: string;
}

/** Pemeriksaan sebelum menyimpan — pesannya bahasa warung, bukan kode. */
export function validatePurchase(input: {
  supplierName: string;
  items: PurchaseItem[];
  paid: number;
}): PurchaseCheck {
  const name = input.supplierName?.trim() ?? '';
  if (!name) return { ok: false, reason: 'Nama supplier atau toko kulakan wajib diisi.' };
  if (input.items.length === 0) return { ok: false, reason: 'Isi jumlah barang yang dibeli dulu.' };
  const total = purchaseTotal(input.items);
  if (total <= 0) {
    return { ok: false, reason: 'Total kulakan masih nol. Periksa jumlah dan harga belinya.' };
  }
  if (!Number.isFinite(input.paid) || input.paid < 0) {
    return { ok: false, reason: 'Jumlah dibayar tidak boleh kurang dari nol.' };
  }
  if (input.paid > total) {
    return { ok: false, reason: 'Jumlah dibayar tidak boleh lebih besar dari total kulakan.' };
  }
  return { ok: true };
}

export interface CostChange {
  productId: string;
  name: string;
  unit: string;
  before: number;
  after: number;
  stockBefore: number;
  stockAfter: number;
  qty: number;
}

/**
 * Perkiraan HPP & stok setelah kulakan disimpan. Dipakai layar untuk
 * memperlihatkan akibatnya sebelum menekan Simpan.
 */
export function previewCosts(
  products: Product[],
  items: PurchaseItem[],
  stockOf: (product: Product) => number,
): CostChange[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const changes: CostChange[] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) continue;
    const stockBefore = stockOf(product);
    const after = averageCost({
      stock: stockBefore,
      cost: product.costPrice,
      qty: item.qty,
      unitCost: item.unitCost,
    });
    changes.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      before: Math.round(product.costPrice),
      after,
      stockBefore,
      stockAfter: stockBefore + item.qty,
      qty: item.qty,
    });
  }
  return changes;
}

/** Nama supplier yang pernah dipakai — dipakai sebagai saran di layar. */
export function supplierSuggestions(purchases: Purchase[], limit = 5): string[] {
  const seen: string[] = [];
  for (const purchase of purchases) {
    const name = purchase.supplierName?.trim();
    if (!name) continue;
    if (seen.some((item) => item.toLowerCase() === name.toLowerCase())) continue;
    seen.push(name);
    if (seen.length >= limit) break;
  }
  return seen;
}

/** Harga beli terakhir untuk satu barang (0 bila belum pernah kulakan). */
export function lastUnitCost(purchases: Purchase[], productId: string): number | null {
  for (const purchase of purchases) {
    for (const item of purchase.items) {
      if (item.productId === productId) return item.unitCost;
    }
  }
  return null;
}

/** Kalimat ringkas untuk daftar riwayat. */
export function purchaseSummaryText(
  purchase: Pick<Purchase, 'items' | 'total'>,
  money: (value: number) => string,
): string {
  const count = purchase.items.length;
  if (count === 0) return money(purchase.total);
  const units = purchase.items.reduce((sum, item) => sum + item.qty, 0);
  return `${count} barang • ${units} unit • ${money(purchase.total)}`;
}

/** Laporan kulakan siap dibagikan (WhatsApp / catatan). */
export function purchaseReportText(
  purchase: Purchase,
  storeName: string,
  money: (value: number) => string,
  date: (iso: string) => string,
): string {
  const lines = [
    `Kulakan — ${storeName}`,
    `${date(purchase.createdAt)} • ${purchase.supplierName}`,
    '',
    ...purchase.items.map(
      (item) => `${item.name}: ${item.qty} ${item.unit} × ${money(item.unitCost)} = ${money(item.qty * item.unitCost)}`,
    ),
    '',
    `Total: ${money(purchase.total)}`,
    `Dibayar: ${money(purchase.paid)}`,
  ];
  const remaining = purchaseRemaining(purchase);
  if (remaining > 0) lines.push(`Belum dibayar: ${money(remaining)}`);
  if (purchase.note?.trim()) lines.push(`Catatan: ${purchase.note.trim()}`);
  return lines.join('\n');
}

/** Utang supplier yang lahir dari kulakan ini. */
export function payableForPurchase(purchase: Purchase, supplierName: string, dueDate: string): Payable {
  return {
    id: `${purchase.id}-utang`,
    supplierName,
    outletId: purchase.outletId,
    amount: purchaseRemaining(purchase),
    dueDate,
    createdAt: purchase.createdAt,
    note: `Kulakan ${purchase.items.length} barang`,
    payments: [],
  };
}

/** Metode pembayaran kulakan yang masuk akal (kasbon tidak dipakai di sini). */
export const PURCHASE_METHODS: { id: PayMethod; label: string }[] = [
  { id: 'cash', label: 'Tunai' },
  { id: 'qris', label: 'QRIS / Bank' },
  { id: 'transfer', label: 'Transfer' },
];
