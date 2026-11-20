/**
 * Pembuat struk 58mm (32 kolom) — murni teks, tanpa dependensi.
 * Teks yang sama dipakai untuk pratinjau di layar dan untuk dikirim ke
 * printer thermal lewat ESC/POS.
 */
import { formatRupiah, formatTanggalJam } from '../../utils/format';
import { sanitizePrintText } from '../../utils/security';
import type { LineItem, PayMethod } from '../../data/types';

const WIDTH = 32;

const wrap = (text: string, width = WIDTH): string[] => {
  const words = sanitizePrintText(text).trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current.length) current = word;
    else if (`${current} ${word}`.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length) lines.push(current);
  return lines.length ? lines : [''];
};

const center = (text: string) =>
  wrap(text)
    .map((line) => ' '.repeat(Math.max(0, Math.floor((WIDTH - line.length) / 2))) + line)
    .join('\n');

const line = (char = '-') => char.repeat(WIDTH);

const twoCols = (left: string, right: string) => {
  const rightText = right.slice(0, WIDTH - 2);
  const space = Math.max(1, WIDTH - left.length - rightText.length);
  return `${left}${' '.repeat(space)}${rightText}`;
};

export interface ReceiptInput {
  storeName: string;
  /** Nama cabang; hanya dicetak bila toko punya lebih dari satu cabang. */
  outletName?: string;
  storeCode?: string;
  storePhone?: string;
  invoice: string;
  createdAt: string;
  items: LineItem[];
  total: number;
  /** Bila diisi, struk menampilkan sub total / diskon / pajak secara terpisah. */
  subtotal?: number;
  discount?: number;
  tax?: number;
  taxRate?: number;
  method: PayMethod;
  note?: string;
  cashier?: string;
  footer?: string;
}

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  kasbon: 'KASBON',
};

export function buildReceiptText(input: ReceiptInput): string {
  const rows: string[] = [];

  rows.push(center(input.storeName.toUpperCase() || 'TOKO SAYA'));
  if (input.outletName) rows.push(center(input.outletName));
  if (input.storeCode) rows.push(center(`ID ${input.storeCode}`));
  if (input.storePhone) rows.push(center(input.storePhone));
  rows.push(line());

  rows.push(twoCols('No', input.invoice));
  rows.push(twoCols('Tanggal', formatTanggalJam(input.createdAt)));
  if (input.cashier) rows.push(twoCols('Kasir', input.cashier));
  rows.push(line());

  if (input.items.length > 0) {
    for (const item of input.items) {
      rows.push(sanitizePrintText(item.name).slice(0, WIDTH));
      rows.push(
        twoCols(
          `  ${item.qty} x ${formatRupiah(item.price, { space: false })}`,
          formatRupiah(item.qty * item.price, { space: false }),
        ),
      );
    }
    rows.push(line());
  }

  const showBreakdown =
    (input.subtotal ?? 0) > 0 &&
    ((input.discount ?? 0) > 0 || (input.tax ?? 0) > 0 || (input.taxRate ?? 0) > 0);

  if (showBreakdown) {
    rows.push(twoCols('Sub total', formatRupiah(input.subtotal ?? input.total, { space: false })));
    if ((input.discount ?? 0) > 0) {
      rows.push(twoCols('Diskon', `-${formatRupiah(input.discount ?? 0, { space: false })}`));
    }
    if ((input.tax ?? 0) > 0) {
      const label = input.taxRate && input.taxRate > 0 ? `Pajak ${input.taxRate}%` : 'Pajak';
      rows.push(twoCols(label, formatRupiah(input.tax ?? 0, { space: false })));
    }
  }

  rows.push(twoCols('TOTAL', formatRupiah(input.total, { space: false })));
  rows.push(twoCols(`Bayar (${METHOD_LABEL[input.method]})`, formatRupiah(input.total, { space: false })));
  if (input.note?.trim()) {
    rows.push(line());
    rows.push(sanitizePrintText(`Catatan: ${input.note.trim()}`).slice(0, WIDTH * 2));
  }
  rows.push(line());
  rows.push(center(input.footer?.trim() || 'Terima kasih sudah berbelanja'));
  rows.push(center('Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan'));

  return rows.join('\n');
}

/** Bungkus teks jadi perintah ESC/POS siap kirim ke printer thermal. */
export function buildEscPos(text: string): string {
  const ESC = '\x1B';
  const GS = '\x1D';
  return [
    `${ESC}@`, // init
    `${ESC}a\x01`, // center
    // Buang byte kontrol agar catatan pengguna tidak bisa menyuntik perintah printer.
    sanitizePrintText(text),
    '\n\n\n',
    `${GS}V\x42\x00`, // feed + partial cut
  ].join('');
}
