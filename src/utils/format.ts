/** Helper format angka & tanggal lokal Indonesia (tanpa dependensi eksternal). */

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('id-ID');

export function formatRupiah(value: number, opts: { sign?: boolean; space?: boolean } = {}): string {
  const safe = Number.isFinite(value) ? value : 0;
  const text = rupiahFormatter.format(Math.abs(safe)).replace(/\u00a0/g, ' ');
  const withSign = opts.sign ? `${safe < 0 ? '−' : '+'}${text}` : safe < 0 ? `−${text}` : text;
  return opts.space === false ? withSign.replace('Rp ', 'Rp') : withSign;
}

/** Rp 1.250.000 → "Rp 1,3 jt" untuk label grafik yang sempit. */
export function formatCompactRupiah(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `Rp ${trim(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `Rp ${trim(abs / 1_000_000)} jt`;
  if (abs >= 1_000) return `Rp ${trim(abs / 1_000)} rb`;
  return `Rp ${numberFormatter.format(abs)}`;
}

function trim(n: number): string {
  return n.toFixed(n < 10 ? 1 : 0).replace('.', ',').replace(',0', '');
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

/** "145.000" → 145000 */
export function parseNumber(input: string): number {
  const digits = input.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** Masker input nominal: 145000 → "145.000" */
export function maskNominal(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits ? numberFormatter.format(Number(digits)) : '';
}

export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;
export const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;
export const BULAN_SINGKAT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** "Selasa, 24 Oktober 2023" */
export function formatTanggalPanjang(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** "24 Okt 2023" */
export function formatTanggalSingkat(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getDate()} ${BULAN_SINGKAT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "24/10" */
export function formatTanggalPendek(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "15:30 WIB" */
export function formatJam(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())} WIB`;
}

export function formatTanggalJam(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${formatTanggalSingkat(d)} • ${formatJam(d)}`;
}

/** "Oktober 2024" */
export function formatBulanTahun(d: Date): string {
  return `${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function startOfDay(d: Date | string = new Date()): Date {
  const date = typeof d === 'string' ? new Date(d) : new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function startOfMonth(d: Date = new Date()): Date {
  const date = new Date(d);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfMonth(d: Date = new Date()): Date {
  const date = startOfMonth(d);
  date.setMonth(date.getMonth() + 1);
  return date;
}

export function addDays(d: Date, days: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  const x = typeof a === 'string' ? new Date(a) : a;
  const y = typeof b === 'string' ? new Date(b) : b;
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** Selisih hari (dibulatkan, bisa negatif). */
export function daysUntil(iso: string): number {
  const target = startOfDay(iso).getTime();
  const today = startOfDay().getTime();
  return Math.round((target - today) / 86_400_000);
}

/** "Hari ini", "Besok", "3 hari lagi", "Lewat 2 hari" */
export function labelJatuhTempo(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return 'Jatuh tempo hari ini';
  if (diff === 1) return 'Besok';
  if (diff > 1) return `${diff} hari lagi`;
  if (diff === -1) return 'Lewat 1 hari';
  return `Lewat ${Math.abs(diff)} hari`;
}

/** Relatif untuk daftar transaksi: "Hari ini", "Kemarin", atau tanggal. */
export function labelHari(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return 'Hari ini';
  if (diff === -1) return 'Kemarin';
  return formatTanggalSingkat(iso);
}

export function greeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


/**
 * Margin (%) = (harga jual − modal) / harga jual × 100.
 * Dipakai untuk menilai untung relatif terhadap harga jual.
 */
export function marginPercent(sell: number, cost: number): number | null {
  if (!Number.isFinite(sell) || !Number.isFinite(cost) || sell <= 0) return null;
  return Math.round(((sell - cost) / sell) * 1000) / 10;
}

/**
 * Markup (%) = (harga jual − modal) / modal × 100.
 * Bedanya dengan margin: markup dihitung dari harga modal.
 */
export function markupPercent(sell: number, cost: number): number | null {
  if (!Number.isFinite(sell) || !Number.isFinite(cost) || cost <= 0) return null;
  return Math.round(((sell - cost) / cost) * 1000) / 10;
}
