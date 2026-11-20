/**
 * Uji cabang / multi-outlet (Sprint 12).
 *
 * Dua hal yang paling penting dijaga di sini:
 *   1. Toko satu lokasi tidak boleh berubah angkanya sama sekali — itu janji
 *      ke pengguna lama.
 *   2. Stok tidak boleh tercampur antar cabang.
 */
import assert from 'node:assert/strict';

import {
  activeOutlet,
  applyStockDelta,
  cleanOutletCode,
  cleanOutletName,
  defaultOutlet,
  migrateToOutlets,
  MAX_OUTLETS,
  outletLabel,
  outletTotals,
  scopeData,
  setStockAt,
  stockFor,
  validateOutlet,
  type ScopedData,
} from '../../src/data/outlets';
import type {
  Order,
  Outlet,
  Payable,
  Product,
  Receivable,
  Shift,
  Transaction,
} from '../../src/data/types';

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

const outlet = (patch: Partial<Outlet> = {}): Outlet => ({
  id: 'out_a',
  name: 'Cabang Pasar Baru',
  code: 'PSR1',
  createdAt: '2026-11-01T03:00:00.000Z',
  ...patch,
});

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

const tx = (patch: Partial<Transaction> = {}): Transaction => ({
  id: 'tx_1',
  type: 'sale',
  amount: 10_000,
  categoryId: 'sale-1',
  method: 'cash',
  createdAt: '2026-11-10T03:00:00.000Z',
  ...patch,
});

const rcv = (patch: Partial<Receivable> = {}): Receivable => ({
  id: 'rcv_1',
  customerName: 'Bu Ratna',
  amount: 20_000,
  dueDate: '2026-11-20T03:00:00.000Z',
  createdAt: '2026-11-05T03:00:00.000Z',
  payments: [],
  ...patch,
});

console.log('\n== cabang (multi-outlet) ==');

check('nama & kode cabang dirapikan', () => {
  assert.equal(cleanOutletName('  Cabang   Pasar  Baru '), 'Cabang Pasar Baru');
  assert.equal(cleanOutletCode('psr-1'), 'PSR1');
  assert.equal(cleanOutletCode(''), '');
});

check('isian cabang ditolak dengan pesan manusia', () => {
  const kosong = validateOutlet({ name: '  ' }, []);
  assert.equal(kosong.ok, false);
  if (!kosong.ok) assert.match(kosong.reason, /nama cabang wajib/i);

  const pendek = validateOutlet({ name: 'A' }, []);
  assert.equal(pendek.ok, false);

  const kodePendek = validateOutlet({ name: 'Cabang Dua', code: 'X' }, []);
  assert.equal(kodePendek.ok, false);
  if (!kodePendek.ok) assert.match(kodePendek.reason, /kode cabang minimal/i);
});

check('nama & kode cabang tidak boleh kembar', () => {
  const nama = validateOutlet({ name: 'cabang pasar baru' }, [outlet()]);
  assert.equal(nama.ok, false);
  if (!nama.ok) assert.match(nama.reason, /sudah ada/i);

  const kode = validateOutlet({ name: 'Cabang Tiga', code: 'PSR1' }, [outlet()]);
  assert.equal(kode.ok, false);
  if (!kode.ok) assert.match(kode.reason, /kode cabang sudah dipakai/i);
});

check(`maksimal ${MAX_OUTLETS} cabang aktif`, () => {
  const penuh = [outlet({ id: 'o1', name: 'A1' }), outlet({ id: 'o2', name: 'A2', code: 'B2' }), outlet({ id: 'o3', name: 'A3', code: 'B3' })];
  const hasil = validateOutlet({ name: 'Cabang Keempat' }, penuh);
  assert.equal(hasil.ok, false);
  if (!hasil.ok) assert.match(hasil.reason, new RegExp(String(MAX_OUTLETS)));
});

