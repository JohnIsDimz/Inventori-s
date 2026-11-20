/**
 * Antarmuka penyimpanan lokal yang dipakai lapisan sinkron.
 *
 * Ada dua implementasi dengan bentuk yang sama:
 *   - `local.ts`      → expo-sqlite (Android/iOS)
 *   - `local.web.ts`  → localStorage (pratinjau web; SQLite web butuh header COOP/COEP)
 *
 * Semua modul lain hanya boleh mengimpor `../db/local`.
 */

/** Satu perubahan yang menunggu dikirim ke server. */
export interface OutboxOp {
  id: string;
  /** Nama entitas: product, transaction, receivable, payable, profile, ... */
  entity: string;
  op: 'upsert' | 'delete';
  /** JSON string baris yang akan dikirim. */
  payload: string;
  /** ISO 8601 waktu perubahan dibuat. */
  createdAt: string;
  /** Berapa kali sudah dicoba (untuk backoff & membuang operasi rusak). */
  attempts: number;
}

export interface LocalDriver {
  /** Baca/tulis nilai kecil (state aplikasi, peta id, kursor sinkron). */
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDel(key: string): Promise<void>;

  /** Antrean perubahan menuju server. */
  enqueue(op: OutboxOp): Promise<void>;
  pending(limit: number): Promise<OutboxOp[]>;
  pendingCount(): Promise<number>;
  removeOps(ids: string[]): Promise<void>;
  /** Tandai satu operasi gagal; operasi dibuang setelah 5 percobaan. */
  bumpAttempts(id: string): Promise<number>;
  dropOp(id: string): Promise<void>;
  clearOutbox(): Promise<void>;
}
