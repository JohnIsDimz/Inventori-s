/**
 * Uji daftar tagih kasbon WhatsApp (Sprint 17).
 *
 * Yang dijaga:
 *   - kasbon lunas tidak pernah muncul di daftar tagih;
 *   - yang telat selalu di atas yang belum jatuh tempo;
 *   - nomor HP diambil dari buku pelanggan (lewat id atau nama), bukan diketik;
 *   - pesan WhatsApp terisi lengkap dan tautannya aman;
 *   - kasbon yang baru ditagih diberi tanda, supaya tidak ditagih berulang.
 */
import assert from 'node:assert/strict';

import {
  collectionRows,
  collectionSummaryText,
  collectionTotals,
  daysUntilDue,
  dueLabel,
  dueTone,
  fillReminderTemplate,
  waLink,
} from '../../src/data/reminders';
import type { Customer, Receivable } from '../../src/data/types';

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

const NOW = new Date('2026-11-20T09:00:00.000Z');
const iso = (day: number, month = 11) =>
  new Date(Date.UTC(2026, month - 1, day, 3, 0)).toISOString();

const receivable = (patch: Partial<Receivable> = {}): Receivable => ({
  id: 'rcv_1',
  customerName: 'Bu Ratna',
  amount: 35000,
  dueDate: iso(24),
  createdAt: iso(15),
  payments: [],
  ...patch,
});

const customer = (patch: Partial<Customer> = {}): Customer => ({
  id: 'cus_1',
  name: 'Bu Ratna',
  phone: '081234567890',
  createdAt: iso(10),
  ...patch,
});

const settings = {
  reminderTemplate:
    'Halo {nama}, kami catat kasbon di {toko} sebesar {nominal} dengan jatuh tempo {tanggal}. Mohon dibayarkan bila sudah memungkinkan ya.',
};

const money = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

console.log('\n== daftar tagih kasbon WhatsApp ==');

check('selisih hari dihitung dari tanggal, bukan jam', () => {
  assert.equal(daysUntilDue(iso(20), NOW), 0, 'hari ini');
  assert.equal(daysUntilDue(iso(24), NOW), 4);
  assert.equal(daysUntilDue(iso(16), NOW), -4, 'telat 4 hari');
  assert.equal(daysUntilDue('bukan tanggal', NOW), 0);
});

check('kalimat jatuh tempo enak dibaca', () => {
  assert.equal(dueLabel(-4), 'Telat 4 hari');
  assert.equal(dueLabel(0), 'Jatuh tempo hari ini');
  assert.equal(dueLabel(1), 'Besok');
  assert.equal(dueLabel(3), '3 hari lagi');
  assert.equal(dueTone(-1), 'lewat');
  assert.equal(dueTone(0), 'hari-ini');
  assert.equal(dueTone(2), 'dekat');
});

check('pesan template terisi lengkap', () => {
  const text = fillReminderTemplate({
    template: settings.reminderTemplate,
    customerName: 'Bu Ratna',
    storeName: 'Warung Berkah',
    amount: 35000,
    dueDate: iso(24),
    itemCount: 2,
  });
  assert.match(text, /Halo Bu Ratna/);
  assert.match(text, /Warung Berkah/);
  assert.match(text, /Rp 35\.000/);
  assert.match(text, /24\/11\/2026/);
  assert.match(text, /Rincian: 2 item/);
});

check('nama toko kosong diganti "toko kami"', () => {
  const text = fillReminderTemplate({
    template: settings.reminderTemplate,
    customerName: 'Pak Budi',
    storeName: '   ',
    amount: 5000,
    dueDate: iso(22),
  });
  assert.match(text, /toko kami/);
  assert.doesNotMatch(text, /Rincian/);
});

check('tautan WhatsApp memakai nomor 62 & pesan ter-encode', () => {
  const link = waLink('0812-3456-7890', 'Halo Bu Ratna, sisa Rp 35.000 & terima kasih');
  assert.ok(link);
  assert.ok(link.startsWith('https://wa.me/6281234567890?text='));
  assert.match(link, /%20/, 'spasi di-encode');
  assert.match(link, /%26/, 'tanda & di-encode');
  assert.equal(waLink('', 'halo'), null);
  assert.equal(waLink(undefined, 'halo'), null);
});

