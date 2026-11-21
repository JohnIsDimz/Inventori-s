/**
 * Turunan angka dari data mentah. Semua nilai dihitung, tidak disimpan —
 * jadi mustahil ada "saldo demo" yang tidak sinkron dengan transaksi.
 */
import {
  endOfMonth,
  formatBulanTahun,
  startOfDay,
  startOfMonth,
} from '../utils/format';
import type { AppSettings, CapitalAllocation, Category, Order, PayMethod, Payable, Product, Purchase, Receivable, StockOpname, StoreProfile, Transaction } from './types';

export interface BusinessData {
  profile: StoreProfile;
  settings: AppSettings;
  categories: Category[];
  transactions: Transaction[];
  receivables: Receivable[];
  payables: Payable[];
  products: Product[];
  allocations: CapitalAllocation[];
  /** Pesanan/kuotasi (opsional supaya pemanggil lama tidak perlu diubah). */
  orders?: Order[];
  /** Hitung stok fisik (Sprint 17) — dipakai laporan ekspor PDF/CSV. */
  opnames?: StockOpname[];
  /** Kulakan supplier (Sprint 17) — dipakai laporan ekspor PDF/CSV. */
  purchases?: Purchase[];
}

export interface DebtLike {
  amount: number;
  payments: { amount: number; source?: 'retur' }[];
  dueDate: string;
}

export const isCashMethod = (method: PayMethod): boolean =>
  method === 'cash' || method === 'qris' || method === 'transfer';

export function debtPaid(debt: DebtLike): number {
  return debt.payments.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Bagian pembayaran utang yang benar-benar berupa uang keluar.
 *
 * Retur barang memotong utang tanpa mengeluarkan uang, jadi tidak boleh
 * mengurangi saldo kas maupun menambah "uang keluar" di laporan.
 */
export function debtPaidCash(debt: DebtLike): number {
  return debt.payments.reduce((sum, p) => sum + (p.source === 'retur' ? 0 : p.amount), 0);
}

export function debtRemaining(debt: DebtLike): number {
  return Math.max(0, debt.amount - debtPaid(debt));
}

export function debtSettled(debt: DebtLike): boolean {
  return debtRemaining(debt) <= 0;
}

export function debtProgress(debt: DebtLike): number {
  if (debt.amount <= 0) return 0;
  return Math.min(1, debtPaid(debt) / debt.amount);
}

/* ------------------------------------------------------------------ kas --- */

export function cashBalance(data: BusinessData): number {
  let balance = 0;
  for (const tx of data.transactions) {
    if (tx.method === 'kasbon') continue;
    balance += tx.type === 'sale' ? tx.amount : -tx.amount;
  }
  balance += data.receivables.reduce((sum, r) => sum + debtPaidCash(r), 0);
  balance -= data.payables.reduce((sum, p) => sum + debtPaidCash(p), 0);
  balance -= data.allocations.reduce((sum, a) => sum + a.amount, 0);
  return balance;
}

export function capitalSavings(data: BusinessData): number {
  return data.allocations.reduce((sum, a) => sum + a.amount, 0);
}

/** Total uang yang benar-benar dipegang (kas + tabungan modal). */
export function totalMoney(data: BusinessData): number {
  return cashBalance(data) + capitalSavings(data);
}

/* -------------------------------------------------------------- periode --- */

export interface RangeSummary {
  from: Date;
  to: Date;
  /** Omzet penjualan (termasuk yang masih kasbon). */
  income: number;
  /** Uang tunai/QRIS/transfer yang benar-benar masuk dari penjualan. */
  incomeCash: number;
  /** Total pengeluaran tercatat. */
  expense: number;
  /** HPP barang yang rinciannya diisi saat mencatat. */
  cogs: number;
  /** income − expense. */
  profit: number;
  margin: number;
  txCount: number;
  saleCount: number;
  /** Jumlah catatan pengeluaran pada periode ini. */
  expenseCount: number;
  /** Kasbon baru yang dibuat pada periode ini. */
  receivableNew: number;
  /** Pembayaran kasbon yang diterima pada periode ini. */
  receivablePaid: number;
  payablePaid: number;
  cashIn: number;
  cashOut: number;
}

export function summarize(data: BusinessData, from: Date, to: Date): RangeSummary {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };

  let income = 0;
  let incomeCash = 0;
  let expense = 0;
  let cogs = 0;
  let txCount = 0;
  let saleCount = 0;
  let expenseCount = 0;

  for (const tx of data.transactions) {
    if (!inRange(tx.createdAt)) continue;
    txCount += 1;
    if (tx.type === 'sale') {
      saleCount += 1;
      income += tx.amount;
      if (isCashMethod(tx.method)) incomeCash += tx.amount;
      cogs += (tx.items ?? []).reduce(
        (sum, item) => sum + (item.cost ?? 0) * item.qty,
        0,
      );
    } else {
      expense += tx.amount;
      expenseCount += 1;
    }
  }

  let receivableNew = 0;
  let receivablePaid = 0;
  for (const r of data.receivables) {
    if (inRange(r.createdAt)) receivableNew += r.amount;
    for (const p of r.payments) if (inRange(p.paidAt)) receivablePaid += p.amount;
  }

  let payablePaid = 0;
  for (const p of data.payables) {
    // Retur tidak dihitung: utang berkurang tanpa uang keluar.
    for (const pay of p.payments) {
      if (pay.source === 'retur') continue;
      if (inRange(pay.paidAt)) payablePaid += pay.amount;
    }
  }

  const profit = income - expense;
  const margin = income > 0 ? (profit / income) * 100 : 0;

  return {
    from,
    to,
    income,
    incomeCash,
    expense,
    cogs,
    profit,
    margin,
    txCount,
    saleCount,
    expenseCount,
    receivableNew,
    receivablePaid,
    payablePaid,
    cashIn: incomeCash + receivablePaid,
    cashOut: expense + payablePaid,
  };
}

