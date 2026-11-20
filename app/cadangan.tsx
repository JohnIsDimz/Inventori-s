/**
 * Cadangan lokal — ekspor & impor seluruh data tanpa cloud.
 *
 * Kenapa ada: pengguna mode lokal tidak punya backup server. Kalau HP hilang
 * atau aplikasi dipasang ulang, data ikut hilang. Satu berkas JSON yang bisa
 * dikirim ke WhatsApp/Drive sudah cukup untuk menyelamatkan usaha.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import { Button, Card, Chip, Divider, KeyValueRow, SectionLabel, SectionTitle } from '../src/components/Primitives';
import { useAppStore } from '../src/data/store';
import { buildTransactionsCsv } from '../src/services/export';
import {
  BACKUP_REMIND_DAYS,
  backupFileName,
  backupReminder,
  countPayload,
} from '../src/services/backup';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { formatTanggalJam } from '../src/utils/format';

export default function CadanganScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const data = useAppStore();
  const exportBackupText = useAppStore((s) => s.exportBackupText);
  const importBackupText = useAppStore((s) => s.importBackupText);
  const markBackupDone = useAppStore((s) => s.markBackupDone);

  const [mode, setMode] = useState<'merge' | 'latest' | 'replace'>('merge');
  const [pasteText, setPasteText] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const counts = useMemo(
    () =>
      countPayload({
        profile: data.profile,
        settings: data.settings,
        categories: data.categories,
        products: data.products,
        transactions: data.transactions,
        receivables: data.receivables,
        payables: data.payables,
        allocations: data.allocations,
        shifts: data.shifts,
        orders: data.orders,
        customers: data.customers,
        outlets: data.outlets,
        opnames: data.opnames,
        purchases: data.purchases,
        suppliers: data.suppliers,
        purchaseReturns: data.purchaseReturns,
      }),
    [data],
  );

  const rawJson = useMemo(() => (showRaw ? exportBackupText() : ''), [showRaw, exportBackupText]);

  const reminder = useMemo(
    () =>
      backupReminder({
        lastBackupAt: data.settings.lastBackupAt,
        hasData: counts.produk + counts.transaksi + counts.kasbon > 0,
      }),
    [data.settings.lastBackupAt, counts],
  );
  const lastBackupLabel = data.settings.lastBackupAt
    ? formatTanggalJam(data.settings.lastBackupAt)
    : 'Belum pernah';

  /**
   * Di web tidak ada dialog berbagi. Tanpa ini tombol "Bagikan" hanya bisa
   * menampilkan teks mentah, padahal peramban bisa mengunduh berkas langsung.
   */
  const downloadOnWeb = (text: string, filename: string, mime: string): boolean => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  };

  const shareBackup = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const text = exportBackupText();
      const name = backupFileName(data.profile.name);

      if (Platform.OS === 'web') {
        const ok = downloadOnWeb(text, name, 'application/json');
        setStatus({
          tone: ok ? 'ok' : 'error',
          text: ok ? `Berkas ${name} diunduh.` : 'Berkas gagal diunduh. Coba lagi.',
        });
        if (ok) markBackupDone();
        return;
      }

      const file = new File(Paths.cache, name);
      file.create({ overwrite: true });
      file.write(text);

      if (!(await Sharing.isAvailableAsync())) {
        setShowRaw(true);
        setStatus({
          tone: 'ok',
          text: 'Dialog berbagi belum terbuka. Teks cadangan ditampilkan di bawah — salin dan simpan sendiri.',
        });
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Simpan / bagikan cadangan',
        UTI: 'public.json',
      });
      markBackupDone();
      setStatus({ tone: 'ok', text: `Berkas cadangan dibuat (${name}).` });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Gagal membuat berkas cadangan.',
      });
    } finally {
      setBusy(false);
    }
  };

  const shareTransactionsCsv = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const csv = buildTransactionsCsv(data, new Date(0), new Date());
      const csvName = `transaksi-inventoris-${Date.now()}.csv`;
      if (Platform.OS === 'web') {
        const ok = downloadOnWeb(csv, csvName, 'text/csv;charset=utf-8');
        setStatus({
          tone: ok ? 'ok' : 'error',
          text: ok ? `Berkas ${csvName} diunduh.` : 'Berkas gagal diunduh. Coba lagi.',
        });
        return;
      }
      const file = new File(Paths.cache, csvName);
      file.create({ overwrite: true });
      file.write(csv);
      if (!(await Sharing.isAvailableAsync())) {
        setStatus({ tone: 'error', text: 'Perangkat ini tidak mendukung dialog berbagi.' });
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Ekspor transaksi (CSV)',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Gagal mengekspor CSV.',
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = (text: string) => {
    const result = importBackupText(text, mode);
    if (!result.ok) {
      setStatus({ tone: 'error', text: result.reason });
      return;
    }
    const added = result.result.added;
    const summary =
      mode === 'replace'
        ? `Data diganti: ${added.produk} barang, ${added.transaksi} transaksi, ${added.kasbon} kasbon.`
        : mode === 'latest'
          ? `Digabung (versi terbaru menang): ${added.produk} barang, ${added.transaksi} transaksi, ${added.kasbon} kasbon diperbarui.`
          : `Ditambahkan: ${added.produk} barang, ${added.transaksi} transaksi, ${added.kasbon} kasbon baru.`;
    setStatus({ tone: 'ok', text: summary });
    setPasteText('');
    setShowRaw(false);
  };

  /**
   * Di aplikasi (Android/iOS) pakai Alert bawaan. Di web `Alert.alert` tidak
   * menampilkan apa pun, jadi memakai confirm peramban — kalau tidak, tombol
   * "Pulihkan" akan terasa tidak bereaksi.
   */
  const confirmRestore = (text: string, source: string) => {
    if (Platform.OS === 'web') {
      const title =
        mode === 'replace'
          ? 'Ganti semua data?'
          : mode === 'latest'
            ? 'Gabungkan versi terbaru?'
            : 'Gabungkan cadangan?';
      const message =
        mode === 'replace'
          ? `Semua data di perangkat ini akan DIGANTI dengan isi cadangan dari ${source}. Tindakan ini tidak bisa dibatalkan.`
          : mode === 'latest'
            ? `Data dari ${source} akan digabung. Untuk catatan yang sama, versi yang lebih baru dipakai; data lokal yang lebih baru tetap dipertahankan.`
            : `Data dari ${source} akan ditambahkan. Data yang sudah ada tidak dihapus.`;
      const agreed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`${title}\n\n${message}`)
          : false;
      if (agreed) restore(text);
      return;
    }

    Alert.alert(
      mode === 'replace'
        ? 'Ganti semua data?'
        : mode === 'latest'
          ? 'Gabungkan versi terbaru?'
          : 'Gabungkan cadangan?',
      mode === 'replace'
        ? `Semua data di perangkat ini akan DIGANTI dengan isi cadangan dari ${source}. Tindakan ini tidak bisa dibatalkan.`
        : mode === 'latest'
          ? `Data dari ${source} akan digabung. Untuk catatan yang sama, versi yang lebih baru dipakai.`
          : `Data dari ${source} akan ditambahkan. Data yang sudah ada tidak dihapus.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: mode === 'replace' ? 'Ganti data' : mode === 'latest' ? 'Gabungkan terbaru' : 'Gabungkan',
          style: mode === 'replace' ? 'destructive' : 'default',
          onPress: () => restore(text),
        },
      ],
    );
  };

  const pickFile = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) {
        setBusy(false);
        return;
      }
      const asset = picked.assets[0];
      const file = new File(asset.uri);
      const text = await file.text();
      setBusy(false);
      confirmRestore(text, asset.name ?? 'berkas');
    } catch (error) {
      setBusy(false);
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Berkas tidak bisa dibaca.',
      });
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Cadangan data</Text>
          <Text style={styles.headerSubtitle}>Simpan & pindahkan data toko</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.cardTitle}>Yang tersimpan di perangkat ini</Text>
          <KeyValueRow label="Barang" value={String(counts.produk)} icon="package" />
          <KeyValueRow label="Transaksi" value={String(counts.transaksi)} icon="receipt" />
          <KeyValueRow label="Kasbon" value={String(counts.kasbon)} icon="book" />
          <KeyValueRow label="Shift" value={String(counts.shift)} icon="clock" />
          <Divider />
          <KeyValueRow label="Cadangan terakhir" value={lastBackupLabel} icon="history" />
          {reminder.state === 'waktunya' || reminder.state === 'belum-pernah' ? (
            <View style={styles.reminderBox}>
              <Icon name="alert" size={15} color={colors.amber} strokeWidth={1.9} />
              <Text style={styles.reminderText}>{reminder.message}</Text>
            </View>
          ) : reminder.state === 'aman' ? (
            <Text style={styles.hint}>
              Aman — cadangan terakhir {reminder.days === 0 ? 'hari ini' : `${reminder.days} hari lalu`}.
              Ulangi setiap {BACKUP_REMIND_DAYS} hari.
            </Text>
          ) : (
            <Text style={styles.hint}>
              Cadangan memuat semua data di atas beserta pengaturan toko. Berkasnya dibuat di HP
              ini dan tidak dikirim ke mana pun.
            </Text>
          )}
        </Card>

        <View>
          <SectionTitle title="Ekspor" icon="download" />
          <Card style={{ gap: spacing.sm }}>
            <Button
              label={busy ? 'Menyiapkan…' : 'Bagikan berkas cadangan (.json)'}
              icon="download"
              onPress={() => void shareBackup()}
              disabled={busy}
            />
            <Button
              label="Ekspor transaksi ke CSV"
              variant="secondary"
              icon="fileText"
              onPress={() => void shareTransactionsCsv()}
              disabled={busy || data.transactions.length === 0}
            />
            <Pressable onPress={() => setShowRaw((value) => !value)} hitSlop={8}>
              <Text style={styles.link}>
                {showRaw ? 'Sembunyikan teks cadangan' : 'Tampilkan teks cadangan (salin manual)'}
              </Text>
            </Pressable>
            {showRaw ? (
              <View style={styles.rawBox}>
                <Text selectable style={styles.rawText} numberOfLines={12}>
                  {rawJson}
                </Text>
              </View>
            ) : null}
          </Card>
        </View>

        <View>
          <SectionTitle title="Pulihkan" icon="refresh" />
          <Card style={{ gap: spacing.md }}>
            <SectionLabel>Cara memulihkan</SectionLabel>
            <View style={styles.modeRow}>
              {[
                { id: 'merge' as const, label: 'Gabungkan', hint: 'aman' },
                { id: 'latest' as const, label: 'Terbaru', hint: 'versi baru' },
                { id: 'replace' as const, label: 'Ganti semua', hint: 'pindah HP' },
              ].map((opt) => {
                const active = mode === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setMode(opt.id)}
                    style={[styles.modeChip, active && styles.modeChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.modeLabel, active && { color: colors.primary }]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.modeHint}>{opt.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {mode === 'merge'
                ? 'Data dari cadangan ditambahkan; data yang sudah ada tidak dihapus. Aman untuk menggabung dua HP.'
                : 'Semua data di perangkat ini diganti dengan isi cadangan. Cocok saat pindah HP baru.'}
            </Text>

            <Button
              label={busy ? 'Memproses…' : 'Pilih berkas cadangan'}
              variant="secondary"
              icon="fileText"
              onPress={() => void pickFile()}
              disabled={busy}
            />

            <Divider />
            <TextField
              label="Atau tempel isi cadangan"
              multiline
              placeholder='Tempel teks JSON cadangan di sini…'
              value={pasteText}
              onChangeText={setPasteText}
              hint="Berguna bila berkas dikirim lewat chat."
            />
            <Button
              label="Pulihkan dari teks"
              icon="check"
              onPress={() => confirmRestore(pasteText, 'teks tempelan')}
              disabled={busy || pasteText.trim().length < 20}
            />
          </Card>
        </View>

        {status ? (
          <Card style={{ gap: 6 }}>
            <Chip
              label={status.tone === 'ok' ? 'Berhasil' : 'Gagal'}
              tone={status.tone === 'ok' ? 'primary' : 'danger'}
              size="sm"
            />
            <Text style={styles.statusText}>{status.text}</Text>
          </Card>
        ) : null}

        <Text style={styles.footer}>
          Dibuat {formatTanggalJam(new Date().toISOString())}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  reminderBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: colors.amberBorder,
  },
  reminderText: { ...type.caption, color: colors.amber, flex: 1, lineHeight: 17 },
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { ...type.h2, fontSize: 15, color: colors.white },
  headerSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },
  content: { padding: spacing.base, gap: spacing.lg },
  cardTitle: { ...type.h2, fontFamily: fonts.bold, color: colors.text },
  hint: { ...type.caption, color: colors.textDim, lineHeight: 17 },
  link: { ...type.caption, fontFamily: fonts.semibold, color: colors.secondary },
  rawBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgDeep,
    padding: spacing.sm,
  },
  rawText: { fontFamily: fonts.mono, fontSize: 9.5, lineHeight: 13, color: colors.textFaint },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: {
    // Tiga pilihan harus sama lebar & sama tinggi walau label berbeda panjang.
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 64,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  modeChipActive: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  modeLabel: { ...type.body, fontFamily: fonts.semibold, color: colors.text, textAlign: 'center' },
  modeHint: { ...type.micro, color: colors.textFaint, textAlign: 'center' },
  statusText: { ...type.body, color: colors.textDim, lineHeight: 19 },
  footer: { ...type.micro, color: colors.textFaint, textAlign: 'center' },
});
