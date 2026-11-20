/**
 * Cabang / outlet (Sprint 12).
 *
 * Sampai Sprint 11 aplikasi menganggap satu HP = satu toko di satu lokasi.
 * Modul ini menambahkan cabang **tanpa mengubah arti data lama**:
 *
 *   - pengguna lama: satu cabang otomatis dibuat dari nama toko, SEMUA baris
 *     ditandai cabang itu, dan angka di layar tetap sama persis;
 *   - stok disimpan per cabang (`stockByOutlet`), sedangkan `stock` menjadi
 *     cermin cabang pertama supaya struk, cadangan, dan server lama tetap jalan;
 *   - pelanggan, kategori, alokasi modal, dan profil tetap milik toko (bukan
 *     per cabang) — pelanggan boleh belanja di cabang mana saja.
 *
 * Semua fungsi di sini MURNI (tanpa state & UI) supaya bisa diuji lewat
 * `npm run test:outlets`.
 */
import type {
  AppSettings,
  CapitalAllocation,
  Category,
  Customer,
  Order,
  Outlet,
  Payable,
  Product,
  Receivable,
  Shift,
  Purchase,
  PurchaseReturn,
  StockOpname,
  Supplier,
  StoreProfile,
  Transaction,
} from './types';

export const MAX_OUTLETS = 3;

export interface OutletInput {
  name: string;
  code?: string;
  address?: string;
}

export type OutletValidation =
  | { ok: true; value: { name: string; code?: string; address?: string } }
  | { ok: false; reason: string };

