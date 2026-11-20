/**
 * Uji buku pelanggan & nilai kesetiaan (Sprint 11).
 *
 * Yang dijaga di sini:
 *   - nama & nomor HP selalu rapi (nomor diseragamkan ke bentuk 62…) sehingga
 *     tautan WhatsApp tidak pernah salah orang;
 *   - riwayat belanja lama (kasbon yang hanya menyimpan NAMA) tetap terhitung;
 *   - poin tidak mungkin dobel karena selalu dihitung dari transaksi.
 */
import assert from 'node:assert/strict';

import {
  cleanCustomerName,
  customerBadge,
  customerHistory,
  customerRows,
  customerStats,
  displayPhone,
  loyaltyPoints,
  loyaltyTier,
  matchCustomer,
  normalizePhone,
  searchCustomers,
  spendToNextTier,
  validateCustomer,
  whatsappNumber,
  POINT_PER_RUPIAH,
  TIER_LANGGANAN,
  TIER_SERING,
} from '../../src/data/customers';
import type { Customer, Order, Receivable, Transaction } from '../../src/data/types';

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

const customer = (patch: Partial<Customer> = {}): Customer => ({
  id: 'cus_1',
  name: 'Bu Ratna',
  phone: '6281234567890',
  createdAt: '2026-11-01T03:00:00.000Z',
  ...patch,
});

const tx = (patch: Partial<Transaction> = {}): Transaction => ({
  id: 'tx_1',
  type: 'sale',
  amount: 50_000,
  categoryId: 'sale-1',
  method: 'cash',
  createdAt: '2026-11-10T03:00:00.000Z',
  ...patch,
});

const rcv = (patch: Partial<Receivable> = {}): Receivable => ({
  id: 'rcv_1',
  customerName: 'Bu Ratna',
  amount: 100_000,
  dueDate: '2026-11-20T03:00:00.000Z',
  createdAt: '2026-11-05T03:00:00.000Z',
  payments: [],
  ...patch,
});

console.log('\n== buku pelanggan ==');

check('nama pelanggan dirapikan (spasi ganda & spasi tepi)', () => {
  assert.equal(cleanCustomerName('   Bu    Ratna  '), 'Bu Ratna');
  assert.equal(cleanCustomerName(undefined), '');
});

check('nomor HP diseragamkan ke bentuk 62…', () => {
  assert.equal(normalizePhone('0812-3456-7890'), '6281234567890');
  assert.equal(normalizePhone('+62 812 3456 7890'), '6281234567890');
  assert.equal(normalizePhone('81234567890'), '6281234567890');
  assert.equal(normalizePhone('6281234567890'), '6281234567890');
});

check('nomor kosong tidak menghasilkan tautan apa pun', () => {
  assert.equal(normalizePhone(''), undefined);
  assert.equal(normalizePhone('   '), undefined);
  assert.equal(whatsappNumber({ phone: '' }), undefined);
  assert.equal(whatsappNumber({ phone: '0812 3456 7890' }), '6281234567890');
});

check('nomor ditampilkan seperti kebiasaan warung: 0812-3456-7890', () => {
  assert.equal(displayPhone('6281234567890'), '0812-3456-7890');
  assert.equal(displayPhone(''), '');
});

check('isian pelanggan ditolak dengan pesan manusia', () => {
  const tanpaNama = validateCustomer({ name: '   ' });
  assert.equal(tanpaNama.ok, false);
  if (!tanpaNama.ok) assert.match(tanpaNama.reason, /nama pelanggan wajib/i);

  const pendek = validateCustomer({ name: 'A' });
  assert.equal(pendek.ok, false);
  if (!pendek.ok) assert.match(pendek.reason, /terlalu pendek/i);

  const nomorPendek = validateCustomer({ name: 'Bu Ratna', phone: '0812' });
  assert.equal(nomorPendek.ok, false);
  if (!nomorPendek.ok) assert.match(nomorPendek.reason, /0812 3456 7890/);
});

check('isian benar menghasilkan nilai yang sudah rapi', () => {
  const hasil = validateCustomer({ name: '  Bu   Ratna ', phone: '0812-3456-7890', note: ' ambil kue ' });
  assert.equal(hasil.ok, true);
  if (!hasil.ok) return;
  assert.equal(hasil.value.name, 'Bu Ratna');
  assert.equal(hasil.value.phone, '6281234567890');
  assert.equal(hasil.value.note, 'ambil kue');
});

