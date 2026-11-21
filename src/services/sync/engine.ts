/**
 * Mesin sinkron offline-first.
 *
 * Alur satu putaran (`syncNow`):
 *   1. PUSH  — kirim antrean perubahan lokal ke Supabase, berurutan.
 *   2. PULL  — tarik baris yang berubah sejak kursor terakhir (per tabel, dengan paginasi).
 *   3. MERGE — gabungkan ke store (termasuk penghapusan jarak jauh); data yang
 *              masih punya perubahan tertunda di antrean TIDAK ditimpa.
 */
import { useAppStore } from '../../data/store';
import { useAuthStore } from '../../data/auth';
import type { OutboxOp } from '../db/types';
import { localStore } from '../db/local';
import { localJsonStorage } from '../db/persistence';
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
const PAGE_SIZE = 300;
const MAX_PAGES = 20;

export interface SyncSummary {
  pushed: number;
  pulled: number;
  error: string | null;
}

const empty: SyncSummary = { pushed: 0, pulled: 0, error: null };

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

async function ensureRemoteCategory(categoryId: string, outletId: string): Promise<string | null> {
  if (!categoryId) return null;
  const remoteCategoryId = await toRemoteId('category', categoryId);
  const localCat = useAppStore.getState().categories.find((c) => c.id === categoryId);
  if (localCat) {
    const sb = requireSupabase();
    const row = map.categoryToRemote(localCat, outletId, remoteCategoryId, 0);
    // Upsert kategori bawaan/lokal agar FK category_id pada transaksi sah di server
    const { error } = await sb.from('categories').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  }
  return remoteCategoryId;
}

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
      const categoryId = tx.categoryId ? await ensureRemoteCategory(tx.categoryId, outletId) : null;
      const customerId = tx.customerId ? await toRemoteId('customer', tx.customerId) : null;
      const body = map.transactionToRemote({
        transaction: tx,
        outletId,
        remoteId,
        items,
        categoryId,
        customerId,
      });
      if (items.length === 0) {
        body.subtotal = tx.subtotal ?? tx.amount;
      }
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
      const rawMethod = (payload.method as Transaction['method']) ?? 'cash';
      // Pembayaran piutang/utang di tabel relasional memakai metode pembayaran nyata
      const safeMethod: Transaction['method'] = rawMethod === 'kasbon' ? 'cash' : rawMethod;
      const row = map.paymentToRemote(
        {
          amount: Number(payload.amount ?? 0),
          method: safeMethod,
          note: typeof payload.note === 'string' ? payload.note : undefined,
        },
        op.entity === 'receivable_payment' ? 'receivable_id' : 'payable_id',
        parentRemoteId,
        remoteId,
        typeof payload.paidAt === 'string' ? payload.paidAt : new Date().toISOString(),
      );
      const table = op.entity === 'receivable_payment' ? 'receivable_payments' : 'payable_payments';
      row.source = payload.source === 'retur' ? 'retur' : rawMethod === 'kasbon' ? 'deposit' : null;
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

  for (let round = 0; round < MAX_PAGES; round += 1) {
    const ops = await localStore.pending(50);
    if (ops.length === 0) break;

    for (const op of ops) {
      try {
        await pushOne(op, outletId);
        await localStore.removeOps([op.id]);
        sent += 1;
      } catch (error) {
        const attempts = await localStore.bumpAttempts(op.id);
        if (isPermanent(error) && attempts >= MAX_ATTEMPTS) {
          // Jangan dibuang diam-diam: beri peringatan ramah di status sinkronisasi
          await localStore.dropOp(op.id);
          const prev = useSyncStore.getState();
          useSyncStore.setState({
            droppedCount: prev.droppedCount + 1,
            warning: messageOf(error),
          });
          continue;
        }
        throw error;
      }
    }
  }

  return sent;
}

// ---------------------------------------------------------------- pull

/**
 * Tarik semua perubahan sejak kursor komposit terakhir (`updated_at|id`).
 * Memakai `.gte` + penyaringan `(updated_at, id)` dan loop paginasi supaya baris
 * dengan stempel waktu identik atau jumlah > 300 tidak pernah terlewat.
 */
