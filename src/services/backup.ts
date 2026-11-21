import { safeNoteFileName } from '../utils/photoPath';
/**
 * Cadangan lokal: ekspor seluruh data ke satu berkas JSON, lalu pulihkan lagi.
 *
 * Ini pengganti backup cloud untuk pengguna mode lokal — kalau HP hilang atau
 * aplikasi dipasang ulang, data bisa dikembalikan dari berkas.
 *
 * Fungsi di sini MURNI (tanpa file system, tanpa UI) supaya bisa diuji dengan
 * `npm run test:backup`. Bagian berkas & dialog ada di `app/cadangan.tsx`.
 */
import { mergeRecords } from './lan/merge';
import type {
  AppSettings,
  CapitalAllocation,
  Category,
  Customer,
  Order,
  Outlet,
  Payable,
  Purchase,
  PurchaseReturn,
  StockOpname,
  Supplier,
  Product,
  Receivable,
  Shift,
  StoreProfile,
  Transaction,
} from '../data/types';

export const BACKUP_APP = 'inventoris';
export const BACKUP_VERSION = 1;

export interface BackupPayload {
  profile: StoreProfile;
  settings: AppSettings;
  categories: Category[];
  products: Product[];
  transactions: Transaction[];
  receivables: Receivable[];
  payables: Payable[];
  allocations: CapitalAllocation[];
  shifts: Shift[];
  orders: Order[];
  customers?: Customer[];
  outlets?: Outlet[];
  opnames?: StockOpname[];
  purchases?: Purchase[];
  suppliers?: Supplier[];
  purchaseReturns?: PurchaseReturn[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  storeName: string;
  counts: Record<string, number>;
  data: BackupPayload;
}

export const countPayload = (data: BackupPayload): Record<string, number> => ({
  produk: data.products.length,
  transaksi: data.transactions.length,
  kasbon: data.receivables.length,
  utang: data.payables.length,
  kategori: data.categories.length,
  shift: data.shifts.length,
  alokasi: data.allocations.length,
  pesanan: (data.orders ?? []).length,
  pelanggan: (data.customers ?? []).length,
  cabang: (data.outlets ?? []).length,
  opname: (data.opnames ?? []).length,
  kulakan: (data.purchases ?? []).length,
  supplier: (data.suppliers ?? []).length,
  retur: (data.purchaseReturns ?? []).length,
});

export function buildBackup(data: BackupPayload, exportedAt = new Date().toISOString()): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt,
    storeName: data.profile.name || 'Toko Saya',
    counts: countPayload(data),
    data,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const finiteNum = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const safeStr = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const safeIso = (value: unknown, fallback = '1970-01-01T00:00:00.000Z'): string => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return Number.isNaN(new Date(value).getTime()) ? fallback : value;
};

function stripDangerousKeys<T>(input: T): T {
  if (Array.isArray(input)) return input.map(stripDangerousKeys) as unknown as T;
  if (!isObject(input)) return input;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    clean[k] = stripDangerousKeys(v);
  }
  return clean as T;
}

function cleanIdRows<T extends { id: string }>(
  raw: unknown,
  normalize: (row: Record<string, unknown>) => T | null,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const id = safeStr(item.id).trim();
    if (!id) continue;
    const safe: Record<string, unknown> = stripDangerousKeys({ ...item, id });
    for (const key of ['note', 'phone', 'address', 'barcode', 'customerId', 'outletId', 'supplierId', 'payableId', 'appliedPayableId', 'receivableId', 'transactionId', 'updatedAt', 'archivedAt', 'closedAt', 'lastRemindedAt']) {
      if (safe[key] !== undefined && typeof safe[key] !== 'string') delete safe[key];
    }
    for (const key of ['subtotal', 'discount', 'discountValue', 'tax', 'taxRate', 'wholesalePrice', 'wholesaleMinQty', 'deposit', 'creditUsed', 'closingCash', 'expectedCash', 'difference', 'remindCount']) {
      if (safe[key] !== undefined) {
        if (typeof safe[key] !== 'number' || !Number.isFinite(safe[key])) delete safe[key];
      }
    }
    const cleaned = normalize(safe);
    if (cleaned) out.push(cleaned);
  }
  return out;
}

