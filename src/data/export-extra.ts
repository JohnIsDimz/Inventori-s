/**
 * Bagian tambahan laporan untuk ekspor PDF & CSV (Sprint 17).
 *
 * Kenapa perlu: sejak Sprint 16 menu Laporan sudah bisa menjawab "bulan ini
 * berapa nilai barang yang hilang?" dan "harga agen naik atau tidak?", tetapi
 * jawabannya hanya terlihat di layar. Begitu laporan dibagikan ke pemilik lain
 * atau dicetak, dua hal itu hilang — padahal justru itu yang paling sering
 * ditanyakan ulang.
 *
 * Aturan yang dipegang:
 *   - isi ekspor memakai hitungan yang sama dengan layar (tidak ada angka
 *     kedua versi yang bisa berbeda);
 *   - selisih hitung stok memakai harga modal, bukan harga jual;
 *   - barang tanpa kulakan tidak ikut daftar harga beli — daripada mengisi
 *     baris "0" yang menyesatkan;
 *   - semua teks sederhana, tanpa istilah teknis.
 *
 * Fungsi di sini MURNI (tanpa UI, tanpa penyimpanan) dan diuji
 * `npm run test:ekspor`.
 */
import { opnameInRange, opnameRangeText } from './opname';
import { priceHistory, priceStats, priceTrendText } from './price-history';
import type { Product, Purchase, StockOpname } from './types';
import { formatRupiah, formatTanggalJam } from '../utils/format';

/** Satu blok tabel pada berkas CSV: judul, kepala kolom, isi, dan teks kosong. */
export interface CsvBlock {
  /** Judul blok, ditulis sebagai baris pemisah di berkas. */
  title: string;
  header: string[];
  rows: (string | number)[][];
  /** Kalimat pengganti saat blok belum punya isi. */
  emptyText: string;
}

/** Satu baris selisih hitung stok yang ditulis ke berkas. */
export interface OpnameExportRow {
  /** Waktu hitung (ISO). */
  at: string;
  name: string;
  unit: string;
  /** Stok menurut catatan. */
  system: number;
  counted: number;
  /** Positif = lebih, negatif = kurang. */
  diff: number;
  /** Nilai rupiah selisih memakai harga modal. */
  value: number;
}

const round0 = (value: number) => Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

/**
 * Baris selisih hitung stok pada satu periode. Barang yang cocok tidak ditulis
 * — daftar barang yang tidak ada masalahnya hanya membuat berkas panjang.
 * Urut waktu hitung, lalu nilai selisih terbesar di atas.
 */
export function opnameExportRows(
  opnames: StockOpname[],
  from: Date,
  to: Date,
): OpnameExportRow[] {
  const rows: OpnameExportRow[] = [];
  const fromTime = from.getTime();
  const toTime = to.getTime();

  for (const session of opnames ?? []) {
    const time = new Date(session.createdAt).getTime();
    if (!Number.isFinite(time) || time < fromTime || time > toTime) continue;
    for (const line of session.lines ?? []) {
      const system = round0(line.system);
      const counted = round0(line.counted);
      const diff = counted - system;
      if (diff === 0) continue;
      rows.push({
        at: session.createdAt,
        name: line.name,
        unit: line.unit,
        system,
        counted,
        diff,
        value: Math.abs(diff) * round0(line.cost),
      });
    }
  }

  return rows.sort((a, b) => a.at.localeCompare(b.at) || b.value - a.value);
}

/** Kalimat ringkas untuk kepala bagian selisih hitung stok di PDF. */
export function opnameExportSummaryText(opnames: StockOpname[], from: Date, to: Date): string {
  const summary = opnameInRange(opnames ?? [], from, to, 3);
  if (summary.sessions === 0) return 'Belum ada hitung stok di periode ini.';
  const parts = [opnameRangeText(summary)];
  if (summary.lossValue > 0) parts.push(`nilai kurang ${formatRupiah(summary.lossValue)}`);
  if (summary.gainValue > 0) parts.push(`nilai lebih ${formatRupiah(summary.gainValue)}`);
  return parts.join(' • ');
}

