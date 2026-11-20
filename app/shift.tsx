/**
 * Shift kasir.
 *
 * Menjawab pertanyaan yang paling sering ditanyakan pemilik warung:
 * "uang di laci sekarang seharusnya berapa, dan kurang/lebih berapa?"
 *
 * Cara hitung (sama persis dengan server di `sync_shift`):
 *   kas seharusnya = modal awal + penjualan tunai − pengeluaran tunai
 *   selisih        = uang fisik − kas seharusnya
 *
 * Kasbon, QRIS, dan transfer tidak dihitung karena bukan uang fisik.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import { Button, Card, Chip, Divider, KeyValueRow, SectionTitle } from '../src/components/Primitives';
import { activeShift, shiftCash } from '../src/data/selectors';
import { useAppStore } from '../src/data/store';
import { useScopedData } from '../src/data/scope';
import { useAuthStore } from '../src/data/auth';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, parseNumber } from '../src/utils/format';
import { can } from '../src/utils/permissions';

export default function ShiftScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const data = useScopedData();
  const openShift = useAppStore((s) => s.openShift);
  const closeShift = useAppStore((s) => s.closeShift);
  const role = useAuthStore((s) => s.role);
  const allowed = can(role, 'shift.manage');

  const shift = activeShift(data);

  // Rekap periode: berguna saat pemilik menagih setoran beberapa hari kerja.
  const [periodDays, setPeriodDays] = useState<7 | 30>(7);

  const recap = useMemo(() => {
    const since = Date.now() - periodDays * 86_400_000;
    const rows = data.shifts.filter((item) => new Date(item.openedAt).getTime() >= since);
    const closed = rows.filter((item) => item.closedAt);
    const sales = rows.reduce((sum, item) => sum + item.openingCash, 0);
    const diffTotal = closed.reduce((sum, item) => sum + (item.difference ?? 0), 0);
    const shortage = closed.filter((item) => (item.difference ?? 0) < 0).length;
    return { shifts: rows.length, closed: closed.length, openingTotal: sales, diffTotal, shortage };
  }, [data.shifts, periodDays]);
  const cash = useMemo(() => (shift ? shiftCash(data, shift) : null), [data, shift]);

  const [modalAwal, setModalAwal] = useState('');
  const [uangFisik, setUangFisik] = useState('');
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);

  const history = data.shifts.filter((item) => item.closedAt).slice(0, 10);

  const handleOpen = () => {
    const value = parseNumber(modalAwal);
    if (value === null) {
      setError('Modal awal harus berupa angka (boleh 0).');
      return;
    }
    const result = openShift(value);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setModalAwal('');
  };

  const handleClose = () => {
    const value = parseNumber(uangFisik);
    if (value === null) {
      setError('Uang fisik harus berupa angka.');
      return;
    }
    const result = closeShift(value, catatan);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    const selisih = value - (cash?.expected ?? 0);
    setError(null);
    setUangFisik('');
    setCatatan('');
    Alert.alert(
      selisih === 0 ? 'Shift ditutup, uang pas' : 'Shift ditutup',
      selisih === 0
        ? 'Uang di laci sama dengan catatan. Kerja bagus.'
        : selisih > 0
          ? `Uang lebih ${formatRupiah(selisih)} dari catatan.`
          : `Uang kurang ${formatRupiah(Math.abs(selisih))} dari catatan.`,
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Shift kasir</Text>
          <Text style={styles.headerSubtitle}>
            {shift ? 'Shift sedang berjalan' : 'Belum ada shift terbuka'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {!allowed ? (
          <Card>
            <Text style={styles.body}>Peran Anda tidak boleh membuka atau menutup shift.</Text>
          </Card>
        ) : null}

        {shift && cash ? (
          <>
            <SectionTitle title="Ringkasan shift" icon="clock" />
            <Card style={{ gap: spacing.sm }}>
              <KeyValueRow
                label="Dibuka"
                value={new Date(shift.openedAt).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
              <Divider />
              <KeyValueRow label="Modal awal" value={formatRupiah(shift.openingCash)} />
              <Divider />
              <KeyValueRow label="Penjualan tunai" value={formatRupiah(cash.cashIn)} />
              <Divider />
              <KeyValueRow label="Pengeluaran tunai" value={formatRupiah(cash.cashOut)} />
              <Divider />
              <KeyValueRow
                label="Kas seharusnya"
                value={formatRupiah(cash.expected)}
                valueStyle={{ color: colors.primary }}
              />
            </Card>

            <SectionTitle title="Tutup shift" icon="lock" />
            <Card style={{ gap: spacing.md }}>
              <TextField
                label="Uang fisik di laci"
                placeholder="0"
                prefix="Rp"
                keyboardType="number-pad"
                value={uangFisik}
                onChangeText={setUangFisik}
                hint="Hitung semua uang tunai di laci, lalu masukkan jumlahnya."
              />
              <TextField
                label="Catatan (opsional)"
                placeholder="Contoh: ada uang kembalian dari kasir lain"
                value={catatan}
                onChangeText={setCatatan}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label="Tutup shift" icon="check" onPress={handleClose} disabled={!allowed} />
            </Card>
          </>
        ) : (
          <>
            <SectionTitle title="Buka shift" icon="wallet" />
            <Card style={{ gap: spacing.md }}>
              <Text style={styles.body}>
                Masukkan uang tunai yang sudah ada di laci sebelum mulai berjualan. Angka ini
                menjadi dasar perhitungan selisih saat shift ditutup.
              </Text>
              <TextField
                label="Modal awal di laci"
                placeholder="0"
                prefix="Rp"
                keyboardType="number-pad"
                value={modalAwal}
                onChangeText={setModalAwal}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label="Buka shift" icon="wallet" onPress={handleOpen} disabled={!allowed} />
            </Card>
          </>
        )}

        {allowed ? (
          <>
            <SectionTitle title="Rekap periode" icon="chart" />
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.row}>
                {[
                  { days: 7 as const, label: '7 hari' },
                  { days: 30 as const, label: '30 hari' },
                ].map((opt) => {
                  const active = periodDays === opt.days;
                  return (
                    <Pressable
                      key={opt.days}
                      onPress={() => setPeriodDays(opt.days)}
                      style={[styles.periodChip, active && styles.periodChipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.periodText, active && { color: colors.primary }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <KeyValueRow label="Shift dibuka" value={`${recap.shifts} (${recap.closed} ditutup)`} icon="clock" />
              <KeyValueRow label="Total modal awal" value={formatRupiah(recap.openingTotal)} icon="banknote" />
              <KeyValueRow
                label="Akumulasi selisih"
                value={`${recap.diffTotal > 0 ? '+' : ''}${formatRupiah(recap.diffTotal)}`}
                icon="chart"
              />
              <KeyValueRow
                label="Shift kurang"
                value={`${recap.shortage} shift`}
                icon="shield"
              />
              <Text style={styles.historyMeta}>
                Rekap dihitung dari shift yang tersimpan di HP ini. Untuk angka lengkap satu bulan,
                buka halaman Laporan.
              </Text>
            </Card>
          </>
        ) : null}

        {history.length > 0 ? (
          <>
            <SectionTitle title="Riwayat shift" icon="receipt" />
            <View style={{ gap: spacing.sm }}>
              {history.map((item) => {
                const diff = item.difference ?? 0;
                return (
                  <Card key={item.id} style={{ gap: 6 }}>
                    <View style={styles.row}>
                      <Text style={styles.historyDate}>
                        {new Date(item.openedAt).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </Text>
                      <Chip
                        label={
                          diff === 0
                            ? 'Pas'
                            : diff > 0
                              ? `Lebih ${formatRupiah(diff)}`
                              : `Kurang ${formatRupiah(Math.abs(diff))}`
                        }
                        tone={diff === 0 ? 'primary' : diff > 0 ? 'amber' : 'danger'}
                        size="sm"
                      />
                    </View>
                    <Text style={styles.historyMeta}>
                      Modal {formatRupiah(item.openingCash)} • Fisik{' '}
                      {formatRupiah(item.closingCash ?? 0)} • Seharusnya{' '}
                      {formatRupiah(item.expectedCash ?? 0)}
                    </Text>
                  </Card>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  body: { ...type.body, color: colors.textDim, lineHeight: 20 },
  error: { ...type.caption, fontFamily: fonts.medium, color: colors.danger },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyDate: { ...type.caption, fontFamily: fonts.semibold, color: colors.text },
  periodChip: {
    flex: 1,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  periodText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMuted },
  historyMeta: { ...type.caption, color: colors.textFaint },
});
