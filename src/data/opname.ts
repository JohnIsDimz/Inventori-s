/**
 * Stok opname — hitung fisik barang di rak (Sprint 13).
 *
 * Kenapa ini penting: hampir semua warung pernah mengalami "stok di catatan
 * beda dengan stok di rak". Penyebabnya macam-macam — barang pecah, hilang,
 * salah hitung saat kulakan, atau lupa mencatat penjualan. Sebelum sprint ini
 * pengguna hanya bisa menebak angka koreksi.
 *
 * Aturan yang dipegang:
 *   - opname TIDAK mengubah uang kas. Barang hilang bukan berarti uang keluar;
 *     yang berubah hanya jumlah barang dan catatan selisihnya;
 *   - nilai selisih dihitung dari harga modal, bukan harga jual, supaya
 *     kerugiannya tidak dibesar-besarkan;
 *   - barang yang tidak dihitung tidak diubah sama sekali — tidak boleh ada
 *     "nol" yang tidak sengaja tertulis.
 *
 * Semua fungsi di sini MURNI (tanpa state & UI) dan diuji `npm run test:opname`.
 */
import { stockFor } from './outlets';
import type { Product, StockOpname } from './types';

export interface OpnameLine {
  productId: string;
  name: string;
  unit: string;
  /** Stok menurut catatan sebelum dihitung. */
  system: number;
  /** Jumlah yang benar-benar ada di rak. */
  counted: number;
  /** Harga modal satuan saat opname dilakukan. */
  cost: number;
  note?: string;
}

/** Positif = barang lebih, negatif = barang kurang, 0 = cocok. */
export const opnameDiff = (line: OpnameLine): number => line.counted - line.system;

/** Nilai rupiah selisih (selalu positif; arahnya dibaca dari `opnameDiff`). */
export const opnameLineValue = (line: OpnameLine): number =>
  Math.abs(opnameDiff(line)) * Math.max(0, Math.round(line.cost));

export type OpnameTone = 'lebih' | 'kurang' | 'cocok';

export const opnameTone = (line: OpnameLine): OpnameTone => {
  const diff = opnameDiff(line);
  return diff > 0 ? 'lebih' : diff < 0 ? 'kurang' : 'cocok';
};

export const OPNAME_TONE_LABEL: Record<OpnameTone, string> = {
  lebih: 'Barang lebih',
  kurang: 'Barang kurang',
  cocok: 'Cocok',
};

export interface OpnameSummary {
  /** Jumlah barang yang benar-benar dihitung. */
  lines: number;
  matched: number;
  over: number;
  under: number;
  /** Nilai barang lebih (rupiah, harga modal). */
  gainValue: number;
  /** Nilai barang kurang (rupiah, harga modal). */
  lossValue: number;
  /** Selisih bersih: positif = lebih banyak dari catatan. */
  netValue: number;
  /** Jumlah barang (unit) yang selisih. */
  unitsOff: number;
}

export function summarizeOpname(lines: OpnameLine[]): OpnameSummary {
  let matched = 0;
  let over = 0;
  let under = 0;
  let gainValue = 0;
  let lossValue = 0;
  let unitsOff = 0;

  for (const line of lines) {
    const diff = opnameDiff(line);
    if (diff === 0) {
      matched += 1;
      continue;
    }
    unitsOff += Math.abs(diff);
    if (diff > 0) {
      over += 1;
      gainValue += opnameLineValue(line);
    } else {
      under += 1;
      lossValue += opnameLineValue(line);
    }
  }

  return {
    lines: lines.length,
    matched,
    over,
    under,
    gainValue,
    lossValue,
    netValue: gainValue - lossValue,
    unitsOff,
  };
}

/**
 * Baca angka yang diketik kasir. Kosong/ngawur = `null` (dianggap belum
 * dihitung), bukan 0 — supaya stok tidak terhapus karena salah pencet.
 */
export function parseCount(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw);
  // Tanda minus bukan angka jumlah: lebih baik dianggap belum diisi daripada
  // berubah jadi angka positif yang tidak diminta kasir.
  if (text.includes('-')) return null;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return null;
  return Math.round(value);
}

/** Baris opname dari isian kasir; hanya barang yang diisi yang ikut. */
export function buildOpnameLines(
  products: Product[],
  outletId: string | null | undefined,
  counts: Record<string, string | number>,
  note?: string,
): OpnameLine[] {
  const lines: OpnameLine[] = [];
  for (const product of products) {
    if (!(product.id in counts)) continue;
    const counted = parseCount(counts[product.id]);
    if (counted === null) continue;
    lines.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      system: stockFor(product, outletId),
      counted,
      cost: Math.max(0, Math.round(product.costPrice)),
      note: note?.trim() ? note.trim().slice(0, 120) : undefined,
    });
  }
  return lines;
}

/** Alasan yang paling mungkin untuk selisih negatif — dipakai sebagai saran. */
export const OPNAME_REASON_HINTS = [
  'Barang pecah / rusak',
  'Hilang',
  'Salah hitung saat kulakan',
  'Penjualan belum tercatat',
] as const;

/** Kalimat ringkas untuk layar & pesan bagikan. */
export function opnameSummaryText(summary: OpnameSummary): string {
  if (summary.lines === 0) return 'Belum ada barang yang dihitung.';
  if (summary.over === 0 && summary.under === 0) {
    return `${summary.lines} barang dihitung, semuanya cocok.`;
  }
  const parts = [`${summary.lines} barang dihitung`];
  if (summary.under > 0) parts.push(`${summary.under} kurang`);
  if (summary.over > 0) parts.push(`${summary.over} lebih`);
  return parts.join(' • ');
}

