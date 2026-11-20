/**
 * Uji penyusun jadwal pengingat (murni, tanpa notifikasi sistem).
 *
 * Yang dijaga: tidak ada pengingat untuk kasbon yang sudah lunas, tidak ada
 * pengingat di masa lalu, dan H-1/hari-H muncul tepat satu kali.
 */
import assert from 'node:assert/strict';

import { buildReminders, summarize } from '../../src/services/notifications/schedule';
import {
  lowStockItems,
  lowStockNotice,
  PRICE_RISE_PERCENT,
  priceRiseItems,
  priceRiseNotice,
  stockAlertSummary,
} from '../../src/data/stock-alerts';
import type { Order, Product, Purchase, Receivable } from '../../src/data/types';

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

const NOW = new Date('2026-11-19T07:00:00');

const receivable = (patch: Partial<Receivable> = {}): Receivable => ({
  id: 'rcv_1',
  customerName: 'Bu Dewi',
  amount: 50000,
  dueDate: '2026-11-22T09:00:00.000Z',
  createdAt: '2026-11-10T09:00:00.000Z',
  payments: [],
  ...patch,
});

const order = (patch: Partial<Order> = {}): Order => ({
  id: 'ord_1',
  customerName: 'Bu Ratna',
  items: [{ name: 'Kue', qty: 2, price: 10000 }],
  total: 20000,
  status: 'terbuka',
  createdAt: '2026-11-18T03:00:00.000Z',
  dueDate: '2026-11-21T09:00:00.000Z',
  ...patch,
});

console.log('\n== pengingat jatuh tempo ==');

check('kasbon dan pesanan menghasilkan H-1 + hari-H', () => {
  const plans = buildReminders({ receivables: [receivable()], orders: [order()], now: NOW });
  assert.equal(plans.length, 4, 'dua sumber × dua pengingat');
  const titles = plans.map((plan) => plan.title);
  assert.ok(titles.some((t) => /Besok: kasbon Bu Dewi/.test(t)));
  assert.ok(titles.some((t) => /Hari ini jatuh tempo: Bu Dewi/.test(t)));
  assert.ok(titles.some((t) => /Besok diambil: Bu Ratna/.test(t)));
  assert.ok(titles.some((t) => /Hari ini diambil: Bu Ratna/.test(t)));
});

check('jam pengingat mengikuti pengaturan (08.00 default)', () => {
  const plans = buildReminders({ receivables: [receivable()], orders: [], now: NOW });
  for (const plan of plans) {
    assert.equal(new Date(plan.at).getHours(), 8);
  }
  const siang = buildReminders({ receivables: [receivable()], orders: [], now: NOW, hour: 15 });
  assert.equal(new Date(siang[0].at).getHours(), 15);
});

check('kasbon lunas tidak diingatkan', () => {
  const lunas = receivable({ payments: [{ id: 'p1', amount: 50000, method: 'cash', paidAt: NOW.toISOString() }] });
  const plans = buildReminders({ receivables: [lunas], orders: [], now: NOW });
  assert.equal(plans.length, 0);
});

check('kasbon yang dibayar sebagian diingatkan sebesar sisanya', () => {
  const sebagian = receivable({ payments: [{ id: 'p1', amount: 20000, method: 'cash', paidAt: NOW.toISOString() }] });
  const plans = buildReminders({ receivables: [sebagian], orders: [], now: NOW });
  assert.equal(plans.length, 2);
  assert.match(plans[0].body, /Rp 30\.000/);
});

check('pesanan selesai/batal dan tanpa tanggal tidak diingatkan', () => {
  const plans = buildReminders({
    receivables: [],
    orders: [order({ status: 'selesai' }), order({ status: 'batal' }), order({ dueDate: undefined })],
    now: NOW,
  });
  assert.equal(plans.length, 0);
});

