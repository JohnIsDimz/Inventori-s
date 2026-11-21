/**
 * Penerjemah bentuk data: lokal (camelCase, id berawalan) ↔ server (snake_case, UUID).
 * Semua angka uang dikirim sebagai number; Postgres menyimpannya numeric(14,2).
 */
import type {
  CapitalAllocation,
  Category,
  LineItem,
  Payable,
  PayMethod,
  Product,
  Receivable,
  Shift,
  Transaction,
  TxType,
} from '../../data/types';
import type { Role } from '../../utils/permissions';

export type RemoteRow = Record<string, unknown>;

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const iso = (value: unknown, fallback: string): string => {
  const text = str(value, '');
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};
const day = (value: unknown, fallback: string): string => iso(value, fallback).slice(0, 10);

const PAY_METHODS: PayMethod[] = ['cash', 'qris', 'kasbon', 'transfer'];
const asMethod = (value: unknown): PayMethod => {
  const text = str(value, 'cash');
  return (PAY_METHODS as string[]).includes(text) ? (text as PayMethod) : 'cash';
};

// ---------------------------------------------------------------- ke server

/**
 * Data produk yang dikirim ke server — TANPA kolom `stock`.
 *
 * Sejak sprint 2 stok tidak lagi dikirim sebagai angka absolut (dua perangkat
 * akan saling menimpa). Server menghitung sendiri dari `stock_moves`; perubahan
 * stok dikirim terpisah sebagai delta (`stock_delta` + `stock_ref`).
 */
export function productToRemote(product: Product, outletId: string, id: string): RemoteRow {
  return {
    id,
    outlet_id: outletId,
    name: product.name,
    unit: product.unit,
    barcode: product.barcode?.trim() ? product.barcode.trim() : null,
    cost_price: product.costPrice,
    sell_price: product.sellPrice,
    min_stock: product.minStock,
    wholesale_price: product.wholesalePrice ?? null,
    wholesale_min_qty: product.wholesaleMinQty ?? null,
  };
}

// ---------------------------------------------------------------- kategori

export function categoryToRemote(category: Category, outletId: string, id: string, sort = 0): RemoteRow {
  return {
    id,
    outlet_id: outletId,
    label: category.label,
    type: category.type,
    icon: String(category.icon),
    sort,
  };
}

export function categoryFromRemote(row: RemoteRow, id: string): Category {
  return {
    id,
    label: str(row.label, 'Lainnya'),
    type: str(row.type, 'sale') === 'expense' ? 'expense' : 'sale',
    icon: str(row.icon, 'tag') as unknown as Category['icon'],
  };
}

// ---------------------------------------------------------------- shift

export function shiftToRemote(shift: Shift, outletId: string, id: string): RemoteRow {
  return {
    id,
    outlet_id: outletId,
    opened_at: shift.openedAt,
    opening_cash: shift.openingCash,
    closed_at: shift.closedAt ?? null,
    closing_cash: shift.closingCash ?? null,
    note: shift.note ?? null,
  };
}

export function shiftFromRemote(row: RemoteRow, id: string): Shift {
  const closed = str(row.closed_at, '');
  const closingCash = row.closing_cash === null || row.closing_cash === undefined ? undefined : num(row.closing_cash);
  return {
    id,
    openedAt: iso(row.opened_at, new Date().toISOString()),
    openingCash: num(row.opening_cash),
    closedAt: closed ? iso(row.closed_at, closed) : undefined,
    closingCash,
    expectedCash: row.expected_cash === null || row.expected_cash === undefined ? undefined : num(row.expected_cash),
    difference: row.difference === null || row.difference === undefined ? undefined : num(row.difference),
    note: str(row.note, '') || undefined,
  };
}

// ---------------------------------------------------------------- alokasi modal

export function allocationToRemote(allocation: CapitalAllocation, outletId: string, id: string): RemoteRow {
  return {
    id,
    outlet_id: outletId,
    amount: allocation.amount,
    note: allocation.note ?? null,
    created_at: allocation.createdAt,
  };
}

export function allocationFromRemote(row: RemoteRow, id: string): CapitalAllocation {
  return {
    id,
    amount: num(row.amount),
    note: str(row.note, '') || undefined,
    createdAt: iso(row.created_at, new Date().toISOString()),
  };
}

export interface TransactionPushInput {
  transaction: Transaction;
  outletId: string;
  remoteId: string;
  items: { product_id: string | null; name: string; qty: number; price: number; cost: number; discount?: number }[];
  categoryId?: string | null;
  shiftId?: string | null;
  customerId?: string | null;
}

export function transactionToRemote(input: TransactionPushInput): RemoteRow {
  const { transaction, outletId, remoteId, items } = input;
  return {
    outlet_id: outletId,
    client_tx_id: remoteId,
    shift_id: input.shiftId ?? null,
    type: transaction.type,
    category_id: input.categoryId ?? null,
    customer_id: input.customerId ?? null,
    discount: transaction.discount ?? 0,
    discount_kind: transaction.discountKind ?? 'amount',
    discount_value: transaction.discountValue ?? 0,
    tax: transaction.tax ?? 0,
    tax_rate: transaction.taxRate ?? 0,
    method: transaction.method,
    note: transaction.note ?? null,
    created_at: transaction.createdAt,
    items,
  };
}