function sanitizePayments(raw: unknown): Receivable['payments'] {
  if (!Array.isArray(raw)) return [];
  const out: Receivable['payments'] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const id = safeStr(item.id).trim();
    const amount = finiteNum(item.amount, -1);
    if (!id || amount <= 0) continue;
    const m = safeStr(item.method, 'cash');
    const method = (['cash', 'qris', 'transfer', 'kasbon'].includes(m) ? m : 'cash') as Transaction['method'];
    out.push({
      id,
      amount,
      paidAt: safeIso(item.paidAt),
      method,
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
      ...(item.source === 'retur' ? { source: item.source } : {}),
    });
  }
  return out;
}

function sanitizePhotoUri(raw: unknown): string | undefined {
  return typeof raw === 'string' && safeNoteFileName(raw) ? raw : undefined;
}

function sanitizePayload(data: Record<string, unknown>): BackupPayload {
  const rawProfile = isObject(data.profile) ? stripDangerousKeys(data.profile) : {};
  const rawSettings = isObject(data.settings) ? stripDangerousKeys(data.settings) : {};

  const profile = {
    ...(typeof rawProfile.name === 'string' ? { name: rawProfile.name } : {}),
    ...(typeof rawProfile.ownerName === 'string' ? { ownerName: rawProfile.ownerName } : {}),
    ...(typeof rawProfile.phone === 'string' ? { phone: rawProfile.phone } : {}),
    ...(typeof rawProfile.address === 'string' ? { address: rawProfile.address } : {}),
    ...(typeof rawProfile.code === 'string' ? { code: rawProfile.code } : {}),
    ...(typeof rawProfile.openTime === 'string' ? { openTime: rawProfile.openTime } : {}),
    ...(typeof rawProfile.closeTime === 'string' ? { closeTime: rawProfile.closeTime } : {}),
    ...(typeof rawProfile.receiptFooter === 'string' ? { receiptFooter: rawProfile.receiptFooter } : {}),
  } as StoreProfile;

  const settings = {
    ...(typeof rawSettings.notifEnabled === 'boolean' ? { notifEnabled: rawSettings.notifEnabled } : {}),
    ...(Number.isInteger(rawSettings.notifHour) && Number(rawSettings.notifHour) >= 0 && Number(rawSettings.notifHour) <= 23 ? { notifHour: Number(rawSettings.notifHour) } : {}),
    ...(typeof rawSettings.lastBackupAt === 'string' ? { lastBackupAt: safeIso(rawSettings.lastBackupAt) } : {}),
    ...(typeof rawSettings.hideBalance === 'boolean' ? { hideBalance: rawSettings.hideBalance } : {}),
    ...(typeof rawSettings.autoPrint === 'boolean' ? { autoPrint: rawSettings.autoPrint } : {}),
    ...(typeof rawSettings.printerName === 'string' ? { printerName: rawSettings.printerName } : {}),
    ...(typeof rawSettings.printerAddress === 'string' ? { printerAddress: rawSettings.printerAddress } : {}),
    ...(typeof rawSettings.reminderTemplate === 'string' ? { reminderTemplate: rawSettings.reminderTemplate } : {}),
    ...(Number.isFinite(Number(rawSettings.taxPercent)) && Number(rawSettings.taxPercent) >= 0 && Number(rawSettings.taxPercent) <= 100
      ? { taxPercent: Number(rawSettings.taxPercent) }
      : {}),
  } as AppSettings;

  const categories = cleanIdRows<Category>(data.categories, (row) => {
    const label = safeStr(row.label).trim();
    if (!label) return null;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      label,
      type: row.type === 'expense' ? 'expense' : 'sale',
      color: safeStr(row.color, '#00F5A0'),
      icon: safeStr(row.icon, 'pricetag-outline'),
    } as Category;
  });

  const products = cleanIdRows<Product>(data.products, (row) => {
    const name = safeStr(row.name).trim();
    if (!name) return null;
    const sellPrice = finiteNum(row.sellPrice, NaN);
    const costPrice = finiteNum(row.costPrice, 0);
    const stock = finiteNum(row.stock, NaN);
    if (!Number.isFinite(sellPrice) || sellPrice < 0 || !Number.isFinite(stock)) return null;
    const stockByOutlet = isObject(row.stockByOutlet)
      ? Object.fromEntries(
          Object.entries(row.stockByOutlet)
            .filter(([k, v]) => k !== '__proto__' && k !== 'constructor' && Number.isFinite(Number(v)))
            .map(([k, v]) => [k, Number(v)]),
        )
      : undefined;
    const priceTiers = Array.isArray(row.priceTiers)
      ? row.priceTiers
          .filter((t): t is Record<string, unknown> => isObject(t) && finiteNum(t.minQty, 0) >= 2 && finiteNum(t.price, -1) >= 0)
          .map((t) => ({ minQty: Math.round(finiteNum(t.minQty, 2)), price: Math.round(finiteNum(t.price, 0)) }))
      : undefined;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      name,
      unit: safeStr(row.unit, 'pcs') || 'pcs',
      sellPrice,
      costPrice: Math.max(0, costPrice),
      stock,
      minStock: Math.max(0, finiteNum(row.minStock, 0)),
      ...(stockByOutlet ? { stockByOutlet } : {}),
      ...(priceTiers ? { priceTiers } : {}),
    } as Product;
  });

  const transactions = cleanIdRows<Transaction>(data.transactions, (row) => {
    const amount = finiteNum(row.amount, NaN);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const m = safeStr(row.method, 'cash');
    const method = (['cash', 'qris', 'transfer', 'kasbon'].includes(m) ? m : 'cash') as Transaction['method'];
    const items = Array.isArray(row.items)
      ? row.items
          .filter((it): it is Record<string, unknown> => isObject(it) && finiteNum(it.qty, 0) > 0 && finiteNum(it.price, -1) >= 0)
          .map((it) => ({
            ...(typeof it.productId === 'string' ? { productId: it.productId } : {}),
            name: safeStr(it.name, 'Barang') || 'Barang',
            qty: finiteNum(it.qty, 1),
            price: finiteNum(it.price, 0),
            ...(Number.isFinite(Number(it.cost)) ? { cost: Math.max(0, Number(it.cost)) } : {}),
            ...(Number.isFinite(Number(it.discount)) ? { discount: Math.max(0, Number(it.discount)) } : {}),
          }))
      : undefined;
    const clean = stripDangerousKeys(row);
    delete clean.photoUri;
    const photoUri = sanitizePhotoUri(row.photoUri);
    return {
      ...clean,
      id: safeStr(row.id),
      type: row.type === 'expense' ? 'expense' : 'sale',
      amount,
      categoryId: safeStr(row.categoryId, ''),
      method,
      createdAt: safeIso(row.createdAt),
      items,
      ...(photoUri ? { photoUri } : {}),
    } as Transaction;
  });

  const receivables = cleanIdRows<Receivable>(data.receivables, (row) => {
    const amount = finiteNum(row.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      customerName: safeStr(row.customerName, 'Pelanggan') || 'Pelanggan',
      amount,
      createdAt: safeIso(row.createdAt),
      dueDate: safeIso(row.dueDate),
      payments: sanitizePayments(row.payments),
    } as Receivable;
  });

  const payables = cleanIdRows<Payable>(data.payables, (row) => {
    const amount = finiteNum(row.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      supplierName: safeStr(row.supplierName, 'Supplier') || 'Supplier',
      amount,
      createdAt: safeIso(row.createdAt),
      dueDate: safeIso(row.dueDate),
      payments: sanitizePayments(row.payments),
    } as Payable;
  });

  const allocations = cleanIdRows<CapitalAllocation>(data.allocations, (row) => {
    const amount = finiteNum(row.amount, NaN);
    if (!Number.isFinite(amount) || amount === 0) return null;
    return { ...stripDangerousKeys(row), id: safeStr(row.id), amount, createdAt: safeIso(row.createdAt) } as CapitalAllocation;
  });

  const shifts = cleanIdRows<Shift>(data.shifts, (row) => {
    const openingCash = finiteNum(row.openingCash, NaN);
    if (!Number.isFinite(openingCash) || openingCash < 0) return null;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      cashierName: safeStr(row.cashierName, 'Kasir') || 'Kasir',
      openedAt: safeIso(row.openedAt),
      openingCash,
    } as Shift;
  });

  const orders = cleanIdRows<Order>(data.orders, (row) => {
    const total = finiteNum(row.total, NaN);
    if (!Number.isFinite(total) || total < 0) return null;
    const items = Array.isArray(row.items)
      ? row.items
          .filter((it): it is Record<string, unknown> => isObject(it) && finiteNum(it.qty, 0) > 0 && finiteNum(it.price, -1) >= 0)
          .map((it) => ({
            ...(typeof it.productId === 'string' ? { productId: it.productId } : {}),
            name: safeStr(it.name, 'Barang') || 'Barang',
            qty: finiteNum(it.qty, 1),
            price: finiteNum(it.price, 0),
          }))
      : [];
    const status = row.status === 'selesai' || row.status === 'batal' ? row.status : 'terbuka';
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      customerName: safeStr(row.customerName, 'Pelanggan') || 'Pelanggan',
      items,
      total,
      status,
      createdAt: safeIso(row.createdAt),
    } as Order;
  });

  const customers = cleanIdRows<Customer>(data.customers, (row) => {
    const name = safeStr(row.name).trim();
    if (!name) return null;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      name,
      createdAt: safeIso(row.createdAt),
    } as Customer;
  });

  const outlets = cleanIdRows<Outlet>(data.outlets, (row) => {
    const name = safeStr(row.name).trim();
    if (!name) return null;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      name,
      code: safeStr(row.code, 'CB01'),
      createdAt: safeIso(row.createdAt),
    } as Outlet;
  });

  const opnames = cleanIdRows<StockOpname>(data.opnames, (row) => {
    const lines = (Array.isArray(row.lines) ? row.lines : [])
      .filter((it): it is Record<string, unknown> => isObject(it) && typeof it.productId === 'string')
      .map((it) => ({
        productId: safeStr(it.productId), name: safeStr(it.name, 'Barang'), unit: safeStr(it.unit, 'pcs'),
        cost: Math.max(0, finiteNum(it.cost)), system: Math.max(0, finiteNum(it.system)), counted: Math.max(0, finiteNum(it.counted)),
      }));
    return { ...stripDangerousKeys(row), id: safeStr(row.id), lines,
      lossValue: lines.reduce((sum, l) => sum + Math.max(0, l.system - l.counted) * l.cost, 0),
      gainValue: lines.reduce((sum, l) => sum + Math.max(0, l.counted - l.system) * l.cost, 0),
      createdAt: safeIso(row.createdAt),
    } as StockOpname;
  });

  const purchases = cleanIdRows<Purchase>(data.purchases, (row) => {
    const total = finiteNum(row.total, NaN);
    if (!Number.isFinite(total) || total < 0) return null;
    const items = Array.isArray(row.items)
      ? row.items
          .filter((it): it is Record<string, unknown> => isObject(it) && finiteNum(it.qty, 0) > 0 && finiteNum(it.unitCost, -1) >= 0)
          .map((it) => ({
            productId: safeStr(it.productId),
            name: safeStr(it.name, 'Barang'),
            unit: safeStr(it.unit, 'pcs'),
            qty: finiteNum(it.qty, 1),
            unitCost: finiteNum(it.unitCost, 0),
          }))
      : [];
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      supplierName: safeStr(row.supplierName, 'Supplier') || 'Supplier',
      items,
      total,
      paid: Math.max(0, Math.min(total, finiteNum(row.paid, 0))),
      method: row.method === 'transfer' ? 'transfer' : row.method === 'kasbon' ? 'kasbon' : 'cash',
      createdAt: safeIso(row.createdAt),
    } as Purchase;
  });

  const suppliers = cleanIdRows<Supplier>(data.suppliers, (row) => {
    const name = safeStr(row.name).trim();
    if (!name) return null;
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      name,
      createdAt: safeIso(row.createdAt),
    } as Supplier;
  });

  const purchaseReturns = cleanIdRows<PurchaseReturn>(data.purchaseReturns, (row) => {
    const total = finiteNum(row.total, NaN);
    if (!Number.isFinite(total) || total < 0) return null;
    const items = Array.isArray(row.items)
      ? row.items
          .filter((it): it is Record<string, unknown> => isObject(it) && finiteNum(it.qty, 0) > 0 && finiteNum(it.unitCost, -1) >= 0)
          .map((it) => ({
            productId: safeStr(it.productId),
            name: safeStr(it.name, 'Barang'),
            unit: safeStr(it.unit, 'pcs'),
            qty: finiteNum(it.qty, 1),
            unitCost: finiteNum(it.unitCost, 0),
          }))
      : [];
    return {
      ...stripDangerousKeys(row),
      id: safeStr(row.id),
      supplierName: safeStr(row.supplierName, 'Supplier') || 'Supplier',
      items,
      total,
      appliedAmount: Math.max(0, Math.min(total, finiteNum(row.appliedAmount, 0))),
      creditValue: Math.max(0, Math.min(total, finiteNum(row.creditValue, 0))),
      createdAt: safeIso(row.createdAt),
    } as PurchaseReturn;
  });

  return {
    profile,
    settings,
    categories,
    products,
    transactions,
    receivables,
    payables,
    allocations,
    shifts,
    orders,
    customers,
    outlets,
    opnames,
    purchases,
    suppliers,
    purchaseReturns,
  };
}

