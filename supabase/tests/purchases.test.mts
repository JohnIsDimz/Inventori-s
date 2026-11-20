/**
 * Uji kulakan supplier & HPP rata-rata (Sprint 14).
 *
 * Yang dijaga:
 *   - harga modal menjadi rata-rata tertimbang, bukan harga terakhir;
 *   - stok kosong tidak menghasilkan harga modal nol;
 *   - uang yang dicatat sebagai pengeluaran hanya yang benar-benar dibayar;
 *   - sisa yang belum dibayar menjadi utang supplier, bukan dianggap lunas.
 */
import assert from 'node:assert/strict';

import {
  averageCost,
  buildPurchaseItems,
  lastUnitCost,
  parseMoney,
  parseQty,
  previewCosts,
  purchaseRemaining,
  purchaseReportText,
  purchaseSummaryText,
  purchaseTotal,
  PURCHASE_METHODS,
  supplierSuggestions,
  validatePurchase,
} from '../../src/data/purchases';
import type { Product, Purchase } from '../../src/data/types';

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

const product = (patch: Partial<Product> = {}): Product => ({
  id: 'prd_1',
  name: 'Indomie',
  unit: 'pcs',
  sellPrice: 3500,
  costPrice: 2900,
  stock: 10,
  minStock: 2,
  ...patch,
});

const purchase = (patch: Partial<Purchase> = {}): Purchase => ({
  id: 'pur_1',
  supplierName: 'Agen Sumber Rejeki',
  createdAt: '2026-11-19T03:00:00.000Z',
  items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 30, unitCost: 3100 }],
  total: 93000,
  paid: 93000,
  method: 'cash',
  ...patch,
});

const money = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

console.log('\n== kulakan supplier & HPP rata-rata ==');

check('harga modal jadi rata-rata tertimbang', () => {
  // 10 bungkus @2.900 + 30 @3.100 = (29.000 + 93.000) / 40
  assert.equal(averageCost({ stock: 10, cost: 2900, qty: 30, unitCost: 3100 }), 3050);
  assert.equal(averageCost({ stock: 1, cost: 3000, qty: 1, unitCost: 3001 }), 3001);
});

check('stok kosong memakai harga beli terbaru', () => {
  assert.equal(averageCost({ stock: 0, cost: 2900, qty: 12, unitCost: 3200 }), 3200);
  assert.equal(averageCost({ stock: -3, cost: 2900, qty: 5, unitCost: 3100 }), 3100);
});

check('tanpa barang masuk harga modal tidak berubah', () => {
  assert.equal(averageCost({ stock: 10, cost: 2900, qty: 0, unitCost: 9000 }), 2900);
});

check('angka jumlah & rupiah dibaca aman', () => {
  assert.equal(parseQty('12'), 12);
  assert.equal(parseQty(''), null, 'kosong = belum diisi');
  assert.equal(parseQty('0'), null, 'jumlah beli nol bukan pembelian');
  assert.equal(parseQty(-2), null);
  assert.equal(parseMoney('Rp 2.900'), 2900);
  assert.equal(parseMoney('2900'), 2900);
  assert.equal(parseMoney('0'), 0, 'barang bonus boleh nol rupiah');
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney(-1), null);
});