check('pencocokan nama tidak membedakan huruf besar & spasi', () => {
  const book = [customer(), customer({ id: 'cus_2', name: 'Pak Ujang' })];
  assert.equal(matchCustomer(book, '  bu  RATNA ')?.id, 'cus_1');
  assert.equal(matchCustomer(book, 'Pak RT'), undefined);
  assert.equal(matchCustomer([], 'Bu Ratna'), undefined);
});

check('pencarian pelanggan lewat nama maupun nomor HP', () => {
  const book = [
    customer(),
    customer({ id: 'cus_2', name: 'Pak Ujang', phone: '628999999000' }),
  ];
  assert.equal(searchCustomers(book, 'ratna').length, 1);
  assert.equal(searchCustomers(book, '8999').length, 1);
  assert.equal(searchCustomers(book, '0812').length, 1);
  assert.equal(searchCustomers(book, '').length, 2);
  assert.equal(searchCustomers(book, 'zzz').length, 0);
});

check('poin = Rp 10.000 belanja jadi 1 poin, dibulatkan ke bawah', () => {
  assert.equal(POINT_PER_RUPIAH, 10_000);
  assert.equal(loyaltyPoints(0), 0);
  assert.equal(loyaltyPoints(9_999), 0);
  assert.equal(loyaltyPoints(10_000), 1);
  assert.equal(loyaltyPoints(155_500), 15);
  assert.equal(loyaltyPoints(Number.NaN), 0);
  assert.equal(loyaltyPoints(-50_000), 0);
});

check('tingkat pelanggan naik sesuai nilai belanja', () => {
  assert.equal(loyaltyTier(0).label, 'Pelanggan baru');
  assert.equal(loyaltyTier(TIER_SERING - 1).label, 'Pelanggan baru');
  assert.equal(loyaltyTier(TIER_SERING).label, 'Sering belanja');
  assert.equal(loyaltyTier(TIER_LANGGANAN).label, 'Langganan setia');
  assert.equal(loyaltyTier(TIER_LANGGANAN).nextAt, null);
  assert.equal(loyaltyTier(0).nextAt, TIER_SERING);
});

check('sisa belanja untuk naik tingkat', () => {
  const stats = customerStats(
    { transactions: [tx({ amount: 100_000, customerId: 'cus_1' })] },
    customer(),
  );
  assert.equal(stats.tier.label, 'Pelanggan baru');
  assert.equal(spendToNextTier(stats), TIER_SERING - 100_000);
  const puncak = customerStats(
    { transactions: [tx({ amount: 2_000_000, customerId: 'cus_1' })] },
    customer(),
  );
  assert.equal(spendToNextTier(puncak), 0);
});

check('belanja & kunjungan dihitung dari transaksi milik pelanggan', () => {
  const stats = customerStats(
    {
      customers: [customer()],
      transactions: [
        tx({ id: 'tx_1', amount: 40_000, customerId: 'cus_1' }),
        tx({ id: 'tx_2', amount: 60_000, customerId: 'cus_1' }),
        tx({ id: 'tx_3', amount: 25_000, customerId: 'cus_2' }),
        tx({ id: 'tx_4', type: 'expense', amount: 15_000, customerId: 'cus_1' }),
      ],
    },
    customer(),
  );
  assert.equal(stats.totalSpend, 100_000, 'hanya penjualan yang dihitung');
  assert.equal(stats.visits, 2);
  assert.equal(stats.points, 10);
});

check('kasbon lama (hanya nama) tetap terhitung untuk pelanggan ini', () => {
  const legacy = rcv({ customerId: undefined, customerName: 'bu  ratna' });
  const history = customerHistory(
    {
      transactions: [tx({ id: 'tx_9', receivableId: 'rcv_1', amount: 100_000, method: 'kasbon' })],
      receivables: [legacy],
    },
    customer(),
  );
  assert.equal(history.receivables.length, 1, 'kasbon lama ikut terbaca');
  assert.equal(history.transactions.length, 1, 'transaksi kasbonnya ikut terbaca');

  const stats = customerStats(
    {
      transactions: [tx({ id: 'tx_9', receivableId: 'rcv_1', amount: 100_000, method: 'kasbon' })],
      receivables: [legacy],
    },
    customer(),
  );
  assert.equal(stats.totalSpend, 100_000);
  assert.equal(stats.kasbonOpen, 100_000, 'kasbon penuh masih terbuka');
  assert.equal(stats.kasbonCount, 1);
});

