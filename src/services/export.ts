import { appAlert } from '../utils/alert';
/**
 * Ekspor laporan: CSV (terbuka di Excel/Sheets) dan PDF (via expo-print).
 * Tidak ada data yang dikirim ke server — file dibuat lokal di perangkat.
 */
import { canWrite } from '../data/access';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { BusinessData } from '../data/selectors';
import { buildTransactionsCsv, buildReportHtml } from './report';
export { buildTransactionsCsv, buildReportHtml } from './report';

export async function shareCsv(data: BusinessData, from: Date, to: Date, showProfit = canWrite('profit.view')): Promise<void> {
  try {
    const file = new File(Paths.cache, `laporan-inventoris-${Date.now()}.csv`);
    file.create({ overwrite: true });
    await file.write(buildTransactionsCsv(data, from, to, showProfit && canWrite('profit.view')));

    if (!(await Sharing.isAvailableAsync())) {
      appAlert.alert('Berbagi belum bisa dibuka', 'Coba lagi sebentar lagi, atau ekspor dari menu Cadangan.');
      return;
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Ekspor data transaksi',
      UTI: 'public.comma-separated-values-text',
    });
  } catch (error) {
    appAlert.alert('Gagal mengekspor CSV', 'Coba lagi. Pastikan ruang penyimpanan cukup.');
  }
}

export async function shareReportPdf(data: BusinessData, from: Date, to: Date, showProfit = canWrite('profit.view')): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html: buildReportHtml(data, from, to, showProfit && canWrite('profit.view')), base64: false });
    if (!(await Sharing.isAvailableAsync())) {
      appAlert.alert('Berbagi belum bisa dibuka', 'Coba lagi sebentar lagi, atau ekspor dari menu Cadangan.');
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Bagikan laporan PDF',
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    appAlert.alert('Gagal membuat PDF', 'Coba lagi. Pastikan ruang penyimpanan cukup.');
  }
}