check('pesanan dengan DP menyebut sisa tagihan', () => {
  const plans = buildReminders({ receivables: [], orders: [order({ deposit: 5000 })], now: NOW });
  assert.match(plans[0].body, /Sisa Rp 15\.000/);
  const lunas = buildReminders({ receivables: [], orders: [order({ deposit: 20000 })], now: NOW });
  assert.match(lunas[0].body, /Sudah lunas/i);
});

check('tidak pernah menjadwalkan waktu yang sudah lewat', () => {
  // Jatuh tempo kemarin → H-1 dan hari-H keduanya sudah lewat.
  const plans = buildReminders({
    receivables: [receivable({ dueDate: '2026-11-17T09:00:00.000Z' })],
    orders: [],
    now: NOW,
  });
  assert.equal(plans.length, 0);
  for (const plan of plans) assert.ok(new Date(plan.at).getTime() > NOW.getTime());
});

check('hasil terurut & tidak ada kunci ganda', () => {
  const plans = buildReminders({
    receivables: [receivable(), receivable({ id: 'rcv_2', customerName: 'Pak RT', dueDate: '2026-11-20T09:00:00.000Z' })],
    orders: [order()],
    now: NOW,
  });
  const times = plans.map((plan) => new Date(plan.at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b), 'urut naik');
  assert.equal(new Set(plans.map((plan) => plan.key)).size, plans.length, 'kunci unik');
});

check('jumlah dibatasi supaya tidak melebihi kuota sistem', () => {
  const banyak = Array.from({ length: 30 }, (_, index) =>
    receivable({ id: `rcv_${index}`, dueDate: '2026-12-01T09:00:00.000Z' }),
  );
  const plans = buildReminders({ receivables: banyak, orders: [], now: NOW, limit: 10 });
  assert.equal(plans.length, 10);
});

check('ringkasan menjelaskan pengingat berikutnya', () => {
  const plans = buildReminders({ receivables: [receivable()], orders: [], now: NOW });
  assert.match(summarize(plans, NOW), /2 pengingat • berikutnya/);
  assert.equal(summarize([], NOW), 'Tidak ada pengingat terjadwal.');
});

console.log('\n== stok menipis & harga beli naik ==');

const product = (patch: Partial<Product> = {}): Product => ({
  id: 'p_indomie',
  name: 'Indomie Goreng',
  unit: 'pcs',
  price: 3500,
  costPrice: 3100,
  stock: 10,
  minStock: 3,
  categoryId: 'cat_1',
  createdAt: '2026-10-01T09:00:00.000Z',
  ...patch,
});

const purchase = (id: string, createdAt: string, unitCost: number, productId = 'p_indomie'): Purchase => ({
  id,
  createdAt,
  supplierName: 'Agen Sinar',
  items: [
    { productId, name: 'Indomie Goreng', unit: 'pcs', qty: 40, unitCost },
  ],
  total: 40 * unitCost,
  paid: 0,
  payments: [],
  dueDate: createdAt,
});

const PURCHASES = [
  purchase('pur_1', '2026-11-02T09:00:00.000Z', 2700),
  purchase('pur_2', '2026-11-09T09:00:00.000Z', 2900),
  purchase('pur_3', '2026-11-16T09:00:00.000Z', 3100),
];

check('stok menyentuh batas minimum masuk daftar, yang kritis di atas', () => {
  const items = lowStockItems([
    product({ id: 'p_a', name: 'Gula Pasir', stock: 2, minStock: 3 }),
    product({ id: 'p_b', name: 'Kopi', stock: 0, minStock: 3 }),
    product({ id: 'p_c', name: 'Teh', stock: 9, minStock: 3 }),
  ]);
  assert.deepEqual(
    items.map((item) => item.name),
    ['Kopi', 'Gula Pasir'],
  );
  assert.equal(lowStockItems([product({ stock: 9 })]).length, 0);
});

