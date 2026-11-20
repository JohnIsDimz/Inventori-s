/**
 * Tagih kasbon lewat WhatsApp (Sprint 17).
 *
 * Satu layar berisi siapa saja yang perlu ditagih hari ini: kasbon yang sudah
 * telat, yang jatuh tempo hari ini, dan yang jatuh tempo dalam beberapa hari.
 * Pesan sudah terisi dari template toko, jadi pemilik cukup menekan kirim di
 * WhatsApp — tidak perlu mengetik ulang nominal dan tanggal.
 *
 * Tidak ada server dan tidak ada akun: nomor HP diambil dari buku pelanggan,
 * dan aplikasi hanya membuka WhatsApp.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import {
  collectionRows,
  collectionSummaryText,
  collectionTotals,
  type CollectionRow,
} from '../src/data/reminders';
import { useScopedData } from '../src/data/scope';
import { useAppStore } from '../src/data/store';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat } from '../src/utils/format';

type Filter = 'semua' | 'telat' | 'hari-ini';

const FILTER_LABEL: Record<Filter, string> = {
  semua: 'Semua',
  telat: 'Telat',
  'hari-ini': 'Hari ini',
};

export default function TagihKasbonScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useScopedData();
  const markReminded = useAppStore((s) => s.markReminded);

  const [filter, setFilter] = useState<Filter>('semua');
  const [preview, setPreview] = useState<CollectionRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      collectionRows({
        receivables: data.receivables,
        customers: data.customers,
        settings: data.settings,
        storeName: data.profile.name,
      }),
    [data.receivables, data.customers, data.settings, data.profile.name],
  );
  const totals = useMemo(() => collectionTotals(rows), [rows]);

  const visible = useMemo(() => {
    if (filter === 'telat') return rows.filter((row) => row.tone === 'lewat');
    if (filter === 'hari-ini') return rows.filter((row) => row.tone === 'hari-ini');
    return rows;
  }, [rows, filter]);

  const send = async (row: CollectionRow) => {
    if (!row.link) {
      Alert.alert(
        'Nomor HP belum ada',
        `${row.customerName} belum punya nomor di buku pelanggan. Tambahkan nomornya dulu supaya bisa ditagih lewat WhatsApp.`,
        [
          { text: 'Nanti', style: 'cancel' },
          { text: 'Buka pelanggan', onPress: () => router.push('/pelanggan') },
        ],
      );
      return;
    }
    try {
      await Linking.openURL(row.link);
      markReminded(row.receivableId);
      setNotice(`${row.customerName} sudah ditandai ditagih hari ini.`);
      setPreview(null);
    } catch {
      Alert.alert(
        'WhatsApp belum terbuka',
        'Perangkat ini belum bisa membuka WhatsApp. Pesannya sudah disiapkan — bisa disalin dari tombol "Lihat pesan".',
      );
    }
  };

  const tone = (row: CollectionRow) =>
    row.tone === 'lewat' ? 'danger' : row.tone === 'hari-ini' ? 'amber' : 'secondary';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tagih kasbon</Text>
          <Text style={styles.headerSub}>{collectionSummaryText(totals, formatRupiah)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="checkCircle"
              title="Tidak ada yang perlu ditagih"
              description="Semua kasbon lunas, atau jatuh temponya masih lebih dari tiga hari."
              action={
                <Button label="Buka buku kasbon" icon="book" onPress={() => router.push('/kasbon')} />
              }
            />
          </Card>
        ) : (
          <>
            <Card tone="flat">
              <View style={styles.hintRow}>
                <Icon name="whatsapp" size={15} color={colors.primary} strokeWidth={1.9} />
                <Text style={styles.hintText}>
                  Pesan diisi otomatis dari template toko (Pengaturan). Nomor diambil dari buku
                  pelanggan, jadi tidak perlu mengetik ulang.
                </Text>
              </View>
            </Card>

            <View style={styles.statsRow}>
              <Stat label="Kasbon" value={String(totals.count)} />
              <View style={styles.statDivider} />
              <Stat label="Total" value={formatRupiah(totals.amount)} />
              <View style={styles.statDivider} />
              <Stat
                label="Telat"
                value={String(totals.overdueCount)}
                tone={totals.overdueCount > 0 ? colors.danger : undefined}
              />
            </View>

            {totals.withoutPhone > 0 ? (
              <Text style={styles.warnText}>
                {totals.withoutPhone} kasbon belum punya nomor HP. Isi nomornya di buku pelanggan
                supaya bisa ditagih lewat WhatsApp.
              </Text>
            ) : null}

            <View style={styles.filterRow}>
              {(Object.keys(FILTER_LABEL) as Filter[]).map((option) => {
                const active = filter === option;
                const count =
                  option === 'telat'
                    ? totals.overdueCount
                    : option === 'hari-ini'
                      ? totals.dueTodayCount
                      : totals.count;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setFilter(option)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    accessibilityLabel={`Saring ${FILTER_LABEL[option]}`}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {FILTER_LABEL[option]} {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {notice ? (
              <View style={styles.noticeRow}>
                <Icon name="checkCircle" size={14} color={colors.primary} strokeWidth={2} />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            <Card padded={false}>
              {visible.length === 0 ? (
                <EmptyState
                  compact
                  icon="checkCircle"
                  title="Tidak ada di saringan ini"
                  description="Coba pilih Semua."
                />
              ) : (
                visible.map((row, index) => (
                  <View
                    key={row.receivableId}
                    style={[styles.row, index !== visible.length - 1 && styles.rowBorder]}
                  >
                    <View style={styles.rowHead}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {row.customerName}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          Jatuh tempo {formatTanggalSingkat(row.dueDate)}
                          {row.phone ? ` • ${row.phone.replace(/^62/, '0')}` : ' • nomor belum ada'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                        <Text style={styles.rowAmount}>{formatRupiah(row.amount)}</Text>
                        <Chip label={row.dueText} tone={tone(row)} size="sm" />
                      </View>
                    </View>

                    <View style={styles.rowActions}>
                      <Button
                        label={row.remindedRecently ? 'Tagih lagi' : 'Kirim WhatsApp'}
                        icon="whatsapp"
                        onPress={() => void send(row)}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label="Lihat pesan"
                        icon="message"
                        variant="ghost"
                        onPress={() => setPreview(row)}
                        style={{ flex: 1 }}
                      />
                    </View>
                    {row.remindedRecently ? (
                      <Text style={styles.remindedText}>
                        Sudah ditagih {formatTanggalSingkat(row.lastRemindedAt ?? '')} — tidak perlu
                        ditagih lagi hari ini.
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </Card>

            <Text style={styles.footNote}>
              Yang dianggap perlu ditagih: kasbon belum lunas dengan jatuh tempo sudah lewat, hari
              ini, atau paling lama tiga hari ke depan. Kasbon yang baru ditagih tetap muncul, tetapi
              diberi tanda supaya tidak ditagih berulang.
            </Text>
          </>
        )}
      </ScrollView>

      <Sheet
        visible={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `Pesan untuk ${preview.customerName}` : ''}
        subtitle={preview ? `Sisa ${formatRupiah(preview.amount)}` : undefined}
      >
        {preview ? (
          <View style={{ gap: spacing.md }}>
            <Card tone="flat">
              <Text style={styles.messageText}>{preview.message}</Text>
            </Card>
            {preview.phone ? (
              <Button
                label="Buka WhatsApp"
                icon="whatsapp"
                onPress={() => void send(preview)}
                fullWidth
              />
            ) : (
              <Button
                label="Isi nomor pelanggan"
                icon="userPlus"
                onPress={() => {
                  setPreview(null);
                  router.push('/pelanggan');
                }}
                fullWidth
              />
            )}
            <Button
              label="Tandai sudah ditagih"
              icon="check"
              variant="ghost"
              onPress={() => {
                markReminded(preview.receivableId);
                setNotice(`${preview.customerName} sudah ditandai ditagih hari ini.`);
                setPreview(null);
              }}
              fullWidth
            />
          </View>
        ) : null}
      </Sheet>

      <View style={{ height: insets.bottom }} />
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.h1, color: colors.text },
  headerSub: { ...type.caption, color: colors.textDim, marginTop: 2 },
  content: { paddingHorizontal: spacing.base, paddingBottom: 40, gap: spacing.md },
  hintRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  hintText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  stat: { flex: 1, gap: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  statLabel: { ...type.caption, color: colors.textDim },
  statValue: { ...type.bodyMedium, color: colors.text },
  warnText: { ...type.caption, color: colors.amber, lineHeight: 18 },
  filterRow: { flexDirection: 'row', gap: spacing.xs },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.cardHigh },
  filterText: { ...type.caption, color: colors.textMuted },
  filterTextActive: { color: colors.primary, fontWeight: '600' },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  noticeText: { ...type.caption, color: colors.primary, flex: 1 },
  row: { padding: spacing.base, gap: spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowName: { ...type.bodyMedium, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  rowAmount: { ...type.bodyMedium, color: colors.text, marginBottom: 4 },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  remindedText: { ...type.caption, color: colors.textDim },
  footNote: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  messageText: { ...type.body, color: colors.text, lineHeight: 21 },
});
