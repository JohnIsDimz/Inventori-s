/**
 * State global aplikasi (Zustand + AsyncStorage).
 *
 * Semua data bisnis dimulai dari NOL — tidak ada saldo, transaksi, kasbon,
 * atau produk contoh.
 *
 * Hasil audit: setiap mutasi sekarang **memvalidasi input di lapisan store**
 * (bukan hanya di UI) dan mengembalikan `MutationResult`, sehingga pemanggil
 * wajib menangani kegagalan. Sebelumnya nominal negatif/NaN, pembayaran
 * melebihi sisa tagihan, dan penghapusan yang ditolak bisa lolos tanpa pesan.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_CATEGORIES } from './categories';
import {
  cleanCustomerName,
  customerHistory,
  matchCustomer,
  validateCustomer,
} from './customers';
import { normalizeOrderItems, orderTotal } from './orders';
import {
  activeOutlet,
  applyStockDelta,
  migrateToOutlets,
  setStockAt,
  stockFor,
  validateOutlet,
} from './outlets';
import { buildOpnameLines, summarizeOpname, type OpnameLine } from './opname';
import {
  availableCredit,
  buildReturnItems,
  cleanSupplierName,
  returnCandidates,
  returnTotal,
  supplierKey,
  supplierNamesFrom,
  validateReturn,
  validateSupplier,
  type SupplierInput,
} from './suppliers';
import {
  averageCost,
  buildPurchaseItems,
  purchaseTotal,
  purchaseRemaining,
  validatePurchase,
  type PurchaseEntry,
} from './purchases';
import { localJsonStorage } from '../services/db/persistence';
import {
  applyBackup,
  buildBackup,
  parseBackup,
  type BackupPayload,
  type RestoreResult,
} from '../services/backup';
import { newUuid } from '../services/sync/idmap';
import { enqueue } from '../services/sync/outbox';
import type {
  AppSettings,
  CapitalAllocation,
  Category,
  Customer,
  DebtPayment,
  Outlet,
  StockOpname,
  LineItem,
  MutationResult,
  PayMethod,
  Order,
  OrderItem,
  Payable,
  Product,
  Purchase,
  PurchaseReturn,
  Receivable,
  Shift,
  StoreProfile,
  Supplier,
  Transaction,
  TxType,
} from './types';
import type { RemotePatch } from './types';
import { debtPaidCash } from './selectors';
import { MAX_AMOUNT, normalizeAmount, normalizeQty, safeISODate } from '../utils/security';

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export type { MutationResult };

const ok = (id?: string): MutationResult => ({ ok: true, id });
const fail = (reason: string): MutationResult => ({ ok: false, reason });
const okState: MutationResult = { ok: true };

/**
 * Penyimpanan state aplikasi.
 *
 * Dulu: satu blob JSON di AsyncStorage. Sekarang: tabel `app_kv` di SQLite
 * (`services/db/persistence.ts`) yang otomatis menyalin data lama sekali saat
 * aplikasi pertama dijalankan, jadi pengguna tidak kehilangan catatan.
 */
const DEFAULT_PROFILE: StoreProfile = {
  name: '',
  ownerName: '',
  code: '',
  openTime: '06:00',
  closeTime: '21:00',
};

const DEFAULT_SETTINGS: AppSettings = {
  hideBalance: false,
  autoPrint: false,
  printerName: '',
  printerAddress: '',
  reminderTemplate:
    'Halo {nama}, kami catat kasbon di {toko} sebesar {nominal} dengan jatuh tempo {tanggal}. Mohon dibayarkan bila sudah memungkinkan ya. Terima kasih.',
  taxPercent: 0,
  lastBackupAt: null,
  notifEnabled: false,
  notifHour: 8,
};

/** Hitungan uang satu transaksi: subtotal → diskon → pajak → total.
 *  Dipakai klien & dicocokkan ulang oleh server (sync_transaction). */
export const computeTotals = (input: {
  subtotal: number;
  discountKind?: 'amount' | 'percent';
  discountValue?: number;
  taxRate?: number;
}) => {
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const subtotal = Math.max(0, round2(input.subtotal));
  const kind = input.discountKind ?? 'amount';
  const raw = Math.max(0, input.discountValue ?? 0);
  const discount =
    kind === 'percent'
      ? round2((subtotal * Math.min(raw, 100)) / 100)
      : Math.min(round2(raw), subtotal);
  const taxRate = Math.min(Math.max(input.taxRate ?? 0, 0), 100);
  const tax = round2(((subtotal - discount) * taxRate) / 100);
  return { subtotal, discount, discountKind: kind, discountValue: raw, tax, taxRate, total: round2(subtotal - discount + tax) };
};

export interface NewTransactionInput {
  type: TxType;
  amount: number;
  categoryId: string;
  method: PayMethod;
  note?: string;
  photoUri?: string;
  createdAt?: string;
  /** Wajib untuk metode kasbon; opsional untuk metode lain (pelanggan tetap). */
  customerName?: string;
  customerPhone?: string;
  /** Bila diisi, nama & nomor HP diambil dari buku pelanggan. */
  customerId?: string;
  /**
   * Bila nama pelanggan diketik dan belum ada di buku, simpan namanya ke buku
   * pelanggan (supaya riwayat & poin ikut terhitung). Default: tidak disimpan.
   */
  saveCustomer?: boolean;
  /** Cabang tujuan. Kosong = cabang yang sedang dibuka. */
  outletId?: string;
  dueDate?: string;
  items?: LineItem[];
  /** Subtotal sebelum diskon & pajak; kosong berarti sama dengan `amount`. */
  subtotal?: number;
  discountKind?: 'amount' | 'percent';
  discountValue?: number;
  taxRate?: number;
}

export interface NewOrderInput {
  customerName: string;
  customerPhone?: string;
  customerId?: string;
  items: OrderItem[];
  dueDate?: string;
  note?: string;
  /** Uang muka yang diterima saat pesanan dibuat (0 = tanpa DP). */
  deposit?: number;
}

export interface NewDebtInput {
  customerName?: string;
  customerId?: string;
  amount: number;
  dueDate: string;
  note?: string;
  items?: LineItem[];
}

interface AppState {
  profile: StoreProfile;
  settings: AppSettings;
  categories: Category[];
  transactions: Transaction[];
  receivables: Receivable[];
  payables: Payable[];
  products: Product[];
  allocations: CapitalAllocation[];
  shifts: Shift[];
  orders: Order[];
  customers: Customer[];
  outlets: Outlet[];
  /** Cabang yang sedang dibuka (null = cabang pertama). */
  activeOutletId: string | null;
  /** Riwayat hitung fisik stok (Sprint 13). */
  opnames: StockOpname[];
  /** Riwayat kulakan supplier (Sprint 14). */
  purchases: Purchase[];
  /** Buku supplier (Sprint 15). */
  suppliers: Supplier[];
  /** Retur barang ke supplier (Sprint 15). */
  purchaseReturns: PurchaseReturn[];

  updateProfile: (patch: Partial<StoreProfile>) => MutationResult;
  updateSettings: (patch: Partial<AppSettings>) => MutationResult;

  addTransaction: (input: NewTransactionInput) => MutationResult;
  deleteTransaction: (id: string) => MutationResult;

  addReceivable: (input: NewDebtInput) => MutationResult;
  payReceivable: (id: string, amount: number, method?: PayMethod, note?: string) => MutationResult;
  deleteReceivable: (id: string) => MutationResult;
  /** Tandai kasbon sudah ditagih (WhatsApp) supaya tidak ditagih berulang. */
  markReminded: (id: string, at?: string) => MutationResult;

  addPayable: (input: {
    supplierName: string;
    amount: number;
    dueDate: string;
    note?: string;
  }) => MutationResult;
  payPayable: (id: string, amount: number, method?: PayMethod, note?: string) => MutationResult;
  deletePayable: (id: string) => MutationResult;

  upsertProduct: (product: Omit<Product, 'id'> & { id?: string }) => MutationResult;
  findByBarcode: (barcode: string) => Product | undefined;
  deleteProduct: (id: string) => MutationResult;
  adjustStock: (id: string, delta: number) => MutationResult;

  addCategory: (category: Omit<Category, 'id'> & { id?: string }) => MutationResult;
  deleteCategory: (id: string) => MutationResult;

  /** Positif = kas → tabungan modal, negatif = tabungan → kas. */
  moveCapital: (amount: number) => MutationResult;
  deleteAllocation: (id: string) => MutationResult;

  /** Buka shift kasir dengan modal awal di laci. */
  openShift: (openingCash: number) => MutationResult;
  /** Tutup shift: uang fisik dihitung, selisih dicatat. */
  closeShift: (closingCash: number, note?: string) => MutationResult;

  /** Pesanan / kuotasi: belum mengubah stok dan belum masuk omzet. */
  addOrder: (input: NewOrderInput) => MutationResult;
  updateOrder: (
    id: string,
    patch: Partial<Pick<Order, 'customerName' | 'customerPhone' | 'dueDate' | 'note' | 'items' | 'deposit'>>,
  ) => MutationResult;
  cancelOrder: (id: string) => MutationResult;
  deleteOrder: (id: string) => MutationResult;
  /** Ubah pesanan menjadi transaksi penjualan (stok & omzet baru bergerak di sini). */
  completeOrder: (id: string, payment: { method: PayMethod; dueDate?: string }) => MutationResult;

