import assert from 'node:assert/strict';
import { buildBackup, parseBackup, type BackupPayload } from '../../src/services/backup';
import { buildReportHtml, buildTransactionsCsv } from '../../src/services/report';
import { buildReceiptText, buildEscPos } from '../../src/services/printer/receipt';
import { safeNoteFileName } from '../../src/utils/photoPath';
import { canSession, ALL_ACTIONS } from '../../src/utils/permissions';

let passed = 0;
function check(label: string, run: () => void) {
  run(); passed++; console.log('  OK   ' + label);
}
const at = '2026-11-20T10:00:00.000Z';
const from = new Date('2026-11-01'), to = new Date('2026-12-01');
const data: BackupPayload = {
  profile: { name: '<Toko Aman>', code: 'UTAMA', ownerName: '', openTime: '06:00', closeTime: '21:00' },
  settings: { hideBalance: false, autoPrint: false, printerName: '', printerAddress: '', reminderTemplate: '', taxPercent: 0, lastBackupAt: null, notifEnabled: false, notifHour: 8 },
  products: [{ id: 'p', name: 'Barang', unit: 'pcs', stock: 10, minStock: 1, sellPrice: 10000, costPrice: 4321 }],
  categories: [], transactions: [{ id: 't', type: 'sale', amount: 10000, categoryId: '', method: 'cash', createdAt: at, items: [{ name: 'Barang', qty: 1, price: 10000, cost: 4321 }] }],
  receivables: [], payables: [], allocations: [{ id: 'a', amount: -100, createdAt: at }], shifts: [], orders: [],
  opnames: [{ id: 'o', createdAt: at, lines: [{ productId: 'p', name: 'Barang', unit: 'pcs', system: 11, counted: 10, cost: 4321 }], lossValue: 4321, gainValue: 0 }],
  purchases: [{ id: 'buy', supplierName: 'Agen', items: [{ productId: 'p', name: 'Barang', unit: 'pcs', qty: 10, unitCost: 4321 }], total: 43210, paid: 43210, method: 'cash', createdAt: at }],
  purchaseReturns: [{ id: 'ret', supplierName: 'Agen', items: [{ productId: 'p', name: 'Barang', unit: 'pcs', qty: 1, unitCost: 4321 }], total: 4321, appliedAmount: 1000, creditValue: 3321, createdAt: at }],
};

