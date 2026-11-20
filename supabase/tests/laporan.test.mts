/**
 * Uji laporan selisih hitung stok & riwayat harga beli (Sprint 16).
 *
 * Yang dijaga:
 *   - hitungan di luar periode tidak ikut dihitung;
 *   - barang yang paling banyak menyumbang kerugian muncul di urutan atas;
 *   - harga beli dibaca urut waktu, dan trennya jujur (naik/turun/tetap);
 *   - titik grafik tidak pernah keluar dari kotak gambar.
 */
import assert from 'node:assert/strict';

import { opnameInRange, opnameRangeText } from '../../src/data/opname';
import {
  priceBoard,
  priceChartPoints,
  priceHistory,
  priceStats,
  priceTrendText,
} from '../../src/data/price-history';
import type { Purchase, StockOpname } from '../../src/data/types';

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

const session = (
  id: string,
  createdAt: string,
  lines: { productId: string; name: string; unit: string; system: number; counted: number; cost: number }[],
): StockOpname => ({
  id,
  createdAt,
  lines,
  lossValue: 0,
  gainValue: 0,
});

const purchase = (patch: Partial<Purchase> = {}): Purchase => ({
  id: 'pur_1',
  supplierName: 'Agen Sumber Rejeki',
  createdAt: '2026-10-01T03:00:00.000Z',
  items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 30, unitCost: 2900 }],
  total: 87000,
  paid: 87000,
  method: 'cash',
  ...patch,
});

const oct = { from: new Date('2026-10-01T00:00:00.000Z'), to: new Date('2026-10-31T23:59:59.999Z') };

console.log('\n== laporan selisih hitung stok & riwayat harga beli ==');

check('hanya hitungan dalam periode yang dihitung', () => {
  const summary = opnameInRange(
    [
      session('opn_1', '2026-10-05T03:00:00.000Z', [
        { productId: 'a', name: 'Indomie', unit: 'pcs', system: 10, counted: 8, cost: 3000 },
      ]),
      session('opn_2', '2026-11-05T03:00:00.000Z', [
        { productId: 'a', name: 'Indomie', unit: 'pcs', system: 5, counted: 1, cost: 3000 },
      ]),
    ],
    oct.from,
    oct.to,
  );
  assert.equal(summary.sessions, 1);
  assert.equal(summary.under, 1);
  assert.equal(summary.lossValue, 6000);
});

check('nilai kurang & lebih dijumlah dari semua sesi', () => {
  const summary = opnameInRange(
    [
      session('opn_1', '2026-10-05T03:00:00.000Z', [
        { productId: 'a', name: 'Indomie', unit: 'pcs', system: 10, counted: 8, cost: 3000 },
      ]),
      session('opn_2', '2026-10-12T03:00:00.000Z', [
        { productId: 'b', name: 'Teh', unit: 'botol', system: 4, counted: 6, cost: 4000 },
      ]),
    ],
    oct.from,
    oct.to,
  );
  assert.equal(summary.sessions, 2);
  assert.equal(summary.lossValue, 6000);
  assert.equal(summary.gainValue, 8000);
  assert.equal(summary.netValue, 2000);
  assert.equal(summary.unitsOff, 4);
});

check('barang paling merugikan muncul paling atas', () => {
  const summary = opnameInRange(
    [
      session('opn_1', '2026-10-05T03:00:00.000Z', [
        { productId: 'a', name: 'Indomie', unit: 'pcs', system: 10, counted: 9, cost: 3000 },
        { productId: 'b', name: 'Telur', unit: 'kg', system: 4, counted: 1, cost: 27000 },
      ]),
      session('opn_2', '2026-10-12T03:00:00.000Z', [
        { productId: 'a', name: 'Indomie', unit: 'pcs', system: 20, counted: 18, cost: 3000 },
      ]),
    ],
    oct.from,
    oct.to,
  );
  assert.equal(summary.losses[0].name, 'Telur');
  assert.equal(summary.losses[0].value, 81000);
  assert.equal(summary.losses[1].name, 'Indomie');
  assert.equal(summary.losses[1].units, 3, 'dua hitungan digabung');
  assert.equal(summary.losses[1].times, 2);
});

check('periode kosong dijawab apa adanya', () => {
  const empty = opnameInRange([], oct.from, oct.to);
  assert.equal(empty.sessions, 0);
  assert.equal(empty.lossValue, 0);
  assert.equal(opnameRangeText(empty), 'Belum ada hitung stok di periode ini.');
  assert.match(opnameRangeText(opnameInRange([
    session('opn_1', '2026-10-05T03:00:00.000Z', [
      { productId: 'a', name: 'Indomie', unit: 'pcs', system: 10, counted: 10, cost: 3000 },
    ]),
  ], oct.from, oct.to)), /semua barang cocok/);
});

