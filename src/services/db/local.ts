/**
 * Driver penyimpanan lokal untuk Android/iOS: SQLite lewat expo-sqlite.
 *
 * Kenapa SQLite, bukan AsyncStorage:
 *   - JSON state utuh di AsyncStorage harus ditulis ulang setiap perubahan;
 *     di 10.000 transaksi itu membuat aplikasi tersendat.
 *   - Antrean sinkron butuh tabel yang bisa di-query (pending, retry, urutan).
 *
 * Catatan: berkas `local.web.ts` menyediakan perilaku setara untuk web.
 */
import * as SQLite from 'expo-sqlite';

import type { LocalDriver, OutboxOp } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const DDL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  create table if not exists app_kv (
    key   text primary key not null,
    value text not null
  );

  create table if not exists outbox (
    id         text primary key not null,
    entity     text not null,
    op         text not null check (op in ('upsert','delete')),
    payload    text not null,
    created_at text not null,
    attempts   integer not null default 0
  );
  create index if not exists outbox_created_idx on outbox (created_at);
`;

function open(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('inventoris.db')
      .then(async (db) => {
        await db.execAsync(DDL);
        return db;
      })
      .catch((error) => {
        // Jangan mengunci Promise gagal selamanya bila pembukaan awal gagal sesaat.
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}

interface Row {
  id: string;
  entity: string;
  op: 'upsert' | 'delete';
  payload: string;
  created_at: string;
  attempts: number;
}

export const localStore: LocalDriver = {
  async kvGet(key) {
    const db = await open();
    const row = await db.getFirstAsync<{ value: string }>('select value from app_kv where key = ?', key);
    return row?.value ?? null;
  },

  async kvSet(key, value) {
    const db = await open();
    await db.runAsync(
      'insert into app_kv (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
      key,
      value,
    );
  },

  async kvDel(key) {
    const db = await open();
    await db.runAsync('delete from app_kv where key = ?', key);
  },

  async enqueue(op: OutboxOp) {
    const db = await open();
    await db.runAsync(
      'insert or replace into outbox (id, entity, op, payload, created_at, attempts) values (?, ?, ?, ?, ?, ?)',
      op.id,
      op.entity,
      op.op,
      op.payload,
      op.createdAt,
      op.attempts,
    );
  },

  async pending(limit) {
    const db = await open();
    const rows = await db.getAllAsync<Row>(
      'select * from outbox order by created_at asc limit ?',
      limit,
    );
    return rows.map((row) => ({
      id: row.id,
      entity: row.entity,
      op: row.op,
      payload: row.payload,
      createdAt: row.created_at,
      attempts: row.attempts,
    }));
  },

  async pendingCount() {
    const db = await open();
    const row = await db.getFirstAsync<{ n: number }>('select count(*) as n from outbox');
    return row?.n ?? 0;
  },

  async removeOps(ids) {
    if (ids.length === 0) return;
    const db = await open();
    const marks = ids.map(() => '?').join(',');
    await db.runAsync(`delete from outbox where id in (${marks})`, ...ids);
  },

  async bumpAttempts(id) {
    const db = await open();
    await db.runAsync('update outbox set attempts = attempts + 1 where id = ?', id);
    const row = await db.getFirstAsync<{ attempts: number }>('select attempts from outbox where id = ?', id);
    return row?.attempts ?? 0;
  },

  async dropOp(id) {
    const db = await open();
    await db.runAsync('delete from outbox where id = ?', id);
  },

  async clearOutbox() {
    const db = await open();
    await db.runAsync('delete from outbox');
  },
};