check('sesi tersambung tanpa keanggotaan selalu ditolak', () => {
  for (const action of ALL_ACTIONS) {
    assert.equal(canSession({ role: null, userId: 'u', outletId: 'o' }, action, true), false);
    assert.equal(canSession({ role: 'owner', userId: null, outletId: 'o' }, action, true), false);
    assert.equal(canSession({ role: 'owner', userId: 'u', outletId: null }, action, true), false);
    assert.equal(canSession({ role: null }, action, false), true);
  }
});
check('kasir tetap boleh ekspor tanpa izin melihat laba', () => {
  const session = { role: 'kasir' as const, userId: 'u', outletId: 'o' };
  assert.equal(canSession(session, 'report.export', true), true);
  assert.equal(canSession(session, 'profit.view', true), false);
});
check('PDF kasir tidak memuat laba, margin, atau nilai harga modal', () => {
  const html = buildReportHtml(data, from, to, false);
  assert.doesNotMatch(html, /Laba bersih|Margin|Riwayat harga beli|Selisih hitung stok|4\.321/);
  assert.match(html, /Omzet/);
  assert.match(html, /&lt;Toko Aman&gt;/);
  assert.match(buildReportHtml(data, from, to, true), /Riwayat harga beli/);
});
check('CSV kasir tidak memuat bagian modal dan ekspor bawaan aman', () => {
  const csv = buildTransactionsCsv(data, from, to);
  assert.doesNotMatch(csv, /4321|harga beli|hitung stok/i);
  assert.match(csv, /10000/);
  assert.match(buildTransactionsCsv(data, from, to, true), /4321/);
});
check('nama foto aman diterima, traversal dan nama bukan nota ditolak', () => {
  assert.equal(safeNoteFileName('file:///document/nota/nota-123-abc.jpg'), 'nota-123-abc.jpg');
  for (const uri of ['file:///nota/../rahasia.json', 'file:///nota/%2e%2e.json', 'file:///nota/nota-%2f.jpg', 'file:///nota/secret.jpg', 'file:///nota/nota-x.jpg/..', 'file:///nota\\nota-x.jpg', '', 'nota-x.jpg']) {
    assert.equal(safeNoteFileName(uri), null, uri);
  }
});
check('cadangan kulakan, retur, opname, dan penarikan modal pulih utuh', () => {
  const result = parseBackup(JSON.stringify(buildBackup(data)));
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.reason);
  const restored = result.backup.data;
  assert.equal(restored.allocations[0].amount, -100);
  assert.deepEqual(restored.purchases?.[0].items, data.purchases?.[0].items);
  assert.equal(restored.purchases?.[0].paid, 43210);
  assert.equal(restored.purchaseReturns?.[0].creditValue, 3321);
  assert.deepEqual(restored.opnames?.[0].lines, data.opnames?.[0].lines);
});
check('cadangan dengan elemen rusak, foto asing dan kunci prototipe dibersihkan', () => {
  const raw = JSON.parse(JSON.stringify(buildBackup(data)));
  raw.data.transactions.push(null, 42, { id: 'bad', amount: -20 });
  raw.data.transactions[0].photoUri = 'file:///nota/../private.json';
  raw.data.transactions[0].items = { unexpected: true };
  raw.data.products[0].note = { bad: true };
  raw.data.products[0].__proto__ = null;
  const text = JSON.stringify(raw).replace('"products":[{', '"products":[{"__proto__":{"polluted":true},');
  const result = parseBackup(text);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.reason);
  assert.equal(result.backup.data.transactions.length, 1);
  assert.equal(result.backup.data.transactions[0].photoUri, undefined);
  assert.equal(result.backup.data.transactions[0].items, undefined);
  assert.equal(Object.hasOwn(result.backup.data.products[0], '__proto__'), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
check('cadangan sepenuhnya rusak ditolak dan ukuran dibatasi', () => {
  const raw = JSON.parse(JSON.stringify(buildBackup({ ...data, products: [] })));
  for (const key of Object.keys(raw.data)) if (Array.isArray(raw.data[key])) raw.data[key] = [];
  raw.data.products = [null, { id: 'broken', name: {} }];
  assert.equal(parseBackup(JSON.stringify(raw)).ok, false);
  assert.equal(parseBackup(' '.repeat(10 * 1024 * 1024 + 1)).ok, false);
});
const receipt = {
  storeName: 'TOKO', invoice: 'tx-unik', createdAt: at,
  items: [{ name: 'Barang', qty: 2, price: 5000, discount: 1000 }],
  total: 9000, method: 'cash' as const, paid: 10000, change: 1000,
};
check('struk mencetak diskon barang, nilai neto, dan kembalian', () => {
  const text = buildReceiptText(receipt);
  assert.match(text, /Diskon barang/); assert.match(text, /Kembalian/); assert.match(text, /9\.000/);
});
check('struk kasbon tidak mengaku sudah lunas dan pengeluaran berlabel benar', () => {
  assert.match(buildReceiptText({ ...receipt, method: 'kasbon' }), /Belum dibayar/);
  assert.match(buildReceiptText({ ...receipt, type: 'expense' }), /Bukti pengeluaran/);
});
check('struk panjang tidak terpotong diam-diam dan kontrol cetak dibuang', () => {
  const payload = buildEscPos('A'.repeat(5000) + '\x1bINJEKSI\x1d');
  assert.equal(payload.includes('A'.repeat(5000)), true);
  assert.equal(payload.includes('\x1bINJEKSI'), false);
});
console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