  /** Buku pelanggan (Sprint 11). */
  addCustomer: (input: { name: string; phone?: string; note?: string }) => MutationResult;
  updateCustomer: (
    id: string,
    patch: { name?: string; phone?: string; note?: string },
  ) => MutationResult;
  /** Hapus dari buku. Riwayat transaksi & kasbon tetap utuh dengan namanya. */
  deleteCustomer: (id: string) => MutationResult;
  /** Cari pelanggan yang namanya sama persis (untuk menautkan kasbon lama). */
  findCustomerByName: (name: string) => Customer | undefined;

  /**
   * Pastikan data sudah sadar-cabang. Dijalankan sekali setelah data dimuat —
   * untuk toko baru/lama hasilnya satu cabang otomatis, tanpa layar tambahan.
   */
  ensureOutlets: () => void;
  addOutlet: (input: { name: string; code?: string; address?: string }) => MutationResult;
  updateOutlet: (
    id: string,
    patch: { name?: string; code?: string; address?: string },
  ) => MutationResult;
  /** Arsipkan cabang: hilang dari pemilih, riwayatnya tetap utuh. */
  archiveOutlet: (id: string) => MutationResult;
  switchOutlet: (id: string) => MutationResult;

  /**
   * Simpan hasil hitung fisik. Hanya barang yang diisi yang diubah; uang kas
   * tidak disentuh (barang hilang bukan pengeluaran tunai).
   */
  commitOpname: (input: { counts: Record<string, string | number>; note?: string }) => MutationResult;

  /**
   * Catat kulakan supplier: stok cabang bertambah, HPP menjadi rata-rata
   * tertimbang, uang yang dibayar dicatat sebagai pengeluaran, sisanya utang.
   */
  commitPurchase: (input: {
    supplierName: string;
    entries: Record<string, PurchaseEntry | undefined>;
    paid: number;
    method?: PayMethod;
    dueDate?: string;
    note?: string;
  }) => MutationResult;

  /** Lengkapi buku supplier dari nama yang sudah dipakai (idempoten). */
  ensureSuppliers: () => void;
  addSupplier: (input: SupplierInput) => MutationResult;
  updateSupplier: (id: string, patch: Partial<SupplierInput>) => MutationResult;
  archiveSupplier: (id: string) => MutationResult;

  /**
   * Retur barang ke supplier: stok berkurang, nilai retur memotong utang
   * kulakan lebih dulu, sisanya menjadi saldo untuk kulakan berikutnya.
   */
  commitReturn: (input: {
    supplierName: string;
    counts: Record<string, string | number | undefined>;
    note?: string;
  }) => MutationResult;

  resetAll: () => void;

  /**
   * Gabungkan hasil tarikan server. Data yang masih menunggu dikirim sudah
   * disaring mesin sinkron, jadi aman dipanggil kapan pun.
   */
  mergeRemote: (patch: RemotePatch) => void;

  /** Cadangan lokal: teks JSON siap dibagikan/disimpan. */
  exportBackupText: () => string;
  /** Catat bahwa cadangan berhasil dibuat (untuk pengingat di Beranda). */
  markBackupDone: (at?: string) => void;
  /** Pulihkan dari teks JSON. `merge` tidak menghapus data yang ada. */
  importBackupText: (
    text: string,
    mode: 'merge' | 'latest' | 'replace',
  ) => { ok: true; result: RestoreResult } | { ok: false; reason: string };
}

const emptyData = () => ({
  profile: { ...DEFAULT_PROFILE },
  settings: { ...DEFAULT_SETTINGS },
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  transactions: [] as Transaction[],
  receivables: [] as Receivable[],
  payables: [] as Payable[],
  products: [] as Product[],
  allocations: [] as CapitalAllocation[],
  shifts: [] as Shift[],
  orders: [] as Order[],
  customers: [] as Customer[],
  outlets: [] as Outlet[],
  activeOutletId: null as string | null,
  opnames: [] as StockOpname[],
  purchases: [] as Purchase[],
  suppliers: [] as Supplier[],
  purchaseReturns: [] as PurchaseReturn[],
});

const makePayment = (
  amount: number,
  method: PayMethod,
  note?: string,
  source?: 'retur',
): DebtPayment => ({
  id: uid('pay'),
  amount,
  method,
  note,
  source,
  paidAt: new Date().toISOString(),
});

const paidOf = (payments: { amount: number }[]) => payments.reduce((sum, p) => sum + p.amount, 0);

// ---------------------------------------------------------------- sinkron
// Setiap perubahan dicatat ke antrean keluar. Fungsi-fungsi ini tidak pernah
// menghambat UI: `void` + penanganan error di dalam `enqueue`.
/**
 * Kirim data produk + perubahan stok sebagai DELTA (sprint 2).
 * `stockRef` membuat server mengenali kiriman ulang, sehingga stok tidak
 * bertambah/berkurang dua kali saat sinyal putus di tengah jalan.
 */
const pushProduct = (product: Product, stockDelta = 0, isNew = false) =>
  void enqueue('product', 'upsert', {
    // `stock` sengaja tidak dikirim: server menghitung sendiri dari delta.
    id: product.id,
    name: product.name,
    unit: product.unit,
    barcode: product.barcode,
    sellPrice: product.sellPrice,
    costPrice: product.costPrice,
    minStock: product.minStock,
    wholesalePrice: product.wholesalePrice ?? null,
    wholesaleMinQty: product.wholesaleMinQty ?? null,
    ...(stockDelta !== 0
      ? {
          stockDelta,
          stockReason: isNew ? 'opening' : 'adjust',
          stockRef: newUuid(),
        }
      : {}),
  });
/**
 * Buku pelanggan masih tersimpan di HP ini saja (server belum punya tabelnya),
 * jadi `customerId` tidak ikut dikirim — server tidak perlu tahu, dan kiriman
 * tetap diterima apa adanya.
 */
const withoutCustomerId = (row: object): Record<string, unknown> => {
  const { customerId: _ignored, ...rest } = row as Record<string, unknown> & {
    customerId?: string;
  };
  return rest;
};
const pushTransaction = (tx: Transaction) => void enqueue('transaction', 'upsert', withoutCustomerId(tx));
const pushOrder = (order: Order) => void enqueue('order', 'upsert', withoutCustomerId(order));
const pushReceivable = (receivable: Receivable) =>
  void enqueue('receivable', 'upsert', withoutCustomerId(receivable));
const pushPayable = (payable: Payable) =>
  void enqueue('payable', 'upsert', payable as unknown as Record<string, unknown>);
const pushReceivablePayment = (receivableId: string, payment: DebtPayment) =>
  void enqueue('receivable_payment', 'upsert', {
    id: payment.id,
    receivableId,
    amount: payment.amount,
    method: payment.method,
    note: payment.note,
    paidAt: payment.paidAt,
  });
const pushShift = (shift: Shift) =>
  void enqueue('shift', 'upsert', shift as unknown as Record<string, unknown>);
const pushPayablePayment = (payableId: string, payment: DebtPayment) =>
  void enqueue('payable_payment', 'upsert', {
    id: payment.id,
    payableId,
    amount: payment.amount,
    method: payment.method,
    note: payment.note,
    paidAt: payment.paidAt,
  });

/** Gabungkan baris dari server tanpa menghapus data lokal yang belum terkirim. */
function mergeList<T extends { id: string }>(current: T[], incoming?: T[]): T[] {
  if (!incoming || incoming.length === 0) return current;
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

/** Cabang yang sedang dibuka (dipakai semua mutasi baru). */
const outletOf = (state: { outlets?: Outlet[]; activeOutletId?: string | null }): string | null =>
  activeOutlet(state.outlets, state.activeOutletId)?.id ?? null;

/** Terapkan perubahan stok dari rincian barang (qty negatif = keluar). */
function applyStockDeltas(
  products: Product[],
  items: LineItem[] | undefined,
  sign: 1 | -1,
  outletId: string | null = null,
): Product[] {
  if (!items || items.length === 0) return products;
  const deltas = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    deltas.set(item.productId, (deltas.get(item.productId) ?? 0) + item.qty * sign);
  }
  if (deltas.size === 0) return products;
  return products.map((product) => {
    const delta = deltas.get(product.id);
    if (!delta) return product;
    return applyStockDelta(product, outletId, delta);
  });
}

