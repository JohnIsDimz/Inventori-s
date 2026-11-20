/**
 * Uji cadangan lokal: bikin, baca, gabung, dan tolak berkas yang salah.
 * Bagian ini murni fungsi — tanpa file system — jadi bisa jalan di Node.
 */
import assert from 'node:assert/strict';

import { backupReminder, BACKUP_REMIND_DAYS } from '../../src/services/backup';
import {
  applyBackup,
  backupFileName,
  buildBackup,
  countPayload,
  parseBackup,
  type BackupPayload,
} from '../../src/services/backup';

import type { Customer, Product, Transaction } from '../../src/data/types';

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log('  OK   ' + label);
};

const product = (id: string, name: string): Product => ({
  id,
  name,
  unit: 'pcs',
  sellPrice: 9000,
  costPrice: 6000,
  stock: 10,
  minStock: 3,
});

const tx = (id: string): Transaction => ({
  id,
  type: 'sale',
  amount: 9000,
  categoryId: 'sale-1',
  method: 'cash',
  createdAt: '2026-11-19T03:00:00.000Z',
});

const empty = (): BackupPayload => ({
  profile: {
    name: 'Toko Uji',
    ownerName: 'Budi',
    code: 'TK01',
    openTime: '07:00',
    closeTime: '21:00',
  },
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
  customers: [],
  outlets: [],
});

const customer = (id: string, name: string): Customer => ({
  id,
  name,
  phone: '6281234567890',
  createdAt: '2026-11-19T03:00:00.000Z',
});

const payload = (): BackupPayload => ({
  ...empty(),
  products: [product('prd_1', 'Kopi')],
  transactions: [tx('tx_1')],
});

console.log('\n== cadangan lokal ==');

check('buildBackup mencatat versi, waktu, nama toko, dan jumlah data', () => {
  const backup = buildBackup(payload(), '2026-11-19T10:00:00.000Z');
  assert.equal(backup.app, 'inventoris');
  assert.equal(backup.version, 1);
  assert.equal(backup.storeName, 'Toko Uji');
  assert.equal(backup.counts.produk, 1);
  assert.equal(backup.counts.transaksi, 1);
  assert.equal(backup.exportedAt, '2026-11-19T10:00:00.000Z');
});

check('teks cadangan bisa dibaca kembali utuh (bolak-balik)', () => {
  const text = JSON.stringify(buildBackup(payload()));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.backup.data.products[0].name, 'Kopi');
  assert.equal(parsed.backup.data.products[0].wholesalePrice, undefined);
  assert.equal(parsed.counts.transaksi, 1);
});

check('menolak berkas yang bukan cadangan Inventori’s', () => {
  const notOurs = parseBackup(JSON.stringify({ app: 'aplikasi-lain', data: {} }));
  assert.equal(notOurs.ok, false);
  if (!notOurs.ok) assert.match(notOurs.reason, /bukan cadangan Inventori/i);
});

check('menolak JSON rusak & teks kosong dengan pesan manusia', () => {
  const broken = parseBackup('{ ini bukan json');
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.match(broken.reason, /bukan cadangan/i);

  const kosong = parseBackup('   ');
  assert.equal(kosong.ok, false);
  if (!kosong.ok) assert.match(kosong.reason, /kosong/i);
});

check('menolak cadangan dari versi aplikasi yang lebih baru', () => {
  const future = parseBackup(
    JSON.stringify({ app: 'inventoris', version: 99, data: { products: [product('p', 'X')] } }),
  );
  assert.equal(future.ok, false);
  if (!future.ok) assert.match(future.reason, /lebih baru/i);
});

check('menolak cadangan tanpa satu pun data', () => {
  const kosong = parseBackup(JSON.stringify(buildBackup(empty())));
  assert.equal(kosong.ok, false);
  if (!kosong.ok) assert.match(kosong.reason, /tidak berisi/i);
});

check('mode gabung menambah yang baru tanpa menghapus yang lama', () => {
  const current = payload();
  const incoming: BackupPayload = {
    ...empty(),
    products: [product('prd_1', 'Kopi (duplikat)'), product('prd_2', 'Teh')],
    transactions: [tx('tx_1'), tx('tx_2')],
  };
  const { payload: next, added } = applyBackup(current, incoming, 'merge');
  assert.equal(next.products.length, 2, 'produk duplikat tidak digandakan');
  assert.equal(next.products.find((p) => p.id === 'prd_1')?.name, 'Kopi', 'data lama dipertahankan');
  assert.equal(added.produk, 1);
  assert.equal(added.transaksi, 1);
});