export function cleanOutletName(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/** Kode cabang: huruf/angka saja, maks 6 karakter, huruf besar. */
export function cleanOutletCode(raw: string | undefined | null): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function validateOutlet(input: OutletInput, existing: Outlet[] = []): OutletValidation {
  const name = cleanOutletName(input.name);
  if (!name) return { ok: false, reason: 'Nama cabang wajib diisi.' };
  if (name.length < 2) return { ok: false, reason: 'Nama cabang terlalu pendek.' };

  const active = existing.filter((outlet) => !outlet.archivedAt);
  if (active.length >= MAX_OUTLETS) {
    return {
      ok: false,
      reason: `Maksimal ${MAX_OUTLETS} cabang aktif. Arsipkan salah satu bila ingin menambah.`,
    };
  }

  const duplicate = active.find((outlet) => outlet.name.toLowerCase() === name.toLowerCase());
  if (duplicate) return { ok: false, reason: `Cabang "${duplicate.name}" sudah ada.` };

  const code = cleanOutletCode(input.code);
  if (input.code && input.code.trim() && code.length < 2) {
    return { ok: false, reason: 'Kode cabang minimal 2 huruf/angka. Contoh: PSR1.' };
  }
  if (code && active.some((outlet) => cleanOutletCode(outlet.code) === code)) {
    return { ok: false, reason: 'Kode cabang sudah dipakai cabang lain.' };
  }

  const address = String(input.address ?? '').trim().slice(0, 120) || undefined;
  return { ok: true, value: { name, code, address } };
}

/** Nama cabang siap tampil (jangan pernah kosong di layar). */
export function outletLabel(outlet: Outlet | undefined | null, fallback = 'Cabang utama'): string {
  return cleanOutletName(outlet?.name) || fallback;
}

/** Cabang yang sedang dibuka; bila belum dipilih, pakai cabang aktif pertama. */
export function activeOutlet(
  outlets: Outlet[] | undefined,
  activeOutletId: string | null | undefined,
): Outlet | undefined {
  const list = outlets ?? [];
  const found = activeOutletId ? list.find((outlet) => outlet.id === activeOutletId) : undefined;
  const pengganti = list.find((outlet) => !outlet.archivedAt);
  // Cabang yang diarsipkan tidak boleh jadi cabang yang sedang dibuka.
  if (found && (!found.archivedAt || !pengganti)) return found;
  return pengganti ?? list[0];
}

/* ------------------------------------------------------------------ stok --- */

/**
 * Stok barang di satu cabang.
 *
 * Aturan penting: **hanya fungsi ini** yang boleh dipakai untuk membaca stok.
 * Bila `stockByOutlet` belum ada (data pra-Sprint 12), yang dipakai `stock` —
 * inilah yang membuat pengguna lama tidak melihat angka berubah.
 */
export function stockFor(product: Product, outletId: string | null | undefined): number {
  const value = outletId ? product.stockByOutlet?.[outletId] : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (!product.stockByOutlet) return Math.max(0, Math.round(product.stock));
  // Sudah bercabang tetapi cabang ini belum punya catatan: stoknya nol, bukan
  // meminjam angka cabang lain (itu yang membuat stok tercampur).
  return 0;
}

/** Salinan produk dengan stok satu cabang diubah. */
export function applyStockDelta(
  product: Product,
  outletId: string | null | undefined,
  delta: number,
): Product {
  if (!Number.isFinite(delta) || Math.round(delta) === 0) return product;
  const next = Math.max(0, stockFor(product, outletId) + Math.round(delta));
  return setStockAt(product, outletId, next);
}

/** Salinan produk dengan stok satu cabang disetel ke angka tertentu. */
export function setStockAt(
  product: Product,
  outletId: string | null | undefined,
  value: number,
): Product {
  const next = Math.max(0, Math.round(value));
  if (!outletId) return { ...product, stock: next };
  const stockByOutlet = { ...(product.stockByOutlet ?? {}), [outletId]: next };
  const cabang = Object.keys(stockByOutlet).length;
  return {
    ...product,
    stockByOutlet,
    // Toko satu cabang tetap memakai kolom `stock` supaya struk & cadangan lama
    // menghasilkan angka yang sama.
    stock: cabang <= 1 ? next : product.stock,
  };
}

/* --------------------------------------------------- migrasi ke cabang ----- */

export interface OutletAwareState {
  profile: Pick<StoreProfile, 'name' | 'code'>;
  outlets?: Outlet[];
  activeOutletId?: string | null;
  products?: Product[];
  transactions?: Transaction[];
  receivables?: Receivable[];
  payables?: Payable[];
  orders?: Order[];
  shifts?: Shift[];
}

export interface OutletMigration {
  outlets: Outlet[];
  activeOutletId: string;
  products: Product[];
  transactions: Transaction[];
  receivables: Receivable[];
  payables: Payable[];
  orders: Order[];
  shifts: Shift[];
  /** true bila ada perubahan (dipakai untuk memutuskan perlu menyimpan). */
  changed: boolean;
}

/** Cabang otomatis untuk toko yang belum punya cabang. */
export function defaultOutlet(profile: Pick<StoreProfile, 'name' | 'code'>, id = 'out_utama'): Outlet {
  const name = cleanOutletName(profile?.name) || 'Toko Saya';
  const code = cleanOutletCode(profile?.code) || 'UTAMA';
  return { id, name, code, createdAt: new Date().toISOString() };
}

const stamp = <T extends { outletId?: string }>(rows: T[] | undefined, outletId: string) =>
  (rows ?? []).map((row) => (row.outletId ? row : { ...row, outletId }));

/**
 * Siapkan data agar sadar-cabang. Aman dijalankan berulang: data yang sudah
 * rapi dikembalikan apa adanya (`changed: false`).
 */
export function migrateToOutlets(state: OutletAwareState): OutletMigration {
  const existing = state.outlets ?? [];
  const outlets = existing.length > 0 ? existing : [defaultOutlet(state.profile)];
  const activeOutletId = activeOutlet(outlets, state.activeOutletId)?.id ?? outlets[0].id;

  const firstId = outlets[0].id;
  const products = (state.products ?? []).map((product) =>
    product.stockByOutlet ? product : { ...product, stockByOutlet: { [firstId]: product.stock } },
  );

  const transactions = stamp(state.transactions, firstId);
  const receivables = stamp(state.receivables, firstId);
  const payables = stamp(state.payables, firstId);
  const orders = stamp(state.orders, firstId);
  const shifts = stamp(state.shifts, firstId);

  const changed =
    existing.length === 0 ||
    state.activeOutletId !== activeOutletId ||
    (state.products ?? []).some((product) => !product.stockByOutlet) ||
    (state.transactions ?? []).some((row) => !row.outletId) ||
    (state.receivables ?? []).some((row) => !row.outletId) ||
    (state.payables ?? []).some((row) => !row.outletId) ||
    (state.orders ?? []).some((row) => !row.outletId) ||
    (state.shifts ?? []).some((row) => !row.outletId);

  return {
    outlets,
    activeOutletId,
    products,
    transactions,
    receivables,
    payables,
    orders,
    shifts,
    changed,
  };
}

/* ------------------------------------------------------- tampilan cabang --- */

export interface ScopedData {
  profile: StoreProfile;
  settings: AppSettings;
  categories: Category[];
  /** Produk dengan `stock` sudah berisi stok cabang yang sedang dibuka. */
  products: Product[];
  transactions: Transaction[];
  receivables: Receivable[];
  payables: Payable[];
  allocations: CapitalAllocation[];
  shifts: Shift[];
  orders: Order[];
  customers: Customer[];
  /** Riwayat hitung stok cabang yang sedang dibuka. */
  opnames: StockOpname[];
  /** Riwayat kulakan cabang yang sedang dibuka. */
  purchases: Purchase[];
  /** Buku supplier dimiliki toko, bukan cabang (seperti buku pelanggan). */
  suppliers: Supplier[];
  /** Retur barang cabang yang sedang dibuka. */
  purchaseReturns: PurchaseReturn[];
  outlets: Outlet[];
  activeOutletId: string | null;
}

interface ScopeSource
  extends Omit<
    ScopedData,
    'outlets' | 'activeOutletId' | 'opnames' | 'purchases' | 'suppliers' | 'purchaseReturns'
  > {
  outlets?: Outlet[];
  activeOutletId?: string | null;
  opnames?: StockOpname[];
  purchases?: Purchase[];
  suppliers?: Supplier[];
  purchaseReturns?: PurchaseReturn[];
}

/**
 * Data untuk layar: hanya baris milik cabang yang sedang dibuka.
 *
 * Bila toko hanya punya satu cabang (atau belum dimigrasi), objek yang
 * dikembalikan **sama persis** dengan aslinya — sehingga angka untuk pengguna
 * lama tidak mungkin berubah karena sprint ini.
 */
export function scopeData(data: ScopeSource): ScopedData {
  const outlets = data.outlets ?? [];
  const current = activeOutlet(data.outlets, data.activeOutletId);
  const outletId = current?.id ?? null;

  if (outlets.length <= 1) {
    return {
      ...data,
      outlets,
      activeOutletId: outletId,
      products: data.products.map((product) => ({
        ...product,
        stock: stockFor(product, outletId),
      })),
      orders: data.orders ?? [],
      customers: data.customers ?? [],
      opnames: data.opnames ?? [],
      purchases: data.purchases ?? [],
      suppliers: data.suppliers ?? [],
      purchaseReturns: data.purchaseReturns ?? [],
    };
  }

  const mine = <T extends { outletId?: string }>(rows: T[] | undefined): T[] =>
    (rows ?? []).filter((row) => !row.outletId || row.outletId === outletId);

  return {
    ...data,
    outlets,
    activeOutletId: outletId,
    products: data.products.map((product) => ({
      ...product,
      stock: stockFor(product, outletId),
    })),
    transactions: mine(data.transactions),
    receivables: mine(data.receivables),
    payables: mine(data.payables),
    orders: mine(data.orders),
    shifts: mine(data.shifts),
    allocations: data.allocations,
    customers: data.customers ?? [],
    opnames: mine(data.opnames),
    purchases: mine(data.purchases),
    suppliers: data.suppliers ?? [],
    purchaseReturns: mine(data.purchaseReturns),
  };
}

export interface OutletTotals {
  outlet: Outlet;
  transactions: number;
  sales: number;
  receivablesOpen: number;
  isActive: boolean;
}

/**
 * Ringkasan singkat per cabang untuk layar Cabang — sengaja hanya 3 angka yang
 * bisa dijelaskan ke pemilik warung: jumlah transaksi, omzet, dan kasbon
 * berjalan.
 */
export function outletTotals(data: ScopeSource): OutletTotals[] {
  const outlets = data.outlets ?? [];
  return outlets.map((outlet) => {
    const transactions = (data.transactions ?? []).filter(
      (tx) => tx.outletId === outlet.id || (!tx.outletId && outlet.id === outlets[0]?.id),
    );
    const receivables = (data.receivables ?? []).filter(
      (rcv) => rcv.outletId === outlet.id || (!rcv.outletId && outlet.id === outlets[0]?.id),
    );
    // Hanya penjualan yang dihitung, supaya angka "transaksi" dan "omzet"
    // bercerita hal yang sama (pengeluaran tidak menggelembungkan hitungan).
    const salesRows = transactions.filter((tx) => tx.type === 'sale');
    const sales = salesRows.reduce((sum, tx) => sum + tx.amount, 0);
    const receivablesOpen = receivables.reduce((sum, rcv) => {
      const paid = rcv.payments.reduce((total, payment) => total + payment.amount, 0);
      return sum + Math.max(0, rcv.amount - paid);
    }, 0);
    return {
      outlet,
      transactions: salesRows.length,
      sales,
      receivablesOpen,
      isActive: outlet.id === activeOutlet(outlets, data.activeOutletId)?.id,
    };
  });
}
