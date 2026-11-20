/**
 * Uji buku supplier & retur barang (Sprint 15).
 *
 * Yang dijaga:
 *   - supplier lama (yang hanya tersimpan sebagai NAMA di kulakan) tetap terbaca;
 *   - nama ganda tidak bisa masuk dua kali;
 *   - retur tidak pernah membuat uang tunai muncul di kas: nilainya memotong
 *     utang dulu, sisanya jadi saldo;
 *   - saldo retur tidak bisa dipakai dua kali.
 */
import assert from 'node:assert/strict';

import {
  availableCredit,
  buildReturnItems,
  cleanSupplierName,
  displaySupplierPhone,
  openPayablesFor,
  parseReturnQty,
  returnCandidates,
  returnReportText,
  returnSummaryText,
  returnTotal,
  supplierKey,
  supplierNamesFrom,
  supplierStats,
  validateReturn,
  validateSupplier,
} from '../../src/data/suppliers';
import type { Payable, Product, Purchase, PurchaseReturn, Supplier } from '../../src/data/types';

let passed = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
    console.log('  OK   ' + label);
  } catch (error) {
    console.log('  FAIL ' + label);
    console.log('       ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};

const supplier = (patch: Partial<Supplier> = {}): Supplier => ({
  id: 'sup_1',
  name: 'Agen Sumber Rejeki',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...patch,
});

const payable = (patch: Partial<Payable> = {}): Payable => ({
  id: 'pay_1',
  supplierName: 'Agen Sumber Rejeki',
  amount: 100000,
  dueDate: '2026-11-26T00:00:00.000Z',
  createdAt: '2026-11-18T00:00:00.000Z',
  payments: [],
  ...patch,
});

const purchase = (patch: Partial<Purchase> = {}): Purchase => ({
  id: 'pur_1',
  supplierName: 'Agen Sumber Rejeki',
  createdAt: '2026-11-18T00:00:00.000Z',
  items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 30, unitCost: 3100 }],
  total: 93000,
  paid: 50000,
  method: 'cash',
  ...patch,
});

const product = (patch: Partial<Product> = {}): Product => ({
  id: 'prd_1',
  name: 'Indomie',
  unit: 'pcs',
  sellPrice: 3500,
  costPrice: 3100,
  stock: 24,
  minStock: 2,
  ...patch,
});

const money = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

console.log('\n== buku supplier & retur barang ==');

check('nama supplier dirapikan & kuncinya sama untuk ejaan beda', () => {
  assert.equal(cleanSupplierName('  Agen   Sumber  '), 'Agen Sumber');
  assert.equal(supplierKey('Agen Sumber Rejeki'), supplierKey('agen  sumber rejeki'));
  assert.notEqual(supplierKey('Agen Sumber'), supplierKey('Agen Sumber Jaya'));
});

check('supplier ganda ditolak, tapi boleh menyimpan nama sendiri saat diubah', () => {
  const list = [supplier()];
  const dup = validateSupplier({ name: 'agen sumber rejeki' }, list);
  assert.equal(dup.ok, false);
  assert.match(dup.ok === false ? dup.reason : '', /sudah ada/i);
  assert.equal(validateSupplier({ name: 'agen sumber rejeki' }, list, 'sup_1').ok, true);
  assert.equal(validateSupplier({ name: 'A' }, list).ok, false);
});

check('nomor HP supplier diseragamkan & enak dibaca', () => {
  const checked = validateSupplier({ name: 'Toko Grosir', phone: '0812-3456-7890' }, []);
  assert.equal(checked.ok, true);
  if (checked.ok) assert.equal(checked.value.phone, '6281234567890');
  assert.equal(displaySupplierPhone('081234567890'), '0812-3456-7890');
});

check('supplier lama terbaca dari nama di kulakan & utang', () => {
  const names = supplierNamesFrom(
    [purchase(), purchase({ id: 'pur_2', supplierName: 'agen sumber rejeki' })],
    [payable({ id: 'pay_9', supplierName: 'Toko Grosir Jaya' })],
  );
  assert.deepEqual(names, ['Agen Sumber Rejeki', 'Toko Grosir Jaya']);
});

check('ringkasan supplier: kulakan, utang, retur, saldo', () => {
  const returns: PurchaseReturn[] = [
    {
      id: 'ret_1',
      supplierName: 'Agen Sumber Rejeki',
      createdAt: '2026-11-19T00:00:00.000Z',
      items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 2, unitCost: 3100 }],
      total: 6200,
      appliedAmount: 0,
      creditValue: 6200,
    },
  ];
  const stats = supplierStats(
    'Agen Sumber Rejeki',
    [purchase(), purchase({ id: 'pur_2', total: 40000, creditUsed: 4000 })],
    [payable()],
    returns,
  );
  assert.equal(stats.purchaseCount, 2);
  assert.equal(stats.purchaseTotal, 133000);
  assert.equal(stats.debtTotal, 100000);
  assert.equal(stats.returnTotal, 6200);
  assert.equal(stats.creditAvailable, 2200, 'saldo 6.200 dipakai 4.000');
  assert.equal(stats.lastPurchaseAt, '2026-11-18T00:00:00.000Z');
});

