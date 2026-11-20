/**
 * Uji logika pesanan/kuotasi (murni, tanpa state & jaringan).
 *
 * Hitungan di sini harus sama dengan `sync_order` di server: harga tidak boleh
 * negatif, jumlah harus > 0, dan total selalu Σ(qty × harga).
 */
import assert from 'node:assert/strict';

import {
  normalizeOrderItems,
  orderIsPaidOff,
  orderRemaining,
  orderDueTone,
  orderItemSummary,
  orderShareText,
  orderTotal,
  ORDER_STATUS_LABEL,
} from '../../src/data/orders';
import type { Order } from '../../src/data/types';

let passed = 0;
const check = (label: string, run: () => void) => {
  try {
    run();
    passed++;
    console.log('  OK   ' + label);
  } catch (error) {
    console.log('  FAIL ' + label);
    console.log('       ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};

const order = (patch: Partial<Order> = {}): Order => ({
  id: 'ord_1',
  customerName: 'Bu Ratna',
  items: [
    { productId: 'prd_1', name: 'Kue Lapis', qty: 3, price: 5000 },
    { name: 'Kotak', qty: 3, price: 500 },
  ],
  total: 16500,
  status: 'terbuka',
  createdAt: '2026-11-19T03:00:00.000Z',
  ...patch,
});

console.log('\n== pesanan / kuotasi ==');

check('total = Σ (qty × harga)', () => {
  assert.equal(orderTotal(order().items), 16500);
  assert.equal(orderTotal([]), 0);
});

check('baris tidak masuk akal dibuang, sisanya dirapikan', () => {
  const items = normalizeOrderItems([
    { name: 'Kue', qty: 2, price: 5000 },
    { name: '  ', qty: 2, price: 5000 },
    { name: 'Gratis', qty: 0, price: 5000 },
    { name: 'Minus', qty: -1, price: 5000 },
    { name: 'Harga salah', qty: 1, price: -100 },
    { name: 'Tanpa id', qty: 1, price: 0, productId: '' },
  ]);
  assert.equal(items.length, 2, 'hanya dua baris yang sah');
  assert.equal(items[1].productId, undefined, 'productId kosong jadi undefined');
  assert.equal(items[1].price, 0, 'harga 0 tetap diterima (barang bonus)');
});

check('tanggal janji: lewat, dekat, aman, tanpa', () => {
  const now = new Date('2026-11-19T09:00:00.000Z');
  assert.equal(orderDueTone(order({ dueDate: '2026-11-17T09:00:00.000Z' }), now), 'lewat');
  assert.equal(orderDueTone(order({ dueDate: '2026-11-19T09:00:00.000Z' }), now), 'dekat');
  assert.equal(orderDueTone(order({ dueDate: '2026-11-20T09:00:00.000Z' }), now), 'dekat');
  assert.equal(orderDueTone(order({ dueDate: '2026-11-30T09:00:00.000Z' }), now), 'aman');
  assert.equal(orderDueTone(order({}), now), 'tanpa');
});

check('pesanan yang sudah batal tidak dianggap lewat tenggat', () => {
  const now = new Date('2026-11-19T09:00:00.000Z');
  const batal = order({ dueDate: '2026-11-17T09:00:00.000Z', status: 'batal' });
  assert.equal(orderDueTone(batal, now), 'aman');
});

check('ringkasan barang untuk kartu daftar', () => {
  assert.match(orderItemSummary(order().items), /2 jenis barang • 6 unit/);
  assert.match(orderItemSummary([{ name: 'Kue Lapis', qty: 2, price: 1000 }]), /Kue Lapis • 2 unit/);
  assert.equal(orderItemSummary([]), 'Tanpa barang');
});

check('teks bagikan memuat pelanggan, rincian, dan total', () => {
  const text = orderShareText(order({ dueDate: '2026-11-25T09:00:00.000Z', note: 'Ambil sore' }), 'Warung Berkah');
  assert.match(text, /Warung Berkah/);
  assert.match(text, /Bu Ratna/);
  assert.match(text, /Kue Lapis 3 x Rp 5\.000 = Rp 15\.000/);
  assert.match(text, /Total: Rp 16\.500/);
  assert.match(text, /Ambil sore/);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(text), 'tanpa emoji');
});

check('label status lengkap', () => {
  assert.deepEqual(Object.keys(ORDER_STATUS_LABEL).sort(), ['batal', 'selesai', 'terbuka']);
});

check('sisa tagihan = total − DP', () => {
  assert.equal(orderRemaining({ total: 50000, deposit: 20000 }), 30000);
  assert.equal(orderRemaining({ total: 50000 }), 50000);
  assert.equal(orderRemaining({ total: 50000, deposit: 0 }), 50000);
});

check('DP melebihi total tidak menghasilkan sisa negatif', () => {
  assert.equal(orderRemaining({ total: 50000, deposit: 80000 }), 0);
  assert.equal(orderIsPaidOff({ total: 50000, deposit: 50000 }), true);
  assert.equal(orderIsPaidOff({ total: 50000, deposit: 49999 }), false);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
