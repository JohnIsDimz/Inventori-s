/**
 * Uji bentuk data sinkron (murni, tanpa jaringan).
 * Jalankan: npx tsx supabase/tests/mappers.test.mts
 *
 * Tujuan: memastikan kunci yang dikirim ke Postgres PERSIS sama dengan kolom
 * di migrasi 0001. Salah satu nama kolom saja meleset → push akan gagal 400.
 */
import { strict as assert } from 'node:assert';

import {
  allocationFromRemote,
  allocationToRemote,
  categoryFromRemote,
  categoryToRemote,
  lineItemFromRemote,
  payableToRemote,
  paymentToRemote,
  productFromRemote,
  productToRemote,
  receivableToRemote,
  shiftFromRemote,
  shiftToRemote,
  transactionFromRemote,
  transactionToRemote,
} from '../../src/services/sync/mappers';

const OUTLET = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log('  OK   ' + label);
};

const keysOf = (row: Record<string, unknown>) => Object.keys(row).sort();
const expectKeys = (row: Record<string, unknown>, expected: string[], label: string) => {
  assert.deepEqual(keysOf(row), [...expected].sort(), `${label}: kunci tidak cocok -> ${keysOf(row).join(',')}`);
};

// ---------------------------------------------------------------- produk
const product = {
  id: 'prd_1',
  name: 'Indomie Goreng',
  unit: 'pcs',
  sellPrice: 3500,
  costPrice: 3000,
  stock: 12,
  minStock: 3,
  barcode: ' 8998866200011 ',
};

check('productToRemote memakai kolom products TANPA stok absolut', () => {
  const row = productToRemote(product, OUTLET, ID);
  expectKeys(
    row,
    ['id', 'outlet_id', 'name', 'unit', 'barcode', 'cost_price', 'sell_price', 'min_stock', 'wholesale_price', 'wholesale_min_qty'],
    'produk',
  );
  assert.equal(row.barcode, '8998866200011', 'barcode di-trim');
  assert.equal(row.sell_price, 3500);
  assert.equal('stock' in row, false, 'stok tidak boleh dikirim sebagai angka absolut');
});

check('productFromRemote mengembalikan bentuk lokal', () => {
  const local = productFromRemote(
    { name: 'Kopi', unit: 'sachet', sell_price: '2500', cost_price: '1800', stock: '4.00', min_stock: 1, barcode: null },
    'prd_x',
  );
  assert.equal(local.sellPrice, 2500);
  assert.equal(local.costPrice, 1800);
  assert.equal(local.stock, 4);
  assert.equal(local.barcode, undefined);
});

// ---------------------------------------------------------------- transaksi
check('transactionToRemote sesuai parameter RPC sync_transaction', () => {
  const tx = {
    id: 'tx_1',
    type: 'sale' as const,
    amount: 7000,
    categoryId: 'sale-1',
    method: 'cash' as const,
    createdAt: '2026-11-19T03:00:00.000Z',
    items: [{ productId: 'prd_1', name: 'Indomie', qty: 2, price: 3500, cost: 3000 }],
  };
  const row = transactionToRemote({
    transaction: tx,
    outletId: OUTLET,
    remoteId: ID,
    items: [{ product_id: ID, name: 'Indomie', qty: 2, price: 3500, cost: 3000 }],
  });
  expectKeys(
    row,
    [
      'outlet_id', 'client_tx_id', 'shift_id', 'type', 'category_id', 'customer_id',
      'discount', 'discount_kind', 'discount_value', 'tax', 'tax_rate',
      'method', 'note', 'created_at', 'items',
    ],
    'transaksi',
  );
  assert.equal(row.client_tx_id, ID, 'client_tx_id dipakai untuk idempotensi');
  assert.equal((row.items as unknown[]).length, 1);
});

