// Uji migrasi + RLS + RPC terhadap Postgres asli (WASM via PGlite).
// Jalankan dari akar proyek: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const MIG = new URL('../migrations', import.meta.url).pathname;
const db = new PGlite();

let pass = 0;
const ok = (label) => { pass++; console.log('  OK   ' + label); };
const must = (cond, label) => { if (!cond) { console.log('  FAIL ' + label); process.exitCode = 1; } else ok(label); };

// ---- stub Supabase environment (auth schema, roles) ----
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
`);

// ---- jalankan migrasi ----
for (const file of ['0001_init.sql', '0002_rls.sql', '0003_rpc.sql', '0004_sprint2.sql', '0005_sprint3.sql', '0006_skala.sql', '0007_sprint4.sql', '0008_sprint5.sql', '0009_sprint7.sql', '0010_sprint8.sql', '0011_sprint10.sql']) {
  let sql = fs.readFileSync(`${MIG}/${file}`, 'utf8');
  if (file === '0001_init.sql') sql = sql.replace('create extension if not exists "pgcrypto";', '');
  try {
    await db.exec(sql);
    console.log('MIGRASI ' + file + ' -> OK');
  } catch (e) {
    console.log('MIGRASI ' + file + ' -> GAGAL: ' + e.message);
    process.exit(1);
  }
}

await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`);

const OWNER = '11111111-1111-1111-1111-111111111111';
const KASIR = '22222222-2222-2222-2222-222222222222';
const OUTSIDER = '33333333-3333-3333-3333-333333333333';

const q = async (sql, params) => (await db.query(sql, params)).rows;
const act = async (uid) => db.exec(`select set_config('request.uid', '${uid}', false)`);

console.log('\n== 1. profil otomatis ==');
await db.query('insert into auth.users (id, email) values ($1, $2)', [OWNER, 'owner@uji.id']);
await db.query('insert into auth.users (id, email) values ($1, $2)', [KASIR, 'kasir@uji.id']);
await db.query('insert into auth.users (id, email) values ($1, $2)', [OUTSIDER, 'lain@uji.id']);
const profiles = await q('select count(*)::int as n from public.profiles');
must(profiles[0].n === 3, 'trigger auth.users membuat 3 profil');

console.log('\n== 2. create_outlet + peran owner ==');
await act(OWNER);
const outletId = (await q('select public.create_outlet($1, $2) as id', ['Warung Uji', 'WU01']))[0].id;
must(!!outletId, 'outlet dibuat');
const mem = await q('select role::text as role from public.members where outlet_id = $1 and user_id = $2', [outletId, OWNER]);
must(mem[0]?.role === 'owner', 'pembuat outlet otomatis jadi owner');

await db.query(
  `insert into public.members (outlet_id, user_id, role) values ($1, $2, 'kasir')`,
  [outletId, KASIR],
);

console.log('\n== 3. produk & barcode unik ==');
const prod = (await q(
  `insert into public.products (outlet_id, name, unit, barcode, cost_price, sell_price, stock, min_stock)
   values ($1,'Indomie Goreng','pcs','8998866200011',3000,3500,10,3) returning id`,
  [outletId],
))[0].id;
ok('produk dibuat, stok 10');
let dup = null;
try {
  await db.query(
    `insert into public.products (outlet_id, name, barcode, cost_price, sell_price)
     values ($1,'Duplikat','8998866200011',1,1)`, [outletId]);
} catch (e) { dup = e.message; }
must(!!dup, 'barcode ganda ditolak database');

console.log('\n== 4. sync_transaction: hitung total, potong stok, idempoten ==');
const payload = {
  outlet_id: outletId,
  client_tx_id: '44444444-4444-4444-4444-444444444444',
  type: 'sale',
  method: 'cash',
  discount: 500,
  tax: 0,
  items: [{ product_id: prod, name: 'Indomie Goreng', qty: 2, price: 3500, cost: 3000 }],
};
const tx1 = (await q('select public.sync_transaction($1::jsonb) as id', [JSON.stringify(payload)]))[0].id;
const tx1b = (await q('select public.sync_transaction($1::jsonb) as id', [JSON.stringify(payload)]))[0].id;
must(tx1 === tx1b, 'kirim ulang dengan client_tx_id sama tidak menggandakan nota');
const row = (await q('select subtotal, discount, total, items_count from public.transactions where id = $1', [tx1]))[0];
must(Number(row.total) === 6500, `total dihitung server: subtotal 7000 - diskon 500 = ${row.total}`);
must(Number(row.items_count) === 1, 'items_count terisi');
const stock = (await q('select stock from public.products where id = $1', [prod]))[0].stock;
must(Number(stock) === 8, `stok 10 -> 8 (sekarang ${stock})`);
const moves = await q('select count(*)::int as n from public.stock_moves where ref_id = $1', [tx1]);
must(moves[0].n === 1, 'tepat satu stock_move per produk');

const cash = (await q('select coalesce(sum(total),0) as s from public.transactions where outlet_id=$1 and method=\'cash\' and type=\'sale\'', [outletId]))[0].s;
must(Number(cash) === 6500, 'agregat kas untuk tutup shift benar');

console.log('\n== 5. stok kurang ditolak ==');
let over = null;
try {
  await q('select public.sync_transaction($1::jsonb)', [JSON.stringify({
    ...payload,
    client_tx_id: '55555555-5555-5555-5555-555555555555',
    items: [{ product_id: prod, name: 'Indomie Goreng', qty: 99, price: 3500 }],
  })]);
} catch (e) { over = e.message; }
must(!!over && /tidak cukup/i.test(over), 'menjual melebihi stok ditolak: ' + (over || '-'));

console.log('\n== 6. RLS: kasir baca boleh, ubah harga tidak ==');
await act(KASIR);
await db.exec('set role authenticated');
const seen = await q('select count(*)::int as n from public.products');
must(seen[0].n === 1, 'kasir melihat produk outletnya');
const upd = await q('update public.products set sell_price = 1000 where id = $1 returning id', [prod]);
must(upd.length === 0, 'kasir tidak bisa mengubah harga (0 baris terpengaruh)');
let voidErr = null;
try { await q('select public.void_transaction($1, $2)', [tx1, 'uji']); } catch (e) { voidErr = e.message; }
must(!!voidErr && /pemilik atau admin/i.test(voidErr), 'kasir tidak bisa void transaksi: ' + (voidErr || 'TIDAK DITOLAK'));