check('cabang yang diarsipkan tidak dihitung sebagai cabang aktif', () => {
  const list = [
    outlet({ id: 'o1', name: 'A1' }),
    outlet({ id: 'o2', name: 'A2', code: 'B2' }),
    outlet({ id: 'o3', name: 'A3', code: 'B3', archivedAt: '2026-11-10T03:00:00.000Z' }),
  ];
  const hasil = validateOutlet({ name: 'Cabang Keempat' }, list);
  assert.equal(hasil.ok, true, 'masih boleh menambah karena satu cabang diarsipkan');
});

check('cabang aktif dipilih dari id, lalu cabang pertama', () => {
  const list = [outlet({ id: 'o1', name: 'Utama' }), outlet({ id: 'o2', name: 'Kedua', code: 'K2' })];
  assert.equal(activeOutlet(list, 'o2')?.name, 'Kedua');
  assert.equal(activeOutlet(list, null)?.name, 'Utama');
  assert.equal(activeOutlet(list, 'tidak-ada')?.name, 'Utama');
  assert.equal(activeOutlet([], 'x'), undefined);
  assert.equal(outletLabel(undefined), 'Cabang utama');
});

check('stok dibaca per cabang, data lama memakai kolom stock', () => {
  assert.equal(stockFor(product(), 'o1'), 10, 'tanpa peta cabang: pakai stock lama');
  const duaCabang = product({ stock: 10, stockByOutlet: { o1: 4, o2: 6 } });
  assert.equal(stockFor(duaCabang, 'o1'), 4);
  assert.equal(stockFor(duaCabang, 'o2'), 6);
  assert.equal(stockFor(duaCabang, 'o3'), 0, 'cabang tanpa catatan = 0, bukan meminjam');
});

check('perubahan stok hanya menyentuh cabangnya', () => {
  const duaCabang = product({ stock: 10, stockByOutlet: { o1: 4, o2: 6 } });
  const after = applyStockDelta(duaCabang, 'o1', -2);
  assert.equal(stockFor(after, 'o1'), 2);
  assert.equal(stockFor(after, 'o2'), 6, 'cabang lain tidak ikut berkurang');
});

check('stok tidak boleh minus', () => {
  const after = applyStockDelta(product({ stockByOutlet: { o1: 1 } }), 'o1', -5);
  assert.equal(stockFor(after, 'o1'), 0);
});

check('toko satu cabang tetap mengisi kolom stock (angka lama tidak berubah)', () => {
  const satu = setStockAt(product({ stock: 10, stockByOutlet: { o1: 10 } }), 'o1', 7);
  assert.equal(satu.stock, 7, 'kolom stock ikut diperbarui');
  assert.equal(stockFor(satu, 'o1'), 7);

  const dua = setStockAt(product({ stock: 10, stockByOutlet: { o1: 4, o2: 6 } }), 'o2', 1);
  assert.equal(dua.stock, 10, 'kolom stock dibiarkan sebagai cermin cabang pertama');
});

check('migrasi membuat satu cabang dari nama toko', () => {
  const hasil = migrateToOutlets({
    profile: { name: 'Warung Berkah', code: 'WB01' },
    products: [product()],
    transactions: [tx()],
    receivables: [rcv()],
    payables: [{ id: 'pay_1', supplierName: 'Agen', amount: 5000, dueDate: '2026-11-20T03:00:00.000Z', createdAt: '2026-11-01T03:00:00.000Z', payments: [] } as Payable],
    orders: [{ id: 'ord_1', customerName: 'Bu Ratna', items: [], total: 1000, status: 'terbuka', createdAt: '2026-11-01T03:00:00.000Z' } as Order],
    shifts: [{ id: 'shf_1', openedAt: '2026-11-01T03:00:00.000Z', openingCash: 100_000 } as Shift],
  });
  assert.equal(hasil.changed, true);
  assert.equal(hasil.outlets.length, 1);
  assert.equal(hasil.outlets[0].name, 'Warung Berkah');
  assert.equal(hasil.outlets[0].code, 'WB01');
  assert.equal(hasil.activeOutletId, hasil.outlets[0].id);

  const id = hasil.outlets[0].id;
  assert.equal(hasil.transactions[0].outletId, id, 'transaksi lama ditandai cabang');
  assert.equal(hasil.receivables[0].outletId, id);
  assert.equal(hasil.payables[0].outletId, id);
  assert.equal(hasil.orders[0].outletId, id);
  assert.equal(hasil.shifts[0].outletId, id);
  assert.equal(hasil.products[0].stockByOutlet?.[id], 10, 'stok lama pindah ke cabang pertama');
  assert.equal(hasil.products[0].stock, 10, 'kolom stok lama tetap sama');
});