async function fetchSince(table: string, outletId: string, cursors: Map<string, string>): Promise<map.RemoteRow[]> {
  const sb = requireSupabase();
  const cursorKey = `sync:kursor:${table}`;
  const raw = (await localStore.kvGet(cursorKey)) ?? '';
  const parts = raw.split('|');
  // A cursor belongs to one membership/outlet, never to a different store.
  let cursorTs = parts[0] === outletId && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-][\d:]+)$/.test(parts[1] ?? '')
    ? parts[1] : '1970-01-01T00:00:00.000Z';
  let cursorId = parts[0] === outletId && /^[0-9a-f-]{36}$/i.test(parts[2] ?? '') ? parts[2] : '';
  const collected: map.RemoteRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = sb.from(table).select('*').eq('outlet_id', outletId);
    query = cursorId
      ? query.or(`updated_at.gt.${cursorTs},and(updated_at.eq.${cursorTs},id.gt.${cursorId})`)
      : query.gte('updated_at', cursorTs);
    const { data, error } = await query.order('updated_at', { ascending: true })
      .order('id', { ascending: true }).limit(PAGE_SIZE);
    if (error) throw error;
    const batch = (data ?? []) as map.RemoteRow[];
    if (batch.length === 0) break;
    collected.push(...batch);
    const last = batch[batch.length - 1];
    cursorTs = String(last.updated_at);
    cursorId = String(last.id);
    cursors.set(cursorKey, `${outletId}|${cursorTs}|${cursorId}`);
    if (batch.length < PAGE_SIZE) break;
  }
  return collected;
}

interface PaymentLocal {
  id: string;
  amount: number;
  paidAt: string;
  method: Transaction['method'];
  source?: 'retur';
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
      method: row.source === 'deposit' ? 'kasbon' : (row.method as Transaction['method']) ?? 'cash',
      ...(row.source === 'retur' ? { source: 'retur' as const } : {}),
      note: typeof row.note === 'string' ? row.note : undefined,
    });
    grouped.set(parent, list);
  }
  return grouped;
}