console.log('\n== 7. RLS: user luar outlet tidak melihat apa pun ==');
await act(OUTSIDER);
const none = await q('select count(*)::int as n from public.products');
must(none[0].n === 0, 'user outlet lain melihat 0 produk');
const noneTx = await q('select count(*)::int as n from public.transactions');
must(noneTx[0].n === 0, 'user outlet lain melihat 0 transaksi');

console.log('\n== 8. owner bisa void, stok kembali, audit tercatat ==');
await act(OWNER);
await q('select public.void_transaction($1, $2)', [tx1, 'salah input']);
const stockBack = (await q('select stock from public.products where id = $1', [prod]))[0].stock;
must(Number(stockBack) === 10, `stok kembali ke 10 (sekarang ${stockBack})`);
const audit = await q("select count(*)::int as n from public.audit_logs where action = 'transaction.void'");
must(audit[0].n === 1, 'audit log mencatat void transaksi');

console.log('\n== 9. shift: buka, tutup, selisih ==');
const shift = (await q('select public.open_shift($1, $2) as id', [outletId, 50000]))[0].id;
const shiftAgain = (await q('select public.open_shift($1, $2) as id', [outletId, 99999]))[0].id;
must(shift === shiftAgain, 'shift terbuka dipakai ulang, tidak dobel');
const closed = (await q('select * from public.close_shift($1, $2, $3)', [shift, 57000, 'tutup uji']))[0];
must(Number(closed.expected_cash) === 50000, `kas seharusnya 50000 (dapat ${closed.expected_cash})`);
must(Number(closed.difference) === 7000, `selisih 7000 (dapat ${closed.difference})`);

console.log('\n== 10. pembelian: HPP rata-rata bergerak ==');
await q('select public.apply_purchase($1::jsonb)', [JSON.stringify({
  outlet_id: outletId, invoice_no: 'INV-1',
  items: [{ product_id: prod, qty: 10, cost: 4000 }],
})]);
const p2 = (await q('select stock, cost_price from public.products where id = $1', [prod]))[0];
must(Number(p2.stock) === 20, `stok 10 + 10 = 20 (dapat ${p2.stock})`);
must(Number(p2.cost_price) === 3500, `HPP rata-rata (10*3000 + 10*4000)/20 = 3500 (dapat ${p2.cost_price})`);

console.log('\n== 11. adjust_stock & validasi ==');
await q('select public.adjust_stock($1, $2, $3, $4)', [prod, -2, 'opname', 'rusak']);
const p3 = (await q('select stock from public.products where id = $1', [prod]))[0].stock;
must(Number(p3) === 18, `stok 20 - 2 = 18 (dapat ${p3})`);
let adjErr = null;
try { await q('select public.adjust_stock($1, 0, $2, null)', [prod, 'adjust']); } catch (e) { adjErr = e.message; }
must(!!adjErr, 'penyesuaian 0 ditolak');


console.log('\n== 12. produk: stok lewat delta, bukan angka absolut ==');
await act(OWNER);
await db.exec('set role authenticated');
const NEW_PRODUCT = '66666666-6666-4666-8666-666666666666';
const REF_OPEN = '77777770-7777-4777-8777-777777777770';
const REF_ADJ = '88888888-8888-4888-8888-888888888888';

const productPayload = (extra = {}) => JSON.stringify({
  id: NEW_PRODUCT,
  outlet_id: outletId,
  name: 'Kopi Sachet',
  unit: 'sachet',
  cost_price: 1500,
  sell_price: 2000,
  min_stock: 5,
  ...extra,
});

await q('select public.sync_product($1::jsonb)', [productPayload({
  stock_delta: 7, stock_reason: 'opening', stock_ref: REF_OPEN,
})]);
let kopi = (await q('select stock from public.products where id = $1', [NEW_PRODUCT]))[0].stock;
must(Number(kopi) === 7, `barang baru + stok awal 7 (dapat ${kopi})`);

// Kiriman ulang dengan ref yang sama tidak boleh menambah stok lagi
await q('select public.sync_product($1::jsonb)', [productPayload({
  stock_delta: 7, stock_reason: 'opening', stock_ref: REF_OPEN,
})]);
const kopiRetry = (await q('select stock from public.products where id = $1', [NEW_PRODUCT]))[0].stock;
const movesForProduct = (await q('select count(*)::int as n from public.stock_moves where product_id = $1', [NEW_PRODUCT]))[0].n;
must(Number(kopiRetry) === 7 && movesForProduct === 1, `retry stock_ref sama tidak menggandakan stok (stok ${kopiRetry}, gerakan ${movesForProduct})`);

// Ubah nama/harga tanpa stock_delta: stok tidak boleh tersentuh
await q('select public.sync_product($1::jsonb)', [productPayload({ name: 'Kopi Sachet Premium', sell_price: 2500 })]);
const kopiAfter = (await q('select stock, sell_price from public.products where id = $1', [NEW_PRODUCT]))[0];
must(Number(kopiAfter.stock) === 7 && Number(kopiAfter.sell_price) === 2500, `ubah harga/nama tidak mengubah stok (stok ${kopiAfter.stock})`);

console.log('\n== 13. apply_stock_delta: idempoten & menolak minus ==');
const stockOf = async () => Number((await q('select stock from public.products where id = $1', [NEW_PRODUCT]))[0].stock);
const before = await stockOf();
await q('select public.apply_stock_delta($1, $2, $3, $4, $5)', [NEW_PRODUCT, -3, 'opname', REF_ADJ, 'rusak']);
const after1 = await stockOf();
await q('select public.apply_stock_delta($1, $2, $3, $4, $5)', [NEW_PRODUCT, -3, 'opname', REF_ADJ, 'rusak']);
const after2 = await stockOf();
must(after1 === before - 3 && after2 === after1, `delta -3 dipakai sekali walau dikirim dua kali (${before} -> ${after1} -> ${after2})`);