check('harga grosir & diskon per baris ikut sinkron', () => {
  const row = productToRemote(
    {
      id: 'prd_g',
      name: 'Gula 1kg',
      unit: 'pcs',
      sellPrice: 15000,
      costPrice: 12000,
      stock: 40,
      minStock: 5,
      wholesalePrice: 13500,
      wholesaleMinQty: 5,
    },
    OUTLET,
    ID,
  );
  assert.equal(row.wholesale_price, 13500);
  assert.equal(row.wholesale_min_qty, 5);

  const back = productFromRemote(
    {
      name: 'Gula 1kg',
      unit: 'pcs',
      sell_price: '15000.00',
      cost_price: '12000.00',
      stock: '40',
      min_stock: '5',
      wholesale_price: '13500.00',
      wholesale_min_qty: '5.00',
    },
    'prd_g',
  );
  assert.equal(back.wholesalePrice, 13500);
  assert.equal(back.wholesaleMinQty, 5);

  const noGrosir = productFromRemote(
    { name: 'Kopi', sell_price: '9000', wholesale_price: null, wholesale_min_qty: null },
    'prd_k',
  );
  assert.equal(noGrosir.wholesalePrice, undefined, 'produk tanpa grosir tetap undefined');

  const item = lineItemFromRemote({ name: 'Gula', qty: 5, price: 13500, cost: 12000, discount: '2500.00' });
  assert.equal(item.discount, 2500, 'diskon per baris terbaca');
});

check('diskon & pajak ikut terkirim dan terbaca kembali', () => {
  const row = transactionToRemote({
    transaction: {
      id: 'tx_2',
      type: 'sale',
      amount: 8910,
      categoryId: 'sale-1',
      method: 'cash',
      createdAt: '2026-11-19T03:00:00.000Z',
      subtotal: 9000,
      discount: 900,
      discountKind: 'percent',
      discountValue: 10,
      tax: 810,
      taxRate: 10,
    },
    outletId: OUTLET,
    remoteId: ID,
    items: [],
  });
  assert.equal(row.discount_kind, 'percent');
  assert.equal(row.discount_value, 10);
  assert.equal(row.tax_rate, 10);

  const back = transactionFromRemote(
    {
      type: 'sale',
      subtotal: '9000.00',
      discount: '900.00',
      discount_kind: 'percent',
      discount_value: '10.00',
      tax: '810.00',
      tax_rate: '10.00',
      total: '8910.00',
      method: 'cash',
      created_at: '2026-11-19T03:00:00Z',
    },
    'tx_2',
    [],
  );
  assert.equal(back.discountKind, 'percent');
  assert.equal(back.discountValue, 10);
  assert.equal(back.taxRate, 10);
  assert.equal(back.tax, 810);
  assert.equal(back.amount, 8910);
});

check('transactionFromRemote memetakan total & metode', () => {
  const local = transactionFromRemote(
    { type: 'sale', total: '97500.00', method: 'qris', created_at: '2026-11-19T04:05:06Z', note: null, category_id: null },
    'tx_9',
    [lineItemFromRemote({ name: 'Beras', qty: 1, price: 97500, cost: 90000 })],
  );
  assert.equal(local.amount, 97500);
  assert.equal(local.method, 'qris');
  assert.equal(local.items?.length, 1);
  assert.equal(local.items?.[0].price, 97500);
});

// ---------------------------------------------------------------- kasbon & utang
check('receivableToRemote menandai lunas bila pembayaran menutup tagihan', () => {
  const row = receivableToRemote(
    {
      id: 'rcv_1',
      customerName: 'Bu Ani',
      amount: 50000,
      dueDate: '2026-11-25T00:00:00.000Z',
      createdAt: '2026-11-18T00:00:00.000Z',
      payments: [{ id: 'p1', amount: 50000, paidAt: '2026-11-19T00:00:00.000Z', method: 'cash' }],
    },
    OUTLET,
    ID,
  );
  expectKeys(row, ['id', 'outlet_id', 'customer_name', 'amount', 'due_date', 'note', 'status'], 'kasbon');
  assert.equal(row.status, 'paid');
  assert.equal(row.due_date, '2026-11-25');
});