/**
 * `merge`   — hanya menambah yang belum ada (data lokal tidak pernah ditimpa).
 * `latest`  — baris yang lebih baru menang (dipakai saat menukar data antar HP).
 * `replace` — pakai isi cadangan sepenuhnya.
 */
export type RestoreMode = 'merge' | 'latest' | 'replace';

export type ParseResult =
  | { ok: true; backup: BackupFile; counts: Record<string, number> }
  | { ok: false; reason: string };

/** Baca teks berkas cadangan. Pesan galat ditulis untuk pengguna, bukan untuk developer. */
export function parseBackup(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'Berkas cadangan kosong.' };
  if (trimmed.length > 40 * 1024 * 1024) {
    return { ok: false, reason: 'Berkas terlalu besar (di atas 40 MB).' };
  }

  if (text.length > 10 * 1024 * 1024) return { ok: false, reason: 'Berkas terlalu besar. Batasnya 10 MB.' };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: 'Berkas ini bukan cadangan Inventori’s (bukan JSON yang sah).' };
  }

  if (!isObject(raw)) return { ok: false, reason: 'Isi berkas tidak dikenali.' };
  if (raw.app !== BACKUP_APP) {
    return { ok: false, reason: 'Berkas ini bukan cadangan Inventori’s.' };
  }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: 'Cadangan dibuat versi aplikasi yang lebih baru. Perbarui aplikasi dulu.',
    };
  }
  if (!isObject(raw.data)) return { ok: false, reason: 'Cadangan tidak berisi data.' };

  const data = raw.data as Record<string, unknown>;
  const rawEntryCount = [
    data.categories,
    data.products,
    data.transactions,
    data.receivables,
    data.payables,
    data.allocations,
    data.shifts,
    data.orders,
    data.customers,
    data.outlets,
    data.opnames,
    data.purchases,
    data.suppliers,
    data.purchaseReturns,
  ].reduce<number>((sum, list) => sum + asArray(list).length, 0);

  const payload = sanitizePayload(data);

  const counts = countPayload(payload);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    if (rawEntryCount > 0) {
      return { ok: false, reason: 'Isi berkas cadangan rusak atau tidak sesuai format.' };
    }
    return { ok: false, reason: 'Cadangan ini tidak berisi satu pun data.' };
  }

  return {
    ok: true,
    counts,
    backup: {
      app: BACKUP_APP,
      version: raw.version,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
      storeName: typeof raw.storeName === 'string' ? raw.storeName : 'Toko Saya',
      counts,
      data: payload,
    },
  };
}