check('notifikasi stok menipis menyebut nama & sisa barang', () => {
  const notice = lowStockNotice(
    lowStockItems([
      product({ id: 'p_a', name: 'Gula Pasir', stock: 1, minStock: 3 }),
      product({ id: 'p_b', name: 'Kopi', stock: 0, minStock: 3 }),
    ]),
  );
  assert.ok(notice);
  assert.equal(notice.title, 'Stok menipis: 2 barang');
  assert.match(notice.body, /Kopi \(0 pcs\)/);
  assert.match(notice.body, /selamat|Catat kulakan/);
  assert.equal(lowStockNotice([]), null);
});

check('harga beli naik diukur dari kulakan terakhir vs sebelumnya', () => {
  const items = priceRiseItems(PURCHASES, [product()]);
  assert.equal(items.length, 1);
  assert.equal(items[0].previous, 2900);
  assert.equal(items[0].latest, 3100);
  assert.equal(items[0].percent, 6.9);
});

check('kenaikan kecil & barang baru sekali kulak tidak dianggap naik', () => {
  const kecil = [purchase('k_1', '2026-11-02T09:00:00.000Z', 3000), purchase('k_2', '2026-11-09T09:00:00.000Z', 3050)];
  assert.equal(priceRiseItems(kecil, [product()]).length, 0);
  assert.equal(priceRiseItems([purchase('s_1', '2026-11-02T09:00:00.000Z', 2000)], [product()]).length, 0);
  assert.equal(PRICE_RISE_PERCENT, 5);
});

check('harga yang turun tidak pernah dilaporkan sebagai naik', () => {
  const turun = [purchase('t_1', '2026-11-02T09:00:00.000Z', 3500), purchase('t_2', '2026-11-09T09:00:00.000Z', 3000)];
  assert.equal(priceRiseItems(turun, [product()]).length, 0);
});

check('kalimat harga naik memuat angka lama & baru', () => {
  const notice = priceRiseNotice(priceRiseItems(PURCHASES, [product()]));
  assert.ok(notice);
  assert.equal(notice.title, 'Harga beli naik: Indomie Goreng');
  assert.match(notice.body, /naik 6,9%/);
  assert.match(notice.body, /Rp 3\.100/);
  assert.match(notice.body, /Rp 2\.900/);
});

check('ringkasan layar menggabungkan dua jenis peringatan', () => {
  assert.equal(
    stockAlertSummary([product({ stock: 1 })], PURCHASES),
    '1 barang menipis • 1 harga beli naik',
  );
  assert.equal(stockAlertSummary([product({ stock: 9 })], []), 'Stok dan harga beli masih aman.');
});

check('penjadwal menambahkan dua pengingat stok & harga sekali sehari', () => {
  const plans = buildReminders({
    receivables: [],
    orders: [],
    products: [product({ stock: 1 })],
    purchases: PURCHASES,
    now: NOW,
  });
  assert.equal(plans.length, 2);
  const stok = plans.find((plan) => plan.kind === 'stok');
  const harga = plans.find((plan) => plan.kind === 'harga');
  assert.ok(stok && harga);
  // NOW = 19 Nov 07.00 → slot berikutnya hari itu juga pukul 08.00.
  assert.equal(new Date(stok.at).getHours(), 8);
  assert.equal(new Date(stok.at).getDate(), 19);
  assert.match(harga.title, /Harga beli naik/);
});

check('pengingat stok & harga tidak muncul saat semuanya aman', () => {
  const plans = buildReminders({
    receivables: [],
    orders: [],
    products: [product({ stock: 9 })],
    purchases: [],
    now: NOW,
  });
  assert.equal(plans.length, 0);
});

check('jam yang sudah lewat mendorong pengingat ke besok pagi', () => {
  const plans = buildReminders({
    receivables: [],
    orders: [],
    products: [product({ stock: 1 })],
    purchases: PURCHASES,
    now: new Date('2026-11-19T21:00:00'),
  });
  assert.equal(new Date(plans[0].at).getDate(), 20);
  assert.equal(new Date(plans[0].at).getHours(), 8);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