check('saldo retur tidak bisa dipakai dua kali', () => {
  const returns = [
    { id: 'ret_1', supplierName: 'Agen Sumber Rejeki', creditValue: 5000 },
  ] as PurchaseReturn[];
  assert.equal(availableCredit([purchase({ creditUsed: 2000 })], returns, 'Agen Sumber Rejeki'), 3000);
  assert.equal(availableCredit([purchase({ creditUsed: 9000 })], returns, 'Agen Sumber Rejeki'), 0);
  assert.equal(availableCredit([], returns, 'supplier lain'), 0);
});

check('utang terbuka dipilih yang paling lama', () => {
  const open = openPayablesFor(
    [
      payable({ id: 'pay_2', createdAt: '2026-11-19T00:00:00.000Z' }),
      payable({ id: 'pay_1', createdAt: '2026-11-18T00:00:00.000Z' }),
      payable({ id: 'pay_3', amount: 1000, payments: [{ id: 'p', amount: 1000, paidAt: '', method: 'cash' }] }),
    ],
    'Agen Sumber Rejeki',
  );
  assert.deepEqual(open.map((row) => row.id), ['pay_1', 'pay_2'], 'yang lunas tidak ikut');
});

check('nilai retur = jumlah × harga beli', () => {
  assert.equal(returnTotal([{ qty: 3, unitCost: 3100 }]), 9300);
  assert.equal(returnTotal([]), 0);
  assert.equal(parseReturnQty('3'), 3);
  assert.equal(parseReturnQty(''), null);
  assert.equal(parseReturnQty(0), null);
  assert.equal(parseReturnQty(-2), null);
});

check('barang yang bisa diretur dibatasi stok rak & jumlah beli', () => {
  const rows = returnCandidates(
    [purchase()],
    [product({ stock: 12 }), product({ id: 'prd_9', name: 'Bukan dari agen ini' })],
    'Agen Sumber Rejeki',
    (row) => row.stock,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bought, 30);
  assert.equal(rows[0].stock, 12);
  assert.equal(rows[0].maxQty, 12, 'tidak bisa meretur barang yang sudah terjual');
});

check('isian retur melebihi batas dipotong ke batas', () => {
  const rows = returnCandidates([purchase()], [product({ stock: 5 })], 'Agen Sumber Rejeki', (row) => row.stock);
  const items = buildReturnItems(rows, { prd_1: '9' });
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 5);
  assert.equal(buildReturnItems(rows, { prd_1: '' }).length, 0);
});

check('retur memotong utang lebih dulu, sisanya jadi saldo', () => {
  const partial = validateReturn({
    supplierName: 'Agen Sumber Rejeki',
    items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 2, unitCost: 3100 }],
    payables: [payable({ amount: 5000 })],
  });
  assert.equal(partial.ok, true);
  if (partial.ok) {
    assert.equal(partial.value.total, 6200);
    assert.equal(partial.value.appliedAmount, 5000);
    assert.equal(partial.value.creditValue, 1200);
    assert.equal(partial.value.payableId, 'pay_1');
  }
});

check('tanpa utang, seluruh nilai retur jadi saldo', () => {
  const onlyCredit = validateReturn({
    supplierName: 'Agen Sumber Rejeki',
    items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 2, unitCost: 3100 }],
    payables: [],
  });
  assert.equal(onlyCredit.ok, true);
  if (onlyCredit.ok) {
    assert.equal(onlyCredit.value.appliedAmount, 0);
    assert.equal(onlyCredit.value.creditValue, 6200);
    assert.equal(onlyCredit.value.payableId, undefined);
  }
});

check('retur kosong ditolak dengan pesan jelas', () => {
  const empty = validateReturn({ supplierName: '', items: [], payables: [] });
  assert.equal(empty.ok, false);
  assert.match(empty.ok === false ? empty.reason : '', /supplier/i);
  const noItem = validateReturn({ supplierName: 'Agen', items: [], payables: [] });
  assert.match(noItem.ok === false ? noItem.reason : '', /jumlah barang/i);
});

check('ringkasan & nota retur siap dibagikan', () => {
  const row: PurchaseReturn = {
    id: 'ret_1',
    supplierName: 'Agen Sumber Rejeki',
    createdAt: '2026-11-19T00:00:00.000Z',
    items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 2, unitCost: 3100 }],
    total: 6200,
    appliedAmount: 5000,
    creditValue: 1200,
    note: '3 bungkus penyok',
  };
  assert.equal(returnSummaryText(row, money), '1 barang • 2 unit • Rp 6.200');
  const text = returnReportText(row, 'Warung Berkah', money, () => '19 Nov 2026');
  assert.match(text, /Retur barang — Warung Berkah/);
  assert.match(text, /Indomie: 2 pcs × Rp 3\.100 = Rp 6\.200/);
  assert.match(text, /Dipotong ke utang: Rp 5\.000/);
  assert.match(text, /Saldo untuk kulakan berikutnya: Rp 1\.200/);
  assert.match(text, /3 bungkus penyok/);
});

check('supplier yang diarsipkan tidak dihitung ganda saat melengkapi', () => {
  const names = supplierNamesFrom([purchase()], []);
  const existing = [supplier({ archivedAt: '2026-11-10T00:00:00.000Z' })];
  const known = existing.map((row) => supplierKey(row.name));
  assert.equal(names.filter((name) => !known.includes(supplierKey(name))).length, 0);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
if (passed < 14) {
  console.log('Pemeriksaan kurang dari yang diharapkan — periksa daftar di atas.');
  process.exitCode = 1;
}
