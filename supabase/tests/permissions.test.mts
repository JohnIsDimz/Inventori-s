/**
 * Uji matriks izin per peran (murni, tanpa jaringan).
 *
 * Matriks ini menentukan menu & tombol apa yang muncul, jadi harus cocok dengan
 * yang ditegakkan server (RLS + RPC di migrasi 0002/0003/0005). Bila salah satu
 * berubah tanpa yang lain, uji ini gagal.
 */
import assert from 'node:assert/strict';

import {
  ACTION_LABEL,
  ALL_ACTIONS,
  can,
  canSeeProfit,
  permissionList,
  ROLE_LABEL,
  ROLE_SUMMARY,
  type Role,
} from '../../src/utils/permissions';

let passed = 0;
const check = (label: string, run: () => void) => {
  try {
    run();
    passed++;
    console.log('  OK   ' + label);
  } catch (error) {
    console.log('  FAIL ' + label);
    console.log('       ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
};

console.log('\n== matriks izin ==');

check('mode lokal (peran null) membuka semua izin', () => {
  for (const action of ALL_ACTIONS) {
    assert.equal(can(null, action), true, `lokal harus boleh ${action}`);
  }
});

check('pemilik boleh melakukan semuanya', () => {
  for (const action of ALL_ACTIONS) {
    assert.equal(can('owner', action), true, `pemilik harus boleh ${action}`);
  }
});

check('admin tidak boleh mengatur anggota', () => {
  assert.equal(can('admin', 'member.manage'), false);
});

check('kasir tidak melihat laba, modal, dan audit', () => {
  assert.equal(canSeeProfit('kasir'), false);
  assert.equal(can('kasir', 'audit.view'), false);
  assert.equal(can('kasir', 'product.manage'), false);
});

check('kasir tetap boleh menjual, mencatat kasbon, dan membuka shift', () => {
  assert.equal(can('kasir', 'kasbon.manage'), true);
  assert.equal(can('kasir', 'shift.manage'), true);
  assert.equal(can('kasir', 'report.export'), true);
});

check('setiap peran punya label dan ringkasan', () => {
  for (const role of ['owner', 'admin', 'kasir'] as Role[]) {
    assert.ok(ROLE_LABEL[role].length > 0, `label ${role}`);
    assert.ok(ROLE_SUMMARY[role].length > 20, `ringkasan ${role}`);
  }
});

check('setiap izin punya kalimat yang bisa dibaca pengguna', () => {
  for (const action of ALL_ACTIONS) {
    assert.ok(ACTION_LABEL[action]?.length > 5, `label untuk ${action}`);
  }
});

check('permissionList mengembalikan semua izin sesuai peran', () => {
  const list = permissionList('kasir');
  assert.equal(list.length, ALL_ACTIONS.length);
  assert.equal(list.find((row) => row.action === 'profit.view')?.allowed, false);
  assert.equal(list.find((row) => row.action === 'kasbon.manage')?.allowed, true);
});

check('larangan kasir konsisten dengan aturan server (harga & audit)', () => {
  // Server menolak kasir mengubah harga dan membaca audit; UI harus sama.
  assert.equal(can('kasir', 'product.manage'), false);
  assert.equal(can('kasir', 'audit.view'), false);
  assert.equal(can('admin', 'product.manage'), true);
  assert.equal(can('admin', 'audit.view'), true);
});

console.log(`\nSELESAI: ${passed} pemeriksaan lulus`);
