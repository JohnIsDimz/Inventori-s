/**
 * Penggabungan data dua perangkat tanpa server.
 *
 * Dipakai dua tempat:
 *   1. mode "Gabungkan (versi terbaru menang)" saat memulihkan berkas cadangan
 *      dari HP lain — mis. hasil kirim lewat WhatsApp atau kabel;
 *   2. nanti, saat sinkron langsung antar-HP lewat Wi-Fi lokal (lihat
 *      `docs/RENCANA-SINKRON-LAN.md`), protokol pertukaran memakai fungsi yang
 *      sama: kirim daftar perubahan → gabungkan → kirim balik.
 *
 * Aturan (Last-Write-Wins sederhana):
 *   - baris yang hanya ada di satu sisi → diambil;
 *   - baris yang ada di dua sisi → dipilih yang stempel waktunya lebih baru
 *     (`updatedAt`, kalau tidak ada pakai `createdAt`, kalau tidak ada juga
 *     pakai `createdAt` milik baris lain / dianggap sama → data lokal menang);
 *   - urutan hasil: data yang lebih baru di atas, supaya daftar langsung terbaca.
 */

export interface MergeInput {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface MergeReport {
  /** Baris baru dari perangkat lain. */
  added: number;
  /** Baris yang ditimpa versi lebih baru dari perangkat lain. */
  updated: number;
  /** Baris lokal yang tetap dipakai karena lebih baru. */
  kept: number;
}

const stamp = (row: MergeInput): number => {
  const iso = row.updatedAt ?? row.createdAt;
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
};

export function mergeRecords<T extends MergeInput>(
  current: T[],
  incoming: T[],
): { rows: T[]; report: MergeReport } {
  const report: MergeReport = { added: 0, updated: 0, kept: 0 };
  const byId = new Map<string, T>();
  for (const row of Array.isArray(current) ? current : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    if (typeof row.id !== 'string' || row.id.trim() === '') continue;
    byId.set(row.id, row);
  }

  for (const row of Array.isArray(incoming) ? incoming : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    if (typeof row.id !== 'string' || row.id.trim() === '') continue;
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      report.added += 1;
      continue;
    }
    if (stamp(row) > stamp(existing)) {
      byId.set(row.id, row);
      report.updated += 1;
    } else {
      report.kept += 1;
    }
  }

  const rows = [...byId.values()].sort((a, b) => stamp(b) - stamp(a));
  return { rows, report };
}

/** Gabungkan semua entitas sekaligus (dipakai layar Cadangan). */
export function mergeAll<TSet extends Record<string, MergeInput[]>>(
  current: TSet,
  incoming: Partial<TSet>,
): { rows: TSet; report: Record<keyof TSet, MergeReport> } {
  const rows = { ...current };
  const report = {} as Record<keyof TSet, MergeReport>;

  for (const key of Object.keys(current) as (keyof TSet)[]) {
    const merged = mergeRecords(current[key], (incoming[key] ?? []) as TSet[keyof TSet]);
    rows[key] = merged.rows as TSet[keyof TSet];
    report[key] = merged.report;
  }

  return { rows, report };
}

/** Ringkasan bahasa manusia untuk laporan setelah penggabungan. */
export function describeReport(report: MergeReport): string {
  const parts: string[] = [];
  if (report.added > 0) parts.push(`${report.added} baru`);
  if (report.updated > 0) parts.push(`${report.updated} diperbarui`);
  if (report.kept > 0) parts.push(`${report.kept} lokal dipertahankan`);
  return parts.length === 0 ? 'Tidak ada perubahan' : parts.join(' • ');
}