check('payableToRemote status open bila belum dibayar', () => {
  const row = payableToRemote(
    { id: 'pay_1', supplierName: 'Agen Sembako', amount: 300000, dueDate: '2026-12-01T00:00:00.000Z', createdAt: '2026-11-19T00:00:00.000Z', payments: [] },
    OUTLET,
    ID,
  );
  assert.equal(row.status, 'open');
});

check('paymentToRemote memakai kolom induk yang benar', () => {
  const receivableRow = paymentToRemote({ amount: 1000, method: 'cash' }, 'receivable_id', ID, 'p_x', '2026-11-19T00:00:00.000Z');
  const payableRow = paymentToRemote({ amount: 1000, method: 'transfer' }, 'payable_id', ID, 'p_y', '2026-11-19T00:00:00.000Z');
  assert.equal(receivableRow.receivable_id, ID);
  assert.equal('payable_id' in receivableRow, false);
  assert.equal(payableRow.payable_id, ID);
});

// ---------------------------------------------------------------- kategori & alokasi
check('categoryToRemote / categoryFromRemote bolak-balik utuh', () => {
  const row = categoryToRemote({ id: 'cat_1', label: 'Minuman', type: 'sale', icon: 'cup' }, OUTLET, ID, 2);
  expectKeys(row, ['id', 'outlet_id', 'label', 'type', 'icon', 'sort'], 'kategori');
  assert.equal(row.sort, 2);

  const back = categoryFromRemote({ label: 'Minuman', type: 'sale', icon: 'cup' }, 'cat_1');
  assert.equal(back.id, 'cat_1');
  assert.equal(back.label, 'Minuman');
  assert.equal(back.type, 'sale');
});

check('allocationToRemote mempertahankan nominal negatif (penarikan modal)', () => {
  const row = allocationToRemote(
    { id: 'alc_1', amount: -75000, createdAt: '2026-11-19T02:00:00.000Z', note: 'ambil' },
    OUTLET,
    ID,
  );
  expectKeys(row, ['id', 'outlet_id', 'amount', 'note', 'created_at'], 'alokasi');
  assert.equal(row.amount, -75000);

  const back = allocationFromRemote({ amount: '-75000.00', note: null, created_at: '2026-11-19T02:00:00Z' }, 'alc_1');
  assert.equal(back.amount, -75000);
});

// ---------------------------------------------------------------- shift
check('shiftToRemote / shiftFromRemote konsisten', () => {
  const open = shiftToRemote({ id: 'shf_1', openedAt: '2026-11-19T01:00:00.000Z', openingCash: 50000 }, OUTLET, ID);
  expectKeys(open, ['id', 'outlet_id', 'opened_at', 'opening_cash', 'closed_at', 'closing_cash', 'note'], 'shift');
  assert.equal(open.closed_at, null);

  const closed = shiftToRemote(
    { id: 'shf_1', openedAt: '2026-11-19T01:00:00.000Z', openingCash: 50000, closedAt: '2026-11-19T09:00:00.000Z', closingCash: 52000, expectedCash: 50000, difference: 2000 },
    OUTLET,
    ID,
  );
  assert.equal(closed.closing_cash, 52000);

  const back = shiftFromRemote(
    {
      opened_at: '2026-11-19T01:00:00Z',
      opening_cash: '50000.00',
      closed_at: '2026-11-19T09:00:00Z',
      closing_cash: '52000.00',
      expected_cash: '50000.00',
      difference: '2000.00',
      note: 'tutup',
    },
    'shf_1',
  );
  assert.equal(back.openingCash, 50000);
  assert.equal(back.closingCash, 52000);
  assert.equal(back.difference, 2000);
  assert.ok(back.closedAt);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