export function todayRange(): [Date, Date] {
  const start = startOfDay();
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return [start, end];
}

export function monthRange(date: Date = new Date()): [Date, Date] {
  const start = startOfMonth(date);
  const end = new Date(endOfMonth(date).getTime() - 1);
  return [start, end];
}

export function todaySummary(data: BusinessData): RangeSummary {
  const [from, to] = todayRange();
  return summarize(data, from, to);
}

export function monthSummary(data: BusinessData, date: Date = new Date()): RangeSummary {
  const [from, to] = monthRange(date);
  return summarize(data, from, to);
}

export function previousMonthSummary(data: BusinessData, date: Date = new Date()): RangeSummary {
  const prev = new Date(date);
  prev.setMonth(prev.getMonth() - 1);
  const [from, to] = monthRange(prev);
  return summarize(data, from, to);
}

/* ---------------------------------------------------------------- kasbon --- */

export interface ReceivableSummary {
  outstanding: number;
  activeCount: number;
  overdueCount: number;
  overdueAmount: number;
  dueSoonCount: number;
  settledCount: number;
  totalRecorded: number;
}

export function receivableSummary(data: BusinessData): ReceivableSummary {
  const now = Date.now();
  const summary: ReceivableSummary = {
    outstanding: 0,
    activeCount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    dueSoonCount: 0,
    settledCount: 0,
    totalRecorded: 0,
  };

  for (const r of data.receivables) {
    summary.totalRecorded += r.amount;
    const remaining = debtRemaining(r);
    if (remaining <= 0) {
      summary.settledCount += 1;
      continue;
    }
    summary.outstanding += remaining;
    summary.activeCount += 1;
    const due = new Date(r.dueDate).getTime();
    if (due < startOfDay().getTime()) {
      summary.overdueCount += 1;
      summary.overdueAmount += remaining;
    } else if (due - now < 3 * 86_400_000) {
      summary.dueSoonCount += 1;
    }
  }

  return summary;
}