/** Teks laporan opname siap dibagikan (WhatsApp/nota). */
export function opnameReportText(
  session: { createdAt: string; lines: OpnameLine[]; note?: string },
  storeName: string,
  formatRupiah: (value: number) => string,
  formatDate: (iso: string) => string,
): string {
  const summary = summarizeOpname(session.lines);
  const rows: string[] = [];
  rows.push(`Hitung stok — ${storeName || 'Toko Saya'}`);
  rows.push(formatDate(session.createdAt));
  rows.push(opnameSummaryText(summary));
  if (summary.lossValue > 0) rows.push(`Nilai barang kurang: ${formatRupiah(summary.lossValue)}`);
  if (summary.gainValue > 0) rows.push(`Nilai barang lebih: ${formatRupiah(summary.gainValue)}`);

  const selisih = session.lines.filter((line) => opnameDiff(line) !== 0);
  if (selisih.length > 0) {
    rows.push('');
    for (const line of selisih) {
      const diff = opnameDiff(line);
      rows.push(
        `${line.name}: catatan ${line.system} → hitung ${line.counted} (${diff > 0 ? '+' : ''}${diff} ${line.unit})`,
      );
    }
  }
  if (session.note) {
    rows.push('');
    rows.push(`Catatan: ${session.note}`);
  }
  return rows.join('\n');
}

/** Satu barang yang paling sering kurang dalam satu periode (Sprint 16). */
export interface OpnameLossRow {
  name: string;
  unit: string;
  /** Jumlah unit yang hilang/kurang di periode ini. */
  units: number;
  /** Nilainya menurut harga modal saat hitung. */
  value: number;
  /** Berapa kali barang ini muncul di beberapa hitungan. */
  times: number;
}

/** Ringkasan semua hitungan fisik dalam satu rentang tanggal (Sprint 16). */
export interface OpnameRangeSummary {
  sessions: number;
  lines: number;
  matched: number;
  over: number;
  under: number;
  gainValue: number;
  lossValue: number;
  netValue: number;
  unitsOff: number;
  /** Barang paling banyak menyumbang nilai kurang, urut dari terbesar. */
  losses: OpnameLossRow[];
  /** Nilai selisih per sesi, dipakai grafik batang kecil. */
  perSession: { id: string; at: string; lossValue: number; gainValue: number }[];
}

const inRange = (iso: string, from: Date, to: Date) => {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
};

/**
 * Rangkum hitungan fisik pada satu periode. Dipakai menu Laporan supaya pemilik
 * bisa menjawab "bulan ini berapa nilai barang yang hilang?" tanpa membuka
 * satu per satu catatan hitung.
 */
export function opnameInRange(
  opnames: StockOpname[],
  from: Date,
  to: Date,
  top = 3,
): OpnameRangeSummary {
  const rows = opnames.filter((row) => inRange(row.createdAt, from, to));
  let lines = 0;
  let matched = 0;
  let over = 0;
  let under = 0;
  let gainValue = 0;
  let lossValue = 0;
  let unitsOff = 0;
  const losses = new Map<string, OpnameLossRow>();
  const perSession: OpnameRangeSummary['perSession'] = [];

  for (const session of rows) {
    // Baris dari penyimpanan tidak membawa fungsi, jadi dihitung langsung.
    const sessionLines: OpnameLine[] = session.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      unit: line.unit,
      system: line.system,
      counted: line.counted,
      cost: line.cost,
    }));
    const summary = summarizeOpname(sessionLines);
    lines += summary.lines;
    matched += summary.matched;
    over += summary.over;
    under += summary.under;
    gainValue += summary.gainValue;
    lossValue += summary.lossValue;
    unitsOff += summary.unitsOff;
    perSession.push({
      id: session.id,
      at: session.createdAt,
      lossValue: summary.lossValue,
      gainValue: summary.gainValue,
    });

    for (const line of sessionLines) {
      const diff = opnameDiff(line);
      if (diff >= 0) continue;
      const key = line.productId || line.name;
      const current = losses.get(key);
      const value = Math.abs(diff) * Math.max(0, Math.round(line.cost));
      if (current) {
        current.units += Math.abs(diff);
        current.value += value;
        current.times += 1;
      } else {
        losses.set(key, {
          name: line.name,
          unit: line.unit,
          units: Math.abs(diff),
          value,
          times: 1,
        });
      }
    }
  }

  return {
    sessions: rows.length,
    lines,
    matched,
    over,
    under,
    gainValue,
    lossValue,
    netValue: gainValue - lossValue,
    unitsOff,
    losses: [...losses.values()].sort((a, b) => b.value - a.value).slice(0, top),
    perSession: perSession.sort((a, b) => a.at.localeCompare(b.at)),
  };
}

/** Kalimat ringkas untuk kartu di menu Laporan. */
export function opnameRangeText(summary: OpnameRangeSummary): string {
  if (summary.sessions === 0) return 'Belum ada hitung stok di periode ini.';
  if (summary.under === 0 && summary.over === 0) {
    return `${summary.sessions} hitungan • semua barang cocok`;
  }
  const parts = [`${summary.sessions} hitungan`];
  if (summary.under > 0) parts.push(`${summary.under} barang kurang`);
  if (summary.over > 0) parts.push(`${summary.over} barang lebih`);
  return parts.join(' • ');
}