async function pullAll(outletId: string): Promise<number> {
  const sb = requireSupabase();
  const keep = await pendingLocalIds();
  const cursors = new Map<string, string>();
  let pulled = 0;

  const deleted: {
    products: string[];
    transactions: string[];
    receivables: string[];
    payables: string[];
    categories: string[];
    allocations: string[];
    orders: string[];
  } = {
    products: [],
    transactions: [],
    receivables: [],
    payables: [],
    categories: [],
    allocations: [],
    orders: [],
  };

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
    deleted?: Partial<typeof deleted>;
  } = {};

  // ---- kategori (ditarik lebih dulu agar transaksi bisa merujuk id kategori lokal)
  const categoryRows = await fetchSince('categories', outletId, cursors);
  const categories: Category[] = [];
  for (const row of categoryRows) {
    const localId = await toLocalId('category', String(row.id));
    if (keep.has(localId)) continue;
    if (row.deleted_at) {
      deleted.categories.push(localId);
      continue;
    }
    categories.push(map.categoryFromRemote(row, localId));
  }
  if (categories.length > 0) {
    patch.categories = categories;
    pulled += categories.length;
  }

  // ---- produk
  const productRows = await fetchSince('products', outletId, cursors);
  const products: Product[] = [];
  for (const row of productRows) {
    const localId = await toLocalId('product', String(row.id));
    if (keep.has(localId)) continue;
    if (row.deleted_at) {
      deleted.products.push(localId);
      continue;
    }
    products.push(map.productFromRemote(row, localId));
  }
  if (products.length > 0) {
    patch.products = products;
    pulled += products.length;
  }

  // ---- transaksi + rincian barang
  const allTxRows = await fetchSince('transactions', outletId, cursors);
  const activeTxRows: map.RemoteRow[] = [];
  for (const row of allTxRows) {
    const localId = await toLocalId('transaction', String(row.id));
    if (keep.has(localId)) continue;
    if (row.deleted_at) {
      deleted.transactions.push(localId);
    } else {
      activeTxRows.push(row);
    }
  }
  if (activeTxRows.length > 0) {
    const remoteIds = activeTxRows.map((row) => String(row.id));
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

    const fallbackCats = useAppStore.getState().categories;
    const transactions: Transaction[] = [];
    for (const row of activeTxRows) {
      const localId = await toLocalId('transaction', String(row.id));
      let localCatId =
        typeof row.category_id === 'string' && row.category_id
          ? await toLocalId('category', row.category_id)
          : '';
      if (!localCatId) {
        const txType = String(row.type ?? 'sale') === 'expense' ? 'expense' : 'sale';
        localCatId = fallbackCats.find((c) => c.type === txType)?.id ?? '';
      }
      transactions.push(
        map.transactionFromRemote(row, localId, byTx.get(String(row.id)) ?? [], localCatId),
      );
    }
    if (transactions.length > 0) {
      patch.transactions = transactions;
      pulled += transactions.length;
    }
  }

  // ---- kasbon
  const allRcvRows = await fetchSince('receivables', outletId, cursors);
  const activeRcvRows: map.RemoteRow[] = [];
  for (const row of allRcvRows) {
    const localId = await toLocalId('receivable', String(row.id));
    if (keep.has(localId)) continue;
    if (row.deleted_at || row.status === 'void') {
      deleted.receivables.push(localId);
    } else {
      activeRcvRows.push(row);
    }
  }
  if (activeRcvRows.length > 0) {
    const remoteIds = activeRcvRows.map((row) => String(row.id));
    const payments = await pullPayments('receivable_payments', remoteIds, 'receivable_id');
    const receivables: Receivable[] = [];
    for (const row of activeRcvRows) {
      const localId = await toLocalId('receivable', String(row.id));
      receivables.push(map.receivableFromRemote(row, localId, payments.get(String(row.id)) ?? []));
    }
    if (receivables.length > 0) {
      patch.receivables = receivables;
      pulled += receivables.length;
    }
  }

  // ---- utang supplier
  const allPayRows = await fetchSince('payables', outletId, cursors);
  const activePayRows: map.RemoteRow[] = [];
  for (const row of allPayRows) {
    const localId = await toLocalId('payable', String(row.id));
    if (keep.has(localId)) continue;
    if (row.deleted_at || row.status === 'void') {
      deleted.payables.push(localId);
    } else {
      activePayRows.push(row);
    }
  }
  if (activePayRows.length > 0) {
    const remoteIds = activePayRows.map((row) => String(row.id));
    const payments = await pullPayments('payable_payments', remoteIds, 'payable_id');
    const payables: Payable[] = [];
    for (const row of activePayRows) {
      const localId = await toLocalId('payable', String(row.id));
      payables.push(map.payableFromRemote(row, localId, payments.get(String(row.id)) ?? []));
    }
    if (payables.length > 0) {
      patch.payables = payables;
      pulled += payables.length;
    }
  }

  // ---- alokasi modal
  const allocationRows = await fetchSince('capital_allocations', outletId, cursors);
  const allocations: CapitalAllocation[] = [];
  for (const row of allocationRows) {
    const localId = await toLocalId('allocation', String(row.id));
    if (keep.has(localId)) continue;
    if (row.deleted_at) {
      deleted.allocations.push(localId);
      continue;
    }
    allocations.push(map.allocationFromRemote(row, localId));
  }
  if (allocations.length > 0) {
    patch.allocations = allocations;
    pulled += allocations.length;
  }

  // ---- shift kasir
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
  const allOrderRows = await fetchSince('orders', outletId, cursors);
  const activeOrderRows: map.RemoteRow[] = [];
  for (const row of allOrderRows) {
    const localId = await toLocalId('order', String(row.id));
    if (keep.has(localId)) continue;
    if (row.deleted_at) {
      deleted.orders.push(localId);
    } else {
      activeOrderRows.push(row);
    }
  }
  if (activeOrderRows.length > 0) {
    const remoteIds = activeOrderRows.map((row) => String(row.id));
    const { data: orderItemData, error: orderItemError } = await sb
      .from('order_items')
      .select('*')
      .in('order_id', remoteIds);
    if (orderItemError) throw itemErrorFallback(orderItemError);

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
    for (const row of activeOrderRows) {
      const localId = await toLocalId('order', String(row.id));
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

  const hasDeleted = Object.values(deleted).some((ids) => ids.length > 0);
  if (hasDeleted) {
    patch.deleted = deleted;
    pulled += Object.values(deleted).reduce((sum, ids) => sum + ids.length, 0);
  }

  // ---- profil toko
  const outletName = useAuthStore.getState().outletName;
  if (outletName) patch.profile = { name: outletName };

  if (Object.keys(patch).length > 0) {
    useAppStore.getState().mergeRemote(patch);
  }

  await localJsonStorage.setItem('inventoris-store-v1', JSON.stringify({ state: useAppStore.getState(), version: 2 }));
  for (const [key, value] of cursors) await localStore.kvSet(key, value);
  return pulled;
}

function itemErrorFallback(error: unknown): unknown {
  return error;
}

// ---------------------------------------------------------------- putaran

let paused = false;
let activeRound: Promise<SyncSummary> | null = null;
export function syncNow(): Promise<SyncSummary> {
  if (paused) return Promise.resolve(empty);
  if (activeRound) return activeRound;
  activeRound = runSync().finally(() => { activeRound = null; });
  return activeRound;
}
export async function pauseSync(): Promise<void> {
  paused = true;
  stopSyncLoop();
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = null;
  await activeRound;
}
export function resumeSync(): void { paused = false; }
async function runSync(): Promise<SyncSummary> {
  if (!isCloudEnabled) return empty;

  const { outletId, userId } = useAuthStore.getState();
  if (!outletId || !userId) return empty;

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

export function syncSoon(delayMs = 1200): void {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void syncNow();
  }, delayMs);
}

let timer: ReturnType<typeof setInterval> | null = null;

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
