/**
 * Mesin sinkron offline-first.
 *
 * Alur satu putaran (`syncNow`):
 *   1. PUSH  — kirim antrean perubahan lokal ke Supabase, berurutan.
 *   2. PULL  — tarik baris yang berubah sejak kursor terakhir (per tabel).
 *   3. MERGE — gabungkan ke store; data yang masih punya perubahan tertunda
 *              di antrean TIDAK ditimpa server (perangkat menang sampai terkirim).
 *
 * Aturan yang dijaga:
 *   - Transaksi dikirim lewat RPC `sync_transaction` dengan `client_tx_id`,
 *     jadi pengiriman ulang tidak pernah menggandakan nota (teruji).
 *   - Stok dipotong server, bukan oleh klien.
 *   - Satu operasi gagal karena jaringan → berhenti, coba lagi nanti.
 *     Gagal karena validasi (stok kurang, bukan anggota) → dibuang setelah
 *     5 percobaan supaya antrean tidak macet selamanya.
 */
import { useAppStore } from '../../data/store';
import { useAuthStore } from '../../data/auth';
import type { OutboxOp } from '../db/types';
import { localStore } from '../db/local';
import { isCloudEnabled, requireSupabase } from '../supabase/client';
import { toLocalId, toRemoteId } from './idmap';
import * as map from './mappers';
import { friendlySyncError } from './errors';
import { pendingLocalIds } from './outbox';
import { useSyncStore } from './state';
import type {
  CapitalAllocation,
  Category,
  LineItem,
  Order,
  Payable,
  Product,
  Receivable,
  Shift,
  Transaction,
} from '../../data/types';
import { isOnline } from './connectivity';

const PERMANENT_CODES = new Set(['42501', 'P0001', '22000', '22P02', '23505', '23514', '23503']);
const MAX_ATTEMPTS = 5;

export interface SyncSummary {
  pushed: number;
  pulled: number;
  error: string | null;
}

const empty: SyncSummary = { pushed: 0, pulled: 0, error: null };

/**
 * Teks galat yang tampil di layar selalu versi ramah; pesan aslinya hanya
 * dicatat di log supaya bisa didiagnosa tanpa membingungkan pengguna.
 */
function messageOf(error: unknown): string {
  if (__DEV__) console.warn('[sinkron]', error);
  return friendlySyncError(error);
}

function isPermanent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && PERMANENT_CODES.has(code);
}

async function refreshPending(): Promise<void> {
  try {
    const pending = await localStore.pendingCount();
    useSyncStore.setState({ pending });
  } catch {
    // abaikan
  }
}

// ---------------------------------------------------------------- push

