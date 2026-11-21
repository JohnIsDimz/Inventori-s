/** Pure report builders: callers must explicitly opt into cost/profit sections. */
import {
  csvBlockLines,
  opnameCsvBlock,
  opnameExportRows,
  opnameExportSummaryText,
  priceCsvBlock,
  priceExportRows,
  priceExportSummaryText,
} from '../data/export-extra';
import type { BusinessData } from '../data/selectors';
import { expenseBreakdown, summarize, topProducts } from '../data/selectors';
import { BULAN, formatRupiah, formatTanggalJam, formatTanggalSingkat } from '../utils/format';
import { csvSafe, escapeHtml } from '../utils/security';

/**
 * Sel CSV. `csvSafe` menetralkan formula injection (=, +, -, @) sehingga
 * catatan seperti `=HYPERLINK(...)` tidak dieksekusi Excel/Sheets.
 */
const csvCell = (value: string | number): string => csvSafe(value);

export function buildTransactionsCsv(data: BusinessData, from: Date, to: Date, showProfit = false): string {
  const rows: string[] = ['Tanggal;Jenis;Kategori;Metode;Nominal;Catatan;Status'];
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };

  for (const tx of [...data.transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )) {
    if (!inRange(tx.createdAt)) continue;
    const category = data.categories.find((c) => c.id === tx.categoryId)?.label ?? '-';
    rows.push(
      [
        csvCell(formatTanggalJam(tx.createdAt)),
        csvCell(tx.type === 'sale' ? 'Pemasukan' : 'Pengeluaran'),
        csvCell(category),
        csvCell(tx.method),
        csvCell(tx.amount),
        csvCell(tx.note ?? ''),
        csvCell(tx.method === 'kasbon' ? 'Kasbon' : 'Lunas'),
      ].join(';'),
    );
  }

  // Bagian tambahan Sprint 17: selisih hitung stok & riwayat harga beli.
  if (showProfit) {
    rows.push('', '');
    rows.push(...csvBlockLines(opnameCsvBlock(data.opnames ?? [], from, to), csvCell));
    rows.push('', '');
    rows.push(...csvBlockLines(priceCsvBlock(data.purchases ?? [], data.products ?? []), csvCell));
  }

  // BOM agar Excel membaca UTF-8 dengan benar.
  return `\uFEFF${rows.join('\r\n')}`;
}