check('hanya kasbon yang perlu ditagih yang masuk daftar', () => {
  const rows = collectionRows({
    receivables: [
      receivable({ id: 'a', dueDate: iso(16) }), // telat 4 hari
      receivable({ id: 'b', dueDate: iso(20) }), // hari ini
      receivable({ id: 'c', dueDate: iso(22) }), // 2 hari lagi
      receivable({ id: 'd', dueDate: iso(28) }), // masih jauh → tidak masuk
      receivable({ id: 'e', amount: 10000, payments: [{ id: 'p', amount: 10000, paidAt: iso(19), method: 'cash' }] }),
    ],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  assert.deepEqual(rows.map((row) => row.receivableId), ['a', 'b', 'c'], 'urut paling telat');
  assert.equal(rows[0].tone, 'lewat');
  assert.equal(rows[1].tone, 'hari-ini');
});

check('sisa tagihan memakai pembayaran yang sudah masuk', () => {
  const rows = collectionRows({
    receivables: [
      receivable({ amount: 50000, dueDate: iso(19), payments: [{ id: 'p1', amount: 20000, paidAt: iso(18), method: 'cash' }] }),
    ],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  assert.equal(rows[0].amount, 30000);
});

check('nomor HP diambil dari buku pelanggan lewat id atau nama', () => {
  const byId = collectionRows({
    receivables: [receivable({ customerId: 'cus_9', customerName: 'Nama Beda', dueDate: iso(21) })],
    customers: [customer({ id: 'cus_9', name: 'Nama Beda', phone: '081200000001' })],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  assert.equal(byId[0].phone, '6281200000001');
  assert.ok(byId[0].link);

  const byName = collectionRows({
    receivables: [receivable({ customerName: '  bu ratna ', dueDate: iso(21) })],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  assert.equal(byName[0].phone, '6281234567890');

  const tanpaNomor = collectionRows({
    receivables: [receivable({ customerName: 'Pak Tanpa HP', dueDate: iso(21) })],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  assert.equal(tanpaNomor[0].phone, undefined);
  assert.equal(tanpaNomor[0].link, null, 'tidak ada tautan bila nomor kosong');
});

check('kasbon yang baru ditagih diberi tanda', () => {
  const [row] = collectionRows({
    receivables: [
      receivable({ dueDate: iso(16), lastRemindedAt: new Date('2026-11-19T04:00:00.000Z').toISOString() }),
    ],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  assert.equal(row.remindedRecently, true);

  const [lama] = collectionRows({
    receivables: [
      receivable({ dueDate: iso(16), lastRemindedAt: new Date('2026-11-10T04:00:00.000Z').toISOString() }),
    ],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  assert.equal(lama.remindedRecently, false, 'sudah lewat 3 hari, boleh ditagih lagi');
});

check('ringkasan menghitung yang telat, hari ini, dan tanpa nomor', () => {
  const rows = collectionRows({
    receivables: [
      receivable({ id: 'a', dueDate: iso(16) }),
      receivable({ id: 'b', dueDate: iso(20) }),
      receivable({ id: 'c', dueDate: iso(22), customerName: 'Pak Tanpa HP' }),
    ],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
  });
  const totals = collectionTotals(rows);
  assert.equal(totals.count, 3);
  assert.equal(totals.amount, 105000);
  assert.equal(totals.overdueCount, 1);
  assert.equal(totals.overdueAmount, 35000);
  assert.equal(totals.dueTodayCount, 1);
  assert.equal(totals.withoutPhone, 1);
  assert.equal(totals.pending, 3);
  assert.equal(
    collectionSummaryText(totals, money),
    '3 kasbon • Rp 105.000 • 1 telat • 1 hari ini',
  );
});

check('daftar kosong dijawab dengan tenang', () => {
  const totals = collectionTotals([]);
  assert.equal(totals.count, 0);
  assert.equal(
    collectionSummaryText(totals, money),
    'Tidak ada kasbon yang perlu ditagih sekarang.',
  );
});

check('batas H+3 bisa diubah bila perlu', () => {
  const rows = collectionRows({
    receivables: [receivable({ dueDate: iso(28) })],
    customers: [customer()],
    settings,
    storeName: 'Warung Berkah',
    now: NOW,
    windowDays: 30,
  });
  assert.equal(rows.length, 1);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
if (passed < 12) {
  console.log('Pemeriksaan kurang dari yang diharapkan — periksa daftar di atas.');
  process.exitCode = 1;
}
