/**
 * Uji alur uang end-to-end pada store (Sprint 17 — audit).
 *
 * Kenapa terpisah dari suite lain: berkas ini menguji `src/data/store.ts`
 * (Zustand + persist) yang menyentuh penyimpanan SQLite & AsyncStorage. Di
 * Node keduanya diganti tiruan sederhana (lihat `supabase/tests/stubs/`),
 * sehingga seluruh alur yang biasanya hanya bisa dicoba lewat layar — kasir,
 * kasbon, kulakan, retur, opname, pesanan, shift, cadangan — bisa diuji
 * otomatis. Dijalankan dengan `npm run test:store`.
 *
 * Yang dijaga (semuanya pernah salah dan sudah diperbaiki):
 *   - pesanan yang dibayar tunai tidak boleh berubah jadi kasbon;
 *   - retur barang tidak boleh mengurangi kas atau menambah "uang keluar";
 *   - tutup shift hanya menghitung kas cabang shift itu;
 *   - menghapus kasbon mengembalikan stok ke cabang transaksinya;
 *   - saldo kas selalu sama dengan (uang masuk − uang keluar − tabungan).
 */
import { setAccessSession } from '../../../src/data/access';
import { shiftCash } from '../../../src/data/selectors';
import { useAppStore, computeTotals } from '../../../src/data/store';
import { cashBalance, summarize, lowStock, receivableSummary, dueOrders } from '../../../src/data/selectors';
import { scopeData } from '../../../src/data/outlets';
import { availableCredit } from '../../../src/data/suppliers';