check('migrasi aman dijalankan berulang (tidak menggandakan apa pun)', () => {
  const sekali = migrateToOutlets({
    profile: { name: 'Warung Berkah', code: 'WB01' },
    products: [product()],
    transactions: [tx()],
  });
  const duaKali = migrateToOutlets({
    profile: { name: 'Warung Berkah', code: 'WB01' },
    outlets: sekali.outlets,
    activeOutletId: sekali.activeOutletId,
    products: sekali.products,
    transactions: sekali.transactions,
  });
  assert.equal(duaKali.changed, false, 'tidak ada yang perlu diubah lagi');
  assert.equal(duaKali.outlets.length, 1);
  assert.equal(duaKali.transactions.length, 1);
});

check('migrasi memilih cabang aktif bila cabang lamanya diarsipkan', () => {
  const hasil = migrateToOutlets({
    profile: { name: 'Warung Berkah', code: 'WB01' },
    outlets: [
      outlet({ id: 'o1', name: 'Lama', archivedAt: '2026-11-10T03:00:00.000Z' }),
      outlet({ id: 'o2', name: 'Baru', code: 'B2' }),
    ],
    activeOutletId: 'o1',
    products: [],
  });
  assert.equal(hasil.activeOutletId, 'o2');
});

check('toko satu cabang: angka layar tidak berubah', () => {
  const sumber = {
    profile: { name: 'Warung Berkah', ownerName: 'Siti', code: 'WB01', openTime: '07:00', closeTime: '21:00' },
    settings: { hideBalance: false, autoPrint: false, printerName: '', printerAddress: '', reminderTemplate: 'Halo', taxPercent: 0, lastBackupAt: null, notifEnabled: false, notifHour: 8 },
    categories: [],
    products: [product()],
    transactions: [tx({ id: 'tx_1' }), tx({ id: 'tx_2', outletId: 'out_a' })],
    receivables: [rcv()],
    payables: [],
    allocations: [],
    shifts: [],
    orders: [],
    customers: [],
    outlets: [outlet()],
    activeOutletId: 'out_a',
  };
  const view = scopeData(sumber);
  assert.equal(view.transactions.length, 2, 'semua transaksi tetap terlihat');
  assert.equal(view.products[0].stock, 10, 'stok tetap sama');
  assert.equal(view.orders.length, 0);
});

check('dua cabang: daftar & stok disaring ke cabang aktif', () => {
  const sumber = {
    profile: { name: 'Warung Berkah', ownerName: 'Siti', code: 'WB01', openTime: '07:00', closeTime: '21:00' },
    settings: { hideBalance: false, autoPrint: false, printerName: '', printerAddress: '', reminderTemplate: 'Halo', taxPercent: 0, lastBackupAt: null, notifEnabled: false, notifHour: 8 },
    categories: [],
    products: [product({ stockByOutlet: { out_a: 4, out_b: 6 } })],
    transactions: [
      tx({ id: 'tx_a', outletId: 'out_a', amount: 10_000 }),
      tx({ id: 'tx_b', outletId: 'out_b', amount: 25_000 }),
    ],
    receivables: [rcv({ id: 'rcv_a', outletId: 'out_a' }), rcv({ id: 'rcv_b', outletId: 'out_b' })],
    payables: [] as Payable[],
    allocations: [],
    shifts: [],
    orders: [],
    customers: [],
    outlets: [outlet({ id: 'out_a', name: 'Pusat' }), outlet({ id: 'out_b', name: 'Cabang Dua', code: 'D2' })],
    activeOutletId: 'out_b',
  };
  const view: ScopedData = scopeData(sumber);
  assert.equal(view.transactions.length, 1);
  assert.equal(view.transactions[0].id, 'tx_b');
  assert.equal(view.receivables.length, 1);
  assert.equal(view.receivables[0].id, 'rcv_b');
  assert.equal(view.products[0].stock, 6, 'stok yang tampil = stok cabang aktif');
  assert.equal(view.outlets.length, 2, 'daftar cabang tetap lengkap');

  const pusat = scopeData({ ...sumber, activeOutletId: 'out_a' });
  assert.equal(pusat.transactions[0].id, 'tx_a');
  assert.equal(pusat.products[0].stock, 4);
});

