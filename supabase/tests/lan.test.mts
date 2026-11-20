/**
 * Uji penggabungan data antar perangkat (fondasi sinkron Wi-Fi lokal).
 *
 * Yang dijaga:
 *   - baris baru dari HP lain ikut masuk;
 *   - untuk id yang sama, versi dengan stempel waktu lebih baru menang;
 *   - data lokal yang lebih baru tidak pernah tertimpa data lama;
 *   - mode cadangan "terbaru menang" memakai aturan yang sama (bukan "lokal selalu menang").
 */
import assert from 'node:assert/strict';

import { applyBackup, type BackupPayload } from '../../src/services/backup';
import { describeReport, mergeAll, mergeRecords } from '../../src/services/lan/merge';
import type { Product, Transaction } from '../../src/data/types';

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

type Row = { id: string; name?: string; updatedAt?: string; createdAt?: string };

const empty = (): BackupPayload => ({
  profile: { name: 'Toko Uji', ownerName: 'Budi', code: 'TK01', openTime: '07:00', closeTime: '21:00' },
  settings: {
    hideBalance: false,
    autoPrint: false,
    printerName: '',
    printerAddress: '',
    reminderTemplate: 'Halo {nama}',
    taxPercent: 10,
  },
  categories: [],
  products: [],
  transactions: [],
  receivables: [],
  payables: [],
  allocations: [],
  shifts: [],
  orders: [],
});

const product = (id: string, name: string, stock: number, updatedAt?: string): Product => ({
  id,
  name,
  unit: 'pcs',
  sellPrice: 9000,
  costPrice: 6000,
  stock,
  minStock: 3,
  ...(updatedAt ? { updatedAt } : {}),
});

const tx = (id: string, amount: number, createdAt: string): Transaction => ({
  id,
  type: 'sale',
  amount,
  categoryId: 'sale-1',
  method: 'cash',
  createdAt,
});

console.log('\n== gabung antar perangkat ==');

check('baris baru dari HP lain ikut masuk', () => {
  const { rows, report } = mergeRecords<Row>(
    [{ id: 'a', name: 'lokal' }],
    [{ id: 'b', name: 'hp-lain' }],
  );
  assert.equal(rows.length, 2);
  assert.equal(report.added, 1);
  assert.equal(report.updated, 0);
});

check('versi lebih baru menang (updatedAt)', () => {
  const { rows, report } = mergeRecords<Row>(
    [{ id: 'a', name: 'lama', updatedAt: '2026-11-18T00:00:00.000Z' }],
    [{ id: 'a', name: 'baru', updatedAt: '2026-11-19T00:00:00.000Z' }],
  );
  assert.equal(rows[0].name, 'baru');
  assert.equal(report.updated, 1);
});

check('data lokal yang lebih baru tidak tertimpa', () => {
  const { rows, report } = mergeRecords<Row>(
    [{ id: 'a', name: 'baru-lokal', updatedAt: '2026-11-19T05:00:00.000Z' }],
    [{ id: 'a', name: 'lama-hp', updatedAt: '2026-11-17T05:00:00.000Z' }],
  );
  assert.equal(rows[0].name, 'baru-lokal');
  assert.equal(report.kept, 1);
});

check('tanpa stempel waktu, data lokal dipertahankan', () => {
  const { rows, report } = mergeRecords<Row>([{ id: 'a', name: 'lokal' }], [{ id: 'a', name: 'hp' }]);
  assert.equal(rows[0].name, 'lokal');
  assert.equal(report.kept, 1);
});

check('createdAt dipakai kalau updatedAt tidak ada', () => {
  const { rows } = mergeRecords<Row>(
    [{ id: 'a', name: 'lama', createdAt: '2026-11-10T00:00:00.000Z' }],
    [{ id: 'a', name: 'baru', createdAt: '2026-11-15T00:00:00.000Z' }],
  );
  assert.equal(rows[0].name, 'baru');
});

check('hasil terurut dari yang terbaru', () => {
  const { rows } = mergeRecords<Row>([], [
    { id: 'a', createdAt: '2026-11-10T00:00:00.000Z' },
    { id: 'b', createdAt: '2026-11-18T00:00:00.000Z' },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['b', 'a']);
});

check('entri rusak diabaikan, tidak membuat aplikasi gagal', () => {
  const { rows } = mergeRecords<Row>([{ id: 'a' }], [{ id: '' } as Row, null as unknown as Row]);
  assert.equal(rows.length, 1);
});

check('mergeAll menghitung laporan per entitas', () => {
  const { rows, report } = mergeAll(
    { products: [{ id: 'p1', name: 'Kopi', updatedAt: '2026-11-10T00:00:00.000Z' }], transactions: [] as Row[] },
    { products: [{ id: 'p1', name: 'Kopi Susu', updatedAt: '2026-11-19T00:00:00.000Z' }, { id: 'p2', name: 'Teh' }] },
  );
  assert.equal(rows.products.length, 2);
  assert.equal(report.products.updated, 1);
  assert.equal(report.products.added, 1);
  assert.equal(report.transactions.added, 0);
});

check('deskripsi laporan terbaca manusia', () => {
  assert.equal(describeReport({ added: 3, updated: 1, kept: 2 }), '3 baru • 1 diperbarui • 2 lokal dipertahankan');
  assert.equal(describeReport({ added: 0, updated: 0, kept: 0 }), 'Tidak ada perubahan');
});

check('mode cadangan "terbaru menang" memakai aturan yang sama', () => {
  const current = empty();
  current.products = [product('prd_1', 'Kopi Lokal', 5, '2026-11-19T04:00:00.000Z')];
  current.transactions = [tx('tx_1', 9000, '2026-11-19T03:00:00.000Z')];

  const incoming = empty();
  incoming.products = [
    product('prd_1', 'Kopi HP Lain', 40, '2026-11-15T04:00:00.000Z'),
    product('prd_2', 'Teh', 12, '2026-11-16T04:00:00.000Z'),
  ];
  incoming.transactions = [
    tx('tx_1', 9000, '2026-11-19T03:00:00.000Z'),
    tx('tx_2', 15000, '2026-11-18T03:00:00.000Z'),
  ];

  const result = applyBackup(current, incoming, 'latest');
  const kopi = result.payload.products.find((item) => item.id === 'prd_1');
  assert.equal(kopi?.name, 'Kopi Lokal', 'stok lokal lebih baru dipertahankan');
  assert.equal(kopi?.stock, 5);
  assert.equal(result.payload.products.length, 2, 'produk baru ikut masuk');
  assert.equal(result.payload.transactions.length, 2, 'transaksi tidak berganda');
  assert.equal(result.added.transaksi, 1, 'hanya transaksi baru yang dihitung');
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