export function payableSummary(data: BusinessData) {
  let outstanding = 0;
  let activeCount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let settledCount = 0;
  let totalRecorded = 0;

  for (const p of data.payables) {
    totalRecorded += p.amount;
    const remaining = debtRemaining(p);
    if (remaining <= 0) {
      settledCount += 1;
      continue;
    }
    outstanding += remaining;
    activeCount += 1;
    if (new Date(p.dueDate).getTime() < startOfDay().getTime()) {
      overdueCount += 1;
      overdueAmount += remaining;
    }
  }

  return { outstanding, activeCount, overdueCount, overdueAmount, settledCount, totalRecorded };
}

export function sortByDue<T extends { dueDate: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

export function activeReceivables(data: BusinessData): Receivable[] {
  return sortByDue(data.receivables.filter((r) => !debtSettled(r)));
}

export function activePayables(data: BusinessData): Payable[] {
  return sortByDue(data.payables.filter((p) => !debtSettled(p)));
}

/* -------------------------------------------------------------- laporan --- */

export interface WeeklyBucket {
  label: string;
  sublabel: string;
  income: number;
  expense: number;
  profit: number;
}

/** Pecah satu bulan jadi pekan (Pekan 1..5). */
export function weeklyFlow(data: BusinessData, month: Date = new Date()): WeeklyBucket[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const buckets: WeeklyBucket[] = [];

  let cursor = new Date(start);
  let index = 1;
  while (cursor < end) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const clampedEnd = weekEnd > end ? new Date(end.getTime() - 1) : weekEnd;
    const summary = summarize(data, weekStart, clampedEnd);
    buckets.push({
      label: `P${index}`,
      sublabel: `${weekStart.getDate()}–${clampedEnd.getDate()}`,
      income: summary.income,
      expense: summary.expense,
      profit: summary.profit,
    });
    // Lanjut ke hari setelah akhir pekan ini. Sebelumnya cursor = akhir pekan
    // sehingga labelnya tumpang tindih ("1–7" lalu "7–13").
    cursor = new Date(weekEnd);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
    index += 1;
  }

  return buckets;
}

export interface CategorySlice {
  categoryId: string;
  label: string;
  icon: Category['icon'];
  amount: number;
  percent: number;
}

export function expenseBreakdown(data: BusinessData, from: Date, to: Date): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const tx of data.transactions) {
    if (tx.type !== 'expense') continue;
    const t = new Date(tx.createdAt).getTime();
    if (t < from.getTime() || t > to.getTime()) continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amount);
  }

  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([categoryId, amount]) => {
      const category = data.categories.find((c) => c.id === categoryId);
      return {
        categoryId,
        label: category?.label ?? 'Tanpa kategori',
        icon: category?.icon ?? ('tag' as Category['icon']),
        amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface TopProduct {
  name: string;
  qty: number;
  unit: string;
  revenue: number;
  margin: number;
  hasCost: boolean;
}

export function topProducts(data: BusinessData, from: Date, to: Date, limit = 5): TopProduct[] {
  const map = new Map<string, TopProduct>();

  const push = (name: string, qty: number, revenue: number, margin: number, hasCost: boolean) => {
    const existing = map.get(name);
    if (existing) {
      existing.qty += qty;
      existing.revenue += revenue;
      existing.margin += margin;
      existing.hasCost = existing.hasCost || hasCost;
    } else {
      map.set(name, { name, qty, unit: 'pcs', revenue, margin, hasCost });
    }
  };

  const productUnit = (productId?: string): string =>
    (productId && data.products.find((p) => p.id === productId)?.unit) || 'pcs';

  for (const tx of data.transactions) {
    if (tx.type !== 'sale') continue;
    const t = new Date(tx.createdAt).getTime();
    if (t < from.getTime() || t > to.getTime()) continue;
    for (const item of tx.items ?? []) {
      const revenue = item.price * item.qty;
      const margin = item.cost !== undefined ? (item.price - item.cost) * item.qty : 0;
      push(item.name, item.qty, revenue, margin, item.cost !== undefined);
      const entry = map.get(item.name);
      if (entry) entry.unit = productUnit(item.productId);
    }
  }

  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export interface MonthPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
  profit: number;
}

export function monthlySeries(data: BusinessData, months = 6, anchor: Date = new Date()): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const [from, to] = monthRange(date);
    const summary = summarize(data, from, to);
    points.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: formatBulanTahun(date).split(' ')[0].slice(0, 3),
      income: summary.income,
      expense: summary.expense,
      profit: summary.profit,
    });
  }
  return points;
}

