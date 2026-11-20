/**
 * Peringatan "stok menipis" & "harga beli naik" (Sprint 17).
 *
 * Kenapa perlu: dua hal ini paling sering bikin warung rugi diam-diam.
 * Stok habis berarti pembeli pulang, dan harga agen yang naik tanpa disadari
 * berarti tiap barang terjual malah mengurangi untung. Sebelumnya keduanya
 * hanya kelihatan kalau pemilik membuka menu Stok dan menu Harga beli satu per
 * satu.
 *
 * Aturan yang dipegang:
 *   - stok dibaca dari data yang sudah disaring ke cabang aktif (jangan pakai
 *     stok cabang lain);
 *   - "harga beli naik" hanya dibandingkan kulakan terakhir vs kulakan
 *     sebelumnya, dengan ambang 5% — naik Rp 50 tidak perlu mengganggu;
 *   - barang yang baru sekali dikulak tidak pernah dianggap naik;
 *   - kalimat singkat dan bisa dikerjakan: nama barang + angka + apa yang
 *     sebaiknya dilakukan.
 *
 * Fungsi di sini MURNI dan diuji `npm run test:notif`.
 */
import { priceHistory } from './price-history';
import type { Product, Purchase } from './types';
import { formatRupiah } from '../utils/format';

/** Ambang kenaikan harga beli yang dianggap penting (persen). */
export const PRICE_RISE_PERCENT = 5;

/** Satu barang yang stoknya sudah menyentuh batas minimum. */
export interface LowStockItem {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
}

/**
 * Barang dengan stok ≤ batas minimum, paling kritis di atas.
 * `products` harus sudah disaring ke cabang aktif (`scopeData`) karena `stock`
 * di sini adalah stok cabang.
 */
export function lowStockItems(products: Product[]): LowStockItem[] {
  return (products ?? [])
    .filter((product) => Math.round(product.stock) <= Math.round(product.minStock))
    .map((product) => ({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      stock: Math.max(0, Math.round(product.stock)),
      minStock: Math.max(0, Math.round(product.minStock)),
    }))
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
}

/** Satu barang yang harga belinya naik dibanding kulakan sebelumnya. */
export interface PriceRiseItem {
  productId: string;
  name: string;
  unit: string;
  /** Harga beli pada kulakan sebelumnya. */
  previous: number;
  /** Harga beli pada kulakan terakhir. */
  latest: number;
  /** Kenaikan dalam persen (1 desimal). */
  percent: number;
}

/**
 * Barang yang harga belinya naik ≥ `minPercent` pada kulakan terakhir.
 * Butuh minimal dua kulakan — satu kulakan tidak punya pembanding.
 */
export function priceRiseItems(
  purchases: Purchase[],
  products: Product[],
  minPercent = PRICE_RISE_PERCENT,
): PriceRiseItem[] {
  const items: PriceRiseItem[] = [];

  for (const product of products ?? []) {
    const points = priceHistory(purchases ?? [], product.id);
    if (points.length < 2) continue;
    const previous = points[points.length - 2].unitCost;
    const latest = points[points.length - 1].unitCost;
    if (previous <= 0 || latest <= previous) continue;
    const percent = ((latest - previous) / previous) * 100;
    if (percent < minPercent) continue;
    items.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      previous,
      latest,
      percent: Math.round(percent * 10) / 10,
    });
  }

  return items.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
}

/** Judul + isi notifikasi singkat, atau `null` bila tidak ada yang perlu dikabari. */
export interface StockAlertNotice {
  title: string;
  body: string;
}

const percentText = (value: number): string =>
  `${Math.abs(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

/** Notifikasi stok menipis; `limit` nama barang yang disebut. */
export function lowStockNotice(items: LowStockItem[], limit = 3): StockAlertNotice | null {
  if (items.length === 0) return null;
  const shown = items.slice(0, limit).map((item) => `${item.name} (${item.stock} ${item.unit})`);
  const rest = items.length - shown.length;
  const tail = rest > 0 ? ` dan ${rest} barang lain` : '';
  return {
    title: items.length === 1 ? `Stok menipis: ${items[0].name}` : `Stok menipis: ${items.length} barang`,
    body: `${shown.join(', ')}${tail}. Catat kulakan supaya rak tidak kosong.`,
  };
}

/** Notifikasi harga beli naik; `limit` nama barang yang disebut. */
export function priceRiseNotice(items: PriceRiseItem[], limit = 2): StockAlertNotice | null {
  if (items.length === 0) return null;
  const shown = items
    .slice(0, limit)
    .map(
      (item) =>
        `${item.name} naik ${percentText(item.percent)} jadi ${formatRupiah(item.latest)} (sebelumnya ${formatRupiah(item.previous)})`,
    );
  const rest = items.length - shown.length;
  const tail = rest > 0 ? `, dan ${rest} barang lain` : '';
  return {
    title:
      items.length === 1
        ? `Harga beli naik: ${items[0].name}`
        : `Harga beli naik: ${items.length} barang`,
    body: `${shown.join('; ')}${tail}. Cek harga jualnya.`,
  };
}

/** Kalimat ringkas untuk kartu di layar: "2 barang menipis • 1 harga beli naik". */
export function stockAlertSummary(products: Product[], purchases: Purchase[]): string {
  const low = lowStockItems(products).length;
  const rise = priceRiseItems(purchases, products).length;
  const parts: string[] = [];
  if (low > 0) parts.push(`${low} barang menipis`);
  if (rise > 0) parts.push(`${rise} harga beli naik`);
  return parts.length === 0 ? 'Stok dan harga beli masih aman.' : parts.join(' • ');
}
