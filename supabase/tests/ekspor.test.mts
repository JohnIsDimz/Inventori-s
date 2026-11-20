/**
 * Uji bagian tambahan ekspor laporan (Sprint 17).
 *
 * Yang dijaga:
 *   - ekspor memakai hitungan yang sama dengan layar (bukan angka kedua versi);
 *   - selisih hitung stok dinilai dengan harga modal, bukan harga jual;
 *   - barang cocok & baris di luar periode tidak ikut menambah berkas;
 *   - harga beli hanya muncul untuk barang yang benar-benar pernah dikulak;
 *   - sel CSV tetap aman dari formula jahat (`=HYPERLINK(...)`).
 */
import assert from 'node:assert/strict';

import {
  csvBlockLines,
  opnameCsvBlock,
  opnameExportRows,
  opnameExportSummaryText,
  priceCsvBlock,
  priceExportRows,
  priceExportSummaryText,
} from '../../src/data/export-extra';
import type { Product, Purchase, StockOpname } from '../../src/data/types';
import { csvSafe } from '../../src/utils/security';

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

const FROM = new Date('2026-11-01T00:00:00');
const TO = new Date('2026-11-30T23:59:59');

const line = (
  name: string,
  system: number,
  counted: number,
  cost: number,
  unit = 'pcs',
): StockOpname['lines'][number] => ({
  productId: 'p_' + name.toLowerCase().replace(/\s+/g, '-'),
  name,
  unit,
  system,
  counted,
  cost,
});

const opname = (id: string, createdAt: string, lines: StockOpname['lines']): StockOpname => ({
  id,
  createdAt,
  lines,
  lossValue: 0,
  gainValue: 0,
  netValue: 0,
});

const session1 = opname('op_1', '2026-11-08T10:00:00', [
  line('Telur Ayam', 10, 8, 4000, 'kg'), // kurang 2 × 4.000 = 8.000
  line('Indomie', 40, 45, 2500), // lebih 5 × 2.500 = 12.500
  line('Gula Pasir', 12, 12, 14000), // cocok, tidak ikut
]);
const session2 = opname('op_2', '2026-11-17T09:00:00', [
  line('Telur Ayam', 20, 14, 4000, 'kg'), // kurang 6 × 4.000 = 24.000
]);
const sessionLuar = opname('op_3', '2026-10-30T09:00:00', [line('Kopi', 5, 1, 3000)]);

const OPNAMES = [session1, session2, sessionLuar];

const product = (id: string, name: string, costPrice: number, unit = 'pcs'): Product => ({
  id,
  name,
  unit,
  price: costPrice + 1000,
  costPrice,
  stock: 10,
  minStock: 2,
  categoryId: 'cat_1',
  createdAt: '2026-10-01T00:00:00',
});

const PRODUCTS = [
  product('p_indomie', 'Indomie Goreng', 2700),
  product('p_telur', 'Telur Ayam', 2000, 'kg'),
  product('p_gula', 'Gula Pasir', 14000, 'kg'),
];

const purchase = (
  id: string,
  createdAt: string,
  items: { productId: string; name: string; qty: number; unitCost: number }[],
): Purchase => ({
  id,
  createdAt,
  supplierName: 'Agen Sinar',
  items: items.map((item) => ({
    productId: item.productId,
    name: item.name,
    unit: 'pcs',
    qty: item.qty,
    unitCost: item.unitCost,
  })),
  total: items.reduce((sum, item) => sum + item.qty * item.unitCost, 0),
  paid: 0,
  payments: [],
  dueDate: createdAt,
});

const PURCHASES = [
  purchase('pur_1', '2026-11-02T08:00:00', [
    { productId: 'p_indomie', name: 'Indomie Goreng', qty: 40, unitCost: 2700 },
  ]),
  purchase('pur_1b', '2026-11-05T08:00:00', [
    { productId: 'p_gula', name: 'Gula Pasir', qty: 5, unitCost: 14000 },
  ]),
  purchase('pur_2', '2026-11-09T08:00:00', [
    { productId: 'p_indomie', name: 'Indomie Goreng', qty: 40, unitCost: 2900 },
  ]),
  purchase('pur_3', '2026-11-16T08:00:00', [
    { productId: 'p_indomie', name: 'Indomie Goreng', qty: 40, unitCost: 3100 },
    { productId: 'p_gula', name: 'Gula Pasir', qty: 5, unitCost: 13000 },
  ]),
];

check('barang yang cocok tidak ikut ditulis', () => {
  const rows = opnameExportRows(OPNAMES, FROM, TO);
  assert.equal(
    rows.some((row) => row.name === 'Gula Pasir'),
    false,
  );
});

check('hitungan di luar periode tidak ikut', () => {
  const rows = opnameExportRows(OPNAMES, FROM, TO);
  assert.equal(
    rows.some((row) => row.name === 'Kopi'),
    false,
  );
  assert.equal(rows.length, 3);
});