check('riwayat harga beli urut waktu & hanya barang itu', () => {
  const points = priceHistory(
    [
      purchase({ id: 'p2', createdAt: '2026-10-20T03:00:00.000Z', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 10, unitCost: 3100 }] }),
      purchase({ id: 'p1' }),
      purchase({ id: 'p3', createdAt: '2026-10-25T03:00:00.000Z', items: [{ productId: 'prd_9', name: 'Kopi', unit: 'sachet', qty: 5, unitCost: 1500 }] }),
    ],
    'prd_1',
  );
  assert.equal(points.length, 2);
  assert.deepEqual(points.map((point) => point.unitCost), [2900, 3100]);
  assert.equal(points[0].purchaseId, 'p1', 'yang paling lama di depan');
});

check('ringkasan harga: terendah, tertinggi, rata-rata, perubahan', () => {
  const stats = priceStats(priceHistory([
    purchase({ id: 'p1', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 1, unitCost: 2900 }] }),
    purchase({ id: 'p2', createdAt: '2026-10-10T03:00:00.000Z', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 1, unitCost: 3200 }] }),
    purchase({ id: 'p3', createdAt: '2026-10-20T03:00:00.000Z', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 1, unitCost: 3100 }] }),
  ], 'prd_1'));
  assert.equal(stats.count, 3);
  assert.equal(stats.first, 2900);
  assert.equal(stats.latest, 3100);
  assert.equal(stats.lowest, 2900);
  assert.equal(stats.highest, 3200);
  assert.equal(stats.average, 3067);
  assert.ok(Math.abs(stats.changePercent - 6.896) < 0.01);
});

check('tren ditulis jujur: naik, turun, tetap, satu kali', () => {
  const base = { count: 2, latest: 0, first: 0, lowest: 0, highest: 0, average: 0, changePercent: 0, firstAt: null, lastAt: null };
  assert.match(priceTrendText({ ...base, changePercent: 10 }), /naik 10%/);
  assert.match(priceTrendText({ ...base, changePercent: -4.5 }), /turun 4,5%/);
  assert.match(priceTrendText({ ...base, changePercent: 0.2 }), /cenderung tetap/);
  assert.match(priceTrendText({ ...base, count: 1 }), /belum ada tren/);
  assert.match(priceTrendText({ ...base, count: 0 }), /Belum pernah kulakan/);
});

check('tanpa kulakan, harga modal sekarang tetap dipakai', () => {
  const stats = priceStats([], 3011);
  assert.equal(stats.count, 0);
  assert.equal(stats.latest, 3011);
  assert.equal(stats.count, 0);
  assert.match(priceTrendText(stats), /Belum pernah kulakan barang ini/);
});

check('titik grafik selalu di dalam kotak', () => {
  const points = priceHistory([
    purchase({ id: 'p1', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 1, unitCost: 2900 }] }),
    purchase({ id: 'p2', createdAt: '2026-10-10T03:00:00.000Z', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 1, unitCost: 3300 }] }),
    purchase({ id: 'p3', createdAt: '2026-10-20T03:00:00.000Z', items: [{ productId: 'prd_1', name: 'Indomie', unit: 'pcs', qty: 1, unitCost: 3100 }] }),
  ], 'prd_1');
  const chart = priceChartPoints(points, 100, 100);
  assert.equal(chart.length, 3);
  for (const dot of chart) {
    assert.ok(dot.x >= 0 && dot.x <= 100, 'x di dalam kotak');
    assert.ok(dot.y >= 0 && dot.y <= 100, 'y di dalam kotak');
  }
  assert.equal(chart[0].y, 100, 'harga terendah di bawah');
  assert.equal(chart[1].y, 0, 'harga tertinggi di atas');
  assert.equal(priceChartPoints([], 100, 100).length, 0);
});

check('satu titik digambar di tengah, bukan menempel di tepi', () => {
  const chart = priceChartPoints(priceHistory([purchase()], 'prd_1'), 100, 100);
  assert.equal(chart.length, 1);
  assert.equal(chart[0].x, 50);
  assert.equal(chart[0].y, 50, 'harga datar digambar di tengah');
});

check('priceBoard menyatukan titik, ringkasan & kalimat tren', () => {
  const board = priceBoard([purchase()], 'prd_1', 3000);
  assert.equal(board.points.length, 1);
  assert.equal(board.stats.latest, 2900);
  assert.match(board.trend, /Baru satu kali kulakan/);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
if (passed < 11) {
  console.log('Pemeriksaan kurang dari yang diharapkan — periksa daftar di atas.');
  process.exitCode = 1;
}