export function buildReportHtml(data: BusinessData, from: Date, to: Date, showProfit = false): string {
  const summary = summarize(data, from, to);
  const breakdown = expenseBreakdown(data, from, to);
  const products = topProducts(data, from, to, 5);
  const period = `${formatTanggalSingkat(from)} – ${formatTanggalSingkat(to)}`;
  const storeName = escapeHtml(data.profile.name || 'Toko Saya');

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #16202b; margin: 32px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .muted { color: #6b7785; font-size: 11px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0d9a6c; padding-bottom: 12px; }
    .brand { font-weight: 800; color: #0d9a6c; letter-spacing: .5px; font-size: 12px; }
    .cards { display: flex; gap: 10px; margin: 18px 0; }
    .card { flex: 1; border: 1px solid #e2e7ee; border-radius: 10px; padding: 12px; }
    .card .label { font-size: 9px; letter-spacing: .6px; text-transform: uppercase; color: #6b7785; }
    .card .value { font-size: 16px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    th { text-align: left; background: #f4f7fa; padding: 7px 8px; font-size: 9px; letter-spacing: .5px; text-transform: uppercase; color: #55616f; }
    td { padding: 7px 8px; border-bottom: 1px solid #eef1f5; }
    .right { text-align: right; }
    h2 { font-size: 13px; margin: 22px 0 6px; }
    .foot { margin-top: 26px; font-size: 9px; color: #8b96a3; border-top: 1px solid #e2e7ee; padding-top: 10px; }
  </style></head><body>
    <div class="head">
      <div>
        <div class="brand">INVENTORI’S</div>
        <h1>${storeName}</h1>
        <div class="muted">${data.profile.code ? `ID ${escapeHtml(data.profile.code)} • ` : ''}Laporan ${escapeHtml(period)}</div>
      </div>
      <div class="muted right">Dicetak<br/>${formatTanggalSingkat(new Date())}</div>
    </div>

    <div class="cards">
      <div class="card"><div class="label">Omzet</div><div class="value">${formatRupiah(summary.income)}</div></div>
      <div class="card"><div class="label">Pengeluaran</div><div class="value">${formatRupiah(summary.expense)}</div></div>
${showProfit ? `      <div class="card"><div class="label">Laba bersih</div><div class="value">${formatRupiah(summary.profit)}</div></div>
      <div class="card"><div class="label">Margin</div><div class="value">${summary.margin.toFixed(1)}%</div></div>` : ''}
    </div>

    <h2>Alokasi pengeluaran</h2>
    <table>
      <thead><tr><th>Kategori</th><th class="right">Nominal</th><th class="right">Porsi</th></tr></thead>
      <tbody>
        ${
          breakdown.length === 0
            ? '<tr><td colspan="3">Belum ada pengeluaran pada periode ini.</td></tr>'
            : breakdown
                .map(
                  (row) =>
                    `<tr><td>${escapeHtml(row.label)}</td><td class="right">${formatRupiah(row.amount)}</td><td class="right">${row.percent.toFixed(1)}%</td></tr>`,
                )
                .join('')
        }
      </tbody>
    </table>

    <h2>Barang terlaris</h2>
    <table>
      <thead><tr><th>Barang</th><th class="right">Terjual</th><th class="right">Omzet</th>${showProfit ? '<th class="right">Margin</th>' : ''}</tr></thead>
      <tbody>
        ${
          products.length === 0
            ? '<tr><td colspan="4">Belum ada rincian barang. Isi rincian saat mencatat penjualan.</td></tr>'
            : products
                .map(
                  (item) =>
                    `<tr><td>${escapeHtml(item.name)}</td><td class="right">${item.qty} ${escapeHtml(item.unit)}</td><td class="right">${formatRupiah(item.revenue)}</td>${showProfit ? `<td class="right">${item.hasCost ? formatRupiah(item.margin) : '—'}</td>` : ''}</tr>`,
                )
                .join('')
        }
      </tbody>
    </table>

    ${showProfit ? `    <h2>Selisih hitung stok</h2>
    <div class="muted">${escapeHtml(opnameExportSummaryText(data.opnames ?? [], from, to))}</div>
    <table>
      <thead><tr><th>Tanggal</th><th>Barang</th><th class="right">Tercatat</th><th class="right">Hasil hitung</th><th class="right">Selisih</th><th class="right">Nilai</th></tr></thead>
      <tbody>
        ${
          opnameExportRows(data.opnames ?? [], from, to).length === 0
            ? '<tr><td colspan="6">Belum ada selisih hitung stok di periode ini.</td></tr>'
            : opnameExportRows(data.opnames ?? [], from, to)
                .map(
                  (row) =>
                    `<tr><td>${escapeHtml(formatTanggalSingkat(row.at))}</td><td>${escapeHtml(row.name)}</td><td class="right">${row.system} ${escapeHtml(row.unit)}</td><td class="right">${row.counted} ${escapeHtml(row.unit)}</td><td class="right">${row.diff > 0 ? '+' : ''}${row.diff}</td><td class="right">${formatRupiah(row.value)}</td></tr>`,
                )
                .join('')
        }
      </tbody>
    </table>

    <h2>Riwayat harga beli</h2>
    <div class="muted">${escapeHtml(priceExportSummaryText(data.purchases ?? [], data.products ?? []))}</div>
    <table>
      <thead><tr><th>Barang</th><th class="right">Kali kulakan</th><th class="right">Pertama</th><th class="right">Terakhir</th><th class="right">Terendah</th><th class="right">Tertinggi</th><th class="right">Perubahan</th></tr></thead>
      <tbody>
        ${
          priceExportRows(data.purchases ?? [], data.products ?? []).length === 0
            ? '<tr><td colspan="7">Belum ada barang yang pernah dikulak.</td></tr>'
            : priceExportRows(data.purchases ?? [], data.products ?? [])
                .slice(0, 12)
                .map(
                  (row) =>
                    `<tr><td>${escapeHtml(row.name)}</td><td class="right">${row.count}</td><td class="right">${formatRupiah(row.first)}</td><td class="right">${formatRupiah(row.latest)}</td><td class="right">${formatRupiah(row.lowest)}</td><td class="right">${formatRupiah(row.highest)}</td><td class="right">${Math.abs(row.changePercent) < 0.5 ? 'tetap' : `${row.changePercent > 0 ? '+' : '−'}${Math.abs(row.changePercent).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`}</td></tr>`,
                )
                .join('')
        }
      </tbody>
    </table>

` : ''}

    <h2>Ringkasan kas</h2>
    <table>
      <tbody>
        <tr><td>Uang masuk (penjualan tunai/QRIS + pembayaran kasbon)</td><td class="right">${formatRupiah(summary.cashIn)}</td></tr>
        <tr><td>Uang keluar (biaya + pembayaran utang)</td><td class="right">${formatRupiah(summary.cashOut)}</td></tr>
        <tr><td><b>Selisih kas periode</b></td><td class="right"><b>${formatRupiah(summary.cashIn - summary.cashOut)}</b></td></tr>
        <tr><td>Kasbon baru terbentuk</td><td class="right">${formatRupiah(summary.receivableNew)}</td></tr>
      </tbody>
    </table>

    <div class="foot">
      Laporan dibuat otomatis oleh Inventori’s dari ${summary.txCount} catatan transaksi pada periode
      ${BULAN[from.getMonth()]} ${from.getFullYear()}. Angka dihitung ulang setiap kali transaksi berubah,
      tanpa data contoh.
    </div>
  </body></html>`;
}