check('nilai selisih memakai harga modal, bukan harga jual', () => {
  const rows = opnameExportRows(OPNAMES, FROM, TO);
  const telur = rows.find((row) => row.name === 'Telur Ayam' && row.diff === -6);
  assert.ok(telur);
  assert.equal(telur.value, 24_000);
  const lebih = rows.find((row) => row.name === 'Indomie');
  assert.ok(lebih);
  assert.equal(lebih.diff, 5);
  assert.equal(lebih.value, 12_500);
});

check('urutan: waktu hitung naik, nilai besar dulu', () => {
  // Dalam satu hitungan: Indomie (lebih 5 × 2.500 = 12.500) di atas Telur
  // (kurang 2 × 4.000 = 8.000); hitungan berikutnya selalu di bawahnya.
  const rows = opnameExportRows(OPNAMES, FROM, TO);
  assert.deepEqual(
    rows.map((row) => row.diff),
    [5, -2, -6],
  );
  // Urutan masukan tidak boleh mengubah hasil.
  assert.deepEqual(
    opnameExportRows([...OPNAMES].reverse(), FROM, TO).map((row) => row.diff),
    [5, -2, -6],
  );
});

check('ringkasan menulis nilai kurang & lebih dengan bahasa warung', () => {
  const text = opnameExportSummaryText(OPNAMES, FROM, TO);
  assert.match(text, /2 hitungan/);
  assert.match(text, /nilai kurang Rp 32\.000/);
  assert.match(text, /nilai lebih Rp 12\.500/);
});

check('periode tanpa hitung stok dijawab tenang', () => {
  const text = opnameExportSummaryText(OPNAMES, new Date('2026-09-01'), new Date('2026-09-30'));
  assert.equal(text, 'Belum ada hitung stok di periode ini.');
});

check('blok CSV selisih punya judul & kepala kolom', () => {
  const block = opnameCsvBlock(OPNAMES, FROM, TO);
  assert.equal(block.title, 'SELISIH HITUNG STOK');
  assert.deepEqual(block.header, [
    'Tanggal',
    'Barang',
    'Satuan',
    'Tercatat',
    'Hasil hitung',
    'Selisih',
    'Nilai',
  ]);
  assert.equal(block.rows.length, 3);
  const telur = block.rows.find((row) => row[1] === 'Telur Ayam' && row[5] === -6);
  assert.ok(telur);
  assert.equal(telur[6], 24_000);
});

check('blok CSV kosong diisi kalimat, bukan tabel kosong', () => {
  const block = opnameCsvBlock([], FROM, TO);
  const lines = csvBlockLines(block, csvSafe);
  assert.equal(lines.at(-1), 'Belum ada selisih hitung stok di periode ini.');
});

check('barang tanpa kulakan tidak masuk daftar harga beli', () => {
  const rows = priceExportRows(PURCHASES, PRODUCTS);
  assert.deepEqual(
    rows.map((row) => row.name).sort(),
    ['Gula Pasir', 'Indomie Goreng'],
  );
});

check('harga pertama/terakhir/terendah/tertinggi dibaca urut waktu', () => {
  const rows = priceExportRows(PURCHASES, PRODUCTS);
  const indomie = rows.find((row) => row.name === 'Indomie Goreng');
  assert.ok(indomie);
  assert.equal(indomie.count, 3);
  assert.equal(indomie.first, 2700);
  assert.equal(indomie.latest, 3100);
  assert.equal(indomie.lowest, 2700);
  assert.equal(indomie.highest, 3100);
  assert.equal(indomie.average, 2900);
  assert.equal(indomie.changePercent, 14.8);
});

check('urutan harga beli: perubahan terbesar di atas', () => {
  const rows = priceExportRows(PURCHASES, PRODUCTS);
  assert.equal(rows[0].name, 'Indomie Goreng'); // +14,8%
  assert.equal(rows[1].name, 'Gula Pasir'); // −7,1%
});

check('tren di berkas sama dengan yang tampil di layar', () => {
  const rows = priceExportRows(PURCHASES, PRODUCTS);
  const indomie = rows.find((row) => row.name === 'Indomie Goreng');
  const gula = rows.find((row) => row.name === 'Gula Pasir');
  assert.equal(indomie?.trend, 'Harga beli naik 14,8% sejak kulakan pertama.');
  assert.equal(gula?.trend, 'Harga beli turun 7,1% sejak kulakan pertama.');
});

check('ringkasan harga beli menghitung yang naik & turun', () => {
  const text = priceExportSummaryText(PURCHASES, PRODUCTS);
  assert.equal(text, '2 barang punya riwayat harga beli • 1 naik • 1 turun');
  assert.equal(
    priceExportSummaryText([], PRODUCTS),
    'Belum ada barang yang pernah dikulak.',
  );
});

check('nama barang berisi formula dinetralkan di sel CSV', () => {
  const nakal = opname(
    'op_x',
    '2026-11-20T08:00:00',
    [{ ...line('=HYPERLINK("http://jahat")', 5, 3, 1000), productId: 'p_x' }],
  );
  const lines = csvBlockLines(opnameCsvBlock([nakal], FROM, TO), csvSafe);
  const row = lines.find((text) => text.includes('HYPERLINK'));
  assert.ok(row);
  assert.match(row, /'=/);
  assert.equal(lines.some((text) => /(^|;)=HYPERLINK/.test(text)), false);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