async function pushOne(op: OutboxOp, outletId: string): Promise<void> {
  const sb = requireSupabase();
  const payload = JSON.parse(op.payload) as Record<string, unknown>;
  const localId = typeof payload.id === 'string' ? payload.id : '';

  switch (op.entity) {
    case 'product': {
      if (!localId) return;
      const remoteId = await toRemoteId('product', localId);
      if (op.op === 'delete') {
        const { error } = await sb
          .from('products')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', remoteId);
        if (error) throw error;
        return;
      }
      const row = map.productToRemote(payload as unknown as Product, outletId, remoteId);

      // Sprint 2: stok tidak lagi dikirim sebagai nilai absolut. Perubahan stok
      // (stok awal barang baru, atau selisih saat pemilik mengedit stok) dikirim
      // sebagai delta dengan `stock_ref` unik agar aman dikirim ulang.
      const delta = Number(payload.stockDelta ?? 0);
      if (Number.isFinite(delta) && delta !== 0) {
        row.stock_delta = delta;
        row.stock_reason = typeof payload.stockReason === 'string' ? payload.stockReason : 'opening';
        row.stock_ref = typeof payload.stockRef === 'string' ? payload.stockRef : null;
      }

      const { error } = await sb.rpc('sync_product', { p: row });
      if (error) throw error;
      return;
    }

    case 'stock_delta': {
      const productId = typeof payload.productId === 'string' ? payload.productId : '';
      const delta = Number(payload.delta ?? 0);
      if (!productId || !Number.isFinite(delta) || delta === 0) return;
      const productRemoteId = await toRemoteId('product', productId);
      const ref = localId ? await toRemoteId('stock_delta', localId) : null;
      const { error } = await sb.rpc('apply_stock_delta', {
        p_product: productRemoteId,
        p_delta: delta,
        p_reason: typeof payload.reason === 'string' ? payload.reason : 'adjust',
        p_ref: ref,
        p_note: typeof payload.note === 'string' ? payload.note : null,
      });
      if (error) throw error;
      return;
    }

    case 'category': {
      if (!localId) return;
      const remoteId = await toRemoteId('category', localId);
      if (op.op === 'delete') {
        const { error } = await sb
          .from('categories')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', remoteId);
        if (error) throw error;
        return;
      }
      const row = map.categoryToRemote(
        payload as unknown as Category,
        outletId,
        remoteId,
        Number(payload.sort ?? 0),
      );
      const { error } = await sb.from('categories').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return;
    }

    case 'allocation': {
      if (!localId) return;
      const remoteId = await toRemoteId('allocation', localId);
      if (op.op === 'delete') {
        const { error } = await sb
          .from('capital_allocations')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', remoteId);
        if (error) throw error;
        return;
      }
      const row = map.allocationToRemote(payload as unknown as CapitalAllocation, outletId, remoteId);
      const { error } = await sb.from('capital_allocations').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return;
    }

    case 'transaction': {
      if (!localId) return;
      const remoteId = await toRemoteId('transaction', localId);
      if (op.op === 'delete') {
        const reason = typeof payload.voidReason === 'string' ? payload.voidReason : null;
        const { error } = await sb.rpc('void_transaction', { p_tx: remoteId, p_reason: reason });
        if (error) throw error;
        return;
      }
      const tx = payload as unknown as Transaction;
      const items: {
        product_id: string | null;
        name: string;
        qty: number;
        price: number;
        cost: number;
        discount: number;
      }[] = [];
      for (const item of tx.items ?? []) {
        items.push({
          product_id: item.productId ? await toRemoteId('product', item.productId) : null,
          name: item.name,
          qty: item.qty,
          price: item.price,
          cost: item.cost ?? 0,
          discount: item.discount ?? 0,
        });
      }
      const body = map.transactionToRemote({ transaction: tx, outletId, remoteId, items });
      const { error } = await sb.rpc('sync_transaction', { p: body });
      if (error) throw error;
      return;
    }

    case 'receivable': {
      if (!localId) return;
      const remoteId = await toRemoteId('receivable', localId);
      if (op.op === 'delete') {
        const { error } = await sb
          .from('receivables')
          .update({ deleted_at: new Date().toISOString(), status: 'void' })
          .eq('id', remoteId);
        if (error) throw error;
        return;
      }
      const row = map.receivableToRemote(payload as unknown as Receivable, outletId, remoteId);
      const { error } = await sb.from('receivables').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return;
    }

    case 'payable': {
      if (!localId) return;
      const remoteId = await toRemoteId('payable', localId);
      if (op.op === 'delete') {
        const { error } = await sb
          .from('payables')
          .update({ deleted_at: new Date().toISOString(), status: 'void' })
          .eq('id', remoteId);
        if (error) throw error;
        return;
      }
      const row = map.payableToRemote(payload as unknown as Payable, outletId, remoteId);
      const { error } = await sb.from('payables').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return;
    }

    case 'receivable_payment':
    case 'payable_payment': {
      if (!localId) return;
      const parentId = op.entity === 'receivable_payment' ? payload.receivableId : payload.payableId;
      if (typeof parentId !== 'string' || !parentId) return;
      const parentEntity = op.entity === 'receivable_payment' ? 'receivable' : 'payable';
      const remoteId = await toRemoteId(op.entity, localId);
      const parentRemoteId = await toRemoteId(parentEntity, parentId);
      const row = map.paymentToRemote(
        {
          amount: Number(payload.amount ?? 0),
          method: (payload.method as Transaction['method']) ?? 'cash',
          note: typeof payload.note === 'string' ? payload.note : undefined,
        },
        op.entity === 'receivable_payment' ? 'receivable_id' : 'payable_id',
        parentRemoteId,
        remoteId,
        typeof payload.paidAt === 'string' ? payload.paidAt : new Date().toISOString(),
      );
      const table = op.entity === 'receivable_payment' ? 'receivable_payments' : 'payable_payments';
      const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
      if (error) throw error;
      return;
    }

    case 'shift': {
      if (!localId) return;
      const remoteId = await toRemoteId('shift', localId);
      const row = map.shiftToRemote(payload as unknown as Shift, outletId, remoteId);
      const { error } = await sb.rpc('sync_shift', { p: row });
      if (error) throw error;
      return;
    }

    case 'order': {
      if (!localId) return;
      const remoteId = await toRemoteId('order', localId);
      if (op.op === 'delete') {
        const { error } = await sb
          .from('orders')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', remoteId);
        if (error) throw error;
        return;
      }
      const order = payload as unknown as Order;
      const items: { product_id: string | null; name: string; qty: number; price: number }[] = [];
      for (const item of order.items ?? []) {
        items.push({
          product_id: item.productId ? await toRemoteId('product', item.productId) : null,
          name: item.name,
          qty: item.qty,
          price: item.price,
        });
      }
      const { error } = await sb.rpc('sync_order', {
        p: {
          id: remoteId,
          outlet_id: outletId,
          customer_name: order.customerName,
          customer_phone: order.customerPhone ?? null,
          note: order.note ?? null,
          due_date: order.dueDate ?? null,
          deposit: order.deposit ?? 0,
          status: order.status,
          transaction_id: order.transactionId
            ? await toRemoteId('transaction', order.transactionId)
            : null,
          created_at: order.createdAt,
          items,
        },
      });
      if (error) throw error;
      return;
    }

    case 'profile': {
      const row = map.profileToRemote(
        payload as unknown as { name: string; phone?: string; openTime: string; closeTime: string },
      );
      const { error } = await sb.from('outlets').update(row).eq('id', outletId);
      if (error) throw error;
      return;
    }

    default:
      return;
  }
}

