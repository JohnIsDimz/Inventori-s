import { useCan, useCanSeeProfit } from '../../src/utils/usePermissions';
import { appAlert } from '../../src/utils/alert';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../src/components/AppHeader';
import { TextField } from '../../src/components/Field';
import { Icon } from '../../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  KeyValueRow,
  SectionLabel,
  Segmented,
  Sheet,
} from '../../src/components/Primitives';
import { TransactionRow } from '../../src/components/TransactionRow';
import { debtRemaining, debtSettled, monthSummary } from '../../src/data/selectors';
import { useAppStore } from '../../src/data/store';
import { useScopedData } from '../../src/data/scope';
import { deletePhoto } from '../../src/services/photos';
import type { Transaction } from '../../src/data/types';
import { colors, fonts, radius, spacing, type } from '../../src/theme/tokens';
import {
  formatJam,
  formatRupiah,
  formatTanggalPanjang,
  labelHari,
  labelJatuhTempo,
} from '../../src/utils/format';

type Filter = 'all' | 'sale' | 'expense' | 'kasbon';

export default function TransaksiScreen() {
  const router = useRouter();
  const showProfit = useCanSeeProfit();
  const mayVoid = useCan('tx.void');
  const params = useLocalSearchParams<{ focus?: string }>();
  const data = useScopedData();
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(params.focus ?? null);

  const summary = monthSummary(data);
  const selected = data.transactions.find((t) => t.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.transactions
      .filter((tx) => {
        if (filter === 'sale' && tx.type !== 'sale') return false;
        if (filter === 'expense' && tx.type !== 'expense') return false;
        if (filter === 'kasbon' && tx.method !== 'kasbon') return false;
        if (!term) return true;
        const category = data.categories.find((c) => c.id === tx.categoryId)?.label ?? '';
        return (
          (tx.note ?? '').toLowerCase().includes(term) ||
          category.toLowerCase().includes(term) ||
          String(tx.amount).includes(term)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data.transactions, data.categories, filter, query]);

  const groups = useMemo(() => {
    const map: { key: string; label: string; items: Transaction[]; income: number; expense: number }[] = [];
    for (const tx of filtered) {
      const key = new Date(tx.createdAt).toDateString();
      const last = map[map.length - 1];
      if (last && last.key === key) {
        last.items.push(tx);
        if (tx.type === 'sale') last.income += tx.amount;
        else last.expense += tx.amount;
      } else {
        map.push({
          key,
          label: labelHari(tx.createdAt),
          items: [tx],
          income: tx.type === 'sale' ? tx.amount : 0,
          expense: tx.type === 'expense' ? tx.amount : 0,
        });
      }
    }
    return map;
  }, [filtered]);

  const selectedCategory = data.categories.find((c) => c.id === selected?.categoryId);
  const selectedReceivable = selected?.receivableId
    ? data.receivables.find((r) => r.id === selected.receivableId)
    : undefined;

  const confirmDelete = (tx: Transaction) => {
    appAlert.alert(
      'Hapus transaksi?',
      'Transaksi akan dihapus dan saldo dihitung ulang otomatis.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => {
            const result = deleteTransaction(tx.id);
            if (!result.ok) {
              appAlert.alert('Tidak bisa dihapus', result.reason);
              return;
            }
            deletePhoto(tx.photoUri);
            setSelectedId(null);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader subtitle="Transaksi" />
      <SectionList
        sections={groups.map((group) => ({ ...group, data: group.items }))}
        keyExtractor={(tx) => tx.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        ListHeaderComponent={<View style={{ gap: spacing.md }}>
        <Card padded={false} style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>Omzet bulan ini</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatRupiah(summary.income)}
              </Text>
              <Text style={styles.summaryHint}>{summary.saleCount} penjualan</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>Pengeluaran</Text>
              <Text style={[styles.summaryValue, { color: colors.tertiary }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatRupiah(summary.expense)}
              </Text>
              <Text style={styles.summaryHint}>{summary.expenseCount} catatan</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>Laba</Text>
              <Text
                style={[styles.summaryValue, { color: summary.profit >= 0 ? colors.secondary : colors.danger }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {showProfit ? formatRupiah(summary.profit) : '—'}
              </Text>
              <Text style={styles.summaryHint}>{showProfit ? `Margin ${summary.margin.toFixed(1)}%` : 'Akses terbatas'}</Text>
            </View>
          </View>
        </Card>

        <TextField
          icon="search"
          placeholder="Cari catatan, kategori, atau nominal"
          value={query}
          onChangeText={setQuery}
          right={
            query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Icon name="close" size={14} color={colors.textFaint} />
              </Pressable>
            ) : null
          }
        />

        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Semua' },
            { value: 'sale', label: 'Masuk', badge: String(data.transactions.filter((t) => t.type === 'sale').length) },
            {
              value: 'expense',
              label: 'Keluar',
              badge: String(data.transactions.filter((t) => t.type === 'expense').length),
            },
            { value: 'kasbon', label: 'Kasbon', badge: String(data.transactions.filter((t) => t.method === 'kasbon').length) },
          ]}
        />

        </View>}
        ListEmptyComponent={
          <Card>
            <EmptyState
              icon={data.transactions.length === 0 ? 'receipt' : 'search'}
              title={data.transactions.length === 0 ? 'Belum ada transaksi' : 'Tidak ada yang cocok'}
              description={
                data.transactions.length === 0
                  ? 'Catatan penjualan dan pengeluaran Anda akan muncul di sini, dikelompokkan per hari.'
                  : 'Coba kata kunci lain atau ganti filter.'
              }
              action={
                data.transactions.length === 0 ? (
                  <Button label="Catat transaksi" icon="plus" onPress={() => router.push('/pilih-transaksi')} />
                ) : (
                  <Button
                    label="Reset filter"
                    variant="ghost"
                    icon="refresh"
                    onPress={() => {
                      setFilter('all');
                      setQuery('');
                    }}
                  />
                )
              }
            />
          </Card>
        }
        renderSectionHeader={({ section: group }) => (
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                <View style={styles.groupTotals}>
                  {group.income > 0 ? (
                    <Text style={[styles.groupTotal, { color: colors.primary }]}>
                      +{formatRupiah(group.income)}
                    </Text>
                  ) : null}
                  {group.expense > 0 ? (
                    <Text style={[styles.groupTotal, { color: colors.tertiary }]}>
                      −{formatRupiah(group.expense)}
                    </Text>
                  ) : null}
                </View>
              </View>
        )}
        renderItem={({ item: tx, index, section }) => (
          <TransactionRow tx={tx} last={index === section.data.length - 1} onPress={() => setSelectedId(tx.id)} />
        )}
      />

      <Sheet
        visible={selected !== null}
        onClose={() => setSelectedId(null)}
        title="Detail transaksi"
        subtitle={selected ? formatTanggalPanjang(selected.createdAt) : undefined}
      >
        {selected ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.detailAmount}>
              <Text
                style={[
                  styles.detailAmountValue,
                  { color: selected.type === 'sale' ? colors.primary : colors.tertiary },
                ]}
              >
                {selected.type === 'sale' ? '+' : '−'}
                {formatRupiah(selected.amount)}
              </Text>
              <View style={styles.detailChips}>
                <Chip
                  label={selected.type === 'sale' ? 'Pemasukan' : 'Pengeluaran'}
                  tone={selected.type === 'sale' ? 'primary' : 'tertiary'}
                  size="sm"
                />
                <Chip
                  label={
                    selected.method === 'cash'
                      ? 'Tunai'
                      : selected.method === 'qris'
                        ? 'QRIS'
                        : selected.method === 'transfer'
                          ? 'Transfer'
                          : 'Kasbon'
                  }
                  tone="neutral"
                  size="sm"
                />
                {selectedCategory ? (
                  <Chip label={selectedCategory.label} tone="secondary" size="sm" icon={selectedCategory.icon} />
                ) : null}
              </View>
            </View>

            <Card padded>
              <KeyValueRow label="Waktu" value={`${formatJam(selected.createdAt)}`} icon="clock" />
              <Divider style={{ marginVertical: 4 }} />
              <KeyValueRow
                label="Metode"
                value={
                  selected.method === 'cash'
                    ? 'Tunai'
                    : selected.method === 'qris'
                      ? 'QRIS / Bank'
                      : selected.method === 'transfer'
                        ? 'Transfer'
                        : 'Kasbon'
                }
                icon="creditCard"
              />
              {selected.items && selected.items.length > 0 ? (
                <>
                  <Divider style={{ marginVertical: 4 }} />
                  <SectionLabel>Rincian barang</SectionLabel>
                  {selected.items.map((item, index) => (
                    <KeyValueRow
                      key={`${item.name}-${index}`}
                      label={`${item.name} × ${item.qty}`}
                      value={formatRupiah(item.price * item.qty)}
                    />
                  ))}
                </>
              ) : null}
              {selectedReceivable ? (
                <>
                  <Divider style={{ marginVertical: 4 }} />
                  <KeyValueRow
                    label="Status kasbon"
                    value={
                      debtSettled(selectedReceivable)
                        ? 'Lunas'
                        : `${formatRupiah(debtRemaining(selectedReceivable))} • ${labelJatuhTempo(selectedReceivable.dueDate)}`
                    }
                    icon="book"
                    valueStyle={{
                      color: debtSettled(selectedReceivable) ? colors.primary : colors.amber,
                    }}
                  />
                </>
              ) : null}
            </Card>

            {selected.note ? (
              <Card>
                <SectionLabel>Catatan</SectionLabel>
                <Text style={styles.detailNote}>{selected.note}</Text>
              </Card>
            ) : null}

            {selected.photoUri ? (
              <Image source={{ uri: selected.photoUri }} style={styles.detailPhoto} contentFit="cover" />
            ) : null}

            {selectedReceivable && !debtSettled(selectedReceivable) ? (
              <Button
                label="Buka kasbon pelanggan"
                icon="book"
                variant="secondary"
                onPress={() => {
                  setSelectedId(null);
                  router.push(`/kasbon/${selectedReceivable.id}`);
                }}
              />
            ) : null}

            {mayVoid ? <Button label="Hapus transaksi" icon="trash" variant="danger" onPress={() => confirmDelete(selected)} /> : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 104 },

  summaryCard: { paddingVertical: spacing.md },
  summaryRow: { flexDirection: 'row' },
  summaryTile: { flex: 1, paddingHorizontal: 10, gap: 3 },
  summaryLabel: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim, letterSpacing: 0.3 },
  summaryValue: { fontFamily: fonts.numBold, fontSize: 12.5 },
  summaryHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },

  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  groupLabel: { ...type.micro, fontFamily: fonts.bold, color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  groupTotals: { flexDirection: 'row', gap: spacing.sm },
  groupTotal: { fontFamily: fonts.numSemibold, fontSize: 11 },

  detailAmount: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  detailAmountValue: { fontFamily: fonts.numBold, fontSize: 30, letterSpacing: -1 },
  detailChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  detailNote: { ...type.body, color: colors.textMuted, lineHeight: 19 },
  detailPhoto: { width: '100%', height: 180, borderRadius: radius.md },
});