check('hanya barang yang diisi yang masuk nota', () => {
  const produk = [product({ id: 'a' }), product({ id: 'b', name: 'Teh', costPrice: 3800 })];
  const items = buildPurchaseItems(produk, null, {
    a: { productId: 'a', qty: '24', unitCost: '' },
    b: { productId: 'b', qty: '', unitCost: '3900' },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 24);
  assert.equal(items[0].unitCost, 2900, 'harga beli kosong memakai modal yang ada');
});

check('total & sisa dihitung dari isi nota', () => {
  const items = [
    { productId: 'a', name: 'Indomie', unit: 'pcs', qty: 24, unitCost: 2900 },
    { productId: 'b', name: 'Teh', unit: 'botol', qty: 12, unitCost: 3800 },
  ];
  assert.equal(purchaseTotal(items), 24 * 2900 + 12 * 3800);
  assert.equal(purchaseRemaining({ total: 100000, paid: 60000 }), 40000);
  assert.equal(purchaseRemaining({ total: 100000, paid: 100000 }), 0);
  assert.equal(purchaseRemaining({ total: 100000, paid: 120000 }), 0, 'tidak pernah minus');
});

check('penyimpanan ditolak dengan kalimat yang jelas', () => {
  const items = [{ productId: 'a', name: 'Indomie', unit: 'pcs', qty: 2, unitCost: 2900 }];
  assert.equal(validatePurchase({ supplierName: '', items, paid: 0 }).ok, false);
  assert.match(
    validatePurchase({ supplierName: '  ', items, paid: 0 }).reason ?? '',
    /supplier/i,
  );
  assert.match(
    validatePurchase({ supplierName: 'Agen', items: [], paid: 0 }).reason ?? '',
    /jumlah barang/i,
  );
  assert.match(
    validatePurchase({ supplierName: 'Agen', items, paid: 999999 }).reason ?? '',
    /lebih besar/i,
  );
  assert.equal(validatePurchase({ supplierName: 'Agen', items, paid: 2000 }).ok, true);
});

check('perkiraan HPP & stok sebelum disimpan', () => {
  const produk = [product({ stock: 10, costPrice: 2900 })];
  const changes = previewCosts(
    produk,
    [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 30, unitCost: 3100 }],
    (row) => row.stock,
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].before, 2900);
  assert.equal(changes[0].after, 3050);
  assert.equal(changes[0].stockBefore, 10);
  assert.equal(changes[0].stockAfter, 40);
});

check('saran supplier: tanpa duplikat, yang terbaru di depan', () => {
  const list = [
    purchase({ id: 'p1', supplierName: 'Agen Sumber Rejeki' }),
    purchase({ id: 'p2', supplierName: 'Toko Grosir Jaya' }),
    purchase({ id: 'p3', supplierName: 'agen sumber rejeki' }),
    purchase({ id: 'p4', supplierName: '   ' }),
  ];
  assert.deepEqual(supplierSuggestions(list), ['Agen Sumber Rejeki', 'Toko Grosir Jaya']);
});

check('harga beli terakhir dipakai sebagai isian awal', () => {
  const list = [
    purchase({ id: 'p1', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 5, unitCost: 3150 }] }),
    purchase({ id: 'p2', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 5, unitCost: 3000 }] }),
  ];
  assert.equal(lastUnitCost(list, 'prd_1'), 3150);
  assert.equal(lastUnitCost(list, 'prd_9'), null);
});

check('ringkasan & nota siap dibagikan', () => {
  const row = purchase();
  assert.equal(purchaseSummaryText(row, money), '1 barang • 30 unit • Rp 93.000');
  const text = purchaseReportText(row, 'Warung Berkah', money, () => '19 Nov 2026');
  assert.match(text, /Agen Sumber Rejeki/);
  assert.match(text, /Indomie: 30 pcs × Rp 3\.100 = Rp 93\.000/);
  assert.match(text, /Total: Rp 93\.000/);
  assert.doesNotMatch(text, /Belum dibayar/, 'lunas tidak menyisakan utang');
});

check('nota menyebut sisa utang bila belum lunas', () => {
  const text = purchaseReportText(
    purchase({ paid: 50000 }),
    'Warung Berkah',
    money,
    () => '19 Nov 2026',
  );
  assert.match(text, /Belum dibayar: Rp 43\.000/);
});

check('metode bayar kulakan tidak memakai kasbon', () => {
  const ids = PURCHASE_METHODS.map((method) => method.id);
  assert.ok(ids.includes('cash'));
  assert.ok(!ids.includes('kasbon'), 'kasbon pelanggan berbeda dengan utang supplier');
});

check('pembulatan rata-rata tetap rupiah utuh', () => {
  const value = averageCost({ stock: 3, cost: 3333, qty: 1, unitCost: 3334 });
  assert.equal(Number.isInteger(value), true);
  assert.ok(value >= 3333 && value <= 3334);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
if (passed < 13) {
  console.log('Pemeriksaan kurang dari yang diharapkan — periksa daftar di atas.');
  process.exitCode = 1;
}