check('baris lama tanpa cabang tetap tampil di cabang mana pun', () => {
  const sumber = {
    profile: { name: 'Warung', ownerName: '', code: 'W1', openTime: '07:00', closeTime: '21:00' },
    settings: { hideBalance: false, autoPrint: false, printerName: '', printerAddress: '', reminderTemplate: 'Halo', taxPercent: 0, lastBackupAt: null, notifEnabled: false, notifHour: 8 },
    categories: [],
    products: [],
    transactions: [tx({ id: 'tx_lama' })],
    receivables: [] as Receivable[],
    payables: [] as Payable[],
    allocations: [],
    shifts: [],
    orders: [],
    customers: [],
    outlets: [outlet({ id: 'out_a' }), outlet({ id: 'out_b', name: 'Dua', code: 'D2' })],
    activeOutletId: 'out_b',
  };
  assert.equal(scopeData(sumber).transactions.length, 1, 'tidak ada data yang hilang');
});

check('ringkasan per cabang: transaksi, omzet, kasbon berjalan', () => {
  const list = [outlet({ id: 'out_a', name: 'Pusat' }), outlet({ id: 'out_b', name: 'Dua', code: 'D2' })];
  const totals = outletTotals({
    profile: { name: 'Warung', ownerName: '', code: 'W1', openTime: '07:00', closeTime: '21:00' },
    settings: { hideBalance: false, autoPrint: false, printerName: '', printerAddress: '', reminderTemplate: 'Halo', taxPercent: 0, lastBackupAt: null, notifEnabled: false, notifHour: 8 },
    categories: [],
    products: [],
    transactions: [
      tx({ id: 'a1', outletId: 'out_a', amount: 10_000 }),
      tx({ id: 'a2', outletId: 'out_a', amount: 5_000 }),
      tx({ id: 'b1', outletId: 'out_b', amount: 7_000 }),
      tx({ id: 'b2', outletId: 'out_b', amount: 3_000, type: 'expense' }),
    ],
    receivables: [rcv({ id: 'r1', outletId: 'out_a', amount: 20_000, payments: [{ id: 'p1', amount: 5_000, method: 'cash', paidAt: '2026-11-10T03:00:00.000Z' }] })],
    payables: [] as Payable[],
    allocations: [],
    shifts: [],
    orders: [],
    customers: [],
    outlets: list,
    activeOutletId: 'out_b',
  });
  assert.equal(totals.length, 2);
  assert.equal(totals[0].transactions, 2);
  assert.equal(totals[0].sales, 15_000, 'pengeluaran tidak dihitung omzet');
  assert.equal(totals[0].receivablesOpen, 15_000);
  assert.equal(totals[1].sales, 7_000);
  assert.equal(totals[0].isActive, false);
  assert.equal(totals[1].isActive, true);
});

check('cabang otomatis memakai nama & kode toko', () => {
  const auto = defaultOutlet({ name: '  Warung  Bu Tini ', code: 'bt2' });
  assert.equal(auto.name, 'Warung Bu Tini');
  assert.equal(auto.code, 'BT2');
  const kosong = defaultOutlet({ name: '', code: '' });
  assert.equal(kosong.name, 'Toko Saya');
  assert.equal(kosong.code, 'UTAMA');
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
if (passed < 18) {
  console.log('Pemeriksaan kurang dari yang diharapkan — periksa daftar di atas.');
  process.exitCode = 1;
}
