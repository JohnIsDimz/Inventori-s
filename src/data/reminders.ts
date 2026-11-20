/**
 * Tagih kasbon lewat WhatsApp (Sprint 17).
 *
 * Kenapa begini, bukan API resmi: rilis ini berjalan **tanpa akun dan tanpa
 * server**, jadi yang bisa dilakukan aplikasi adalah membuka WhatsApp dengan
 * pesan yang sudah terisi. Pemilik cukup menekan kirim — tidak ada kode akses,
 * tidak ada biaya, dan tidak ada data pelanggan yang keluar dari HP ini.
 *
 * Aturan yang dipegang:
 *   - yang masuk daftar tagih = kasbon yang **belum lunas** dan jatuh temponya
 *     sudah lewat, hari ini, atau dalam beberapa hari ke depan;
 *   - nomor HP diambil dari buku pelanggan (bila ada), bukan diketik ulang;
 *   - setelah ditagih, kasbon diberi tanda "sudah diingatkan" supaya tidak
 *     ditagih berulang kali di hari yang sama.
 *
 * Semua fungsi di sini MURNI dan diuji `npm run test:reminders`.
 */
import { normalizePhone } from './customers';
import type { AppSettings, Customer, Receivable } from './types';

/** Berapa hari ke depan yang sudah ditampilkan (H+3). */
export const REMIND_WINDOW_DAYS = 3;
/** Jeda minimal sebelum kasbon yang sama ditagih lagi. */
export const REMIND_GAP_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Selisih hari (positif = belum jatuh tempo, negatif = sudah lewat). */
export function daysUntilDue(dueDate: string, now: Date = new Date()): number {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** Kalimat jatuh tempo: "Telat 4 hari", "Hari ini", "3 hari lagi". */
export function dueLabel(days: number): string {
  if (days < 0) return `Telat ${Math.abs(days)} hari`;
  if (days === 0) return 'Jatuh tempo hari ini';
  if (days === 1) return 'Besok';
  return `${days} hari lagi`;
}

export type DueTone = 'lewat' | 'hari-ini' | 'dekat';

export const dueTone = (days: number): DueTone =>
  days < 0 ? 'lewat' : days === 0 ? 'hari-ini' : 'dekat';

/** Isi template pesan; dipakai juga oleh `utils/reminder` supaya tidak dobel. */
export function fillReminderTemplate(input: {
  template: string;
  customerName: string;
  storeName: string;
  amount: number;
  dueDate: string;
  itemCount?: number;
  /** Tanggal siap baca; bila kosong dihitung dari `dueDate`. */
  dateText?: string;
}): string {
  const money = `Rp ${Math.round(input.amount).toLocaleString('id-ID')}`;
  const tanggal = new Date(input.dueDate);
  const tanggalText =
    input.dateText ??
    (Number.isNaN(tanggal.getTime())
      ? '-'
      : `${tanggal.getDate()}/${tanggal.getMonth() + 1}/${tanggal.getFullYear()}`);

  const filled = (input.template || '')
    .replace(/\{nama\}/g, input.customerName)
    .replace(/\{toko\}/g, input.storeName.trim() || 'toko kami')
    .replace(/\{nominal\}/g, money)
    .replace(/\{tanggal\}/g, tanggalText);

  const detail = input.itemCount && input.itemCount > 0 ? `\nRincian: ${input.itemCount} item` : '';
  return `${filled}${detail}`.trim();
}

/** Tautan WhatsApp dengan pesan terisi. Null bila nomor tidak ada. */
export function waLink(phone: string | undefined | null, message: string): string | null {
  const number = normalizePhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

const paidOf = (receivable: Receivable): number =>
  (receivable.payments ?? []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

export const remainingOf = (receivable: Receivable): number =>
  Math.max(0, Math.round(receivable.amount) - paidOf(receivable));

export interface CollectionRow {
  receivableId: string;
  customerName: string;
  /** Nomor siap pakai (62…), kosong bila belum ada di buku pelanggan. */
  phone?: string;
  amount: number;
  dueDate: string;
  days: number;
  tone: DueTone;
  dueText: string;
  message: string;
  /** Tautan WhatsApp siap dibuka (null bila nomor belum ada). */
  link: string | null;
  /** Sudah ditagih dalam beberapa hari terakhir? */
  remindedRecently: boolean;
  lastRemindedAt: string | null;
}

export interface CollectionInput {
  receivables: Receivable[];
  customers: Customer[];
  settings: Pick<AppSettings, 'reminderTemplate'>;
  storeName: string;
  now?: Date;
  /** Tampilkan juga yang jatuh tempo lebih jauh dari `REMIND_WINDOW_DAYS`. */
  windowDays?: number;
}

const key = (name: string) => name.trim().toLowerCase();

/** Cari nomor pelanggan dari buku pelanggan (cocok lewat id, lalu nama). */
function phoneFor(receivable: Receivable, customers: Customer[]): string | undefined {
  const byId = receivable.customerId
    ? customers.find((customer) => customer.id === receivable.customerId)
    : undefined;
  if (byId?.phone) return normalizePhone(byId.phone);
  const byName = customers.find(
    (customer) => key(customer.name) === key(receivable.customerName ?? ''),
  );
  return byName?.phone ? normalizePhone(byName.phone) : undefined;
}

/**
 * Daftar kasbon yang perlu ditagih, urut dari yang paling telat.
 * Yang sudah lunas tidak pernah masuk daftar.
 */
export function collectionRows(input: CollectionInput): CollectionRow[] {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? REMIND_WINDOW_DAYS;
  const rows: CollectionRow[] = [];

  for (const receivable of input.receivables) {
    const amount = remainingOf(receivable);
    if (amount <= 0) continue;
    const days = daysUntilDue(receivable.dueDate, now);
    if (days > windowDays) continue;

    const customerName = receivable.customerName?.trim() || 'Pelanggan';
    const phone = phoneFor(receivable, input.customers);
    const message = fillReminderTemplate({
      template: input.settings.reminderTemplate,
      customerName,
      storeName: input.storeName,
      amount,
      dueDate: receivable.dueDate,
      itemCount: receivable.items?.length,
    });
    const lastRemindedAt = receivable.lastRemindedAt ?? null;
    const remindedRecently = lastRemindedAt
      ? Math.abs(now.getTime() - new Date(lastRemindedAt).getTime()) < REMIND_GAP_DAYS * DAY_MS
      : false;

    rows.push({
      receivableId: receivable.id,
      customerName,
      phone,
      amount,
      dueDate: receivable.dueDate,
      days,
      tone: dueTone(days),
      dueText: dueLabel(days),
      message,
      link: waLink(phone, message),
      remindedRecently,
      lastRemindedAt,
    });
  }

  return rows.sort((a, b) => a.days - b.days || b.amount - a.amount);
}

export interface CollectionTotals {
  count: number;
  amount: number;
  overdueCount: number;
  overdueAmount: number;
  dueTodayCount: number;
  withoutPhone: number;
  /** Yang belum ditagih dalam beberapa hari terakhir. */
  pending: number;
}

export function collectionTotals(rows: CollectionRow[]): CollectionTotals {
  return {
    count: rows.length,
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    overdueCount: rows.filter((row) => row.tone === 'lewat').length,
    overdueAmount: rows.filter((row) => row.tone === 'lewat').reduce((sum, row) => sum + row.amount, 0),
    dueTodayCount: rows.filter((row) => row.tone === 'hari-ini').length,
    withoutPhone: rows.filter((row) => !row.phone).length,
    pending: rows.filter((row) => !row.remindedRecently).length,
  };
}

/** Kalimat ringkas untuk kepala layar. */
export function collectionSummaryText(
  totals: CollectionTotals,
  money: (value: number) => string,
): string {
  if (totals.count === 0) return 'Tidak ada kasbon yang perlu ditagih sekarang.';
  const parts = [`${totals.count} kasbon • ${money(totals.amount)}`];
  if (totals.overdueCount > 0) parts.push(`${totals.overdueCount} telat`);
  if (totals.dueTodayCount > 0) parts.push(`${totals.dueTodayCount} hari ini`);
  return parts.join(' • ');
}
