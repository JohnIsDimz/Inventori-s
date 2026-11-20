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
  customers: Customer[];
  outlets: Outlet[];
  opnames: StockOpname[];
  purchases: Purchase[];
  suppliers: Supplier[];
  purchaseReturns: PurchaseReturn[];
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
  const payload: BackupPayload = {
    profile: (isObject(data.profile) ? data.profile : {}) as unknown as StoreProfile,
    settings: (isObject(data.settings) ? data.settings : {}) as unknown as AppSettings,
    categories: asArray<Category>(data.categories),
    products: asArray<Product>(data.products),
    transactions: asArray<Transaction>(data.transactions),
    receivables: asArray<Receivable>(data.receivables),
    payables: asArray<Payable>(data.payables),
    allocations: asArray<CapitalAllocation>(data.allocations),
    shifts: asArray<Shift>(data.shifts),
    // Berkas versi 1 belum punya pesanan — dibaca sebagai daftar kosong.
    orders: asArray<Order>(data.orders),
    // Begitu juga buku pelanggan (baru ada sejak Sprint 11).
    customers: asArray<Customer>(data.customers),
    // Daftar cabang baru ada sejak Sprint 12; berkas lama dibaca kosong.
    outlets: asArray<Outlet>(data.outlets),
    // Riwayat hitung stok baru ada sejak Sprint 13.
    opnames: asArray<StockOpname>(data.opnames),
    // Riwayat kulakan supplier baru ada sejak Sprint 14.
    purchases: asArray<Purchase>(data.purchases),
    // Buku supplier & retur barang baru ada sejak Sprint 15.
    suppliers: asArray<Supplier>(data.suppliers),
    purchaseReturns: asArray<PurchaseReturn>(data.purchaseReturns),
  };

  const counts = countPayload(payload);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total === 0) return { ok: false, reason: 'Cadangan ini tidak berisi satu pun data.' };

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