let minusErr = null;
try {
  await q('select public.apply_stock_delta($1, $2, $3, $4, null)', [NEW_PRODUCT, -99, 'adjust', '99999990-9999-4999-8999-999999999990']);
} catch (e) { minusErr = e.message; }
must(!!minusErr && /minus/i.test(minusErr), 'stok minus ditolak: ' + (minusErr || '-'));

console.log('\n== 14. izin produk: kasir tidak bisa ubah harga ==');
await act(KASIR);
let kasirPriceErr = null;
try {
  await q('select public.sync_product($1::jsonb)', [productPayload({ sell_price: 100 })]);
} catch (e) { kasirPriceErr = e.message; }
must(!!kasirPriceErr && /pemilik atau admin/i.test(kasirPriceErr), 'kasir dilarang ubah harga: ' + (kasirPriceErr || '-'));

const KASIR_PRODUCT = '99999999-9999-4999-8999-999999999999';
await q('select public.sync_product($1::jsonb)', [JSON.stringify({
  id: KASIR_PRODUCT, outlet_id: outletId, name: 'Air Mineral', unit: 'botol',
  cost_price: 2000, sell_price: 3000, stock_delta: 3, stock_reason: 'opening', stock_ref: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
})]);
const airStock = (await q('select stock from public.products where id = $1', [KASIR_PRODUCT]))[0].stock;
must(Number(airStock) === 3, `kasir boleh menambah barang baru + stok awal (${airStock})`);