check('mode ganti menimpa seluruh daftar dengan isi cadangan', () => {
  const current = payload();
  const incoming: BackupPayload = {
    ...empty(),
    profile: { ...empty().profile, name: 'Toko Baru' },
    products: [product('prd_9', 'Gula')],
  };
  const { payload: next } = applyBackup(current, incoming, 'replace');
  assert.equal(next.products.length, 1);
  assert.equal(next.products[0].id, 'prd_9');
  assert.equal(next.transactions.length, 0, 'transaksi lama hilang sesuai pilihan pengguna');
  assert.equal(next.profile.name, 'Toko Baru', 'profil ikut dari cadangan');
});

check('mode ganti tidak menghapus kategori bawaan bila cadangan tidak punya', () => {
  const current: BackupPayload = {
    ...payload(),
    categories: [
      { id: 'sale-1', label: 'Penjualan', type: 'sale', icon: 'cart' },
    ] as BackupPayload['categories'],
  };
  const { payload: next } = applyBackup(current, empty(), 'replace');
  assert.equal(next.categories.length, 1, 'kategori lama dipakai sebagai cadangan terakhir');
});

check('mode gabung tetap memulihkan identitas toko di HP baru', () => {
  // HP baru: profil masih kosong (belum diisi), hanya ada data bawaan aplikasi.
  const kosong: BackupPayload = {
    ...empty(),
    profile: { ...empty().profile, name: '', ownerName: '', code: '' },
    settings: { ...empty().settings, taxPercent: 0 },
  };
  const incoming = payload();
  const { payload: next } = applyBackup(kosong, incoming, 'merge');
  assert.equal(next.profile.name, 'Toko Uji', 'nama toko dari cadangan dipakai');
  assert.equal(next.settings.taxPercent, 10, 'pengaturan ikut pulih');
});

check('mode gabung tidak menimpa identitas toko yang sudah diisi', () => {
  const current = payload();
  const incoming: BackupPayload = {
    ...payload(),
    profile: { ...payload().profile, name: 'Nama Lain' },
    products: [product('prd_9', 'Gula')],
  };
  const { payload: next } = applyBackup(current, incoming, 'merge');
  assert.equal(next.profile.name, 'Toko Uji', 'nama toko di perangkat ini menang');
  assert.equal(next.products.length, 2, 'produk baru tetap masuk');
});

check('countPayload menghitung semua jenis data', () => {
  const counts = countPayload({ ...payload(), shifts: [], allocations: [] });
  assert.equal(counts.produk, 1);
  assert.equal(counts.transaksi, 1);
  assert.equal(counts.pelanggan, 0, 'buku pelanggan ikut dihitung');
  assert.equal(counts.cabang, 0, 'daftar cabang ikut dihitung');
  assert.equal(counts.opname, 0, 'riwayat hitung stok ikut dihitung');
  assert.equal(counts.kulakan, 0, 'riwayat kulakan ikut dihitung');
  assert.equal(counts.supplier, 0, 'buku supplier ikut dihitung');
  assert.equal(counts.retur, 0, 'retur barang ikut dihitung');
  assert.equal(Object.keys(counts).length, 14, 'tiga belas jenis data + pesanan');
});

check('buku pelanggan ikut tercadangkan & tergabung', () => {
  const withBook = { ...payload(), customers: [customer('cus_1', 'Bu Ratna')] };
  const text = JSON.stringify(buildBackup(withBook));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.backup.data.customers.length, 1, 'pelanggan terbaca kembali');
  assert.equal(parsed.backup.data.customers[0].name, 'Bu Ratna');

  const merged = applyBackup(
    { ...payload(), customers: [customer('cus_1', 'Bu Ratna')] },
    { ...payload(), customers: [customer('cus_2', 'Pak Ujang')] },
    'merge',
  );
  assert.equal(merged.payload.customers.length, 2, 'pelanggan baru ikut bergabung');
  assert.equal(merged.added.pelanggan, 1);
});