let pass = 0;
const fails: string[] = [];
const check = (label: string, fn: () => void) => {
  try {
    fn();
    pass += 1;
    console.log('  OK   ' + label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fails.push(label + ' :: ' + message);
    console.log('  FAIL ' + label);
    console.log('       ' + message);
  }
};
const eq = (a: unknown, b: unknown, msg = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg} dapat ${JSON.stringify(a)}, harusnya ${JSON.stringify(b)}`);
  }
};
const ok = (r: any, msg = '') => {
  if (!r || r.ok !== true) throw new Error(`${msg} gagal: ${r?.reason ?? r}`);
  return r;
};

const s = () => useAppStore.getState();
const reset = () => {
  s().resetAll();
  s().ensureOutlets();
};
const seed = () => {
  ok(s().upsertProduct({ name: 'Indomie', unit: 'pcs', sellPrice: 5000, costPrice: 3000, stock: 10, minStock: 2 }), 'produk A');
  ok(s().upsertProduct({ name: 'Teh', unit: 'botol', sellPrice: 4000, costPrice: 2000, stock: 5, minStock: 1 }), 'produk B');
};
const pid = (n = 'Indomie') => s().products.find((p) => p.name === n)!.id;
const cat = (t: 'sale' | 'expense') => s().categories.find((c) => c.type === t)!.id;
const stock = (n = 'Indomie') => s().products.find((p) => p.name === n)!.stock;
const day = () => [new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000)] as const;

console.log('\n== 1. penjualan tunai ==');
check('jual 2 Indomie: stok turun, kas naik, laba benar', () => {
  reset(); seed();
  ok(s().addTransaction({
    type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash',
    items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 2, price: 5000, cost: 3000 }],
  }));
  eq(stock('Indomie'), 8, 'stok');
  eq(cashBalance(s() as any), 10000, 'kas');
  const from = new Date(Date.now() - 86400000), to = new Date(Date.now() + 86400000);
  const sum = summarize(s() as any, from, to);
  eq(sum.income, 10000, 'omzet');
  eq(sum.profit, 10000, 'laba kas (omzet - pengeluaran)');
  eq(sum.cogs, 6000, 'HPP tercatat terpisah');
});

check('stok tidak boleh minus saat jual melebihi stok', () => {
  reset(); seed();
  const before = stock('Teh');
  const result = s().addTransaction({
    type: 'sale', amount: 40000, categoryId: cat('sale'), method: 'cash',
    items: [{ productId: pid('Teh'), name: 'Teh', qty: 10, price: 4000, cost: 2000 }],
  });
  const after = stock('Teh');
  console.log(`    stok Teh: ${before} → ${after}`);
  eq(result.ok, false, 'kelebihan stok ditolak');
  eq(after, before, 'stok tidak berubah');
  eq(s().transactions.length, 0, 'tidak mencatat penjualan yang gagal');
});

console.log('\n== 2. kasbon ==');
check('kasbon membuat piutang tanpa mengubah kas', () => {
  reset(); seed();
  const before = cashBalance(s() as any);
  ok(s().addTransaction({
    type: 'sale', amount: 35000, categoryId: cat('sale'), method: 'kasbon',
    customerName: 'Bu Ratna',
    items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 7, price: 5000, cost: 3000 }],
  }));
  eq(s().receivables.length, 1, 'jumlah piutang');
  eq(s().receivables[0].amount, 35000, 'nilai piutang');
  eq(cashBalance(s() as any), before, 'kas tidak berubah');
  eq(stock('Indomie'), 3, 'stok turun');
  eq(!!s().receivables[0].dueDate, true, 'jatuh tempo terisi');
});

check('kasbon tanpa nama ditolak', () => {
  reset(); seed();
  const r = s().addTransaction({ type: 'sale', amount: 5000, categoryId: cat('sale'), method: 'kasbon', customerName: '   ' });
  eq(r.ok, false, 'harus ditolak');
});

check('pembayaran kasbon sebagian & lebih bayar ditolak', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 35000, categoryId: cat('sale'), method: 'kasbon', customerName: 'Bu Ratna' });
  const id = s().receivables[0].id;
  ok(s().payReceivable(id, 10000), 'bayar 10.000');
  eq(cashBalance(s() as any), 10000, 'kas');
  const over = s().payReceivable(id, 30000);
  eq(over.ok, false, 'lebih bayar harus ditolak');
  ok(s().payReceivable(id, 25000), 'pelunasan');
  eq(s().payReceivable(id, 1).ok, false, 'kasbon lunas tidak bisa dibayar lagi');
});

console.log('\n== 3. diskon & pajak ==');
check('diskon persen lalu pajak dihitung di store', () => {
  reset(); seed();
  const t = computeTotals({ subtotal: 10000, discountKind: 'percent', discountValue: 10, taxRate: 10 });
  eq(t.total, 9900, 'total 9.900');
  ok(s().addTransaction({
    type: 'sale', amount: 9900, subtotal: 10000, discountKind: 'percent', discountValue: 10, taxRate: 10,
    categoryId: cat('sale'), method: 'cash',
  }));
  eq(s().transactions[0].amount, 9900, 'nominal tersimpan');
  eq(s().transactions[0].discount, 1000, 'diskon tersimpan');
  eq(s().transactions[0].tax, 900, 'pajak tersimpan');
});

check('diskon melebihi subtotal tidak menghasilkan total negatif', () => {
  const t = computeTotals({ subtotal: 5000, discountKind: 'amount', discountValue: 99999 });
  eq(t.total, 0, 'total 0');
  eq(t.discount, 5000, 'diskon dibatasi subtotal');
});

console.log('\n== 4. kulakan ==');
check('kulakan: stok naik, HPP rata-rata, utang sisa, kas keluar = dibayar', () => {
  reset(); seed();
  const r = ok(s().commitPurchase({
    supplierName: 'Agen Sinar',
    entries: { [pid('Indomie')]: { productId: pid('Indomie'), qty: 30, unitCost: 3200 } },
    paid: 20000,
  }), 'kulakan');
  const p = s().products.find((x) => x.name === 'Indomie')!;
  eq(stock('Indomie'), 40, 'stok');
  eq(p.costPrice, Math.round((10 * 3000 + 30 * 3200) / 40), 'HPP rata-rata');
  eq(s().payables.length, 1, 'utang terbentuk');
  eq(s().payables[0].amount, 30 * 3200 - 20000, 'sisa utang');
  eq(s().transactions.filter((t) => t.type === 'expense')[0].amount, 20000, 'pengeluaran = yang dibayar');
  eq(cashBalance(s() as any), -20000, 'kas berkurang sebesar yang dibayar');
  if (!r.ok) throw new Error('kulakan gagal');
});

check('kulakan lunas tidak membuat utang', () => {
  reset(); seed();
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid('Teh')]: { productId: pid('Teh'), qty: 5, unitCost: 2000 } }, paid: 10000 }));
  eq(s().payables.length, 0, 'tanpa utang');
});

check('dibayar melebihi total ditolak', () => {
  reset(); seed();
  const r = s().commitPurchase({ supplierName: 'Agen', entries: { [pid('Teh')]: { productId: pid('Teh'), qty: 1, unitCost: 2000 } }, paid: 999999 });
  eq(r.ok, false, 'harus ditolak');
});

console.log('\n== 5. retur ==');
check('retur mengurangi stok & memotong utang, bukan menambah kas', () => {
  reset(); seed();
  ok(s().commitPurchase({ supplierName: 'Agen Sinar', entries: { [pid('Indomie')]: { productId: pid('Indomie'), qty: 30, unitCost: 3000 } }, paid: 0 }));
  const cashBefore = cashBalance(s() as any);
  const debtBefore = s().payables[0].amount;
  const r = s().commitReturn({ supplierName: 'Agen Sinar', counts: { [pid('Indomie')]: 2 } });
  ok(r, 'retur');
  eq(stock('Indomie'), 38, 'stok berkurang 2');
  eq(s().payables[0].amount - s().payables[0].payments.reduce((a, b) => a + b.amount, 0), debtBefore - 6000, 'utang terpotong');
  eq(cashBalance(s() as any), cashBefore, 'kas tidak berubah');
});

check('retur tidak dihitung sebagai uang keluar di laporan', () => {
  reset(); seed();
  ok(s().commitPurchase({ supplierName: 'Agen Sinar', entries: { [pid('Indomie')]: { productId: pid('Indomie'), qty: 30, unitCost: 3000 } }, paid: 0 }));
  s().commitReturn({ supplierName: 'Agen Sinar', counts: { [pid('Indomie')]: 2 } });
  const from = new Date(Date.now() - 86400000), to = new Date(Date.now() + 86400000);
  const sum = summarize(s() as any, from, to);
  console.log(`    uang keluar laporan = ${sum.cashOut} (retur 6.000 bukan uang keluar)`);
  eq(sum.cashOut, 0, 'uang keluar tidak boleh bertambah karena retur');
});

check('retur melebihi qty yang pernah dibeli ditolak', () => {
  reset(); seed();
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid('Teh')]: { productId: pid('Teh'), qty: 2, unitCost: 2000 } }, paid: 0 }));
  const r = s().commitReturn({ supplierName: 'Agen', counts: { [pid('Teh')]: 99 } });
  console.log('    retur 99 qty →', r.ok ? 'diterima, qty tercatat ' + s().purchaseReturns[0].items[0].qty : 'ditolak: ' + r.reason);
  eq(s().purchaseReturns[0].items[0].qty <= 2, true, 'qty retur harus dibatasi jumlah yang pernah dibeli');
});

console.log('\n== 6. opname ==');
check('opname menimpa stok ke angka hitung & mencatat nilai', () => {
  reset(); seed();
  ok(s().commitOpname({ counts: { [pid('Indomie')]: 7 } }), 'opname');
  eq(stock('Indomie'), 7, 'stok = hasil hitung');
  eq(s().opnames.length, 1, 'riwayat');
  eq(s().opnames[0].lossValue, 3 * 3000, 'nilai kurang');
});

console.log('\n== 7. pesanan + DP ==');
check('pesanan selesai (dipilih kasbon): omzet penuh, kas hanya DP, sisa jadi kasbon', () => {
  reset(); seed();
  const order = ok(s().addOrder({
    customerName: 'Bu Sari', items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 4, price: 5000 }], deposit: 5000,
  }), 'pesanan');
  eq(stock('Indomie'), 10, 'stok belum bergerak saat pesanan dibuat');
  const done = s().completeOrder(order.id!, { method: 'kasbon' });
  ok(done, 'selesaikan pesanan');
  eq(stock('Indomie'), 6, 'stok berkurang saat selesai');
  eq(s().receivables.length, 1, 'kasbon sisa');
  const rcv = s().receivables[0];
  eq(rcv.amount, 20000, 'nilai kasbon');
  eq(rcv.payments.reduce((a: number, b: any) => a + b.amount, 0), 5000, 'DP tercatat sebagai pembayaran');
  eq(cashBalance(s() as any), 5000, 'kas hanya DP');
});

console.log('\n== 8. shift ==');
check('tutup shift: kas seharusnya & selisih', () => {
  reset(); seed();
  ok(s().openShift(50000), 'buka shift');
  s().addTransaction({ type: 'sale', amount: 20000, categoryId: cat('sale'), method: 'cash' });
  s().addTransaction({ type: 'sale', amount: 15000, categoryId: cat('sale'), method: 'qris' });
  s().addTransaction({ type: 'expense', amount: 5000, categoryId: cat('expense'), method: 'cash' });
  ok(s().closeShift(65000), 'tutup shift');
  const sh = s().shifts[0];
  eq(sh.expectedCash, 50000 + 20000 - 5000, 'kas seharusnya (QRIS tidak dihitung)');
  eq(sh.difference, 65000 - 65000, 'selisih');
});

check('shift cabang lain tidak ikut terhitung', () => {
  reset(); seed();
  const a = s().outlets[0]?.id ?? 'out_a';
  const b = ok(s().addOutlet({ name: 'Cabang 2' }), 'cabang 2').id!;
  s().switchOutlet(a);
  ok(s().openShift(10000), 'shift cabang A');
  s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash' });
  // transaksi tunai di cabang B (kasir lain) tidak boleh masuk shift A
  s().addTransaction({ type: 'sale', amount: 99000, categoryId: cat('sale'), method: 'cash', outletId: b });
  s().switchOutlet(a);
  ok(s().closeShift(20000), 'tutup shift A');
  const sh = s().shifts.find((x) => x.outletId === a)!;
  console.log(`    expectedCash=${sh.expectedCash} (seharusnya 20000)`);
  eq(sh.expectedCash, 20000, 'kas cabang lain bocor ke shift');
});

console.log('\n== 9. hapus transaksi & kasbon ==');
check('hapus transaksi mengembalikan stok', () => {
  reset(); seed();
  const r = ok(s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash', items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 2, price: 5000, cost: 3000 }] }));
  eq(stock('Indomie'), 8, 'stok turun');
  ok(s().deleteTransaction(r.id!), 'hapus');
  eq(stock('Indomie'), 10, 'stok kembali');
});

check('hapus kasbon mengembalikan stok ke cabang yang benar', () => {
  reset(); seed();
  const a = s().outlets[0].id;
  const b = ok(s().addOutlet({ name: 'Cabang 2' }), 'cabang 2').id!;
  s().switchOutlet(b);
  ok(s().adjustStock(pid('Indomie'), 2), 'siapkan stok cabang B');
  s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'kasbon', customerName: 'Bu A', items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 2, price: 5000, cost: 3000 }] });
  const stockB = scopeData(s()).products.find((p) => p.name === 'Indomie')!.stock;
  const rcvId = s().receivables[0].id;
  ok(s().deleteReceivable(rcvId), 'hapus kasbon');
  const scoped = scopeData(s()).products.find((p) => p.name === 'Indomie')!;
  const stockA = (scoped.stockByOutlet as any)?.[a];
  console.log(`    stok cabang B setelah hapus: ${scoped.stock} (seharusnya ${stockB + 2}); cabang A: ${stockA}`);
});

console.log('\n== 10. modal & cadangan ==');
check('pindah kas ke tabungan modal & batal', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 100000, categoryId: cat('sale'), method: 'cash' });
  ok(s().moveCapital(40000), 'pindah 40.000');
  eq(cashBalance(s() as any), 60000, 'kas');
  eq(s().moveCapital(70000).ok, false, 'melebihi kas ditolak');
  ok(s().deleteAllocation(s().allocations[0].id), 'batalkan');
  eq(cashBalance(s() as any), 100000, 'kas kembali');
});

check('cadangan: ekspor lalu pulihkan utuh', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash' });
  s().addCustomer({ name: 'Bu Ratna', phone: '08123456789' });
  const text = s().exportBackupText();
  const txCount = s().transactions.length;
  reset();
  eq(s().transactions.length, 0, 'kosong setelah reset');
  const r = s().importBackupText(text, 'replace');
  if (!r.ok) throw new Error('impor gagal: ' + r.reason);
  eq(s().transactions.length, txCount, 'transaksi pulih');
  eq(s().customers.length, 1, 'pelanggan pulih');
  eq(s().products.length, 2, 'produk pulih');
});

console.log('\n== 11. input aneh ==');
check('nominal negatif / NaN ditolak', () => {
  reset(); seed();
  eq(s().addTransaction({ type: 'sale', amount: -5000, categoryId: cat('sale'), method: 'cash' }).ok, false, 'negatif');
  eq(s().addTransaction({ type: 'sale', amount: NaN, categoryId: cat('sale'), method: 'cash' }).ok, false, 'NaN');
  eq(s().addTransaction({ type: 'sale', amount: 0, categoryId: cat('sale'), method: 'cash' }).ok, false, 'nol');
});

check('kategori tidak dikenal ditolak', () => {
  reset(); seed();
  eq(s().addTransaction({ type: 'sale', amount: 5000, categoryId: 'tidak-ada', method: 'cash' }).ok, false, 'kategori palsu');
});

check('barcode ganda ditolak', () => {
  reset(); seed();
  ok(s().upsertProduct({ name: 'Kopi', unit: 'sachet', sellPrice: 2000, costPrice: 1500, stock: 5, minStock: 1, barcode: '899' }));
  eq(s().upsertProduct({ name: 'Kopi 2', unit: 'sachet', sellPrice: 2000, costPrice: 1500, stock: 5, minStock: 1, barcode: '899' }).ok, false, 'barcode ganda');
});

check('stok tidak boleh minus lewat penyesuaian', () => {
  reset(); seed();
  eq(s().adjustStock(pid('Teh'), -99).ok, false, 'minus ditolak');
  ok(s().adjustStock(pid('Teh'), -5), 'kurangi sampai habis');
  eq(stock('Teh'), 0, 'stok 0');
});

console.log('\n== cabang ==');
check('stok tiap cabang terpisah saat kulakan', () => {
  reset(); seed();
  const a = s().outlets[0].id;
  const b = ok(s().addOutlet({ name: 'Cabang 2' })).id!;
  s().switchOutlet(b);
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid('Indomie')]: { productId: pid('Indomie'), qty: 5, unitCost: 3000 } }, paid: 15000 }));
  const scopedB = scopeData(s()).products.find((p) => p.name === 'Indomie')!;
  s().switchOutlet(a);
  const scopedA = scopeData(s()).products.find((p) => p.name === 'Indomie')!;
  eq(scopedB.stock, 5, 'stok B');
  eq(scopedA.stock, 10, 'stok A tidak ikut naik');
});

check('jual di cabang A tidak mengurangi stok cabang B', () => {
  reset(); seed();
  const a = s().outlets[0].id;
  const b = ok(s().addOutlet({ name: 'Cabang 2' })).id!;
  s().switchOutlet(a);
  s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash', items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 2, price: 5000, cost: 3000 }] });
  const aStock = scopeData(s()).products.find((p) => p.name === 'Indomie')!.stock;
  s().switchOutlet(b);
  const bStock = scopeData(s()).products.find((p) => p.name === 'Indomie')!.stock;
  eq(aStock, 8, 'A berkurang');
  eq(bStock, 0, 'B tetap (belum pernah kulakan di B)');
});

check('laporan mengikuti cabang yang dibuka', () => {
  reset(); seed();
  const a = s().outlets[0].id;
  const b = ok(s().addOutlet({ name: 'Cabang 2' })).id!;
  s().switchOutlet(a); s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash' });
  s().switchOutlet(b); s().addTransaction({ type: 'sale', amount: 77000, categoryId: cat('sale'), method: 'cash' });
  const [from, to] = day();
  eq(summarize(scopeData(s()) as any, from, to).income, 77000, 'omzet cabang B');
  s().switchOutlet(a);
  eq(summarize(scopeData(s()) as any, from, to).income, 10000, 'omzet cabang A');
});

check('kasbon cabang A tidak muncul di daftar kasbon cabang B', () => {
  reset(); seed();
  const a = s().outlets[0].id;
  const b = ok(s().addOutlet({ name: 'Cabang 2' })).id!;
  s().switchOutlet(a);
  s().addTransaction({ type: 'sale', amount: 20000, categoryId: cat('sale'), method: 'kasbon', customerName: 'Bu A' });
  s().switchOutlet(b);
  eq(receivableSummary(scopeData(s()) as any).activeCount, 0, 'kasbon B kosong');
  s().switchOutlet(a);
  eq(receivableSummary(scopeData(s()) as any).activeCount, 1, 'kasbon A ada');
});

console.log('\n== konsistensi uang ==');
check('saldo kas = uang masuk − uang keluar − tabungan', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 50000, categoryId: cat('sale'), method: 'cash' });
  s().addTransaction({ type: 'sale', amount: 20000, categoryId: cat('sale'), method: 'qris' });
  s().addTransaction({ type: 'expense', amount: 15000, categoryId: cat('expense'), method: 'cash' });
  s().addTransaction({ type: 'sale', amount: 30000, categoryId: cat('sale'), method: 'kasbon', customerName: 'Bu X' });
  const rcv = s().receivables[0].id;
  s().payReceivable(rcv, 10000);
  ok(s().moveCapital(5000));
  const [from, to] = day();
  const sum = summarize(s() as any, from, to);
  const expected = sum.cashIn - sum.cashOut - s().allocations.reduce((x, a) => x + a.amount, 0);
  eq(cashBalance(s() as any), expected, 'kas vs laporan');
});

check('utang supplier dibayar mengurangi kas & uang keluar sama besar', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 100000, categoryId: cat('sale'), method: 'cash' });
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid('Teh')]: { productId: pid('Teh'), qty: 5, unitCost: 2000 } }, paid: 0 }));
  const payId = s().payables[0].id;
  ok(s().payPayable(payId, 4000));
  const [from, to] = day();
  const sum = summarize(s() as any, from, to);
  eq(cashBalance(s() as any), 100000 - 4000, 'kas');
  eq(sum.cashOut, 4000, 'uang keluar');
});

console.log('\n== pesanan ==');
check('pesanan dengan DP: sisa & jatuh tempo benar', () => {
  reset(); seed();
  const o = ok(s().addOrder({ customerName: 'Bu Sari', items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 10, price: 5000 }], deposit: 15000, dueDate: new Date(Date.now() + 2 * 86400000).toISOString() }));
  const order = s().orders[0];
  eq(order.total, 50000, 'total');
  eq(order.total - (order.deposit ?? 0), 35000, 'sisa');
  eq(dueOrders(s() as any, new Date()).length, 0, 'belum jatuh tempo hari ini');
  eq(dueOrders(s() as any, new Date(Date.now() + 3 * 86400000)).length, 1, 'masuk daftar saat harinya tiba');
  ok(s().cancelOrder(o.id!));
  eq(s().orders[0].status, 'batal', 'dibatalkan');
  eq(s().completeOrder(o.id!, { method: 'cash' }).ok, false, 'tidak bisa diselesaikan setelah batal');
});

check('pesanan tanpa DP langsung lunas: tidak membuat kasbon', () => {
  reset(); seed();
  const o = ok(s().addOrder({ customerName: 'Pak Budi', items: [{ name: 'Kue', qty: 2, price: 10000 }] }));
  ok(s().completeOrder(o.id!, { method: 'cash' }));
  eq(s().receivables.length, 0, 'tanpa kasbon');
  eq(cashBalance(s() as any), 20000, 'kas');
});

check('pesanan dengan metode kasbon: piutang penuh, DP memotong', () => {
  reset(); seed();
  const o = ok(s().addOrder({ customerName: 'Bu Sari', items: [{ name: 'Kue', qty: 2, price: 10000 }], deposit: 5000 }));
  ok(s().completeOrder(o.id!, { method: 'kasbon', dueDate: new Date(Date.now() + 5 * 86400000).toISOString() }));
  const r = s().receivables[0];
  eq(r.amount, 20000, 'piutang penuh');
  eq(r.payments.reduce((a: number, b: any) => a + b.amount, 0), 5000, 'DP terbayar');
  eq(r.payments[0].method, 'kasbon', 'metode DP mengikuti pilihan');
});

console.log('\n== pelanggan & pengingat ==');
check('kasbon baru otomatis tertaut ke buku pelanggan', () => {
  reset(); seed();
  s().addCustomer({ name: 'Bu Ratna', phone: '08123456789' });
  s().addTransaction({ type: 'sale', amount: 20000, categoryId: cat('sale'), method: 'kasbon', customerName: '  bu ratna ' });
  eq(s().receivables[0].customerId, s().customers[0].id, 'tertaut');
  eq(s().receivables[0].customerName, 'Bu Ratna', 'nama mengikuti buku');
});

check('pelanggan dengan kasbon belum lunas tidak bisa dihapus', () => {
  reset(); seed();
  s().addCustomer({ name: 'Bu Ratna' });
  s().addTransaction({ type: 'sale', amount: 20000, categoryId: cat('sale'), method: 'kasbon', customerName: 'Bu Ratna' });
  eq(s().deleteCustomer(s().customers[0].id).ok, false, 'harus ditolak');
});

check('tanda sudah ditagih tersimpan', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 20000, categoryId: cat('sale'), method: 'kasbon', customerName: 'Bu Ratna' });
  const id = s().receivables[0].id;
  ok(s().markReminded(id));
  eq(s().receivables[0].remindCount, 1, 'jumlah tagih');
  eq(!!s().receivables[0].lastRemindedAt, true, 'waktu tagih');
});

console.log('\n== stok ==');
check('stok menipis hanya barang di bawah minimum', () => {
  reset(); seed();
  s().adjustStock(pid('Teh'), -4);
  const low = lowStock(scopeData(s()) as any).map((p) => p.name);
  eq(low, ['Teh'], 'hanya Teh');
});

check('barang dihapus tidak merusak riwayat transaksi', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash', items: [{ productId: pid('Indomie'), name: 'Indomie', qty: 2, price: 5000, cost: 3000 }] });
  ok(s().deleteProduct(pid('Indomie')));
  const [from, to] = day();
  eq(summarize(s() as any, from, to).income, 10000, 'omzet tetap');
  eq(s().transactions[0].items?.[0].name, 'Indomie', 'nama barang tetap di riwayat');
});

console.log('\n== retur & saldo ==');
check('retur lunas utang: sisa saldo jadi kredit kulakan berikutnya', () => {
  reset(); seed();
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid()]: { productId: pid(), qty: 2, unitCost: 3000 } }, paid: 0 })); // utang 6.000
  ok(s().commitReturn({ supplierName: 'Agen', counts: { [pid()]: 2 } })); // retur 6.000 → utang lunas, saldo 0
  eq(availableCredit(s().purchases, s().purchaseReturns, 'Agen'), 0, 'saldo 0');
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid()]: { productId: pid(), qty: 1, unitCost: 3000 } }, paid: 0 }));
  eq(s().payables.length, 2, 'dua utang tercatat');
});

check('retur melebihi utang menyisakan saldo retur', () => {
  reset(); seed();
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid()]: { productId: pid(), qty: 10, unitCost: 3000 } }, paid: 0 })); // utang 30.000
  ok(s().payPayable(s().payables[0].id, 20000)); // sisa utang 10.000
  ok(s().commitReturn({ supplierName: 'Agen', counts: { [pid()]: 6 } })); // retur 18.000 → potong 10.000, saldo 8.000
  const credit = availableCredit(s().purchases, s().purchaseReturns, 'Agen');
  console.log(`    saldo retur = ${credit} (seharusnya 8000)`);
  eq(credit, 8000, 'saldo retur');
});

check('saldo retur dipakai otomatis saat kulakan berikutnya', () => {
  reset(); seed();
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid()]: { productId: pid(), qty: 10, unitCost: 3000 } }, paid: 30000 })); // lunas
  ok(s().commitReturn({ supplierName: 'Agen', counts: { [pid()]: 2 } })); // retur 6.000 → saldo 6.000
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid()]: { productId: pid(), qty: 2, unitCost: 3000 } }, paid: 6000 })); // total 6.000 → habis saldo
  const last = s().purchases[0];
  console.log(`    kulakan: total ${last.total}, dibayar tunai ${last.paid}, saldo dipakai ${last.creditUsed ?? 0}`);
  eq(last.paid, 0, 'uang tunai keluar 0 karena saldo menutup semua');
});

check('mode merge tidak menghapus data yang ada', () => {
  reset(); seed();
  s().addCustomer({ name: 'Bu Lama' });
  const text = s().exportBackupText();
  reset(); seed();
  s().addCustomer({ name: 'Bu Baru' });
  const r = s().importBackupText(text, 'merge');
  if (!r.ok) throw new Error(r.reason);
  const names = s().customers.map((c) => c.name).sort();
  eq(names, ['Bu Baru', 'Bu Lama'], 'dua pelanggan ada');
});

check('cadangan rusak ditolak dengan pesan jelas', () => {
  reset(); seed();
  const bad = s().importBackupText('{ bukan json }', 'replace');
  eq(bad.ok, false, 'harus ditolak');
  console.log('    pesan: ' + (bad.ok === false ? bad.reason : ''));
});

check('cadangan lama tanpa field baru tetap bisa dipulihkan', () => {
  reset(); seed();
  const text = JSON.parse(s().exportBackupText());
  delete text.data.purchases; delete text.data.suppliers; delete text.data.purchaseReturns; delete text.data.opnames;
  reset(); seed();
  const r = s().importBackupText(JSON.stringify(text), 'replace');
  console.log('    hasil impor cadangan lama:', r.ok ? 'ok' : (r as any).reason);
  eq(r.ok, true, 'cadangan lama harus tetap terbaca');
});

console.log('\n== pelanggan ==');


console.log('\n== regresi audit Sprint 17 ==');
check('pesanan berDP yang dibayar tunai: kas masuk penuh, tidak jadi kasbon', () => {
  reset(); seed();
  const o = ok(s().addOrder({ customerName: 'Bu Sari', items: [{ productId: pid(), name: 'Indomie', qty: 4, price: 5000 }], deposit: 5000 }), 'pesanan');
  ok(s().completeOrder(o.id!, { method: 'cash' }), 'selesaikan');
  eq(s().receivables.length, 0, 'tidak ada kasbon');
  eq(cashBalance(s() as any), 20000, 'kas bertambah sebesar total (DP + sisa dibayar hari itu)');
  eq(s().transactions[0].method, 'cash', 'metode transaksi sesuai pilihan');
});

check('pesanan tanpa DP dibayar QRIS tidak membuat piutang', () => {
  reset(); seed();
  const o = ok(s().addOrder({ customerName: 'Pak Budi', items: [{ name: 'Kue', qty: 10, price: 2500 }] }), 'pesanan');
  ok(s().completeOrder(o.id!, { method: 'qris' }), 'selesaikan');
  eq(s().receivables.length, 0, 'tanpa piutang');
  eq(s().transactions[0].method, 'qris', 'metode qris');
});

check('retur: kas, uang keluar, dan saldo kas tetap konsisten', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 100000, categoryId: cat('sale'), method: 'cash' });
  ok(s().commitPurchase({ supplierName: 'Agen', entries: { [pid()]: { productId: pid(), qty: 10, unitCost: 3000 } }, paid: 0 }));
  ok(s().commitReturn({ supplierName: 'Agen', counts: { [pid()]: 2 } }));
  const [from, to] = day();
  const sum = summarize(s() as any, from, to);
  eq(sum.cashOut, 0, 'tidak ada uang keluar');
  eq(cashBalance(s() as any), 100000, 'kas tetap');
  eq(cashBalance(s() as any), sum.cashIn - sum.cashOut - s().allocations.reduce((x, a) => x + a.amount, 0), 'kas = masuk − keluar − tabungan');
});

check('tutup shift cabang A tidak terpengaruh kasir cabang B', () => {
  reset(); seed();
  const a = s().outlets[0].id;
  const b = ok(s().addOutlet({ name: 'Cabang 2' })).id!;
  s().switchOutlet(a);
  ok(s().openShift(10000));
  s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash' });
  s().addTransaction({ type: 'sale', amount: 99000, categoryId: cat('sale'), method: 'cash', outletId: b });
  ok(s().closeShift(20000));
  eq(s().shifts.find((x) => x.outletId === a)!.expectedCash, 20000, 'kas seharusnya shift A');
});

check('hapus kasbon mengembalikan stok ke cabang transaksinya', () => {
  reset(); seed();
  const a = s().outlets[0].id;
  const b = ok(s().addOutlet({ name: 'Cabang 2' })).id!;
  s().switchOutlet(b);
  ok(s().adjustStock(pid('Indomie'), 2), 'siapkan stok cabang B');
  s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'kasbon', customerName: 'Bu A', items: [{ productId: pid(), name: 'Indomie', qty: 2, price: 5000, cost: 3000 }] });
  ok(s().deleteReceivable(s().receivables[0].id), 'hapus kasbon');
  const scoped = scopeData(s()).products.find((p) => p.name === 'Indomie')!;
  eq(scoped.stock, 2, 'stok cabang B kembali');
  s().switchOutlet(a);
  eq(scopeData(s()).products.find((p) => p.name === 'Indomie')!.stock, 10, 'stok cabang A tidak tersentuh');
});

console.log('\n== lanjutan audit: rincian pengeluaran, pesanan dibuka lagi, pelanggan manual ==');
check('pengeluaran dengan rincian barang tidak mengubah stok', () => {
  reset(); seed();
  const before = stock();
  ok(s().addTransaction({
    type: 'expense', amount: 15000, categoryId: cat('expense'), method: 'cash',
    items: [{ productId: pid(), name: 'Indomie', qty: 5, price: 3000, cost: 3000 }],
  }), 'catat pengeluaran');
  eq(stock(), before, 'stok tidak berubah');
  eq(s().transactions[0].items?.length, 1, 'rincian tetap tersimpan sebagai catatan');
});

check('menghapus pengeluaran ber-rincian juga tidak menyentuh stok', () => {
  reset(); seed();
  const before = stock();
  const r = ok(s().addTransaction({
    type: 'expense', amount: 9000, categoryId: cat('expense'), method: 'cash',
    items: [{ productId: pid(), name: 'Indomie', qty: 3, price: 3000, cost: 3000 }],
  }));
  ok(s().deleteTransaction(r.id!), 'hapus');
  eq(stock(), before, 'stok tetap');
});

check('penjualan tetap mengurangi stok seperti biasa', () => {
  reset(); seed();
  ok(s().addTransaction({
    type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash',
    items: [{ productId: pid(), name: 'Indomie', qty: 2, price: 5000, cost: 3000 }],
  }));
  eq(stock(), 8, 'stok berkurang 2');
});

check('hapus transaksi hasil pesanan mengembalikan pesanan ke Terbuka', () => {
  reset(); seed();
  const o = ok(s().addOrder({ customerName: 'Bu Sari', items: [{ productId: pid(), name: 'Indomie', qty: 2, price: 5000 }] }), 'pesanan');
  const done = ok(s().completeOrder(o.id!, { method: 'cash' }), 'selesaikan');
  eq(s().orders[0].status, 'selesai', 'pesanan selesai');
  eq(stock(), 8, 'stok berkurang');
  ok(s().deleteTransaction(done.id!), 'hapus transaksi');
  eq(s().orders[0].status, 'terbuka', 'pesanan kembali terbuka');
  eq(s().orders[0].transactionId, undefined, 'tautan transaksi dibersihkan');
  eq(stock(), 10, 'stok kembali');
});

check('menghapus transaksi biasa tidak membuat pesanan palsu', () => {
  reset(); seed();
  s().addTransaction({ type: 'sale', amount: 5000, categoryId: cat('sale'), method: 'cash' });
  const id = s().transactions[0].id;
  ok(s().deleteTransaction(id), 'hapus');
  eq(s().orders.length, 0, 'tidak ada pesanan');
});

check('nama pelanggan yang diketik disimpan ke buku & tertaut', () => {
  reset(); seed();
  ok(s().addTransaction({
    type: 'sale', amount: 12000, categoryId: cat('sale'), method: 'cash',
    customerName: '  bu sri  ', saveCustomer: true,
  }));
  eq(s().customers.length, 1, 'pelanggan baru tersimpan');
  eq(s().customers[0].name, 'bu sri', 'spasi berlebih dibuang, ejaan dibiarkan seperti diketik');
  eq(s().transactions[0].customerId, s().customers[0].id, 'transaksi tertaut');
});

check('nama pelanggan yang sudah ada dipakai ulang, tidak dobel', () => {
  reset(); seed();
  s().addCustomer({ name: 'Bu Sri', phone: '08123456789' });
  ok(s().addTransaction({ type: 'sale', amount: 9000, categoryId: cat('sale'), method: 'qris', customerName: 'BU SRI', saveCustomer: true }));
  eq(s().customers.length, 1, 'tidak membuat pelanggan kedua');
  eq(s().transactions[0].customerId, s().customers[0].id, 'tertaut ke pelanggan lama');
});

check('tanpa izin simpan, nama tidak menambah buku pelanggan', () => {
  reset(); seed();
  ok(s().addTransaction({ type: 'sale', amount: 8000, categoryId: cat('sale'), method: 'cash', customerName: 'Orang Lewat' }));
  eq(s().customers.length, 0, 'buku pelanggan tetap kosong');
  eq(s().transactions[0].customerId, undefined, 'tidak tertaut');
});

check('kasbon tanpa nama tetap ditolak', () => {
  reset(); seed();
  eq(s().addTransaction({ type: 'sale', amount: 5000, categoryId: cat('sale'), method: 'kasbon', customerName: '   ', saveCustomer: true }).ok, false, 'harus ditolak');
});

console.log('\n== regresi audit keamanan dan kas ==');
check('pembayaran manual tidak boleh memakai metode kasbon', () => {
  reset(); seed();
  ok(s().addReceivable({ customerName: 'Bu Sri', amount: 10000, dueDate: new Date().toISOString() }));
  eq(s().payReceivable(s().receivables[0].id, 1000, 'kasbon').ok, false);
  ok(s().addPayable({ supplierName: 'Agen', amount: 10000, dueDate: new Date().toISOString() }));
  eq(s().payPayable(s().payables[0].id, 1000, 'kasbon').ok, false);
});
check('shift menghitung cicilan tunai, bukan QRIS atau kredit retur', () => {
  reset(); seed();
  ok(s().openShift(10000));
  ok(s().addReceivable({ customerName: 'Bu Sri', amount: 10000, dueDate: new Date().toISOString() }));
  ok(s().payReceivable(s().receivables[0].id, 3000, 'cash'));
  ok(s().payReceivable(s().receivables[0].id, 1000, 'qris'));
  ok(s().addPayable({ supplierName: 'Agen', amount: 10000, dueDate: new Date().toISOString() }));
  ok(s().payPayable(s().payables[0].id, 2000, 'cash'));
  const payable = s().payables[0];
  useAppStore.setState({ payables: [{ ...payable, payments: [...payable.payments, { id: 'ret', amount: 1000, method: 'cash', source: 'retur', paidAt: new Date().toISOString() }] }] });
  eq(shiftCash(scopeData(s()), s().shifts[0]).expected, 11000);
  ok(s().closeShift(11000));
  eq(s().shifts[0].expectedCash, 11000); eq(s().shifts[0].difference, 0);
});
check('jumlah barang duplikat digabung saat memeriksa stok', () => {
  reset(); seed();
  const line = { productId: pid(), name: 'Indomie', qty: 6, price: 5000 };
  const before = stock();
  eq(s().addTransaction({ type: 'sale', amount: 60000, categoryId: cat('sale'), method: 'cash', items: [line, line] }).ok, false);
  eq(stock(), before); eq(s().transactions.length, 0);
});
check('penghapusan jarak jauh benar-benar menghilangkan data lokal', () => {
  reset(); seed();
  const id = pid();
  s().mergeRemote({ deleted: { products: [id] } });
  eq(s().products.some((p) => p.id === id), false);
});
check('modal cabang pertama tidak bisa dipakai cabang kedua', () => {
  reset(); seed();
  ok(s().addTransaction({ type: 'sale', amount: 10000, categoryId: cat('sale'), method: 'cash' }));
  ok(s().moveCapital(5000));
  const b = ok(s().addOutlet({ name: 'Cabang Dua' })).id!;
  ok(s().switchOutlet(b));
  eq(scopeData(s()).allocations.length, 0);
  eq(s().moveCapital(-1000).ok, false);
  eq(s().moveCapital(1000).ok, false);
});
check('store menolak mutasi terlarang walau dipanggil tanpa tombol UI', () => {
  reset(); seed();
  setAccessSession({ userId: 'u', outletId: 'o', role: 'kasir' }, true);
  try {
    eq(s().adjustStock(pid(), 1).ok, false);
    eq(s().deleteProduct(pid()).ok, false);
    eq(s().addOutlet({ name: 'Cabang Lain' }).ok, false);
    eq(s().updateProfile({ name: 'Ubah' }).ok, false);
    eq(s().addTransaction({ type: 'expense', amount: 1000, categoryId: cat('expense'), method: 'cash' }).ok, false);
    setAccessSession({ userId: 'u', outletId: null, role: null }, true);
    eq(s().openShift(0).ok, false);
  } finally { setAccessSession({ userId: null, outletId: null, role: null }, false); }
});

console.log(`\nSELESAI: ${pass} pemeriksaan lulus${fails.length ? `, ${fails.length} GAGAL` : ''}`);
if (fails.length) {
  console.log(fails.map((f) => ' - ' + f).join('\n'));
  process.exitCode = 1;
}