check('kasbon yang sudah dibayar sebagian tidak dihitung penuh', () => {
  const sebagian = rcv({
    customerId: 'cus_1',
    amount: 100_000,
    payments: [{ id: 'pay_1', amount: 40_000, method: 'cash', paidAt: '2026-11-12T03:00:00.000Z' }],
  });
  const stats = customerStats(
    { transactions: [], receivables: [sebagian], customers: [customer()] },
    customer(),
  );
  assert.equal(stats.kasbonOpen, 60_000);
  assert.equal(stats.kasbonCount, 1);

  const lunas = rcv({
    customerId: 'cus_1',
    amount: 100_000,
    payments: [{ id: 'pay_2', amount: 100_000, method: 'cash', paidAt: '2026-11-13T03:00:00.000Z' }],
  });
  const setelahLunas = customerStats({ transactions: [], receivables: [lunas] }, customer());
  assert.equal(setelahLunas.kasbonOpen, 0);
  assert.equal(setelahLunas.kasbonCount, 0);
});

check('waktu belanja terakhir diambil dari transaksi teranyar', () => {
  const stats = customerStats(
    {
      transactions: [
        tx({ id: 'tx_1', createdAt: '2026-11-02T03:00:00.000Z', customerId: 'cus_1' }),
        tx({ id: 'tx_2', createdAt: '2026-11-15T03:00:00.000Z', customerId: 'cus_1' }),
        tx({ id: 'tx_3', createdAt: '2026-11-18T03:00:00.000Z', customerId: 'cus_1' }),
      ],
    },
    customer(),
  );
  assert.equal(stats.lastVisitAt, '2026-11-18T03:00:00.000Z');
});

check('pesanan pelanggan ikut terbaca di riwayatnya', () => {
  const order: Order = {
    id: 'ord_1',
    customerName: 'BU RATNA',
    items: [{ name: 'Kue Lapis', qty: 3, price: 5_000 }],
    total: 15_000,
    status: 'terbuka',
    createdAt: '2026-11-16T03:00:00.000Z',
  };
  const history = customerHistory({ transactions: [], orders: [order] }, customer());
  assert.equal(history.orders.length, 1);

  const lain = customerHistory({ transactions: [], orders: [order] }, customer({ name: 'Pak Ujang' }));
  assert.equal(lain.orders.length, 0);
});

check('daftar pelanggan urut dari yang paling banyak belanja', () => {
  const book = [
    customer(),
    customer({ id: 'cus_2', name: 'Pak Ujang' }),
    customer({ id: 'cus_3', name: 'Mbak Sri' }),
  ];
  const rows = customerRows({
    customers: book,
    transactions: [
      tx({ id: 'tx_1', amount: 20_000, customerId: 'cus_1' }),
      tx({ id: 'tx_2', amount: 300_000, customerId: 'cus_2' }),
      tx({ id: 'tx_3', amount: 5_000, customerId: 'cus_3' }),
    ],
  });
  assert.deepEqual(
    rows.map((row) => row.customer.name),
    ['Pak Ujang', 'Bu Ratna', 'Mbak Sri'],
  );
});

check('label kartu pelanggan singkat & tidak menyesatkan', () => {
  const kosong = customerStats({ transactions: [] }, customer());
  assert.equal(customerBadge(kosong), 'Belum pernah belanja');

  const punyaKasbon = customerStats({ transactions: [], receivables: [rcv({ customerId: 'cus_1' })] }, customer());
  assert.equal(customerBadge(punyaKasbon), 'Ada kasbon');

  const poin = customerStats({ transactions: [tx({ amount: 55_000, customerId: 'cus_1' })] }, customer());
  assert.equal(customerBadge(poin), '5 poin');
});

check('pelanggan tanpa HP tidak menghasilkan tautan WhatsApp', () => {
  assert.equal(whatsappNumber(customer({ phone: undefined })), undefined);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
if (passed < 18) {
  console.log('Pemeriksaan kurang dari yang diharapkan — periksa daftar di atas.');
  process.exitCode = 1;
}