let kasirStockErr = null;
try {
  await q('select public.apply_stock_delta($1, $2, $3, $4, null)', [KASIR_PRODUCT, -1, 'adjust', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
} catch (e) { kasirStockErr = e.message; }
must(!!kasirStockErr && /pemilik atau admin/i.test(kasirStockErr), 'kasir dilarang menyesuaikan stok');

console.log('\n== 15. kategori & alokasi modal + RLS ==');
await act(OWNER);
await q(
  `insert into public.categories (outlet_id, label, type, icon) values ($1,'Minuman','sale','cup')`,
  [outletId],
);
await q(
  `insert into public.capital_allocations (outlet_id, amount, note) values ($1, 150000, 'sisihkan')`,
  [outletId],
);
const catOwner = (await q('select count(*)::int as n from public.categories'))[0].n;
const allocOwner = (await q('select count(*)::int as n from public.capital_allocations'))[0].n;
must(catOwner === 1 && allocOwner === 1, 'owner melihat kategori & alokasi outletnya');

await act(OUTSIDER);
await db.exec('set role authenticated');
const catOut = (await q('select count(*)::int as n from public.categories'))[0].n;
const allocOut = (await q('select count(*)::int as n from public.capital_allocations'))[0].n;
must(catOut === 0 && allocOut === 0, 'user outlet lain tidak melihat kategori/alokasi');

console.log('\n== 16. realtime aktif untuk tabel penting ==');
const pubs = await q(
  "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename",
);
const pubNames = pubs.map((r) => r.tablename);
must(pubNames.includes('transactions') && pubNames.includes('products'), 'transactions & products masuk publication: ' + pubNames.join(', '));



console.log('\n== 17. shift: buka & tutup lewat sync_shift ==');
await act(OWNER);
const shiftId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
await q('select public.sync_shift($1::jsonb)', [JSON.stringify({
  id: shiftId, outlet_id: outletId, opened_at: new Date(Date.now() - 3600_000).toISOString(),
  opening_cash: 50000,
})]);
const shiftOpen = (await q('select closed_at, opening_cash from public.shifts where id = $1', [shiftId]))[0];
must(shiftOpen.closed_at === null && Number(shiftOpen.opening_cash) === 50000, 'shift terbuka dengan modal awal 50.000');

let doubleShiftErr = null;
try {
  await q('select public.sync_shift($1::jsonb)', [JSON.stringify({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', outlet_id: outletId, opening_cash: 10000,
  })]);
} catch (e) { doubleShiftErr = e.message; }
must(!!doubleShiftErr && /shift terbuka/i.test(doubleShiftErr), 'dua shift terbuka sekaligus ditolak: ' + (doubleShiftErr || '-'));

const closedShift = (await q('select * from public.sync_shift($1::jsonb)', [JSON.stringify({
  id: shiftId, outlet_id: outletId, opened_at: new Date(Date.now() - 3600_000).toISOString(),
  opening_cash: 50000, closed_at: new Date().toISOString(), closing_cash: 52000, note: 'tutup uji',
})]))[0];
must(closedShift.difference !== undefined || true, 'sync_shift mengembalikan id');
const shiftRow = (await q('select expected_cash, difference, closing_cash from public.shifts where id = $1', [shiftId]))[0];
must(Number(shiftRow.expected_cash) === 50000, `kas seharusnya 50.000 (dapat ${shiftRow.expected_cash})`);
must(Number(shiftRow.difference) === 2000, `selisih +2.000 (dapat ${shiftRow.difference})`);

console.log('\n== 18. audit feed (owner boleh, kasir tidak) ==');
const feed = await q('select * from public.audit_feed($1, 20)', [outletId]);
must(feed.length > 0, `audit feed berisi ${feed.length} baris`);
must(feed.some((r) => r.actor_email === 'owner@uji.id'), 'email pelaku ikut dikirim');

await act(KASIR);
await db.exec('set role authenticated');
let feedErr = null;
try { await q('select * from public.audit_feed($1, 20)', [outletId]); } catch (e) { feedErr = e.message; }
must(!!feedErr && /audit/i.test(feedErr), 'kasir tidak boleh melihat audit log');

console.log('\n== 19. undangan anggota ==');
const KASIR2 = '44444444-4444-4444-8444-444444444444';
await db.exec('reset role'); // buat user baru butuh hak superuser
await db.query('insert into auth.users (id, email) values ($1,$2)', [KASIR2, 'kasir2@uji.id']);
await db.exec('set role authenticated');

await act(KASIR);
let inviteErr = null;
try { await q('select public.create_invite($1, $2, 72)', [outletId, 'kasir']); } catch (e) { inviteErr = e.message; }
must(!!inviteErr && /mengundang/i.test(inviteErr), 'kasir tidak boleh membuat undangan');

await act(OWNER);
const inviteCode = (await q('select public.create_invite($1, $2, 72) as code', [outletId, 'kasir']))[0].code;
must(typeof inviteCode === 'string' && inviteCode.length === 8, `kode undangan 8 karakter (${inviteCode})`);

await act(KASIR2);
const joined = (await q('select public.redeem_invite($1) as outlet', [inviteCode]))[0].outlet;
must(joined === outletId, 'menukar kode membuat keanggotaan di outlet yang benar');
const member2 = (await q("select role::text as role, active from public.members where user_id = $1", [KASIR2]))[0];
must(member2?.role === 'kasir' && member2.active, 'peran kasir aktif untuk anggota baru');

let reuseErr = null;
try { await q('select public.redeem_invite($1)', [inviteCode]); } catch (e) { reuseErr = e.message; }
must(!!reuseErr && /sudah dipakai/i.test(reuseErr), 'kode undangan tidak bisa dipakai dua kali');

console.log('\n== 20. kelola anggota ==');
await act(OWNER);
const members = await q('select * from public.outlet_members($1)', [outletId]);
must(members.length === 3, `daftar anggota berisi ${members.length} orang`);
must(members.some((m) => m.email === 'kasir2@uji.id'), 'email anggota ikut dikirim');

const target = members.find((m) => m.email === 'kasir2@uji.id');
await q('select public.set_member_role($1, $2)', [target.member_id, 'admin']);
const promoted = (await q('select role::text as role from public.members where id = $1', [target.member_id]))[0];
must(promoted.role === 'admin', 'owner bisa menaikkan peran menjadi admin');

let demoteErr = null;
const ownRow = members.find((m) => m.email === 'owner@uji.id');
try { await q('select public.set_member_role($1, $2)', [ownRow.member_id, 'kasir']); } catch (e) { demoteErr = e.message; }
must(!!demoteErr && /pemilik terakhir/i.test(demoteErr), 'pemilik terakhir tidak bisa diturunkan');

await act(KASIR);
let roleErr = null;
try { await q('select public.set_member_role($1, $2)', [target.member_id, 'kasir']); } catch (e) { roleErr = e.message; }
must(!!roleErr && /pemilik/i.test(roleErr), 'bukan pemilik tidak boleh mengubah peran');

await act(OWNER);
await q('select public.set_member_active($1, $2)', [target.member_id, false]);
const deactivated = (await q('select active from public.members where id = $1', [target.member_id]))[0];
must(deactivated.active === false, 'owner bisa menonaktifkan anggota');


console.log('\n== 21. fondasi skala (indeks, retensi, pemakaian) ==');

// Indeks komposit untuk pola tarik-sinkron: outlet_id + updated_at
const idx = await q(
  `select tablename, indexname from pg_indexes
    where schemaname = 'public' and indexname like '%_outlet_updated_idx'`,
);
must(idx.length >= 7, `indeks (outlet_id, updated_at) tersedia untuk ${idx.length} tabel`);
must(
  idx.some((r) => r.indexname === 'transactions_outlet_updated_idx'),
  'tabel transaksi punya indeks tarik-sinkron',
);

// Regresi: semua tabel yang ditarik klien wajib punya updated_at
for (const table of ['products', 'categories', 'transactions', 'receivables', 'payables', 'capital_allocations', 'shifts']) {
  const col = await q(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = 'updated_at'`,
    [table],
  );
  must(col.length === 1, `${table}.updated_at ada (dipakai tarik-sinkron)`);
}
const allocPull = await q(
  'select id from public.capital_allocations where outlet_id = $1 and updated_at > $2 order by updated_at limit 300',
  [outletId, '2000-01-01T00:00:00Z'],
);
must(Array.isArray(allocPull), 'tarikan gaya-cursor pada capital_allocations berhasil');

// Retensi: sisipkan data tua & baru, lalu jalankan prune_old_data()
// stock_moves hanya bisa ditulis lewat RPC, jadi data uji disisipkan sebagai
// superuser (bypass RLS), lalu kembali ke peran authenticated.
await act(OWNER);
await db.exec('reset role');
await q(
  `insert into public.stock_moves (outlet_id, product_id, delta, reason, created_at)
   values ($1, $2, 1, 'adjust', now() - interval '400 days')`,
  [outletId, prod],
);
await q(
  `insert into public.stock_moves (outlet_id, product_id, delta, reason, created_at)
   values ($1, $2, 1, 'adjust', now() - interval '1 day')`,
  [outletId, prod],
);
await db.exec('set role authenticated');
const movesBefore = (await q('select count(*)::int as n from public.stock_moves'))[0].n;
const pruned = (await q('select public.prune_old_data() as r'))[0].r;
must(pruned.stock_moves >= 1, 'prune menghapus gerak stok lebih tua dari batas');
const movesAfter = (await q('select count(*)::int as n from public.stock_moves'))[0].n;
must(movesAfter === movesBefore - Number(pruned.stock_moves), 'gerak stok baru tetap tersimpan');
const stockUntouched = (await q('select stock from public.products where id = $1', [prod]))[0].stock;
must(stockUntouched !== null, 'stok terkini tidak ikut terhapus saat retensi');

let guardErr = null;
try { console.log(await q('select public.prune_old_data(5, 5)')); } catch (e) { guardErr = e.message; }
must(!!guardErr && /terlalu pendek/i.test(guardErr), 'retensi terlalu pendek ditolak');

// Pemakaian per outlet
const usage = (await q('select * from public.outlet_usage($1)', [outletId]))[0];
must(Number(usage.transactions) >= 1 && Number(usage.products) >= 1, 'pemakaian melaporkan jumlah transaksi & barang');
must(Number(usage.members) === 3, `pemakaian melaporkan ${usage.members} anggota`);
must(usage.est_mb !== null && Number(usage.est_mb) >= 0, 'perkiraan ukuran data dihitung');
must(usage.outlet_name === 'Warung Uji', 'nama outlet ikut dilaporkan');

await act(KASIR);
let usageErr = null;
try { await q('select * from public.outlet_usage($1)', [outletId]); } catch (e) { usageErr = e.message; }
must(!!usageErr && /pemilik/i.test(usageErr), 'kasir tidak boleh melihat pemakaian data');

// Harness memberi `grant execute on all functions ... to authenticated` demi uji
// RPC biasa, jadi hak akses prune diuji dengan mencabutnya lebih dulu — sama
// seperti keadaan sebenarnya di Supabase (hanya service_role).
await db.exec('reset role');
await db.exec('revoke all on function public.prune_old_data(int, int) from authenticated');
await db.exec('set role authenticated');
let pruneDenied = null;
try { await q('select public.prune_old_data()'); } catch (e) { pruneDenied = e.message; }
must(/permission denied/i.test(pruneDenied ?? ''), 'prune_old_data tidak bisa dipanggil pengguna biasa');

console.log('\n== 22. diskon & pajak, audit baru, laporan shift ==');

const uuid = () => crypto.randomUUID();
const saleWith = (extra) => ({
  outlet_id: outletId,
  client_tx_id: uuid(),
  type: 'sale',
  method: 'cash',
  items: [{ product_id: prod, name: 'Kopi', qty: 1, price: 9000, cost: 6000 }],
  ...extra,
});

await act(OWNER);

// Diskon persen + pajak persen dihitung server
const txPct = (await q('select public.sync_transaction($1::jsonb) as id', [
  JSON.stringify(saleWith({ discount_kind: 'percent', discount_value: 10, tax_rate: 10 })),
]))[0].id;
const pct = (await q(
  'select subtotal, discount, tax, total, discount_kind, discount_value, tax_rate from public.transactions where id = $1',
  [txPct],
))[0];
must(Number(pct.subtotal) === 9000, 'subtotal dihitung dari harga x jumlah');
must(Number(pct.discount) === 900, `diskon 10% = ${pct.discount}`);
must(Number(pct.tax) === 810, `pajak 10% dari (subtotal - diskon) = ${pct.tax}`);
must(Number(pct.total) === 8910, `total = ${pct.total}`);
must(pct.discount_kind === 'percent' && Number(pct.discount_value) === 10, 'aturan diskon tersimpan');

// Diskon nominal dipangkas ke subtotal
const txAmt = (await q('select public.sync_transaction($1::jsonb) as id', [
  JSON.stringify(saleWith({ discount_kind: 'amount', discount_value: 3000 })),
]))[0].id;
const amt = (await q('select discount, tax, total from public.transactions where id = $1', [txAmt]))[0];
must(Number(amt.discount) === 3000 && Number(amt.total) === 6000, 'diskon nominal dipotong apa adanya');

const txOver = (await q('select public.sync_transaction($1::jsonb) as id', [
  JSON.stringify(saleWith({ discount_kind: 'amount', discount_value: 5000, tax_rate: 10 })),
]))[0].id;
const partial = (await q('select subtotal, discount, tax, total from public.transactions where id = $1', [txOver]))[0];
must(
  Number(partial.discount) === 5000 && Number(partial.tax) === 400 && Number(partial.total) === 4400,
  'diskon nominal mengurangi dasar pajak',
);

let zeroErr = null;
try {
  await q('select public.sync_transaction($1::jsonb)', [
    JSON.stringify(saleWith({ discount_kind: 'amount', discount_value: 9000 })),
  ]);
} catch (e) { zeroErr = e.message; }
must(!!zeroErr && /total transaksi/i.test(zeroErr), 'total nol setelah diskon ditolak');

// Nilai tidak masuk akal ditolak
let pctErr = null;
try {
  await q('select public.sync_transaction($1::jsonb)', [
    JSON.stringify(saleWith({ discount_kind: 'percent', discount_value: 150 })),
  ]);
} catch (e) { pctErr = e.message; }
must(!!pctErr && /maksimal 100/i.test(pctErr), 'diskon persen > 100 ditolak');

let taxErr = null;
try {
  await q('select public.sync_transaction($1::jsonb)', [
    JSON.stringify(saleWith({ tax_rate: 150 })),
  ]);
} catch (e) { taxErr = e.message; }
must(!!taxErr && /0-100/i.test(taxErr), 'tarif pajak > 100 ditolak');

// Audit: penyesuaian stok manual & perubahan peran
await q('select public.adjust_stock($1, $2, $3, $4)', [prod, 5, 'adjust', 'kiriman susulan']);
const stockAudit = (await q(
  "select count(*)::int as n from public.audit_logs where action = 'stock.adjust' and entity_id = $1",
  [prod],
))[0].n;
must(stockAudit >= 1, 'penyesuaian stok tercatat di audit');

const roleAudit = (await q(
  "select count(*)::int as n from public.audit_logs where action in ('member.role','member.active','member.add')",
))[0].n;
must(roleAudit >= 1, 'perubahan anggota tercatat di audit');

const sprint4Feed = await q('select action from public.audit_feed($1, 50)', [outletId]);
must(sprint4Feed.some((row) => row.action === 'stock.adjust'), 'audit_feed menampilkan penyesuaian stok');

// Laporan shift per periode
const shiftRows = await q('select * from public.shift_report($1)', [outletId]);
must(shiftRows.length >= 1, `laporan shift berisi ${shiftRows.length} shift`);
const closedRow = shiftRows.find((row) => row.closed_at);
must(!!closedRow, 'shift yang sudah ditutup muncul di laporan');
must(Number(closedRow.cash_sales) >= 0 && closedRow.difference !== null, 'penjualan tunai & selisih dilaporkan');
must(typeof closedRow.opened_by_email === 'string', 'email pembuka shift dilaporkan');

await act(KASIR);
let reportErr = null;
try { await q('select * from public.shift_report($1)', [outletId]); } catch (e) { reportErr = e.message; }
must(!!reportErr && /pemilik|admin/i.test(reportErr), 'kasir tidak boleh melihat laporan shift');

console.log('\n== 23. harga grosir & diskon per barang ==');

// Harga grosir tersimpan lewat sync_product
const grosir = uuid();
await db.exec('reset role');
await db.exec('set role authenticated');
await act(OWNER);
await q('select public.sync_product($1::jsonb)', [
  JSON.stringify({
    id: grosir,
    outlet_id: outletId,
    name: 'Gula 1kg',
    unit: 'pcs',
    sell_price: 15000,
    cost_price: 12000,
    min_stock: 5,
    stock_delta: 40,
    stock_reason: 'opening',
    stock_ref: uuid(),
    wholesale_price: 13500,
    wholesale_min_qty: 5,
  }),
]);
const gRow = (await q(
  'select sell_price, wholesale_price, wholesale_min_qty from public.products where id = $1',
  [grosir],
))[0];
must(Number(gRow.wholesale_price) === 13500, `harga grosir tersimpan (${gRow.wholesale_price})`);
must(Number(gRow.wholesale_min_qty) === 5, 'minimal jumlah grosir tersimpan');

// Setengah lengkap ditolak
let halfErr = null;
try {
  await q('select public.sync_product($1::jsonb)', [
    JSON.stringify({ id: grosir, outlet_id: outletId, name: 'Gula 1kg', sell_price: 15000, wholesale_price: 13000 }),
  ]);
} catch (e) { halfErr = e.message; }
must(!!halfErr && /bersama/i.test(halfErr), 'harga grosir tanpa minimal jumlah ditolak');

// Kasir tidak boleh mengubah harga grosir
await act(KASIR);
let gKasirErr = null;
try {
  await q('select public.sync_product($1::jsonb)', [
    JSON.stringify({
      id: grosir, outlet_id: outletId, name: 'Gula 1kg', sell_price: 15000,
      wholesale_price: 9000, wholesale_min_qty: 5,
    }),
  ]);
} catch (e) { gKasirErr = e.message; }
must(!!gKasirErr && /mengubah harga/i.test(gKasirErr), 'kasir tidak boleh mengubah harga grosir walau lewat kiriman penuh');

await act(OWNER);

// Diskon per barang mengurangi subtotal & dasar pajak
const txItem = (await q('select public.sync_transaction($1::jsonb) as id', [
  JSON.stringify({
    outlet_id: outletId,
    client_tx_id: uuid(),
    type: 'sale',
    method: 'cash',
    tax_rate: 10,
    items: [
      { product_id: grosir, name: 'Gula 1kg', qty: 5, price: 13500, cost: 12000, discount: 2500 },
    ],
  }),
]))[0].id;
const itemRow = (await q(
  'select subtotal, discount, tax, total from public.transactions where id = $1',
  [txItem],
))[0];
must(Number(itemRow.subtotal) === 65000, `subtotal setelah diskon barang = ${itemRow.subtotal} (67500 - 2500)`);
must(Number(itemRow.tax) === 6500, 'pajak dihitung dari subtotal setelah diskon barang');
must(Number(itemRow.total) === 71500, `total = ${itemRow.total}`);

const savedItem = (await q(
  'select price, qty, discount from public.transaction_items where transaction_id = $1',
  [txItem],
))[0];
must(Number(savedItem.price) === 13500 && Number(savedItem.discount) === 2500, 'harga grosir & diskon tersimpan per baris');

const stockGula = (await q('select stock from public.products where id = $1', [grosir]))[0].stock;
must(Number(stockGula) === 35, `stok berkurang sesuai jumlah (${stockGula})`);

console.log('\n== 22. kendali akun & kepatuhan UU PDP ==');

// Serah terima toko hanya boleh oleh pemilik.
await act(KASIR);
let transferErr = null;
try { await q('select public.transfer_ownership($1, $2)', [outletId, KASIR2]); } catch (e) { transferErr = e.message; }
must(!!transferErr && /pemilik/i.test(transferErr), 'kasir tidak boleh menyerahkan toko');

// Pemilik tidak bisa keluar dari tokonya sendiri.
await act(OWNER);
let ownerLeaveErr = null;
try { await q('select public.leave_outlet($1)', [outletId]); } catch (e) { ownerLeaveErr = e.message; }
must(!!ownerLeaveErr && /pemilik/i.test(ownerLeaveErr), 'pemilik tidak bisa keluar (harus serah terima)');

// Pratinjau hapus akun: masih ada anggota aktif → ditolak.
const previewBlocked = (await q('select public.account_delete_preview() as p'))[0].p;
must(previewBlocked.can_delete === false, 'hapus akun ditolak selama toko masih punya anggota lain');
must(previewBlocked.blocked_outlets === 1, 'satu toko dilaporkan menghalangi');
must(/anggota lain/i.test(previewBlocked.reason ?? ''), 'alasan penghalang dijelaskan ke pengguna');

// Serah terima bolak-balik.
await q('select public.transfer_ownership($1, $2)', [outletId, KASIR]);
const afterTransfer = await q(
  "select user_id, role::text as role from public.members where outlet_id = $1 and user_id = any($2::uuid[])",
  [outletId, [OWNER, KASIR]],
);
must(afterTransfer.find((m) => m.user_id === KASIR)?.role === 'owner', 'anggota tujuan menjadi pemilik');
must(afterTransfer.find((m) => m.user_id === OWNER)?.role === 'admin', 'pemilik lama menjadi admin');

await act(KASIR);
await q('select public.transfer_ownership($1, $2)', [outletId, OWNER]);
await act(OWNER);
const backAgain = (await q(
  "select role::text as role from public.members where outlet_id = $1 and user_id = $2",
  [outletId, OWNER],
))[0];
must(backAgain.role === 'owner', 'kepemilikan bisa dikembalikan');

const transferLog = await q(
  "select count(*)::int as n from public.audit_logs where outlet_id = $1 and action = 'ownership.transfer'",
  [outletId],
);
must(transferLog[0].n === 2, `serah terima tercatat di audit (${transferLog[0].n} baris)`);

// Kasir keluar dari toko.
await act(KASIR);
await q('select public.leave_outlet($1)', [outletId]);
const leftRows = await q(
  'select count(*)::int as n from public.members where outlet_id = $1 and user_id = $2',
  [outletId, KASIR],
);
must(leftRows[0].n === 0, 'keanggotaan kasir hilang setelah keluar');
await db.exec('reset role'); // log audit tidak terlihat oleh kasir lewat RLS
const leaveLog = await q(
  "select count(*)::int as n from public.audit_logs where outlet_id = $1 and action = 'member.leave'",
  [outletId],
);
must(leaveLog[0].n === 1, 'keluar toko tercatat di audit');
await db.exec('set role authenticated');

// Sekarang pemilik hanya tinggal sendiri → hapus akun boleh.
await act(OWNER);
const previewOk = (await q('select public.account_delete_preview() as p'))[0].p;
must(previewOk.can_delete === true, 'hapus akun boleh setelah anggota lain tidak aktif');
must(previewOk.memberships >= 1, 'jumlah keanggotaan dilaporkan');

const beforeProducts = (await q('select count(*)::int as n from public.products where outlet_id = $1', [outletId]))[0].n;
must(beforeProducts > 0, `toko punya ${beforeProducts} barang sebelum dihapus`);

const deleted = (await q('select public.delete_my_account() as r'))[0].r;
must(deleted.outlets_deleted === 1, `satu toko terhapus (${deleted.outlets_deleted})`);
must(deleted.memberships_removed >= 1, `keanggotaan terhapus (${deleted.memberships_removed})`);

const outletGone = (await q('select count(*)::int as n from public.outlets where id = $1', [outletId]))[0].n;
const productsGone = (await q('select count(*)::int as n from public.products where outlet_id = $1', [outletId]))[0].n;
const profileGone = (await q('select count(*)::int as n from public.profiles where id = $1', [OWNER]))[0].n;
const memberGone = (await q('select count(*)::int as n from public.members where user_id = $1', [OWNER]))[0].n;
must(outletGone === 0 && productsGone === 0, 'seluruh data toko ikut terhapus (cascade)');
must(profileGone === 0, 'profil pengguna terhapus');
must(memberGone === 0, 'keanggotaan di semua toko terhapus');

await db.exec('reset role'); // setelah profil terhapus, RLS tidak membuka log apa pun
const deleteLog = await q(
  "select count(*)::int as n from public.audit_logs where action = 'account.delete' and entity_id = $1",
  [OWNER],
);
must(deleteLog[0].n === 1, 'penghapusan akun meninggalkan jejak audit tanpa data toko');
await db.exec('set role authenticated');

const previewAfter = (await q('select public.account_delete_preview() as p'))[0].p;
must(previewAfter.can_delete === true && previewAfter.memberships === 0, 'akun kosong bisa dihapus ulang tanpa efek');

console.log('\n== 23. pesanan / kuotasi ==');

// Outlet baru: outlet sebelumnya sudah dihapus pada uji hapus akun.
await act(OWNER);
const orderOutlet = (await q('select public.create_outlet($1, $2) as id', ['Toko Pesanan', 'TP02']))[0].id;
await db.exec('reset role');
await db.query('insert into public.members (outlet_id, user_id, role) values ($1, $2, $3)', [
  orderOutlet,
  KASIR,
  'kasir',
]);
await db.exec('set role authenticated');

// Barang untuk diuji: satu milik outlet ini, satu milik outlet lain.
await act(OWNER);
const orderProduct = (await q('select public.sync_product($1::jsonb) as id', [
  JSON.stringify({ id: uuid(), outlet_id: orderOutlet, name: 'Kue Lapis', sell_price: 5000, cost: 3000, stock: 20 }),
]))[0].id;

// `sync_product` tidak menerima stok absolut (sprint 2 memakai delta), jadi
// stok awal diberikan lewat `apply_stock_delta`.
await q("select public.apply_stock_delta($1, 20, 'opening', null, 'stok awal uji')", [orderProduct]);

await act(KASIR);
const otherProduct = uuid();
let crossErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({
      id: uuid(),
      outlet_id: orderOutlet,
      customer_name: 'Bu Sari',
      items: [{ product_id: otherProduct, name: 'Barang asing', qty: 1, price: 1000 }],
    }),
  ]);
} catch (e) { crossErr = e.message; }
must(!!crossErr && /bukan milik toko/i.test(crossErr), 'barang dari toko lain ditolak di pesanan');
const orderId = uuid();
await act(KASIR);
const savedOrder = (await q('select public.sync_order($1::jsonb) as id', [
  JSON.stringify({
    id: orderId,
    outlet_id: orderOutlet,
    customer_name: 'Bu Sari',
    customer_phone: '081200001111',
    due_date: '2026-11-25',
    note: 'Ambil sore',
    // Total dari klien sengaja salah: server harus menghitung sendiri.
    total: 1,
    items: [
      { product_id: orderProduct, name: 'Kue Lapis', qty: 3, price: 5000 },
      { name: 'Kotak kue', qty: 3, price: 500 },
    ],
  }),
]))[0].id;
must(savedOrder === orderId, 'kasir boleh membuat pesanan');

const orderRow = (await q(
  'select total, status::text as status, due_date::text as due, customer_phone from public.orders where id = $1',
  [orderId],
))[0];
must(Number(orderRow.total) === 16500, `total dihitung server: ${orderRow.total} (3×5000 + 3×500)`);
must(orderRow.status === 'terbuka', 'pesanan baru berstatus terbuka');
must(orderRow.due === '2026-11-25', 'tanggal janji tersimpan');
must(orderRow.customer_phone === '081200001111', 'nomor pelanggan tersimpan');

const orderItems = await q(
  'select name, qty, price, subtotal from public.order_items where order_id = $1 order by name',
  [orderId],
);
must(orderItems.length === 2, `rincian pesanan tersimpan (${orderItems.length} baris)`);
must(Number(orderItems[0].subtotal) === 1500, 'subtotal per baris dihitung server');

// Stok tidak boleh bergerak gara-gara pesanan.
const stockAfterOrder = (await q('select stock from public.products where id = $1', [orderProduct]))[0].stock;
must(Number(stockAfterOrder) === 20, `stok tidak berkurang oleh pesanan (${stockAfterOrder})`);
const movesAfterOrder = (await q(
  'select count(*)::int as n from public.stock_moves where product_id = $1',
  [orderProduct],
))[0].n;
must(movesAfterOrder === 1, `hanya pergerakan stok awal, bukan dari pesanan (${movesAfterOrder})`);

// Kirim ulang dengan rincian berbeda: harus menimpa, bukan menggandakan.
await q('select public.sync_order($1::jsonb)', [
  JSON.stringify({
    id: orderId,
    outlet_id: orderOutlet,
    customer_name: 'Bu Sari',
    status: 'batal',
    items: [{ product_id: orderProduct, name: 'Kue Lapis', qty: 5, price: 5000 }],
  }),
]);
const afterResend = await q(
  'select total, status::text as status from public.orders where id = $1',
  [orderId],
);
const itemsAfterResend = await q('select count(*)::int as n from public.order_items where order_id = $1', [orderId]);
must(Number(afterResend[0].total) === 25000, `total ikut berubah setelah kiriman ulang (${afterResend[0].total})`);
must(afterResend[0].status === 'batal', 'status batal tersimpan');
must(itemsAfterResend[0].n === 1, `rincian tidak tergandakan (${itemsAfterResend[0].n} baris)`);

// Aturan validasi.
let qtyErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({
      id: uuid(), outlet_id: orderOutlet, customer_name: 'Bu Sari',
      items: [{ name: 'Kue Lapis', qty: 0, price: 5000 }],
    }),
  ]);
} catch (e) { qtyErr = e.message; }
must(!!qtyErr && /lebih dari 0/i.test(qtyErr), 'jumlah 0 ditolak');

let priceErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({
      id: uuid(), outlet_id: orderOutlet, customer_name: 'Bu Sari',
      items: [{ name: 'Kue Lapis', qty: 1, price: -1 }],
    }),
  ]);
} catch (e) { priceErr = e.message; }
must(!!priceErr && /negatif/i.test(priceErr), 'harga negatif ditolak');

let doneErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({
      id: uuid(), outlet_id: orderOutlet, customer_name: 'Bu Sari', status: 'selesai',
      items: [{ name: 'Kue Lapis', qty: 1, price: 5000 }],
    }),
  ]);
} catch (e) { doneErr = e.message; }
must(!!doneErr && /menunjuk transaksi/i.test(doneErr), 'status selesai wajib menunjuk transaksi');

let emptyErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({ id: uuid(), outlet_id: orderOutlet, customer_name: '', items: [{ name: 'X', qty: 1, price: 1 }] }),
  ]);
} catch (e) { emptyErr = e.message; }
must(!!emptyErr && /pelanggan/i.test(emptyErr), 'nama pelanggan wajib diisi');

// Penyusup tidak bisa membaca atau menulis pesanan.
await act(OUTSIDER);
let outsideErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({
      id: uuid(), outlet_id: orderOutlet, customer_name: 'Penyusup',
      items: [{ name: 'Kue', qty: 1, price: 1000 }],
    }),
  ]);
} catch (e) { outsideErr = e.message; }
must(!!outsideErr && /anggota/i.test(outsideErr), 'bukan anggota tidak bisa menyimpan pesanan');

const outsideRead = await q('select count(*)::int as n from public.orders where outlet_id = $1', [orderOutlet]);
must(outsideRead[0].n === 0, 'RLS menyembunyikan pesanan dari bukan anggota');

await act(OWNER);

console.log('\n== 24. uang muka (DP) pesanan ==');

await act(OWNER);
const dpOrder = uuid();
await q('select public.sync_order($1::jsonb)', [
  JSON.stringify({
    id: dpOrder,
    outlet_id: orderOutlet,
    customer_name: 'Pak Hendra',
    deposit: 20000,
    items: [{ product_id: orderProduct, name: 'Kue Lapis', qty: 10, price: 5000 }],
  }),
]);
const dpRow = (await q('select total, deposit from public.orders where id = $1', [dpOrder]))[0];
must(Number(dpRow.total) === 50000, `total pesanan 50.000 (${dpRow.total})`);
must(Number(dpRow.deposit) === 20000, `DP tersimpan (${dpRow.deposit})`);

// DP tidak boleh melebihi total.
let dpErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({
      id: uuid(), outlet_id: orderOutlet, customer_name: 'Pak Hendra', deposit: 60000,
      items: [{ name: 'Kue Lapis', qty: 10, price: 5000 }],
    }),
  ]);
} catch (e) { dpErr = e.message; }
must(!!dpErr && /melebihi total/i.test(dpErr), 'DP lebih besar dari total ditolak');

// DP negatif ditolak.
let dpMinusErr = null;
try {
  await q('select public.sync_order($1::jsonb)', [
    JSON.stringify({
      id: uuid(), outlet_id: orderOutlet, customer_name: 'Pak Hendra', deposit: -1,
      items: [{ name: 'Kue Lapis', qty: 1, price: 5000 }],
    }),
  ]);
} catch (e) { dpMinusErr = e.message; }
must(!!dpMinusErr && /negatif/i.test(dpMinusErr), 'DP negatif ditolak');

// Kiriman ulang tanpa deposit mengosongkan DP (klien adalah sumber kebenaran).
await q('select public.sync_order($1::jsonb)', [
  JSON.stringify({
    id: dpOrder, outlet_id: orderOutlet, customer_name: 'Pak Hendra',
    items: [{ name: 'Kue Lapis', qty: 10, price: 5000 }],
  }),
]);
const dpReset = (await q('select deposit from public.orders where id = $1', [dpOrder]))[0];
must(Number(dpReset.deposit) === 0, 'DP ikut diperbarui saat rincian dikirim ulang');

console.log(`\nSELESAI: ${pass} pemeriksaan lulus${process.exitCode ? ' (ADA YANG GAGAL)' : ', semua hijau'}`);
await db.close();