function normalizeItems(items?: LineItem[]): LineItem[] | undefined {
  if (!items || items.length === 0) return undefined;
  const cleaned: LineItem[] = [];
  for (const item of items) {
    const qty = normalizeQty(item.qty);
    const price = normalizeAmount(item.price, { min: 0 });
    if (qty === null || price === null) continue;
    cleaned.push({
      productId: item.productId,
      name: String(item.name ?? '').trim().slice(0, 80) || 'Barang',
      qty,
      price,
      cost: item.cost === undefined ? undefined : Math.max(0, Math.round(item.cost)),
      discount:
        item.discount === undefined ? undefined : Math.max(0, Math.round(item.discount)),
    });
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...emptyData(),

      updateProfile: (patch) => {
        const next: StoreProfile = { ...get().profile, ...patch };
        const timeOk = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
        if (!timeOk(next.openTime) || !timeOk(next.closeTime)) {
          return fail('Format jam harus HH:MM (contoh 06:00).');
        }
        if (next.name.length > 60) return fail('Nama toko terlalu panjang (maks 60 karakter).');
        set({ profile: next });
        void enqueue('profile', 'upsert', {
          name: next.name,
          phone: next.phone,
          openTime: next.openTime,
          closeTime: next.closeTime,
        });
        return ok();
      },

      updateSettings: (patch) => {
        if (patch.reminderTemplate !== undefined && !patch.reminderTemplate.trim()) {
          return fail('Template pesan tidak boleh kosong.');
        }
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        return okState;
      },

      addTransaction: (input) => {
        const state = get();
        const amount = normalizeAmount(input.amount);
        if (amount === null) {
          return fail(
            input.amount > MAX_AMOUNT
              ? 'Nominal melebihi batas yang didukung.'
              : 'Nominal transaksi tidak valid.',
          );
        }
        if (input.method === 'kasbon' && input.type === 'expense') {
          return fail('Kasbon hanya berlaku untuk pemasukan, bukan pengeluaran.');
        }
        if (!state.categories.some((c) => c.id === input.categoryId)) {
          return fail('Kategori tidak ditemukan. Pilih kategori lain.');
        }

        let picked = input.customerId
          ? state.customers.find((customer) => customer.id === input.customerId)
          : matchCustomer(state.customers, input.customerName);
        if (input.customerId && !picked) {
          return fail('Pelanggan tidak ditemukan. Pilih ulang dari buku pelanggan.');
        }
        let customerName = cleanCustomerName(picked?.name ?? input.customerName);
        if (input.method === 'kasbon' && customerName.length === 0) {
          return fail('Nama pelanggan wajib diisi untuk transaksi kasbon.');
        }

        // Nama yang diketik (bukan dipilih dari buku) bisa langsung disimpan
        // supaya transaksi tunai juga masuk riwayat & poin pelanggan.
        if (!picked && customerName && input.saveCustomer) {
          const checked = validateCustomer({ name: customerName });
          if (checked.ok) {
            picked = {
              id: uid('cus'),
              name: checked.value.name,
              phone: checked.value.phone,
              note: checked.value.note,
              createdAt: new Date().toISOString(),
            };
            customerName = picked.name;
            const created = picked;
            set((current) => ({ customers: [created, ...current.customers] }));
          }
        }

        const createdAt = safeISODate(input.createdAt);
        const items = normalizeItems(input.items);

        // Diskon & pajak dihitung ulang di sini supaya angka yang disimpan lokal
        // sama persis dengan yang nanti dihitung server.
        const totals = computeTotals({
          subtotal: typeof input.subtotal === 'number' && input.subtotal > 0 ? input.subtotal : amount,
          discountKind: input.discountKind,
          discountValue: input.discountValue,
          taxRate: input.taxRate,
        });
        const finalAmount = normalizeAmount(totals.total);
        if (finalAmount === null || totals.total <= 0) {
          return fail('Total setelah diskon & pajak tidak valid.');
        }

        const id = uid('tx');
        const note = input.note?.trim().slice(0, 240) || undefined;
        const outletId = input.outletId ?? outletOf(state) ?? undefined;

        if (input.method === 'kasbon') {
          const receivableId = uid('rcv');
          const dueDate = safeISODate(input.dueDate, new Date(Date.now() + 7 * 86_400_000).toISOString());
          const receivable: Receivable = {
            id: receivableId,
            customerName: customerName || 'Pelanggan',
            customerId: picked?.id,
            outletId,
            amount: finalAmount,
            dueDate,
            createdAt,
            note,
            items,
            payments: [],
          };
          set((s) => ({
            receivables: [receivable, ...s.receivables],
            transactions: [
              {
                id,
                type: input.type,
                amount: finalAmount,
                categoryId: input.categoryId,
                method: 'kasbon',
                note,
                photoUri: input.photoUri,
                createdAt,
                items,
                receivableId,
                customerId: picked?.id,
                outletId,
                subtotal: totals.subtotal,
                discount: totals.discount,
                discountKind: totals.discountKind,
                discountValue: totals.discountValue,
                tax: totals.tax,
                taxRate: totals.taxRate,
              },
              ...s.transactions,
            ],
            // Hanya penjualan yang mengurangi stok. Rincian barang pada
            // pengeluaran disimpan sebagai catatan saja — penambahan stok wajib
            // lewat Catat kulakan supaya harga modal ikut diperbarui.
            products:
              input.type === 'sale'
                ? applyStockDeltas(s.products, items, -1, outletId ?? null)
                : s.products,
          }));
          pushReceivable(receivable);
          const created = get().transactions.find((t) => t.id === id);
          if (created) pushTransaction(created);
          return ok(id);
        }

        set((s) => ({
          transactions: [
            {
              id,
              type: input.type,
              amount: finalAmount,
              categoryId: input.categoryId,
              method: input.method,
              note,
              photoUri: input.photoUri,
              createdAt,
              items,
              customerId: picked?.id,
              outletId,
              subtotal: totals.subtotal,
              discount: totals.discount,
              discountKind: totals.discountKind,
              discountValue: totals.discountValue,
              tax: totals.tax,
              taxRate: totals.taxRate,
            },
            ...s.transactions,
          ],
          products:
            input.type === 'sale'
              ? applyStockDeltas(s.products, items, -1, outletId ?? null)
              : s.products,
        }));
        const stored = get().transactions.find((t) => t.id === id);
        if (stored) pushTransaction(stored);
        return ok(id);
      },

      deleteTransaction: (id) => {
        const state = get();
        const tx = state.transactions.find((t) => t.id === id);
        if (!tx) return fail('Transaksi tidak ditemukan.');

        const linked = tx.receivableId
          ? state.receivables.find((r) => r.id === tx.receivableId)
          : undefined;
        if (linked && paidOf(linked.payments) > 0) {
          return fail(
            'Transaksi ini sudah punya pembayaran kasbon. Hapus/ubah pembayarannya dulu di menu Kasbon.',
          );
        }

        // Transaksi hasil pesanan: pesanannya dibuka lagi supaya bisa
        // diserahkan ulang, bukan tertinggal "selesai" tanpa transaksi.
        const linkedOrder = state.orders.find(
          (order) => order.transactionId === id && order.status === 'selesai',
        );
        const reopenedOrder: Order | null = linkedOrder
          ? {
              ...linkedOrder,
              status: 'terbuka',
              transactionId: undefined,
              updatedAt: new Date().toISOString(),
            }
          : null;

        set((s) => ({
          transactions: s.transactions.filter((t) => t.id !== id),
          receivables: linked ? s.receivables.filter((r) => r.id !== linked.id) : s.receivables,
          orders: reopenedOrder
            ? s.orders.map((order) => (order.id === reopenedOrder.id ? reopenedOrder : order))
            : s.orders,
          // Stok penjualan dikembalikan agar katalog tetap akurat. Pengeluaran
          // tidak pernah mengubah stok, jadi tidak ada yang perlu dibalik.
          products:
            tx.type === 'sale'
              ? applyStockDeltas(s.products, tx.items, 1, tx.outletId ?? null)
              : s.products,
        }));
        void enqueue('transaction', 'delete', { id, voidReason: 'dibatalkan di aplikasi' });
        if (linked) void enqueue('receivable', 'delete', { id: linked.id });
        if (reopenedOrder) pushOrder(reopenedOrder);
        return ok(id);
      },

      addReceivable: (input) => {
        const state = get();
        const picked = input.customerId
          ? state.customers.find((customer) => customer.id === input.customerId)
          : matchCustomer(state.customers, input.customerName);
        const name = cleanCustomerName(picked?.name ?? input.customerName);
        if (!name) return fail('Nama pelanggan wajib diisi.');
        const amount = normalizeAmount(input.amount);
        if (amount === null) return fail('Nominal kasbon tidak valid.');
        const id = uid('rcv');
        const receivable: Receivable = {
          id,
          customerName: name,
          customerId: picked?.id,
          outletId: outletOf(state) ?? undefined,
          amount,
          dueDate: safeISODate(input.dueDate),
          createdAt: new Date().toISOString(),
          note: input.note?.trim().slice(0, 240) || undefined,
          items: normalizeItems(input.items),
          payments: [],
        };
        set((s) => ({ receivables: [receivable, ...s.receivables] }));
        pushReceivable(receivable);
        return ok(id);
      },

      payReceivable: (id, amount, method = 'cash', note) => {
        const receivable = get().receivables.find((r) => r.id === id);
        if (!receivable) return fail('Kasbon tidak ditemukan.');
        const remaining = receivable.amount - paidOf(receivable.payments);
        if (remaining <= 0) return fail('Kasbon ini sudah lunas.');
        const value = normalizeAmount(amount, { max: remaining });
        if (value === null) {
          return fail(`Jumlah pembayaran harus antara Rp 1 dan sisa tagihan (${remaining}).`);
        }
        const payment = makePayment(value, method, note);
        set((s) => ({
          receivables: s.receivables.map((r) =>
            r.id === id ? { ...r, payments: [...r.payments, payment] } : r,
          ),
        }));
        pushReceivablePayment(id, payment);
        return ok();
      },

      markReminded: (id, at) => {
        const receivable = get().receivables.find((row) => row.id === id);
        if (!receivable) return fail('Kasbon tidak ditemukan.');
        const stamp = at ?? new Date().toISOString();
        const next: Receivable = {
          ...receivable,
          lastRemindedAt: stamp,
          remindCount: (receivable.remindCount ?? 0) + 1,
        };
        set((current) => ({
          receivables: current.receivables.map((row) => (row.id === id ? next : row)),
        }));
        pushReceivable(next);
        return ok(id);
      },

      deleteReceivable: (id) => {
        const receivable = get().receivables.find((r) => r.id === id);
        if (!receivable) return fail('Kasbon tidak ditemukan.');
        if (paidOf(receivable.payments) > 0) {
          return fail('Kasbon yang sudah memiliki pembayaran tidak bisa dihapus.');
        }
        const removed = get().transactions.filter((t) => t.receivableId === id);
        set((s) => {
          // Transaksi terkait ikut dihapus agar omzet tidak "hantu", dan stok
          // barang yang sempat terjual dikembalikan seperti batal jual — ke
          // cabang tempat transaksi itu terjadi, bukan ke cabang yang kebetulan
          // sedang dibuka.
          const products = removed.reduce(
            (acc, tx) => applyStockDeltas(acc, tx.items, tx.type === 'sale' ? 1 : -1, tx.outletId ?? null),
            s.products,
          );
          return {
            receivables: s.receivables.filter((r) => r.id !== id),
            transactions: s.transactions.filter((t) => t.receivableId !== id),
            products,
          };
        });
        void enqueue('receivable', 'delete', { id });
        for (const tx of removed) {
          void enqueue('transaction', 'delete', { id: tx.id, voidReason: 'kasbon dihapus' });
        }
        return ok(id);
      },

      addPayable: (input) => {
        const name = input.supplierName?.trim().slice(0, 60) ?? '';
        if (!name) return fail('Nama supplier wajib diisi.');
        const amount = normalizeAmount(input.amount);
        if (amount === null) return fail('Nominal utang tidak valid.');
        const id = uid('pay');
        const payable: Payable = {
          id,
          supplierName: name,
          outletId: outletOf(get()) ?? undefined,
          amount,
          dueDate: safeISODate(input.dueDate),
          createdAt: new Date().toISOString(),
          note: input.note?.trim().slice(0, 240) || undefined,
          payments: [],
        };
        set((s) => ({ payables: [payable, ...s.payables] }));
        pushPayable(payable);
        return ok(id);
      },

      payPayable: (id, amount, method = 'cash', note) => {
        const payable = get().payables.find((p) => p.id === id);
        if (!payable) return fail('Utang tidak ditemukan.');
        const remaining = payable.amount - paidOf(payable.payments);
        if (remaining <= 0) return fail('Utang ini sudah lunas.');
        const value = normalizeAmount(amount, { max: remaining });
        if (value === null) {
          return fail(`Jumlah pembayaran harus antara Rp 1 dan sisa utang (${remaining}).`);
        }
        const payment = makePayment(value, method, note);
        set((s) => ({
          payables: s.payables.map((p) =>
            p.id === id ? { ...p, payments: [...p.payments, payment] } : p,
          ),
        }));
        pushPayablePayment(id, payment);
        return ok();
      },

      deletePayable: (id) => {
        const payable = get().payables.find((p) => p.id === id);
        if (!payable) return fail('Utang tidak ditemukan.');
        if (paidOf(payable.payments) > 0) {
          return fail('Utang yang sudah memiliki pembayaran tidak bisa dihapus.');
        }
        set((s) => ({ payables: s.payables.filter((p) => p.id !== id) }));
        void enqueue('payable', 'delete', { id });
        return ok(id);
      },

      upsertProduct: (product) => {
        const name = product.name?.trim().slice(0, 60) ?? '';
        if (!name) return fail('Nama barang wajib diisi.');
        const sellPrice = normalizeAmount(product.sellPrice, { min: 0 });
        const costPrice = normalizeAmount(product.costPrice, { min: 0 });
        const stock = normalizeAmount(product.stock, { min: 0 });
        const minStock = normalizeAmount(product.minStock, { min: 0 });
        if (sellPrice === null || costPrice === null || stock === null || minStock === null) {
          return fail('Harga dan stok harus berupa angka 0 atau lebih.');
        }
        const barcode = (product.barcode ?? '').trim().slice(0, 32) || undefined;
        if (barcode) {
          const duplicate = get().products.some(
            (p) => p.id !== product.id && p.barcode === barcode,
          );
          if (duplicate) return fail('Barcode ini sudah dipakai barang lain.');
        }
        // Harga grosir: harus lengkap (harga + minimal jumlah) atau kosong sama sekali.
        const rawWPrice = product.wholesalePrice;
        const rawWQty = product.wholesaleMinQty;
        const hasWPrice = rawWPrice !== undefined && rawWPrice !== null && Number(rawWPrice) > 0;
        const hasWQty = rawWQty !== undefined && rawWQty !== null && Number(rawWQty) >= 1;
        if (rawWPrice !== undefined && rawWPrice !== null && Number(rawWPrice) > 0 && !hasWQty) {
          return fail('Minimal jumlah grosir harus 1 atau lebih.');
        }
        if (hasWPrice !== hasWQty) {
          return fail('Isi harga grosir dan minimal jumlahnya sekaligus.');
        }
        const wholesalePrice = hasWPrice ? normalizeAmount(rawWPrice, { min: 1 }) ?? undefined : undefined;
        const wholesaleMinQty = hasWQty ? normalizeAmount(rawWQty, { min: 1 }) ?? undefined : undefined;

        const payload = {
          name,
          unit: (product.unit?.trim() || 'pcs').slice(0, 12),
          sellPrice,
          costPrice,
          stock,
          minStock,
          barcode,
          wholesalePrice,
          wholesaleMinQty,
        };

        const state = get();
        const outletId = outletOf(state);
        const base = { ...payload, stock: 0 };

        if (product.id && state.products.some((p) => p.id === product.id)) {
          const previous = state.products.find((p) => p.id === product.id);
          const before = previous ? stockFor(previous, outletId) : 0;
          let updated: Product | undefined;
          set((s) => ({
            products: s.products.map((p) => {
              if (p.id !== product.id) return p;
              // Stok yang diisi kasir hanya berlaku untuk cabang yang dibuka.
              const next = setStockAt({ ...p, ...payload }, outletId, stock);
              updated = { ...next, stock: stockFor(next, outletId) };
              return updated;
            }),
          }));
          if (updated) pushProduct(updated, stock - before);
          return ok(product.id);
        }

        const id = product.id ?? uid('prd');
        const created = setStockAt({ ...base, id }, outletId, stock);
        set((s) => ({ products: [created, ...s.products] }));
        pushProduct(created, stock, true);
        return ok(id);
      },

      findByBarcode: (barcode) => {
        const code = barcode.trim();
        if (!code) return undefined;
        return get().products.find((p) => p.barcode === code);
      },

      deleteProduct: (id) => {
        if (!get().products.some((p) => p.id === id)) return fail('Barang tidak ditemukan.');
        set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
        void enqueue('product', 'delete', { id });
        return ok(id);
      },

      adjustStock: (id, delta) => {
        if (!Number.isFinite(delta) || Math.abs(delta) > 100_000) {
          return fail('Perubahan stok tidak valid.');
        }
        const state = get();
        const product = state.products.find((p) => p.id === id);
        if (!product) return fail('Barang tidak ditemukan.');
        const outletId = outletOf(state);
        if (stockFor(product, outletId) + delta < 0) return fail('Stok tidak boleh minus.');
        set((s) => ({
          products: s.products.map((p) =>
            p.id === id ? applyStockDelta(p, outletId, delta) : p,
          ),
        }));
        // Stok dikirim sebagai delta dengan ref unik → aman dikirim ulang.
        void enqueue('stock_delta', 'upsert', {
          id: newUuid(),
          productId: id,
          delta: Math.round(delta),
          reason: 'adjust',
        });
        return okState;
      },

      addCategory: (category) => {
        const label = category.label?.trim().slice(0, 40) ?? '';
        if (!label) return fail('Nama kategori wajib diisi.');
        const duplicate = get().categories.some(
          (c) => c.type === category.type && c.label.toLowerCase() === label.toLowerCase(),
        );
        if (duplicate) return fail('Kategori dengan nama itu sudah ada.');
        const id = category.id ?? uid('cat');
        const created = { ...category, id, label };
        set((s) => ({ categories: [...s.categories, created] }));
        void enqueue('category', 'upsert', created as unknown as Record<string, unknown>);
        return ok(id);
      },

      deleteCategory: (id) => {
        const state = get();
        const category = state.categories.find((c) => c.id === id);
        if (!category) return fail('Kategori tidak ditemukan.');
        const used = state.transactions.some((t) => t.categoryId === id);
        if (used) return fail('Kategori sudah dipakai transaksi, tidak bisa dihapus.');
        const sameType = state.categories.filter((c) => c.type === category.type);
        if (sameType.length <= 1) return fail('Minimal satu kategori harus tersedia.');
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
        void enqueue('category', 'delete', { id });
        return ok(id);
      },

      moveCapital: (amount) => {
        const state = get();
        if (!Number.isFinite(amount) || Math.round(amount) === 0) {
          return fail('Nominal pemindahan tidak valid.');
        }
        const value = Math.round(amount);
        const saved = state.allocations.reduce((sum, a) => sum + a.amount, 0);
        let balance = 0;
        for (const tx of state.transactions) {
          if (tx.method !== 'kasbon') balance += tx.type === 'sale' ? tx.amount : -tx.amount;
        }
        balance += state.receivables.reduce((sum, r) => sum + paidOf(r.payments), 0);
        balance -= state.payables.reduce((sum, p) => sum + debtPaidCash(p), 0);
        balance -= saved;

        if (value > 0 && value > balance) return fail('Kas harian tidak cukup untuk dipindahkan.');
        if (value < 0 && Math.abs(value) > saved) return fail('Tabungan modal tidak mencukupi.');

        const allocation: CapitalAllocation = {
          id: uid('alc'),
          amount: value,
          createdAt: new Date().toISOString(),
          note: value > 0 ? 'Pemisahan kas ke tabungan modal' : 'Pengambilan dari tabungan modal',
        };
        set((s) => ({ allocations: [allocation, ...s.allocations] }));
        void enqueue('allocation', 'upsert', allocation as unknown as Record<string, unknown>);
        return ok();
      },

      deleteAllocation: (id) => {
        const state = get();
        const allocation = state.allocations.find((a) => a.id === id);
        if (!allocation) return fail('Catatan pemindahan tidak ditemukan.');

        // Menghapus pemindahan = membalik arahnya, jadi saldo kas harus cukup.
        if (allocation.amount > 0) {
          let balance = 0;
          for (const tx of state.transactions) {
            if (tx.method !== 'kasbon') balance += tx.type === 'sale' ? tx.amount : -tx.amount;
          }
          balance += state.receivables.reduce((sum, r) => sum + paidOf(r.payments), 0);
          balance -= state.payables.reduce((sum, p) => sum + debtPaidCash(p), 0);
          balance -= state.allocations.reduce((sum, a) => sum + a.amount, 0);
          if (allocation.amount > balance + allocation.amount) {
            return fail('Kas tidak cukup untuk membatalkan pemindahan ini.');
          }
        }

        set((s) => ({ allocations: s.allocations.filter((a) => a.id !== id) }));
        void enqueue('allocation', 'delete', { id });
        return ok(id);
      },

      openShift: (openingCash) => {
        const state = get();
        const outletId = outletOf(state);
        if (state.shifts.some((shift) => !shift.closedAt && (shift.outletId ?? outletId) === outletId)) {
          return fail('Masih ada shift terbuka di cabang ini. Tutup dulu sebelum membuka yang baru.');
        }
        const cash = normalizeAmount(openingCash, { min: 0 });
        if (cash === null) return fail('Modal awal tidak valid.');

        const shift: Shift = {
          id: uid('shf'),
          outletId: outletOf(state) ?? undefined,
          openedAt: new Date().toISOString(),
          openingCash: cash,
        };
        set((s) => ({ shifts: [shift, ...s.shifts] }));
        pushShift(shift);
        return ok(shift.id);
      },

      closeShift: (closingCash, note) => {
        const state = get();
        const shift = state.shifts.find(
          (item) => !item.closedAt && (item.outletId ?? outletOf(state)) === outletOf(state),
        );
        if (!shift) return fail('Tidak ada shift yang sedang terbuka.');
        const cash = normalizeAmount(closingCash, { min: 0 });
        if (cash === null) return fail('Uang fisik tidak valid.');

        // Kas seharusnya dihitung sama seperti di layar Shift (hanya tunai) dan
        // hanya dari cabang shift ini — kas cabang lain tidak boleh ikut.
        const shiftOutlet = shift.outletId ?? outletOf(state);
        const since = new Date(shift.openedAt).getTime();
        let cashIn = 0;
        let cashOut = 0;
        for (const tx of state.transactions) {
          if (tx.method !== 'cash') continue;
          if ((tx.outletId ?? shiftOutlet) !== shiftOutlet) continue;
          if (new Date(tx.createdAt).getTime() < since) continue;
          if (tx.type === 'sale') cashIn += tx.amount;
          else cashOut += tx.amount;
        }
        const expected = shift.openingCash + cashIn - cashOut;

        const closed: Shift = {
          ...shift,
          closedAt: new Date().toISOString(),
          closingCash: cash,
          expectedCash: expected,
          difference: cash - expected,
          note: note?.trim().slice(0, 160) || undefined,
        };
        set((s) => ({ shifts: s.shifts.map((item) => (item.id === shift.id ? closed : item)) }));
        pushShift(closed);
        return ok(shift.id);
      },

      mergeRemote: (patch) => {
        set((s) => ({
          products: mergeList(s.products, patch.products),
          transactions: mergeList(s.transactions, patch.transactions),
          receivables: mergeList(s.receivables, patch.receivables),
          payables: mergeList(s.payables, patch.payables),
          categories: mergeList(s.categories, patch.categories),
          allocations: mergeList(s.allocations, patch.allocations),
          shifts: mergeList(s.shifts, patch.shifts),
          orders: mergeList(s.orders, patch.orders),
          customers: mergeList(s.customers, patch.customers),
          outlets: mergeList(s.outlets, patch.outlets),
          opnames: mergeList(s.opnames, patch.opnames),
          activeOutletId: patch.activeOutletId ?? s.activeOutletId,
          profile: patch.profile ? { ...s.profile, ...patch.profile } : s.profile,
        }));
      },

      exportBackupText: () => {
        const s = get();
        return JSON.stringify(
          buildBackup({
            profile: s.profile,
            settings: s.settings,
            categories: s.categories,
            products: s.products,
            transactions: s.transactions,
            receivables: s.receivables,
            payables: s.payables,
            allocations: s.allocations,
            shifts: s.shifts,
            orders: s.orders,
            customers: s.customers,
            outlets: s.outlets,
            opnames: s.opnames,
            purchases: s.purchases,
            suppliers: s.suppliers,
            purchaseReturns: s.purchaseReturns,
          }),
          null,
          2,
        );
      },

      importBackupText: (text, mode) => {
        const parsed = parseBackup(text);
        if (!parsed.ok) return { ok: false, reason: parsed.reason };

        const s = get();
        const current: BackupPayload = {
          profile: s.profile,
          settings: s.settings,
          categories: s.categories,
          products: s.products,
          transactions: s.transactions,
          receivables: s.receivables,
          payables: s.payables,
          allocations: s.allocations,
          shifts: s.shifts,
          orders: s.orders,
          customers: s.customers,
          outlets: s.outlets,
          opnames: s.opnames,
          purchases: s.purchases,
          suppliers: s.suppliers,
          purchaseReturns: s.purchaseReturns,
        };

        const result = applyBackup(current, parsed.backup.data, mode);
        set({
          profile: result.payload.profile,
          settings: result.payload.settings,
          categories: result.payload.categories,
          products: result.payload.products,
          transactions: result.payload.transactions,
          receivables: result.payload.receivables,
          payables: result.payload.payables,
          allocations: result.payload.allocations,
          shifts: result.payload.shifts,
          orders: result.payload.orders,
          customers: result.payload.customers,
          // Daftar cabang ikut dipulihkan; pastikan cabang yang dibuka masih ada.
          outlets: result.payload.outlets ?? s.outlets,
          opnames: result.payload.opnames ?? s.opnames,
          purchases: result.payload.purchases ?? s.purchases,
          suppliers: result.payload.suppliers ?? s.suppliers,
          purchaseReturns: result.payload.purchaseReturns ?? s.purchaseReturns,
          activeOutletId:
            result.payload.outlets && result.payload.outlets.some((o) => o.id === s.activeOutletId)
              ? s.activeOutletId
              : (result.payload.outlets?.[0]?.id ?? s.activeOutletId),
        });
        return { ok: true, result };
      },

      markBackupDone: (at) => {
        set((s) => ({ settings: { ...s.settings, lastBackupAt: at ?? new Date().toISOString() } }));
      },

      addOrder: (input) => {
        const picked = input.customerId
          ? get().customers.find((customer) => customer.id === input.customerId)
          : matchCustomer(get().customers, input.customerName);
        const customerName = cleanCustomerName(picked?.name ?? input.customerName);
        if (!customerName) return fail('Nama pelanggan wajib diisi untuk pesanan.');

        const items = normalizeOrderItems(input.items ?? []);
        if (items.length === 0) {
          return fail('Tambahkan minimal satu barang dengan jumlah lebih dari 0.');
        }

        const total = orderTotal(items);
        if (total <= 0) return fail('Total pesanan harus lebih dari 0.');

        const deposit = normalizeAmount(input.deposit ?? 0, { min: 0 });
        if (deposit === null) return fail('Uang muka (DP) tidak valid.');
        if (deposit > total) {
          return fail(`Uang muka tidak boleh melebihi total pesanan (${total}).`);
        }

        const dueDate = input.dueDate ? safeISODate(input.dueDate) : undefined;
        const order: Order = {
          id: uid('ord'),
          customerName,
          customerId: picked?.id,
          outletId: outletOf(get()) ?? undefined,
          customerPhone: input.customerPhone?.trim().slice(0, 24) || undefined,
          items,
          total,
          deposit: deposit > 0 ? deposit : undefined,
          dueDate,
          note: input.note?.trim().slice(0, 240) || undefined,
          status: 'terbuka',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({ orders: [order, ...state.orders] }));
        pushOrder(order);
        return ok(order.id);
      },

      updateOrder: (id, patch) => {
        const state = get();
        const order = state.orders.find((o) => o.id === id);
        if (!order) return fail('Pesanan tidak ditemukan.');
        if (order.status !== 'terbuka') {
          return fail('Pesanan yang sudah selesai atau dibatalkan tidak bisa diubah.');
        }

        const next: Order = { ...order };
        if (patch.customerName !== undefined) {
          const name = patch.customerName.trim().slice(0, 60);
          if (!name) return fail('Nama pelanggan tidak boleh kosong.');
          next.customerName = name;
        }
        if (patch.customerPhone !== undefined) {
          next.customerPhone = patch.customerPhone.trim().slice(0, 24) || undefined;
        }
        if (patch.note !== undefined) next.note = patch.note.trim().slice(0, 240) || undefined;
        if (patch.dueDate !== undefined) next.dueDate = patch.dueDate ? safeISODate(patch.dueDate) : undefined;
        if (patch.items !== undefined) {
          const items = normalizeOrderItems(patch.items);
          if (items.length === 0) return fail('Pesanan harus punya minimal satu barang.');
          next.items = items;
          next.total = orderTotal(items);
          if (next.total <= 0) return fail('Total pesanan harus lebih dari 0.');
        }
        if (patch.deposit !== undefined) {
          const deposit = normalizeAmount(patch.deposit ?? 0, { min: 0 });
          if (deposit === null) return fail('Uang muka (DP) tidak valid.');
          if (deposit > next.total) return fail('Uang muka tidak boleh melebihi total pesanan.');
          next.deposit = deposit > 0 ? deposit : undefined;
        } else if ((next.deposit ?? 0) > next.total) {
          return fail('Total pesanan lebih kecil dari uang muka yang sudah diterima.');
        }
        next.updatedAt = new Date().toISOString();

        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? next : o)) }));
        pushOrder(next);
        return ok(id);
      },

      cancelOrder: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return fail('Pesanan tidak ditemukan.');
        if (order.status === 'selesai') {
          return fail('Pesanan ini sudah menjadi transaksi. Batalkan transaksinya bila perlu.');
        }
        if (order.status === 'batal') return ok(id);

        const next: Order = { ...order, status: 'batal', updatedAt: new Date().toISOString() };
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? next : o)) }));
        pushOrder(next);
        return ok(id);
      },

      deleteOrder: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return fail('Pesanan tidak ditemukan.');
        if (order.status === 'selesai') {
          return fail('Pesanan yang sudah menjadi transaksi tidak bisa dihapus.');
        }
        set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }));
        void enqueue('order', 'delete', { id });
        return ok(id);
      },

      completeOrder: (id, payment) => {
        const state = get();
        const order = state.orders.find((o) => o.id === id);
        if (!order) return fail('Pesanan tidak ditemukan.');
        if (order.status !== 'terbuka') return fail('Pesanan ini sudah tidak terbuka.');

        const saleCategory = state.categories.find((c) => c.type === 'sale');
        if (!saleCategory) return fail('Kategori penjualan belum ada. Buka Pengaturan dulu.');

        /**
         * DP (uang muka) sudah diterima saat pesanan dibuat, tetapi baru dicatat
         * ke kas saat pesanan diserahkan — supaya uang tidak muncul di laporan
         * harian sebelum barang keluar. Caranya: transaksi penuh dicatat dengan
         * metode kasbon (bila masih ada sisa), lalu DP dicatat sebagai
         * pembayaran pertama pada kasbon itu.
         */
        const deposit = Math.min(order.deposit ?? 0, order.total);
        const remaining = Math.max(0, order.total - deposit);
        /**
         * Dua kemungkinan saat pesanan diserahkan:
         *   - pemilik memilih kasbon → seluruh nilai jadi piutang, DP dicatat
         *     sebagai pembayaran pertama (sisa tetap piutang);
         *   - pemilik memilih tunai/QRIS/transfer → uangnya benar-benar masuk
         *     hari itu, jadi TIDAK boleh dibuat piutang. Sebelum perbaikan ini
         *     semua pesanan (walau dibayar tunai) tercatat sebagai kasbon,
         *     sehingga kas tidak bertambah dan pelanggan terlihat berutang.
         */
        const useKasbon = payment.method === 'kasbon';

        const result = get().addTransaction({
          type: 'sale',
          amount: order.total,
          subtotal: order.total,
          categoryId: saleCategory.id,
          method: useKasbon ? 'kasbon' : payment.method,
          customerName: order.customerName,
          customerId: order.customerId,
          outletId: order.outletId ?? outletOf(state) ?? undefined,
          customerPhone: order.customerPhone,
          dueDate: payment.dueDate,
          note: order.note ?? `Pesanan ${order.customerName}`,
          items: order.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            qty: item.qty,
            price: item.price,
            cost: state.products.find((p) => p.id === item.productId)?.costPrice,
          })),
        });
        if (!result.ok) return result;

        // DP dicatat sebagai pembayaran pertama hanya pada jalur kasbon. Pada
        // jalur tunai/QRIS, seluruh total sudah masuk sebagai uang diterima.
        if (deposit > 0 && useKasbon) {
          const created = get().transactions.find((tx) => tx.id === result.id);
          const receivableId = created?.receivableId;
          if (receivableId) {
            const paid = get().payReceivable(receivableId, deposit, payment.method, 'Uang muka pesanan');
            if (!paid.ok) {
              // Transaksi sudah tercatat; DP gagal hanya menyisakan sisa yang
              // lebih besar. Beri tahu pengguna, jangan diam-diam.
              return paid;
            }
          }
        }

        const next: Order = {
          ...order,
          status: 'selesai',
          transactionId: result.id,
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? next : o)) }));
        pushOrder(next);
        return ok(result.id);
      },

      addCustomer: (input) => {
        const checked = validateCustomer(input);
        if (!checked.ok) return fail(checked.reason);

        const state = get();
        const duplicate = state.customers.find(
          (customer) => matchCustomer([customer], checked.value.name) !== undefined,
        );
        if (duplicate) {
          return fail(`Pelanggan "${duplicate.name}" sudah ada di buku pelanggan.`);
        }

        const id = uid('cus');
        const customer: Customer = {
          id,
          name: checked.value.name,
          phone: checked.value.phone,
          note: checked.value.note,
          createdAt: new Date().toISOString(),
        };
        set((current) => ({ customers: [customer, ...current.customers] }));
        return ok(id);
      },

      updateCustomer: (id, patch) => {
        const state = get();
        const existing = state.customers.find((customer) => customer.id === id);
        if (!existing) return fail('Pelanggan tidak ditemukan.');

        const checked = validateCustomer({
          name: patch.name ?? existing.name,
          phone: patch.phone ?? existing.phone,
          note: patch.note ?? existing.note,
        });
        if (!checked.ok) return fail(checked.reason);

        const clash = state.customers.find(
          (customer) => customer.id !== id && matchCustomer([customer], checked.value.name),
        );
        if (clash) return fail(`Nama itu sudah dipakai pelanggan lain (${clash.name}).`);

        const next: Customer = {
          ...existing,
          name: checked.value.name,
          phone: checked.value.phone,
          note: checked.value.note,
          updatedAt: new Date().toISOString(),
        };
        set((current) => ({
          customers: current.customers.map((customer) => (customer.id === id ? next : customer)),
          // Kasbon yang belum lunas ikut diperbarui namanya supaya tidak
          // tertinggal dengan ejaan lama.
          receivables: current.receivables.map((receivable) =>
            receivable.customerId === id
              ? { ...receivable, customerName: next.name }
              : receivable,
          ),
        }));
        return ok(id);
      },

      deleteCustomer: (id) => {
        const state = get();
        const customer = state.customers.find((item) => item.id === id);
        if (!customer) return fail('Pelanggan tidak ditemukan.');

        const history = customerHistory(state, customer);
        const unpaid = history.receivables.filter((receivable) => {
          const paid = receivable.payments.reduce((sum, payment) => sum + payment.amount, 0);
          return receivable.amount - paid > 0;
        });
        if (unpaid.length > 0) {
          return fail('Pelanggan ini masih punya kasbon belum lunas. Lunasi dulu di menu Kasbon.');
        }
        const openOrder = history.orders.some((order) => order.status === 'terbuka');
        if (openOrder) {
          return fail('Pelanggan ini masih punya pesanan yang belum diambil.');
        }

        set((current) => ({ customers: current.customers.filter((item) => item.id !== id) }));
        return ok(id);
      },

      findCustomerByName: (name) => matchCustomer(get().customers, name),

      ensureOutlets: () => {
        const state = get();
        const migrated = migrateToOutlets({
          profile: state.profile,
          outlets: state.outlets,
          activeOutletId: state.activeOutletId,
          products: state.products,
          transactions: state.transactions,
          receivables: state.receivables,
          payables: state.payables,
          orders: state.orders,
          shifts: state.shifts,
        });
        /**
         * Selalu tulis ulang keadaan: selain untuk migrasi, ini menaikkan versi
         * data yang tersimpan sehingga migrasi tidak dijalankan ulang tiap
         * aplikasi dibuka.
         */
        set({
          outlets: migrated.outlets,
          activeOutletId: migrated.activeOutletId,
          products: migrated.products,
          transactions: migrated.transactions,
          receivables: migrated.receivables,
          payables: migrated.payables,
          orders: migrated.orders,
          shifts: migrated.shifts,
        });
      },

      addOutlet: (input) => {
        const state = get();
        const checked = validateOutlet(input, state.outlets);
        if (!checked.ok) return fail(checked.reason);

        const id = uid('out');
        // Kode otomatis: huruf/angka saja, tidak mungkin bentrok dengan cabang lain.
        const autoCode = `CB${state.outlets.length + 1}`;
        const outlet: Outlet = {
          id,
          name: checked.value.name,
          code: checked.value.code || autoCode,
          address: checked.value.address,
          createdAt: new Date().toISOString(),
        };
        set((current) => ({
          outlets: [...current.outlets, outlet],
          // Cabang baru langsung dibuka supaya pengguna tidak bingung.
          activeOutletId: id,
        }));
        return ok(id);
      },

      updateOutlet: (id, patch) => {
        const state = get();
        const existing = state.outlets.find((outlet) => outlet.id === id);
        if (!existing) return fail('Cabang tidak ditemukan.');

        const checked = validateOutlet(
          {
            name: patch.name ?? existing.name,
            code: patch.code ?? existing.code,
            address: patch.address ?? existing.address,
          },
          state.outlets.filter((outlet) => outlet.id !== id),
        );
        if (!checked.ok) return fail(checked.reason);

        const next: Outlet = {
          ...existing,
          name: checked.value.name,
          code: checked.value.code || existing.code,
          address: checked.value.address,
        };
        set((current) => ({
          outlets: current.outlets.map((outlet) => (outlet.id === id ? next : outlet)),
        }));
        return ok(id);
      },

      archiveOutlet: (id) => {
        const state = get();
        const outlet = state.outlets.find((item) => item.id === id);
        if (!outlet) return fail('Cabang tidak ditemukan.');
        if (outlet.archivedAt) return ok(id);

        const active = state.outlets.filter((item) => !item.archivedAt);
        if (active.length <= 1) {
          return fail('Minimal satu cabang harus tetap aktif.');
        }
        const openShift = state.shifts.some(
          (shift) => !shift.closedAt && shift.outletId === id,
        );
        if (openShift) {
          return fail('Masih ada shift terbuka di cabang ini. Tutup dulu shift-nya.');
        }

        const next = { ...outlet, archivedAt: new Date().toISOString() };
        const fallback = active.find((item) => item.id !== id);
        set((current) => ({
          outlets: current.outlets.map((item) => (item.id === id ? next : item)),
          activeOutletId: current.activeOutletId === id ? fallback?.id ?? null : current.activeOutletId,
        }));
        return ok(id);
      },

      switchOutlet: (id) => {
        const state = get();
        const outlet = state.outlets.find((item) => item.id === id);
        if (!outlet) return fail('Cabang tidak ditemukan.');
        if (outlet.archivedAt) return fail('Cabang ini sudah tidak dipakai.');
        set({ activeOutletId: id });
        return ok(id);
      },

      commitOpname: (input) => {
        const state = get();
        const outletId = outletOf(state);
        const lines = buildOpnameLines(state.products, outletId, input.counts, input.note);
        if (lines.length === 0) {
          return fail('Isi jumlah nyata minimal satu barang dulu.');
        }

        const summary = summarizeOpname(lines);
        const changes = lines.filter((line) => line.counted !== line.system);

        const opname: StockOpname = {
          id: uid('opn'),
          outletId: outletId ?? undefined,
          createdAt: new Date().toISOString(),
          note: input.note?.trim().slice(0, 160) || undefined,
          lines: lines.map((line) => ({
            productId: line.productId,
            name: line.name,
            unit: line.unit,
            system: line.system,
            counted: line.counted,
            cost: line.cost,
          })),
          lossValue: summary.lossValue,
          gainValue: summary.gainValue,
        };

        set((current) => {
          let products = current.products;
          for (const line of changes) {
            products = products.map((product) =>
              product.id === line.productId
                ? setStockAt(product, outletId, line.counted)
                : product,
            );
          }
          return { products, opnames: [opname, ...current.opnames] };
        });

        // Server hanya menerima perubahan stok sebagai delta (bukan angka
        // absolut), jadi selisih dikirim satu per satu agar stok server sama.
        for (const line of changes) {
          const delta = line.counted - line.system;
          void enqueue('stock_delta', 'upsert', {
            id: newUuid(),
            productId: line.productId,
            delta,
            reason: 'opname',
          });
        }

        return ok(opname.id);
      },

      commitPurchase: (input) => {
        const state = get();
        const outletId = outletOf(state);
        const items = buildPurchaseItems(state.products, outletId, input.entries);
        const supplierName = input.supplierName?.trim().slice(0, 60) ?? '';
        const total = purchaseTotal(items);
        const paid = Math.max(0, Math.round(input.paid));

        const checked = validatePurchase({ supplierName, items, paid });
        if (!checked.ok) return fail(checked.reason ?? 'Kulakan belum bisa disimpan.');

        const method: PayMethod = input.method ?? 'cash';
        const now = new Date().toISOString();
        const id = uid('pur');

        // Saldo retur dari supplier yang sama dipakai lebih dulu (Sprint 15),
        // sehingga uang tunai yang keluar hanya sisanya.
        const creditUsed = Math.min(
          availableCredit(state.purchases, state.purchaseReturns, supplierName),
          total,
        );
        const cashPaid = Math.min(paid, Math.max(0, total - creditUsed));
        const remaining = Math.max(0, total - cashPaid - creditUsed);

        // HPP rata-rata dihitung dari stok cabang ini, bukan stok gabungan.
        const costChanges: { productId: string; before: number; after: number }[] = [];
        const stockDeltas: { productId: string; delta: number; product: Product }[] = [];
        for (const item of items) {
          const product = state.products.find((row) => row.id === item.productId);
          if (!product) continue;
          const before = Math.round(product.costPrice);
          const after = averageCost({
            stock: stockFor(product, outletId),
            cost: before,
            qty: item.qty,
            unitCost: item.unitCost,
          });
          costChanges.push({ productId: product.id, before, after });
          stockDeltas.push({
            productId: product.id,
            delta: item.qty,
            product: { ...product, costPrice: after },
          });
        }

        const payable: Payable | null =
          remaining > 0
            ? {
                id: uid('pay'),
                supplierName,
                outletId: outletId ?? undefined,
                amount: remaining,
                dueDate: safeISODate(input.dueDate ?? now),
                createdAt: now,
                note: `Kulakan ${items.length} barang`,
                payments: [],
              }
            : null;

        const purchase: Purchase = {
          id,
          outletId: outletId ?? undefined,
          supplierName,
          createdAt: now,
          items,
          total,
          paid: cashPaid,
          method,
          creditUsed: creditUsed > 0 ? creditUsed : undefined,
          payableId: payable?.id,
          note: input.note?.trim().slice(0, 160) || undefined,
          costChanges,
        };

        // Uang yang benar-benar keluar hari ini dicatat sebagai pengeluaran
        // kulakan. Sisa yang belum dibayar masuk daftar utang supplier.
        const expense: Transaction | null =
          cashPaid > 0
            ? {
                id: uid('tx'),
                type: 'expense',
                amount: cashPaid,
                categoryId: 'exp-kulakan',
                method,
                note: `Kulakan ${supplierName}`.slice(0, 80),
                createdAt: now,
                outletId: outletId ?? undefined,
              }
            : null;

        set((current) => {
          let products = current.products;
          for (const change of costChanges) {
            products = products.map((product) =>
              product.id === change.productId
                ? { ...product, costPrice: change.after }
                : product,
            );
          }
          for (const row of stockDeltas) {
            products = products.map((product) =>
              product.id === row.productId ? applyStockDelta(product, outletId, row.delta) : product,
            );
          }
          return {
            products,
            purchases: [purchase, ...current.purchases],
            payables: payable ? [payable, ...current.payables] : current.payables,
            transactions: expense ? [expense, ...current.transactions] : current.transactions,
          };
        });

        // Sinkron: harga modal ikut naik lewat upsert produk (tanpa delta),
        // sedangkan stok dikirim sebagai delta beralasan "purchase".
        for (const row of stockDeltas) {
          pushProduct(row.product, 0);
          void enqueue('stock_delta', 'upsert', {
            id: newUuid(),
            productId: row.productId,
            delta: row.delta,
            reason: 'purchase',
          });
        }
        if (expense) pushTransaction(expense);
        if (payable) pushPayable(payable);
        return ok(id);
      },

      ensureSuppliers: () => {
        const state = get();
        const names = supplierNamesFrom(state.purchases, state.payables);
        if (names.length === 0) return;
        const known = new Set(state.suppliers.map((supplier) => supplierKey(supplier.name)));
        const missing = names.filter((name) => !known.has(supplierKey(name)));
        if (missing.length === 0) return;
        const now = new Date().toISOString();
        set((current) => ({
          suppliers: [
            ...current.suppliers,
            ...missing.map((name) => ({ id: uid('sup'), name, createdAt: now })),
          ],
        }));
      },

      addSupplier: (input) => {
        const state = get();
        const checked = validateSupplier(input, state.suppliers);
        if (!checked.ok) return fail(checked.reason);
        const supplier: Supplier = {
          id: uid('sup'),
          ...checked.value,
          createdAt: new Date().toISOString(),
        };
        set((current) => ({ suppliers: [supplier, ...current.suppliers] }));
        return ok(supplier.id);
      },

      updateSupplier: (id, patch) => {
        const state = get();
        const existing = state.suppliers.find((supplier) => supplier.id === id);
        if (!existing) return fail('Supplier tidak ditemukan.');
        const checked = validateSupplier(
          {
            name: patch.name ?? existing.name,
            phone: patch.phone ?? existing.phone,
            address: patch.address ?? existing.address,
            note: patch.note ?? existing.note,
          },
          state.suppliers,
          id,
        );
        if (!checked.ok) return fail(checked.reason);

        const oldKey = supplierKey(existing.name);
        const newKey = supplierKey(checked.value.name);
        const rename = oldKey !== newKey;

        set((current) => ({
          suppliers: current.suppliers.map((supplier) =>
            supplier.id === id
              ? { ...supplier, ...checked.value, updatedAt: new Date().toISOString() }
              : supplier,
          ),
          // Nama di nota kulakan, utang, dan retur ikut dirapikan supaya
          // riwayat tidak pecah menjadi dua supplier berbeda.
          purchases: rename
            ? current.purchases.map((row) =>
                supplierKey(row.supplierName) === oldKey
                  ? { ...row, supplierName: checked.value.name }
                  : row,
              )
            : current.purchases,
          payables: rename
            ? current.payables.map((row) =>
                supplierKey(row.supplierName) === oldKey
                  ? { ...row, supplierName: checked.value.name }
                  : row,
              )
            : current.payables,
          purchaseReturns: rename
            ? current.purchaseReturns.map((row) =>
                supplierKey(row.supplierName) === oldKey
                  ? { ...row, supplierName: checked.value.name }
                  : row,
              )
            : current.purchaseReturns,
        }));
        return ok(id);
      },

      archiveSupplier: (id) => {
        const state = get();
        const supplier = state.suppliers.find((row) => row.id === id);
        if (!supplier) return fail('Supplier tidak ditemukan.');
        if (supplier.archivedAt) return ok(id);
        const open = state.payables.some(
          (row) =>
            supplierKey(row.supplierName) === supplierKey(supplier.name) &&
            row.amount - row.payments.reduce((sum, payment) => sum + payment.amount, 0) > 0,
        );
        if (open) {
          return fail('Supplier ini masih punya utang belum dibayar. Lunasi dulu utangnya.');
        }
        set((current) => ({
          suppliers: current.suppliers.map((row) =>
            row.id === id ? { ...row, archivedAt: new Date().toISOString() } : row,
          ),
        }));
        return ok(id);
      },

      commitReturn: (input) => {
        const state = get();
        const outletId = outletOf(state);
        const supplierName = cleanSupplierName(input.supplierName);
        const candidates = returnCandidates(
          state.purchases,
          state.products,
          supplierName,
          (product) => stockFor(product, outletId),
        );
        const items = buildReturnItems(candidates, input.counts);
        const checked = validateReturn({ supplierName, items, payables: state.payables });
        if (!checked.ok) return fail(checked.reason);

        const { total, appliedAmount, creditValue, payableId } = checked.value;
        const now = new Date().toISOString();
        const id = uid('ret');
        const supplier = state.suppliers.find(
          (row) => supplierKey(row.name) === supplierKey(supplierName),
        );

        if (items.length === 0 || returnTotal(items) !== total) {
          return fail('Isi jumlah barang yang diretur dulu.');
        }

        const row: PurchaseReturn = {
          id,
          outletId: outletId ?? undefined,
          supplierName,
          supplierId: supplier?.id,
          createdAt: now,
          items,
          total,
          appliedPayableId: payableId,
          appliedAmount,
          creditValue,
          note: input.note?.trim().slice(0, 160) || undefined,
        };

        // Nilai retur memotong utang kulakan lebih dulu — bukan uang masuk.
        if (payableId && appliedAmount > 0) {
          // `source: 'retur'` membuat pemotongan utang ini tidak dihitung
          // sebagai uang keluar (kas tidak berkurang karena barang kembali).
          const payment = makePayment(appliedAmount, 'cash', 'Retur barang', 'retur');
          set((current) => ({
            payables: current.payables.map((payable) =>
              payable.id === payableId
                ? { ...payable, payments: [...payable.payments, payment] }
                : payable,
            ),
          }));
          pushPayablePayment(payableId, payment);
        }

        set((current) => {
          let products = current.products;
          for (const item of items) {
            products = products.map((product) =>
              product.id === item.productId
                ? applyStockDelta(product, outletId, -item.qty)
                : product,
            );
          }
          return { products, purchaseReturns: [row, ...current.purchaseReturns] };
        });

        for (const item of items) {
          void enqueue('stock_delta', 'upsert', {
            id: newUuid(),
            productId: item.productId,
            delta: -item.qty,
            reason: 'return',
          });
        }
        return ok(id);
      },

      resetAll: () => {
        const current = get();
        set({
          ...emptyData(),
          // Pengaturan printer dipertahankan agar tidak perlu pairing ulang.
          settings: {
            ...DEFAULT_SETTINGS,
            printerName: current.settings.printerName,
            printerAddress: current.settings.printerAddress,
          },
        });
      },
    }),
    {
      // Kunci baru setelah aplikasi berganti nama. Data lama tetap terbaca
      // lewat fallback ke kunci "warunglui-store-v1" (lihat storage di bawah).
      name: 'inventoris-store-v1',
      // Versi 2: data sadar-cabang (Sprint 12). Migrasi membuat satu cabang
      // otomatis dan menandai semua baris lama tanpa mengubah angkanya.
      version: 2,
      migrate: (persisted, _version) => {
        const state = persisted as Record<string, unknown>;
        const migrated = migrateToOutlets({
          profile: (state.profile as { name: string; code: string }) ?? { name: '', code: '' },
          outlets: (state.outlets as Outlet[]) ?? [],
          activeOutletId: (state.activeOutletId as string | null) ?? null,
          products: (state.products as Product[]) ?? [],
          transactions: (state.transactions as Transaction[]) ?? [],
          receivables: (state.receivables as Receivable[]) ?? [],
          payables: (state.payables as Payable[]) ?? [],
          orders: (state.orders as Order[]) ?? [],
          shifts: (state.shifts as Shift[]) ?? [],
        });
        return {
          ...state,
          outlets: migrated.outlets,
          activeOutletId: migrated.activeOutletId,
          products: migrated.products,
          transactions: migrated.transactions,
          receivables: migrated.receivables,
          payables: migrated.payables,
          orders: migrated.orders,
          shifts: migrated.shifts,
        } as unknown as AppState;
      },
      storage: createJSONStorage(() => localJsonStorage),
      partialize: (state) => ({
        profile: state.profile,
        settings: state.settings,
        categories: state.categories,
        transactions: state.transactions,
        receivables: state.receivables,
        payables: state.payables,
        products: state.products,
        allocations: state.allocations,
        shifts: state.shifts,
        orders: state.orders,
        customers: state.customers,
        outlets: state.outlets,
        activeOutletId: state.activeOutletId,
        opnames: state.opnames,
        purchases: state.purchases,
        suppliers: state.suppliers,
        purchaseReturns: state.purchaseReturns,
      }),
    },
  ),
);

/** True setelah data dari AsyncStorage selesai dimuat (hindari kedip 0 → data). */
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    const unsubFinish = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsubFinish;
  }, []);

  return hydrated;
}