async function pushOutbox(outletId: string): Promise<number> {
  let sent = 0;
  const ops = await localStore.pending(50);

  for (const op of ops) {
    try {
      await pushOne(op, outletId);
      await localStore.removeOps([op.id]);
      sent += 1;
    } catch (error) {
      const attempts = await localStore.bumpAttempts(op.id);
      if (isPermanent(error) || attempts >= MAX_ATTEMPTS) {
        // Operasi tidak akan pernah berhasil: buang agar antrean tidak macet.
        await localStore.dropOp(op.id);
        continue;
      }
      throw error;
    }
  }

  return sent;
}

// ---------------------------------------------------------------- pull

async function fetchSince(table: string, outletId: string): Promise<map.RemoteRow[]> {
  const sb = requireSupabase();
  const cursorKey = `sync:kursor:${table}`;
  const cursor = (await localStore.kvGet(cursorKey)) ?? '1970-01-01T00:00:00.000Z';

  const { data, error } = await sb
    .from(table)
    .select('*')
    .eq('outlet_id', outletId)
    .gt('updated_at', cursor)
    .order('updated_at', { ascending: true })
    .limit(300);

  if (error) throw error;

  const rows = (data ?? []) as map.RemoteRow[];
  const last = rows[rows.length - 1];
  if (last && typeof last.updated_at === 'string') {
    await localStore.kvSet(cursorKey, last.updated_at);
  }
  return rows;
}

interface PaymentLocal {
  id: string;
  amount: number;
  paidAt: string;
  method: Transaction['method'];
  note?: string;
}

async function pullPayments(table: string, parentIds: string[], parentColumn: string): Promise<Map<string, PaymentLocal[]>> {
  const sb = requireSupabase();
  const grouped = new Map<string, PaymentLocal[]>();
  if (parentIds.length === 0) return grouped;

  const { data, error } = await sb.from(table).select('*').in(parentColumn, parentIds);
  if (error) throw error;

  for (const row of (data ?? []) as map.RemoteRow[]) {
    const parent = String(row[parentColumn] ?? '');
    if (!parent) continue;
    const list = grouped.get(parent) ?? [];
    list.push({
      id: String(row.id),
      amount: Number(row.amount ?? 0),
      paidAt: String(row.paid_at ?? new Date().toISOString()),
      method: (row.method as Transaction['method']) ?? 'cash',
      note: typeof row.note === 'string' ? row.note : undefined,
    });
    grouped.set(parent, list);
  }
  return grouped;
}