check('cadangan lama tanpa buku pelanggan tetap bisa dibuka', () => {
  const older = JSON.stringify({
    app: 'inventoris',
    version: 1,
    data: { products: [product('prd_1', 'Kopi')] },
  });
  const parsed = parseBackup(older);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.backup.data.customers, [], 'daftar kosong, bukan gagal');
});

check('backupFileName aman untuk nama toko bersimbol', () => {
  const name = backupFileName('Warung Bu Tini’s / Cabang #2', new Date('2026-11-19T10:20:00Z'));
  assert.match(name, /^cadangan-inventoris-warung-bu-tini-s-cabang-2-202611191020\.json$/);
});

check('pengingat: data kosong tidak pernah mengingatkan', () => {
  const r = backupReminder({ lastBackupAt: null, hasData: false });
  assert.equal(r.state, 'kosong');
  assert.equal(r.message, '');
});

check('pengingat: belum pernah mencadangkan tapi ada data', () => {
  const r = backupReminder({ lastBackupAt: null, hasData: true });
  assert.equal(r.state, 'belum-pernah');
  assert.match(r.message, /belum pernah dicadangkan/i);
});

check('pengingat: cadangan kemarin masih aman', () => {
  const now = new Date('2026-11-19T09:00:00.000Z');
  const r = backupReminder({
    lastBackupAt: '2026-11-18T09:00:00.000Z',
    hasData: true,
    now,
  });
  assert.equal(r.state, 'aman');
  assert.equal(r.days, 1);
  assert.equal(r.message, '');
});

check(`pengingat: lewat ${BACKUP_REMIND_DAYS} hari minta cadangkan lagi`, () => {
  const now = new Date('2026-11-19T09:00:00.000Z');
  const r = backupReminder({
    lastBackupAt: '2026-11-11T09:00:00.000Z',
    hasData: true,
    now,
  });
  assert.equal(r.state, 'waktunya');
  assert.equal(r.days, 8);
  assert.match(r.message, /8 hari lalu/);
});

check('pengingat: waktu cadangan rusak dianggap belum pernah', () => {
  const r = backupReminder({ lastBackupAt: 'bukan-tanggal', hasData: true });
  assert.equal(r.state, 'belum-pernah');
});

check('pesanan ikut tercadangkan dan bisa dipulihkan', () => {
  const withOrder: BackupPayload = {
    ...payload(),
    orders: [
      {
        id: 'ord_1',
        customerName: 'Bu Ratna',
        items: [{ name: 'Kue Lapis', qty: 3, price: 5000 }],
        total: 15000,
        status: 'terbuka',
        createdAt: '2026-11-19T03:00:00.000Z',
      },
    ],
  };
  const backup = buildBackup(withOrder);
  assert.equal(backup.counts.pesanan, 1, 'jumlah pesanan dicatat');

  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const { payload: restored } = applyBackup(empty(), parsed.backup.data, 'merge');
  assert.equal(restored.orders.length, 1);
  assert.equal(restored.orders[0].customerName, 'Bu Ratna');
});

check('berkas cadangan versi 1 (tanpa pesanan) tetap bisa dipulihkan', () => {
  const lama = buildBackup(payload()) as unknown as Record<string, unknown>;
  const data = { ...(lama.data as Record<string, unknown>) };
  delete data.orders; // berkas dari aplikasi versi sebelumnya
  const parsed = parseBackup(JSON.stringify({ ...lama, data }));
  assert.equal(parsed.ok, true, 'berkas lama tidak ditolak');
  if (!parsed.ok) return;
  assert.deepEqual(parsed.backup.data.orders, [], 'pesanan dibaca sebagai daftar kosong');
  assert.equal(parsed.counts.pesanan, 0);
});

check('gabung tidak menggandakan pesanan yang sama', () => {
  const denganPesanan: BackupPayload = {
    ...payload(),
    orders: [
      {
        id: 'ord_1',
        customerName: 'Bu Ratna',
        items: [{ name: 'Kue', qty: 1, price: 1000 }],
        total: 1000,
        status: 'terbuka',
        createdAt: '2026-11-19T03:00:00.000Z',
      },
    ],
  };
  const { payload: merged, added } = applyBackup(denganPesanan, denganPesanan, 'merge');
  assert.equal(merged.orders.length, 1);
  assert.equal(added.pesanan, 0);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