export function lowStock(data: BusinessData): Product[] {
  return data.products
    .filter((p) => p.stock <= p.minStock)
    .sort((a, b) => a.stock - b.stock);
}

export function stockValue(data: BusinessData): number {
  return data.products.reduce((sum, p) => sum + p.stock * p.costPrice, 0);
}

export function recentTransactions(data: BusinessData, limit = 4): Transaction[] {
  return [...data.transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}



export function categoryById(data: BusinessData, id: string): Category | undefined {
  return data.categories.find((c) => c.id === id);
}

export function isStoreConfigured(data: BusinessData): boolean {
  return data.profile.name.trim().length > 0;
}

/* ------------------------------------------------- kategori paling laku --- */

export interface TopCategory {
  categoryId: string;
  label: string;
  icon: Category['icon'];
  /** Omzet dari kategori ini (termasuk kasbon). */
  amount: number;
  /** Jumlah transaksi penjualan pada kategori ini. */
  txCount: number;
  /** Jumlah barang terjual (dari rincian barang, bila diisi). */
  qty: number;
  /** Untung kotor (harga jual − modal) untuk kategori ini. */
  margin: number;
  /** Porsi omzet terhadap total penjualan, 0–100. */
  percent: number;
}

/**
 * Kategori penjualan paling laku — diurutkan dari omzet terbesar.
 * Berbeda dari `topProducts` (per barang): ini menjawab "jualan apa yang
 * paling menghasilkan" pada level kategori.
 */
export function topSaleCategories(
  data: BusinessData,
  from: Date,
  to: Date,
  limit = 5,
): TopCategory[] {
  const totals = new Map<string, TopCategory>();
  let grand = 0;

  for (const tx of data.transactions) {
    if (tx.type !== 'sale') continue;
    const time = new Date(tx.createdAt).getTime();
    if (time < from.getTime() || time > to.getTime()) continue;

    const category = data.categories.find((c) => c.id === tx.categoryId);
    const key = tx.categoryId || 'tanpa-kategori';
    const current =
      totals.get(key) ??
      {
        categoryId: key,
        label: category?.label ?? 'Tanpa kategori',
        icon: (category?.icon ?? 'tag') as Category['icon'],
        amount: 0,
        txCount: 0,
        qty: 0,
        margin: 0,
        percent: 0,
      };

    current.amount += tx.amount;
    current.txCount += 1;
    for (const item of tx.items ?? []) {
      current.qty += item.qty;
      if (item.cost !== undefined) current.margin += (item.price - item.cost) * item.qty;
    }
    totals.set(key, current);
    grand += tx.amount;
  }

  return [...totals.values()]
    .map((row) => ({ ...row, percent: grand > 0 ? (row.amount / grand) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/* --------------------------------------------------------- omzet harian --- */

export interface DailyBucket {
  /** Label pendek untuk grafik, mis. "19". */
  label: string;
  /** Keterangan di bawah label, mis. "Sen". */
  sublabel: string;
  isoDate: string;
  income: number;
  expense: number;
  profit: number;
  txCount: number;
}

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Omzet, pengeluaran, dan untung per hari untuk `days` hari terakhir. */
export function dailyFlow(data: BusinessData, days = 7, now: Date = new Date()): DailyBucket[] {
  const buckets: DailyBucket[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    const summary = summarize(data, start, end);
    buckets.push({
      label: String(day.getDate()),
      sublabel: HARI_PENDEK[day.getDay()],
      isoDate: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      income: summary.income,
      expense: summary.expense,
      profit: summary.profit,
      txCount: summary.txCount,
    });
  }
  return buckets;
}

// ---------------------------------------------------------------- shift kasir

/** Shift yang masih terbuka (maksimal satu per outlet), bila ada. */
export function activeShift(state: { shifts?: { id: string; openedAt: string; openingCash: number; closedAt?: string }[] }):
  | { id: string; openedAt: string; openingCash: number; closedAt?: string }
  | undefined {
  return (state.shifts ?? []).find((shift) => !shift.closedAt);
}

/**
 * Uang tunai yang seharusnya ada di laci menurut catatan:
 * modal awal + penjualan tunai − pengeluaran tunai (sejak shift dibuka).
 * Kasbon & QRIS/transfer tidak dihitung karena bukan uang fisik.
 */
export function shiftCash(
  state: {
    transactions: { type: string; method: string; amount: number; createdAt: string; outletId?: string }[];
    receivables?: Receivable[];
    payables?: Payable[];
  },
  shift: { openedAt: string; openingCash: number; closedAt?: string; outletId?: string },
): { cashIn: number; cashOut: number; expected: number } {
  const since = new Date(shift.openedAt).getTime();
  let cashIn = 0;
  let cashOut = 0;
  for (const tx of state.transactions) {
    if (tx.method !== 'cash') continue;
    if (shift.outletId && tx.outletId && tx.outletId !== shift.outletId) continue;
    if (new Date(tx.createdAt).getTime() < since || (shift.closedAt && tx.createdAt > shift.closedAt)) continue;
    if (tx.type === 'sale') cashIn += tx.amount;
    else cashOut += tx.amount;
  }
  const paymentsDuringShift = (rows: (Receivable | Payable)[]) => rows.reduce((sum, row) => {
    if (shift.outletId && row.outletId && row.outletId !== shift.outletId) return sum;
    return sum + row.payments.reduce((total, p) => {
      const at = new Date(p.paidAt).getTime();
      return p.method === 'cash' && p.source !== 'retur' && at >= since && (!shift.closedAt || p.paidAt <= shift.closedAt)
        ? total + p.amount : total;
    }, 0);
  }, 0);
  cashIn += paymentsDuringShift(state.receivables ?? []);
  // Return credits reduce debt but never move physical cash.
  cashOut += paymentsDuringShift(state.payables ?? []);
  return { cashIn, cashOut, expected: shift.openingCash + cashIn - cashOut };
}

/* ----------------------------------------------------------------- pesanan */

/** Pesanan yang masih terbuka, yang paling dekat tenggat di atas. */
export function openOrders(data: BusinessData): Order[] {
  const rows = (data.orders ?? []).filter((order) => order.status === 'terbuka');
  return [...rows].sort((a, b) => {
    const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** Pesanan yang sudah lewat / jatuh tempo hari ini — dipakai untuk peringatan. */
export function dueOrders(data: BusinessData, now = new Date()): Order[] {
  return openOrders(data).filter((order) => {
    if (!order.dueDate) return false;
    const due = new Date(order.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return due.getTime() <= endOfToday.getTime();
  });
}

export interface OrderSummary {
  openCount: number;
  openValue: number;
  doneCount: number;
  dueCount: number;
}

export function orderSummary(data: BusinessData, now = new Date()): OrderSummary {
  const orders = data.orders ?? [];
  const open = orders.filter((order) => order.status === 'terbuka');
  return {
    openCount: open.length,
    openValue: open.reduce((sum, order) => sum + order.total, 0),
    doneCount: orders.filter((order) => order.status === 'selesai').length,
    dueCount: dueOrders(data, now).length,
  };
}
