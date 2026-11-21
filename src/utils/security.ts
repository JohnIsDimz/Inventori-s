/**
 * Utilitas keamanan & sanitasi input.
 *
 * Dipakai untuk menutup tiga kelas masalah yang ditemukan saat audit:
 * 1. HTML/script injection pada laporan PDF (expo-print merender HTML).
 * 2. CSV/Excel formula injection saat data diekspor.
 * 3. Escape-sequence injection pada printer thermal (ESC/POS).
 */

/** Batas wajar nominal uang: Rp 1 .. Rp 1 triliun. */
export const MAX_AMOUNT = 1_000_000_000_000;

/**
 * Validasi & normalisasi nominal. Mengembalikan `null` bila tidak valid,
 * bukan 0 — supaya pemanggil tidak bisa diam-diam menyimpan transaksi kosong.
 */
export function normalizeAmount(
  value: number,
  opts: { min?: number; max?: number } = {},
): number | null {
  const min = opts.min ?? 1;
  const max = opts.max ?? MAX_AMOUNT;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

export function normalizeQty(value: number, max = 100_000): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > max) return null;
  return rounded;
}

/** Tanggal ISO yang valid, atau `fallback` bila input rusak. */
export function safeISODate(value: string | undefined, fallback = new Date().toISOString()): string {
  if (!value) return fallback;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return fallback;
  // Jangan izinkan tanggal absurd (sebelum 2000 / lebih dari 1 tahun ke depan).
  const min = new Date('2000-01-01T00:00:00Z').getTime();
  const max = Date.now() + 366 * 86_400_000;
  if (time < min || time > max) return fallback;
  return new Date(time).toISOString();
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escape teks pengguna sebelum disisipkan ke HTML/PDF. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Cegah CSV/Excel formula injection (OWASP): sel yang dimulai dengan
 * = + - @ atau karakter kontrol diberi prefix apostrof.
 */
export function csvSafe(value: string | number): string {
  const text = String(value ?? '');
  const dangerous = /^[=+\-@\t\r]/.test(text);
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const escaped = cleaned.replace(/"/g, '""');
  const withPrefix = dangerous ? `'${escaped}` : escaped;
  return /[",;\n]/.test(withPrefix) ? `"${withPrefix}"` : withPrefix;
}

/**
 * Bersihkan teks sebelum dikirim ke printer thermal: buang karakter kontrol
 * (ESC/POS memakai 0x1B dan kawan-kawan) tapi pertahankan baris baru.
 */
export function sanitizePrintText(value: unknown, maxLength = 2000): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

/** Ringkas teks untuk log/UI tanpa memotong di tengah karakter aneh. */
export function truncate(value: string, max = 80): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