async function pullAll(outletId: string): Promise<number> {
  const sb = requireSupabase();
  const keep = await pendingLocalIds();
  let pulled = 0;

  const patch: {
    products?: Product[];
    transactions?: Transaction[];
    receivables?: Receivable[];
    payables?: Payable[];
    categories?: Category[];
    allocations?: CapitalAllocation[];
    shifts?: Shift[];
    orders?: Order[];
    profile?: { name: string; phone?: string };
  } = {};

  // ---- produk
  const productRows = await fetchSince('products', outletId);
  const products: Product[] = [];
  for (const row of productRows) {
    if (row.deleted_at) continue;
    const localId = await toLocalId('product', String(row.id));
    if (keep.has(localId)) continue;
    products.push(map.productFromRemote(row, localId));
  }
  if (products.length > 0) {
    patch.products = products;
    pulled += products.length;
  }

  // ---- transaksi + rincian barang
  const txRows = (await fetchSince('transactions', outletId)).filter((row) => !row.deleted_at);
  if (txRows.length > 0) {
    const remoteIds = txRows.map((row) => String(row.id));
    const { data: itemData, error: itemError } = await sb
      .from('transaction_items')
      .select('*')
      .in('transaction_id', remoteIds);
    if (itemError) throw itemError;

    const byTx = new Map<string, LineItem[]>();
    for (const item of (itemData ?? []) as map.RemoteRow[]) {
      const key = String(item.transaction_id ?? '');
      if (!key) continue;
      const productLocalId =
        typeof item.product_id === 'string' ? await toLocalId('product', item.product_id) : undefined;
      const list = byTx.get(key) ?? [];
      list.push(map.lineItemFromRemote(item, productLocalId));
      byTx.set(key, list);
    }

    const transactions: Transaction[] = [];
    for (const row of txRows) {
      const localId = await toLocalId('transaction', String(row.id));
      if (keep.has(localId)) continue;
      transactions.push(map.transactionFromRemote(row, localId, byTx.get(String(row.id)) ?? []));
    }
    if (transactions.length > 0) {
      patch.transactions = transactions;
      pulled += transactions.length;
    }
  }

  // ---- kasbon
  const receivableRows = (await fetchSince('receivables', outletId)).filter((row) => !row.deleted_at);
  if (receivableRows.length > 0) {
    const remoteIds = receivableRows.map((row) => String(row.id));
    const payments = await pullPayments('receivable_payments', remoteIds, 'receivable_id');
    const receivables: Receivable[] = [];
    for (const row of receivableRows) {
      const localId = await toLocalId('receivable', String(row.id));
      if (keep.has(localId)) continue;
      receivables.push(map.receivableFromRemote(row, localId, payments.get(String(row.id)) ?? []));
    }
    if (receivables.length > 0) {
      patch.receivables = receivables;
      pulled += receivables.length;
    }
  }

  // ---- utang supplier
  const payableRows = (await fetchSince('payables', outletId)).filter((row) => !row.deleted_at);
  if (payableRows.length > 0) {
    const remoteIds = payableRows.map((row) => String(row.id));
    const payments = await pullPayments('payable_payments', remoteIds, 'payable_id');
    const payables: Payable[] = [];
    for (const row of payableRows) {
      const localId = await toLocalId('payable', String(row.id));
      if (keep.has(localId)) continue;
      payables.push(map.payableFromRemote(row, localId, payments.get(String(row.id)) ?? []));
    }
    if (payables.length > 0) {
      patch.payables = payables;
      pulled += payables.length;
    }
  }

  // ---- kategori
  const categoryRows = (await fetchSince('categories', outletId)).filter((row) => !row.deleted_at);
  if (categoryRows.length > 0) {
    const categories: Category[] = [];
    for (const row of categoryRows) {
      const localId = await toLocalId('category', String(row.id));
      if (keep.has(localId)) continue;
      categories.push(map.categoryFromRemote(row, localId));
    }
    if (categories.length > 0) {
      patch.categories = categories;
      pulled += categories.length;
    }
  }

  // ---- alokasi modal
  const allocationRows = (await fetchSince('capital_allocations', outletId)).filter((row) => !row.deleted_at);
  if (allocationRows.length > 0) {
    const allocations: CapitalAllocation[] = [];
    for (const row of allocationRows) {
      const localId = await toLocalId('allocation', String(row.id));
      if (keep.has(localId)) continue;
      allocations.push(map.allocationFromRemote(row, localId));
    }
    if (allocations.length > 0) {
      patch.allocations = allocations;
      pulled += allocations.length;
    }
  }

  // ---- shift kasir (tabel ini tidak punya updated_at: ambil 50 terakhir)
  const { data: shiftData, error: shiftError } = await sb
    .from('shifts')
    .select('*')
    .eq('outlet_id', outletId)
    .order('opened_at', { ascending: false })
    .limit(50);
  if (shiftError) throw shiftError;
  const shifts: Shift[] = [];
  for (const row of (shiftData ?? []) as map.RemoteRow[]) {
    const localId = await toLocalId('shift', String(row.id));
    if (keep.has(localId)) continue;
    shifts.push(map.shiftFromRemote(row, localId));
  }
  if (shifts.length > 0) {
    patch.shifts = shifts;
    pulled += shifts.length;
  }

  // ---- pesanan / kuotasi
  const orderRows = (await fetchSince('orders', outletId)).filter((row) => !row.deleted_at);
  if (orderRows.length > 0) {
    const remoteIds = orderRows.map((row) => String(row.id));
    const { data: orderItemData, error: orderItemError } = await sb
      .from('order_items')
      .select('*')
      .in('order_id', remoteIds);
    if (orderItemError) throw orderItemError;

    const itemsByOrder = new Map<string, { productId?: string; name: string; qty: number; price: number }[]>();
    for (const row of (orderItemData ?? []) as map.RemoteRow[]) {
      const key = String(row.order_id);
      const list = itemsByOrder.get(key) ?? [];
      list.push({
        productId: row.product_id ? await toLocalId('product', String(row.product_id)) : undefined,
        name: String(row.name ?? 'Barang'),
        qty: Number(row.qty ?? 0),
        price: Number(row.price ?? 0),
      });
      itemsByOrder.set(key, list);
    }

    const orders: Order[] = [];
    for (const row of orderRows) {
      const localId = await toLocalId('order', String(row.id));
      if (keep.has(localId)) continue;
      orders.push({
        id: localId,
        customerName: String(row.customer_name ?? 'Pelanggan'),
        customerPhone: row.customer_phone ? String(row.customer_phone) : undefined,
        items: itemsByOrder.get(String(row.id)) ?? [],
        total: Number(row.total ?? 0),
        deposit: row.deposit === null || row.deposit === undefined ? undefined : Number(row.deposit),
        dueDate: row.due_date ? String(row.due_date) : undefined,
        note: row.note ? String(row.note) : undefined,
        status: (row.status === 'selesai' || row.status === 'batal' ? row.status : 'terbuka') as Order['status'],
        createdAt: String(row.created_at ?? new Date().toISOString()),
        updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        transactionId: row.transaction_id
          ? await toLocalId('transaction', String(row.transaction_id))
          : undefined,
      });
    }
    if (orders.length > 0) {
      patch.orders = orders;
      pulled += orders.length;
    }
  }

  // ---- profil toko
  const outletName = useAuthStore.getState().outletName;
  if (outletName) patch.profile = { name: outletName };

  if (Object.keys(patch).length > 0) {
    useAppStore.getState().mergeRemote(patch);
  }

  return pulled;
}

