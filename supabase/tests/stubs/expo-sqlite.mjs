// Stub minimal expo-sqlite untuk audit logika di Node (tanpa perangkat).
const kv = new Map();
const outbox = new Map();
const db = {
  execAsync: async () => {},
  closeAsync: async () => {},
  async getFirstAsync(sql, ...args) {
    if (sql.includes('app_kv')) return kv.has(args[0]) ? { value: kv.get(args[0]) } : null;
    if (sql.includes('outbox')) return outbox.size ? { c: outbox.size } : null;
    return null;
  },
  async runAsync(sql, ...args) {
    if (sql.includes('app_kv')) kv.set(args[0], args[1]);
    else if (sql.includes('outbox')) outbox.set(args[0], args.slice(0, 6));
    return { changes: 1 };
  },
  async getAllAsync(sql) {
    if (sql.includes('outbox')) return [...outbox.values()].map((v) => ({ id: v[0], entity: v[1], op: v[2], payload: v[3], created_at: v[4], attempts: v[5] }));
    return [];
  },
};
export const openDatabaseAsync = async () => db;
export const openDatabaseSync = () => db;
export default { openDatabaseAsync, openDatabaseSync };