/** Blok CSV selisih hitung stok. */
export function opnameCsvBlock(opnames: StockOpname[], from: Date, to: Date): CsvBlock {
  const rows = opnameExportRows(opnames, from, to).map((row) => [
    formatTanggalJam(row.at),
    row.name,
    row.unit,
    row.system,
    row.counted,
    row.diff,
    row.value,
  ]);
  return {
    title: 'SELISIH HITUNG STOK',
    header: ['Tanggal', 'Barang', 'Satuan', 'Tercatat', 'Hasil hitung', 'Selisih', 'Nilai'],
    rows,
    emptyText: 'Belum ada selisih hitung stok di periode ini.',
  };
}

/** Satu baris riwayat harga beli satu barang. */
export interface PriceExportRow {
  name: string;
  unit: string;
  /** Berapa kali barang ini pernah dikulak. */
  count: number;
  first: number;
  latest: number;
  lowest: number;
  highest: number;
  average: number;
  /** Perubahan harga terakhir dibanding kulakan pertama (persen, 1 desimal). */
  changePercent: number;
  /** Kalimat tren yang sama dengan yang tampil di layar. */
  trend: string;
}

/** Barang yang pernah dikulak, urut perubahan harga terbesar. */
export function priceExportRows(purchases: Purchase[], products: Product[]): PriceExportRow[] {
  const rows: PriceExportRow[] = [];

  for (const product of products ?? []) {
    const points = priceHistory(purchases ?? [], product.id);
    if (points.length === 0) continue;
    const stats = priceStats(points, product.costPrice);
    rows.push({
      name: product.name,
      unit: product.unit,
      count: stats.count,
      first: stats.first,
      latest: stats.latest,
      lowest: stats.lowest,
      highest: stats.highest,
      average: stats.average,
      changePercent: Math.round(stats.changePercent * 10) / 10,
      trend: priceTrendText(stats),
    });
  }

  return rows.sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || a.name.localeCompare(b.name),
  );
}

/** Kalimat ringkas untuk kepala bagian riwayat harga beli di PDF. */
export function priceExportSummaryText(purchases: Purchase[], products: Product[]): string {
  const rows = priceExportRows(purchases, products);
  if (rows.length === 0) return 'Belum ada barang yang pernah dikulak.';
  const naik = rows.filter((row) => row.changePercent >= 0.5).length;
  const turun = rows.filter((row) => row.changePercent <= -0.5).length;
  const parts = [`${rows.length} barang punya riwayat harga beli`];
  if (naik > 0) parts.push(`${naik} naik`);
  if (turun > 0) parts.push(`${turun} turun`);
  return parts.join(' • ');
}

/** Blok CSV riwayat harga beli. */
export function priceCsvBlock(purchases: Purchase[], products: Product[]): CsvBlock {
  const rows = priceExportRows(purchases, products).map((row) => [
    row.name,
    row.unit,
    row.count,
    row.first,
    row.latest,
    row.lowest,
    row.highest,
    row.average,
    row.changePercent,
    row.trend,
  ]);
  return {
    title: 'RIWAYAT HARGA BELI',
    header: [
      'Barang',
      'Satuan',
      'Kali kulakan',
      'Harga pertama',
      'Harga terakhir',
      'Terendah',
      'Tertinggi',
      'Rata-rata',
      'Perubahan (%)',
      'Tren',
    ],
    rows,
    emptyText: 'Belum ada barang yang pernah dikulak.',
  };
}

/**
 * Susun satu blok menjadi baris CSV. `cell` dipakai untuk menetralkan formula
 * (`=`, `+`, `-`, `@`) supaya aman dibuka di Excel/Sheets.
 */
export function csvBlockLines(
  block: CsvBlock,
  cell: (value: string | number) => string,
  separator = ';',
): string[] {
  const lines: string[] = [block.title, block.header.map(cell).join(separator)];
  if (block.rows.length === 0) {
    lines.push(block.emptyText);
    return lines;
  }
  for (const row of block.rows) lines.push(row.map(cell).join(separator));
  return lines;
}
