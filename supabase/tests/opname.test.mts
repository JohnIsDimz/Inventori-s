/**
 * Uji hitung stok fisik / opname (Sprint 13).
 *
 * Yang dijaga:
 *   - barang yang tidak diisi TIDAK diubah (tidak boleh ada nol tak sengaja);
 *   - nilai selisih memakai harga modal, bukan harga jual;
 *   - ringkasan kurang/lebih dan laporan siap dibagikan tetap benar.
 */
import assert from 'node:assert/strict';

import {
  buildOpnameLines,
  opnameDiff,
  opnameLineValue,
  opnameReportText,
  opnameSummaryText,
  opnameTone,
  OPNAME_REASON_HINTS,
  OPNAME_TONE_LABEL,
  parseCount,
  summarizeOpname,
  type OpnameLine,
} from '../../src/data/opname';
import type { Product } from '../../src/data/types';

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

const line = (patch: Partial<OpnameLine> = {}): OpnameLine => ({
  productId: 'prd_1',
  name: 'Indomie',
  unit: 'pcs',
  system: 10,
  counted: 8,
  cost: 2900,
  ...patch,
});

console.log('\n== hitung stok fisik (opname) ==');

check('angka nyata dibaca aman: kosong bukan nol', () => {
  assert.equal(parseCount(''), null, 'kosong berarti belum dihitung');
  assert.equal(parseCount('   '), null);
  assert.equal(parseCount(undefined), null);
  assert.equal(parseCount('0'), 0, 'nol yang diketik memang nol');
  assert.equal(parseCount('12'), 12);
  assert.equal(parseCount('12 pcs'), 12);
  assert.equal(parseCount(-5), null, 'angka negatif ditolak');
  assert.equal(parseCount(9_999_999), null, 'angka kelewat besar ditolak');
});

check('selisih dibaca sebagai lebih / kurang / cocok', () => {
  assert.equal(opnameDiff(line({ system: 10, counted: 8 })), -2);
  assert.equal(opnameDiff(line({ system: 10, counted: 12 })), 2);
  assert.equal(opnameDiff(line({ system: 10, counted: 10 })), 0);
  assert.equal(opnameTone(line({ system: 10, counted: 12 })), 'lebih');
  assert.equal(opnameTone(line({ system: 10, counted: 8 })), 'kurang');
  assert.equal(opnameTone(line({ system: 10, counted: 10 })), 'cocok');
  assert.equal(OPNAME_TONE_LABEL.kurang, 'Barang kurang');
});

check('nilai selisih memakai harga modal, bukan harga jual', () => {
  assert.equal(opnameLineValue(line({ system: 10, counted: 8, cost: 2900 })), 5800);
  assert.equal(opnameLineValue(line({ system: 10, counted: 10 })), 0);
});

check('ringkasan menghitung kurang, lebih, dan nilainya', () => {
  const summary = summarizeOpname([
    line({ productId: 'a', system: 10, counted: 8 }), // kurang 2 x 2900
    line({ productId: 'b', system: 5, counted: 7, cost: 1000 }), // lebih 2 x 1000
    line({ productId: 'c', system: 4, counted: 4 }),
  ]);
  assert.equal(summary.lines, 3);
  assert.equal(summary.matched, 1);
  assert.equal(summary.under, 1);
  assert.equal(summary.over, 1);
  assert.equal(summary.unitsOff, 4);
  assert.equal(summary.lossValue, 5800);
  assert.equal(summary.gainValue, 2000);
  assert.equal(summary.netValue, -3800);
});

check('hanya barang yang diisi yang masuk hitungan', () => {
  const produk = [product({ id: 'a' }), product({ id: 'b', name: 'Teh', stock: 5 })];
  const lines = buildOpnameLines(produk, null, { a: '7' });
  assert.equal(lines.length, 1, 'barang b tidak diisi, tidak ikut');
  assert.equal(lines[0].productId, 'a');
  assert.equal(lines[0].system, 10, 'stok catatan diambil dari data');
  assert.equal(lines[0].counted, 7);

  const kosong = buildOpnameLines(produk, null, { a: '' });
  assert.equal(kosong.length, 0, 'isian kosong tidak menghasilkan baris');
});

check('stok yang dipakai adalah stok cabang yang dibuka', () => {
  const produk = [product({ stock: 10, stockByOutlet: { out_a: 4, out_b: 6 } })];
  assert.equal(buildOpnameLines(produk, 'out_b', { prd_1: '6' })[0].system, 6);
  assert.equal(buildOpnameLines(produk, 'out_a', { prd_1: '4' })[0].system, 4);
});

check('kalimat ringkasan enak dibaca', () => {
  assert.equal(opnameSummaryText(summarizeOpname([])), 'Belum ada barang yang dihitung.');
  assert.equal(
    opnameSummaryText(summarizeOpname([line({ system: 10, counted: 10 })])),
    '1 barang dihitung, semuanya cocok.',
  );
  assert.equal(
    opnameSummaryText(
      summarizeOpname([line({ system: 10, counted: 8 }), line({ productId: 'b', system: 1, counted: 3 })]),
    ),
    '2 barang dihitung • 1 kurang • 1 lebih',
  );
});

check('laporan siap dibagikan memuat angka penting', () => {
  const text = opnameReportText(
    {
      createdAt: '2026-11-19T10:00:00.000Z',
      lines: [line({ system: 10, counted: 8, cost: 2900 })],
      note: 'Ada 2 bungkus pecah',
    },
    'Warung Berkah',
    (value) => `Rp ${value.toLocaleString('id-ID')}`,
    () => '19 Nov 2026',
  );
  assert.match(text, /Warung Berkah/);
  assert.match(text, /19 Nov 2026/);
  assert.match(text, /Nilai barang kurang: Rp 5\.800/);
  assert.match(text, /Indomie: catatan 10 → hitung 8 \(-2 pcs\)/);
  assert.match(text, /Ada 2 bungkus pecah/);
});

check('laporan tanpa selisih tidak memuat daftar barang', () => {
  const text = opnameReportText(
    { createdAt: '2026-11-19T10:00:00.000Z', lines: [line({ system: 10, counted: 10 })] },
    'Warung Berkah',
    (value) => `Rp ${value}`,
    () => '19 Nov 2026',
  );
  assert.match(text, /semuanya cocok/);
  assert.doesNotMatch(text, /Nilai barang/);
});

check('pilihan alasan siap dipakai kasir', () => {
  assert.ok(OPNAME_REASON_HINTS.length >= 3);
  assert.ok(OPNAME_REASON_HINTS.every((reason) => reason.trim().length > 3));
});

check('hitung kosong tidak menghasilkan selisih palsu', () => {
  const summary = summarizeOpname(buildOpnameLines([product()], null, {}));
  assert.equal(summary.lines, 0);
  assert.equal(summary.lossValue, 0);
  assert.equal(summary.gainValue, 0);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
if (passed < 11) {
  console.log('Pemeriksaan kurang dari yang diharapkan — periksa daftar di atas.');
  process.exitCode = 1;
}
