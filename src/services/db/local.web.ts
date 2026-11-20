/**
 * Driver penyimpanan lokal untuk web (pratinjau/QA).
 *
 * expo-sqlite di web butuh header COOP/COEP (SharedArrayBuffer) yang tidak
 * tersedia di pratinjau, jadi versi web memakai localStorage dengan bentuk
 * API yang sama. Logika sinkron tidak perlu tahu bedanya.
 */
import type { LocalDriver, OutboxOp } from './types';

const KV_PREFIX = 'inventoris.kv.';
const OUTBOX_KEY = 'inventoris.outbox';

function read(): OutboxOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(ops: OutboxOp[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
  } catch {
    // Kuota penuh: antrean boleh hilang, data bisnis tetap di app_kv.
  }
}

export const localStore: LocalDriver = {
  async kvGet(key) {
    try {
      return localStorage.getItem(KV_PREFIX + key);
    } catch {
      return null;
    }
  },
  async kvSet(key, value) {
    try {
      localStorage.setItem(KV_PREFIX + key, value);
    } catch {
      // abaikan: localStorage bisa penuh
    }
  },
  async kvDel(key) {
    try {
      localStorage.removeItem(KV_PREFIX + key);
    } catch {
      // abaikan
    }
  },

  async enqueue(op) {
    const ops = read().filter((o) => o.id !== op.id);
    ops.push(op);
    write(ops);
  },
  async pending(limit) {
    return read()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  },
  async pendingCount() {
    return read().length;
  },
  async removeOps(ids) {
    const drop = new Set(ids);
    write(read().filter((o) => !drop.has(o.id)));
  },
  async bumpAttempts(id) {
    const ops = read();
    const op = ops.find((o) => o.id === id);
    if (!op) return 0;
    op.attempts += 1;
    write(ops);
    return op.attempts;
  },
  async dropOp(id) {
    write(read().filter((o) => o.id !== id));
  },
  async clearOutbox() {
    write([]);
  },
};