export function receivableToRemote(row: Receivable, outletId: string, id: string): RemoteRow {
  const paid = row.payments.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    id,
    outlet_id: outletId,
    customer_name: row.customerName,
    amount: row.amount,
    due_date: day(row.dueDate, new Date().toISOString().slice(0, 10)),
    note: row.note ?? null,
    status: paid >= row.amount ? 'paid' : 'open',
  };
}

export function payableToRemote(row: Payable, outletId: string, id: string): RemoteRow {
  const paid = row.payments.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    id,
    outlet_id: outletId,
    supplier_name: row.supplierName,
    amount: row.amount,
    due_date: day(row.dueDate, new Date().toISOString().slice(0, 10)),
    note: row.note ?? null,
    status: paid >= row.amount ? 'paid' : 'open',
  };
}

export function paymentToRemote(
  payment: { amount: number; method: PayMethod; note?: string },
  column: 'receivable_id' | 'payable_id',
  parentRemoteId: string,
  id: string,
  paidAt: string,
): RemoteRow {
  return {
    id,
    amount: payment.amount,
    method: payment.method,
    paid_at: paidAt,
    note: payment.note ?? null,
    [column]: parentRemoteId,
  };
}

export function profileToRemote(profile: { name: string; phone?: string; openTime: string; closeTime: string }): RemoteRow {
  return {
    name: profile.name,
    phone: profile.phone?.trim() ? profile.phone.trim() : null,
    open_time: profile.openTime,
    close_time: profile.closeTime,
  };
}

// ---------------------------------------------------------------- ke lokal

export function productFromRemote(row: RemoteRow, id: string): Product {
  return {
    id,
    name: str(row.name, 'Barang'),
    unit: str(row.unit, 'pcs'),
    sellPrice: num(row.sell_price),
    costPrice: num(row.cost_price),
    stock: num(row.stock),
    minStock: num(row.min_stock),
    barcode: str(row.barcode, '') || undefined,
    wholesalePrice: row.wholesale_price == null ? undefined : num(row.wholesale_price),
    wholesaleMinQty: row.wholesale_min_qty == null ? undefined : num(row.wholesale_min_qty),
  };
}

export function transactionFromRemote(
  row: RemoteRow,
  id: string,
  items: LineItem[],
  localCategoryId?: string,
): Transaction {
  const type = str(row.type, 'sale') === 'expense' ? ('expense' as TxType) : ('sale' as TxType);
  return {
    id,
    type,
    amount: num(row.total),
    categoryId: localCategoryId ?? str(row.category_id, ''),
    method: asMethod(row.method),
    note: str(row.note, '') || undefined,
    createdAt: iso(row.created_at, new Date().toISOString()),
    items: items.length > 0 ? items : undefined,
    subtotal: num(row.subtotal, num(row.total)),
    discount: num(row.discount),
    discountKind: str(row.discount_kind, 'amount') === 'percent' ? 'percent' : 'amount',
    discountValue: num(row.discount_value, num(row.discount)),
    tax: num(row.tax),
    taxRate: num(row.tax_rate),
  };
}

export function lineItemFromRemote(row: RemoteRow, productId?: string): LineItem {
  const discount = num(row.discount);
  return {
    productId,
    name: str(row.name, 'Barang'),
    qty: num(row.qty, 1),
    price: num(row.price),
    cost: num(row.cost),
    discount: discount > 0 ? discount : undefined,
  };
}

export function receivableFromRemote(
  row: RemoteRow,
  id: string,
  payments: { id: string; amount: number; paidAt: string; method: PayMethod; note?: string }[],
): Receivable {
  return {
    id,
    customerName: str(row.customer_name, 'Pelanggan'),
    amount: num(row.amount),
    dueDate: day(row.due_date, new Date().toISOString().slice(0, 10)),
    createdAt: iso(row.created_at, new Date().toISOString()),
    note: str(row.note, '') || undefined,
    payments,
  };
}

export function payableFromRemote(
  row: RemoteRow,
  id: string,
  payments: { id: string; amount: number; paidAt: string; method: PayMethod; note?: string }[],
): Payable {
  return {
    id,
    supplierName: str(row.supplier_name, 'Supplier'),
    amount: num(row.amount),
    dueDate: day(row.due_date, new Date().toISOString().slice(0, 10)),
    createdAt: iso(row.created_at, new Date().toISOString()),
    note: str(row.note, '') || undefined,
    payments,
  };
}

export function memberRoleFromRemote(value: unknown): Role {
  const text = str(value, 'kasir');
  return text === 'owner' || text === 'admin' ? text : 'kasir';
}