/** Gabung dua daftar berdasarkan `id`; data yang sudah ada tidak ditimpa. */
function unionById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const existing = new Set(current.map((row) => row.id));
  const added = incoming.filter((row) => row && typeof row.id === 'string' && !existing.has(row.id));
  return [...current, ...added];
}

export interface RestoreResult {
  payload: BackupPayload;
  added: Record<string, number>;
}

/**
 * `merge`  — tambahkan yang belum ada (aman, tidak menghapus apa pun).
 * `replace` — pakai isi cadangan sepenuhnya (untuk pindah HP).
 */
export function applyBackup(
  current: BackupPayload,
  backup: BackupPayload,
  mode: RestoreMode,
): RestoreResult {
  if (mode === 'replace') {
    return {
      payload: {
        profile: { ...current.profile, ...backup.profile },
        settings: { ...current.settings, ...backup.settings },
        categories: backup.categories.length > 0 ? backup.categories : current.categories,
        products: backup.products,
        transactions: backup.transactions,
        receivables: backup.receivables,
        payables: backup.payables,
        allocations: backup.allocations,
        shifts: backup.shifts,
        orders: backup.orders,
        customers: backup.customers ?? [],
        outlets: backup.outlets ?? [],
        opnames: backup.opnames ?? [],
        purchases: backup.purchases ?? [],
        suppliers: backup.suppliers ?? [],
        purchaseReturns: backup.purchaseReturns ?? [],
      },
      added: countPayload(backup),
    };
  }

  if (mode === 'latest') {
    const merged = {
      products: mergeRecords(current.products, backup.products),
      transactions: mergeRecords(current.transactions, backup.transactions),
      receivables: mergeRecords(current.receivables, backup.receivables),
      payables: mergeRecords(current.payables, backup.payables),
      categories: mergeRecords(current.categories, backup.categories),
      allocations: mergeRecords(current.allocations, backup.allocations),
      shifts: mergeRecords(current.shifts, backup.shifts),
      orders: mergeRecords(current.orders ?? [], backup.orders ?? []),
      customers: mergeRecords(current.customers ?? [], backup.customers ?? []),
      outlets: mergeRecords(current.outlets ?? [], backup.outlets ?? []),
      opnames: mergeRecords(current.opnames ?? [], backup.opnames ?? []),
      purchases: mergeRecords(current.purchases ?? [], backup.purchases ?? []),
      suppliers: mergeRecords(current.suppliers ?? [], backup.suppliers ?? []),
      purchaseReturns: mergeRecords(current.purchaseReturns ?? [], backup.purchaseReturns ?? []),
    };
    return {
      payload: {
        profile: current.profile,
        settings: current.settings,
        categories: merged.categories.rows,
        products: merged.products.rows,
        transactions: merged.transactions.rows,
        receivables: merged.receivables.rows,
        payables: merged.payables.rows,
        allocations: merged.allocations.rows,
        shifts: merged.shifts.rows,
        orders: merged.orders.rows,
        customers: merged.customers.rows,
        outlets: merged.outlets.rows,
        opnames: merged.opnames.rows,
        purchases: merged.purchases.rows,
        suppliers: merged.suppliers.rows,
        purchaseReturns: merged.purchaseReturns.rows,
      },
      added: {
        produk: merged.products.report.added + merged.products.report.updated,
        transaksi: merged.transactions.report.added + merged.transactions.report.updated,
        kasbon: merged.receivables.report.added + merged.receivables.report.updated,
        utang: merged.payables.report.added + merged.payables.report.updated,
        kategori: merged.categories.report.added + merged.categories.report.updated,
        shift: merged.shifts.report.added + merged.shifts.report.updated,
        alokasi: merged.allocations.report.added + merged.allocations.report.updated,
        pesanan: merged.orders.report.added + merged.orders.report.updated,
        pelanggan: merged.customers.report.added + merged.customers.report.updated,
        cabang: merged.outlets.report.added + merged.outlets.report.updated,
        opname: merged.opnames.report.added + merged.opnames.report.updated,
        kulakan: merged.purchases.report.added + merged.purchases.report.updated,
        supplier: merged.suppliers.report.added + merged.suppliers.report.updated,
        retur: merged.purchaseReturns.report.added + merged.purchaseReturns.report.updated,
      },
    };
  }

  const added = {
    produk: 0,
    transaksi: 0,
    kasbon: 0,
    utang: 0,
    kategori: 0,
    shift: 0,
    alokasi: 0,
    pesanan: 0,
    pelanggan: 0,
    cabang: 0,
    opname: 0,
    kulakan: 0,
    supplier: 0,
    retur: 0,
  };
  const doUnion = <T extends { id: string }>(key: keyof typeof added, target: T[], source: T[]) => {
    const before = target.length;
    const merged = unionById(target, source);
    added[key] = merged.length - before;
    return merged;
  };

  const mergedCategories = doUnion('kategori', [...current.categories], backup.categories);
  const mergedProducts = doUnion('produk', [...current.products], backup.products);
  const mergedTransactions = doUnion('transaksi', [...current.transactions], backup.transactions);
  const mergedReceivables = doUnion('kasbon', [...current.receivables], backup.receivables);
  const mergedPayables = doUnion('utang', [...current.payables], backup.payables);
  const mergedAllocations = doUnion('alokasi', [...current.allocations], backup.allocations);
  const mergedShifts = doUnion('shift', [...current.shifts], backup.shifts);
  const mergedOrders = doUnion('pesanan', [...current.orders], backup.orders ?? []);
  const mergedCustomers = doUnion('pelanggan', [...(current.customers ?? [])], backup.customers ?? []);
  const mergedOutlets = doUnion('cabang', [...(current.outlets ?? [])], backup.outlets ?? []);
  const mergedOpnames = doUnion('opname', [...(current.opnames ?? [])], backup.opnames ?? []);
  const mergedPurchases = doUnion('kulakan', [...(current.purchases ?? [])], backup.purchases ?? []);
  const mergedSuppliers = doUnion('supplier', [...(current.suppliers ?? [])], backup.suppliers ?? []);
  const mergedReturns = doUnion('retur', [...(current.purchaseReturns ?? [])], backup.purchaseReturns ?? []);

  /**
   * Di HP baru (profil belum diisi) gabung harus tetap memulihkan identitas toko
   * dan pengaturan — kalau tidak, pengguna harus mengetik ulang nama toko setelah
   * memulihkan cadangan. Kalau toko sudah diisi, identitas yang ada dipertahankan.
   */
  const freshStore = !(current.profile?.name ?? '').trim();
  const adopt = <T extends object>(kept: T, incoming: T): T =>
    freshStore ? { ...kept, ...(incoming ?? {}) } : kept;

  return {
    payload: {
      profile: adopt(current.profile, backup.profile),
      settings: adopt(current.settings, backup.settings),
      categories: mergedCategories,
      products: mergedProducts,
      transactions: mergedTransactions,
      receivables: mergedReceivables,
      payables: mergedPayables,
      allocations: mergedAllocations,
      shifts: mergedShifts,
      orders: mergedOrders,
      customers: mergedCustomers,
      outlets: mergedOutlets,
      opnames: mergedOpnames,
      purchases: mergedPurchases,
      suppliers: mergedSuppliers,
      purchaseReturns: mergedReturns,
    },
    added,
  };
}