// ---------------------------------------------------------------- putaran

export async function syncNow(): Promise<SyncSummary> {
  if (!isCloudEnabled) return empty;

  const { outletId, userId } = useAuthStore.getState();
  if (!outletId || !userId) return empty;

  // Tanpa internet: jangan buang waktu, perubahan tetap menunggu di antrean.
  if (!isOnline()) return empty;

  if (useSyncStore.getState().running) return empty;
  useSyncStore.setState({ running: true, status: 'syncing', error: null });

  try {
    const pushed = await pushOutbox(outletId);
    const pulled = await pullAll(outletId);
    useSyncStore.setState({
      running: false,
      status: 'idle',
      error: null,
      lastSyncAt: new Date().toISOString(),
    });
    await refreshPending();
    return { pushed, pulled, error: null };
  } catch (error) {
    useSyncStore.setState({
      running: false,
      status: 'error',
      error: messageOf(error),
    });
    await refreshPending();
    return { pushed: 0, pulled: 0, error: messageOf(error) };
  }
}

let soonTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Minta sinkron dalam waktu dekat (dipakai Realtime & tombol manual).
 * Beberapa pemicu beruntun digabung jadi satu putaran.
 */
export function syncSoon(delayMs = 1200): void {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void syncNow();
  }, delayMs);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Mulai sinkron berkala (default 30 detik). Aman dipanggil berulang. */
export function startSyncLoop(intervalMs = 30_000): void {
  stopSyncLoop();
  void refreshPending();
  void syncNow();
  timer = setInterval(() => {
    void syncNow();
  }, intervalMs);
}

export function stopSyncLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export { refreshPending };
