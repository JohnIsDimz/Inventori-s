/**
 * Riwayat harga beli per barang & grafiknya (Sprint 16).
 *
 * Kenapa perlu: setelah beberapa kali kulakan, pemilik sering bertanya "memang
 * harga agen naik, atau saya yang salah catat?". Daftar angka saja sulit
 * dibaca; grafik kecil dengan titik terendah/tertinggi langsung menjawabnya.
 *
 * Fungsi di sini MURNI dan diuji `npm run test:price-history`.
 */
import type { Purchase } from './types';

export interface PricePoint {
  /** Waktu kulakan. */
  at: string;
  /** Harga beli satuan saat itu. */
  unitCost: number;
  qty: number;
  supplierName: string;
  purchaseId: string;
}

/** Riwayat harga beli satu barang, dari yang paling lama ke terbaru. */
export function priceHistory(purchases: Purchase[], productId: string): PricePoint[] {
  const points: PricePoint[] = [];
  for (const purchase of purchases) {
    for (const item of purchase.items) {
      if (item.productId !== productId) continue;
      points.push({
        at: purchase.createdAt,
        unitCost: Math.max(0, Math.round(item.unitCost)),
        qty: Math.max(0, Math.round(item.qty)),
        supplierName: purchase.supplierName,
        purchaseId: purchase.id,
      });
    }
  }
  return points.sort((a, b) => a.at.localeCompare(b.at));
}

export interface PriceStats {
  count: number;
  /** Harga beli pada kulakan terakhir. */
  latest: number;
  first: number;
  lowest: number;
  highest: number;
  /** Rata-rata sederhana per kulakan (bukan rata-rata tertimbang HPP). */
  average: number;
  /** Perubahan harga terakhir dibanding kulakan pertama, dalam persen. */
  changePercent: number;
  firstAt: string | null;
  lastAt: string | null;
}

/** Ringkasan harga beli; `fallback` dipakai bila belum ada kulakan sama sekali. */
export function priceStats(points: PricePoint[], fallback = 0): PriceStats {
  if (points.length === 0) {
    const value = Math.max(0, Math.round(fallback));
    return {
      count: 0,
      latest: value,
      first: value,
      lowest: value,
      highest: value,
      average: value,
      changePercent: 0,
      firstAt: null,
      lastAt: null,
    };
  }
  const costs = points.map((point) => point.unitCost);
  const first = costs[0];
  const latest = costs[costs.length - 1];
  const total = costs.reduce((sum, value) => sum + value, 0);
  return {
    count: points.length,
    latest,
    first,
    lowest: Math.min(...costs),
    highest: Math.max(...costs),
    average: Math.round(total / costs.length),
    changePercent: first > 0 ? ((latest - first) / first) * 100 : 0,
    firstAt: points[0].at,
    lastAt: points[points.length - 1].at,
  };
}

/** Kalimat tren yang mudah dibaca pemilik warung. */
export function priceTrendText(stats: PriceStats): string {
  if (stats.count === 0) return 'Belum pernah kulakan barang ini.';
  if (stats.count === 1) return 'Baru satu kali kulakan, belum ada tren.';
  const change = stats.changePercent;
  if (Math.abs(change) < 0.5) return 'Harga beli cenderung tetap.';
  const value = `${Math.abs(change).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
  return change > 0 ? `Harga beli naik ${value} sejak kulakan pertama.` : `Harga beli turun ${value} sejak kulakan pertama.`;
}

/**
 * Titik grafik dalam koordinat 0–100 supaya mudah digambar SVG.
 * `y` = 0 untuk harga tertinggi (atas), 100 untuk terendah.
 */
export function priceChartPoints(
  points: PricePoint[],
  width = 100,
  height = 100,
): { x: number; y: number; point: PricePoint }[] {
  if (points.length === 0) return [];
  const costs = points.map((point) => point.unitCost);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const span = Math.max(1, max - min);
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  return points.map((point, index) => ({
    x: points.length > 1 ? index * stepX : width / 2,
    y: max === min ? height / 2 : height - ((point.unitCost - min) / span) * height,
    point,
  }));
}

/** Data siap pakai untuk layar riwayat harga beli satu barang. */
export function priceBoard(
  purchases: Purchase[],
  productId: string,
  fallbackCost: number,
): { points: PricePoint[]; stats: PriceStats; trend: string } {
  const points = priceHistory(purchases, productId);
  const stats = priceStats(points, fallbackCost);
  return { points, stats, trend: priceTrendText(stats) };
}