/** Nama berkas yang mudah dikenali di folder Download/Drive. */
export function backupFileName(storeName: string, at = new Date()): string {
  const slug =
    storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28)
      .replace(/-+$/g, '') || 'toko';
  const stamp = at.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `cadangan-inventoris-${slug}-${stamp}.json`;
}

/** Selang pengingat cadangan: 7 hari sejak cadangan terakhir. */
export const BACKUP_REMIND_DAYS = 7;

export type BackupReminderState = 'kosong' | 'belum-pernah' | 'aman' | 'waktunya';

export interface BackupReminder {
  state: BackupReminderState;
  /** Umur cadangan terakhir dalam hari (null bila belum pernah). */
  days: number | null;
  /** Kalimat siap tampil; kosong bila tidak perlu ditampilkan. */
  message: string;
}

/**
 * Pengingat cadangan untuk Beranda.
 *
 * Aturannya dibuat sederhana supaya bisa dijelaskan ke pemilik warung:
 * - belum ada data sama sekali → tidak ada yang perlu dicadangkan;
 * - ada data tapi belum pernah mencadangkan → "waktunya";
 * - sudah lewat 7 hari → "waktunya";
 * - selain itu → "aman".
 */
export function backupReminder(
  input: { lastBackupAt: string | null; hasData: boolean; now?: Date },
): BackupReminder {
  const now = input.now ?? new Date();
  if (!input.hasData) return { state: 'kosong', days: null, message: '' };

  if (!input.lastBackupAt) {
    return {
      state: 'belum-pernah',
      days: null,
      message: 'Data toko belum pernah dicadangkan. Simpan satu berkas supaya aman bila HP hilang.',
    };
  }

  const then = new Date(input.lastBackupAt);
  const days = Number.isNaN(then.getTime())
    ? null
    : Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));

  if (days === null) {
    return {
      state: 'belum-pernah',
      days: null,
      message: 'Waktu cadangan terakhir tidak terbaca. Sebaiknya cadangkan ulang sekarang.',
    };
  }

  if (days >= BACKUP_REMIND_DAYS) {
    return {
      state: 'waktunya',
      days,
      message: `Cadangan terakhir ${days} hari lalu. Buat cadangan baru supaya data tetap aman.`,
    };
  }

  return { state: 'aman', days, message: '' };
}
