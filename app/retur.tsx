/**
 * Retur barang ke supplier (Sprint 15).
 *
 * Barang rusak / salah kirim dikembalikan ke agen. Yang dicatat: barang apa,
 * berapa banyak, dan nilainya menurut harga beli terakhir. Nilai itu dipakai
 * lebih dulu untuk **memotong utang** kulakan yang masih terbuka; kalau tidak
 * ada utang, sisanya menjadi **saldo retur** yang otomatis memotong pembayaran
 * kulakan berikutnya dari supplier yang sama.
 *
 * Sengaja tidak membuat uang tunai "muncul" di kas: uang yang benar-benar
 * kembali diterima pemilik dicatat sendiri lewat Tabungan/modal.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  EmptyState,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import { activeOutlet, stockFor } from '../src/data/outlets';
import {
  availableCredit,
  buildReturnItems,
  openPayablesFor,
  returnCandidates,
  returnReportText,
  returnSummaryText,
  returnTotal,
  supplierKey,
  validateReturn,
} from '../src/data/suppliers';
import { useScopedData } from '../src/data/scope';
import { useAppStore } from '../src/data/store';
import type { PurchaseReturn } from '../src/data/types';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat } from '../src/utils/format';
import { shareMessage } from '../src/utils/reminder';

export default function ReturScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ supplier?: string }>();
  const data = useScopedData();
  const payables = useAppStore((s) => s.payables);
  const purchasesAll = useAppStore((s) => s.purchases);
  const commitReturn = useAppStore((s) => s.commitReturn);

  const outletId = activeOutlet(data.outlets, data.activeOutletId)?.id ?? null;

  // Supplier yang pernah kulakan (yang punya barang untuk diretur).
  const supplierNames = useMemo(() => {
    const names: string[] = [];
    for (const purchase of data.purchases) {
      if (!names.some((name) => supplierKey(name) === supplierKey(purchase.supplierName))) {
        names.push(purchase.supplierName);
      }
    }
    return names;
  }, [data.purchases]);

  const [supplier, setSupplier] = useState<string>(
    params.supplier ?? supplierNames[0] ?? '',
  );
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseReturn | null>(null);

  const candidates = useMemo(
    () =>
      supplier
        ? returnCandidates(purchasesAll, data.products, supplier, (product) =>
            stockFor(product, outletId),
          )
        : [],
    [purchasesAll, data.products, supplier, outletId],
  );

  const items = useMemo(() => buildReturnItems(candidates, counts), [candidates, counts]);
  const total = returnTotal(items);
  const openPayables = supplier ? openPayablesFor(payables, supplier) : [];
  const openDebt = openPayables[0]
    ? openPayables[0].amount -
      openPayables[0].payments.reduce((sum, payment) => sum + payment.amount, 0)
    : 0;
  const applied = Math.min(total, Math.max(0, openDebt));
  const credit = Math.max(0, total - applied);
  const creditBefore = supplier ? availableCredit(purchasesAll, data.purchaseReturns, supplier) : 0;

  const setCount = (productId: string, value: string) => {
    setCounts((current) => ({ ...current, [productId]: value.replace(/[^\d]/g, '').slice(0, 6) }));
    setError(null);
  };

  const submit = () => {
    if (!supplier) {
      setError('Pilih supplier yang barangnya mau diretur.');
      return;
    }
    const checked = validateReturn({ supplierName: supplier, items, payables });
    if (!checked.ok) {
      setError(checked.reason);
      return;
    }
    const saved = commitReturn({ supplierName: supplier, counts, note });
    if (!saved.ok) {
      setError(saved.reason);
      return;
    }
    const fresh = useAppStore.getState().purchaseReturns[0] ?? null;
    setCounts({});
    setNote('');
    setError(null);
    if (fresh) setResult(fresh);
  };

  const share = () => {
    if (!result) return;
    void shareMessage(
      returnReportText(result, data.profile.name, formatRupiah, formatTanggalSingkat),
      'Nota retur',
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Retur barang</Text>
          <Text style={styles.headerSub}>
            {supplier || 'Barang rusak / salah kirim ke supplier'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {data.purchases.length === 0 ? (
          <Card>
            <EmptyState
              icon="truck"
              title="Belum ada kulakan"
              description="Retur hanya bisa untuk barang yang pernah dibeli dari supplier. Catat kulakan dulu."
              action={
                <Button label="Catat kulakan" icon="truck" onPress={() => router.push('/pembelian')} />
              }
            />
          </Card>
        ) : (
          <>
            <Card tone="flat">
              <View style={styles.hintRow}>
                <Icon name="info" size={15} color={colors.secondary} strokeWidth={1.9} />
                <Text style={styles.hintText}>
                  Nilai retur dipakai dulu untuk memotong utang kulakan. Kalau utangnya sudah
                  lunas, sisanya jadi saldo yang memotong kulakan berikutnya.
                </Text>
              </View>
            </Card>

            <View>
              <SectionLabel>SUPPLIER</SectionLabel>
              <View style={styles.chipWrap}>
                {supplierNames.map((name) => {
                  const isActive = supplierKey(name) === supplierKey(supplier);
                  return (
                    <Pressable
                      key={name}
                      onPress={() => {
                        setSupplier(name);
                        setCounts({});
                        setError(null);
                      }}
                      style={[styles.chip, isActive && styles.chipActive]}
                      accessibilityLabel={`Pilih supplier ${name}`}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {creditBefore > 0 ? (
              <Text style={styles.creditHint}>
                Saldo retur supplier ini yang belum terpakai: {formatRupiah(creditBefore)}
              </Text>
            ) : null}

            <TextField
              label="Catatan (opsional)"
              icon="edit"
              placeholder="Contoh: 3 bungkus penyok"
              value={note}
              onChangeText={setNote}
            />

            {candidates.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  icon="package"
                  title="Tidak ada barang untuk diretur"
                  description="Barang dari supplier ini sudah tidak ada di rak cabang ini."
                />
              </Card>
            ) : (
              <Card padded={false}>
                {candidates.map((candidate, index) => {
                  const qty = Number(counts[candidate.productId] ?? 0) || 0;
                  return (
                    <View
                      key={candidate.productId}
                      style={[styles.row, index !== candidates.length - 1 && styles.rowBorder]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {candidate.name}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          Beli {candidate.bought} {candidate.unit} • di rak {candidate.stock}{' '}
                          {candidate.unit} • {formatRupiah(candidate.unitCost)}
                        </Text>
                        {qty > candidate.maxQty ? (
                          <Text style={styles.rowWarn}>
                            Paling banyak {candidate.maxQty} {candidate.unit}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.qtyField}>
                        <TextField
                          keyboardType="number-pad"
                          placeholder="0"
                          value={counts[candidate.productId] ?? ''}
                          onChangeText={(value) => setCount(candidate.productId, value)}
                          accessibilityLabel={`Jumlah retur ${candidate.name}`}
                        />
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}

            {data.purchaseReturns.length > 0 ? (
              <View>
                <SectionLabel>RETUR TERAKHIR</SectionLabel>
                <Card padded={false} tone="flat">
                  {data.purchaseReturns.slice(0, 4).map((row, index, list) => (
                    <View
                      key={row.id}
                      style={[styles.historyRow, index !== list.length - 1 && styles.rowBorder]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {row.supplierName}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {formatTanggalSingkat(row.createdAt)} •{' '}
                          {returnSummaryText(row, formatRupiah)}
                        </Text>
                      </View>
                      <Text style={styles.historyValue}>{formatRupiah(row.total)}</Text>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {data.purchases.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.footerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerLabel}>
                {items.length === 0
                  ? 'Belum ada barang yang diretur'
                  : applied > 0
                    ? `Potong utang ${formatRupiah(applied)}${credit > 0 ? ` • saldo ${formatRupiah(credit)}` : ''}`
                    : `Jadi saldo retur ${formatRupiah(credit)}`}
              </Text>
              <Text style={styles.footerValue}>Nilai retur {formatRupiah(total)}</Text>
            </View>
            <Button
              label="Simpan"
              icon="check"
              onPress={submit}
              disabled={items.length === 0}
              fullWidth={false}
              style={{ paddingHorizontal: spacing.xl }}
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      <Sheet
        visible={result !== null}
        onClose={() => setResult(null)}
        title="Retur tercatat"
        subtitle="Stok sudah dikurangi sesuai jumlah yang dikembalikan."
      >
        {result ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.stats}>
              <Stat label="Nilai retur" value={formatRupiah(result.total)} />
              <View style={styles.statDivider} />
              <Stat
                label="Potong utang"
                value={result.appliedAmount > 0 ? formatRupiah(result.appliedAmount) : '—'}
                tone={colors.amber}
              />
              <View style={styles.statDivider} />
              <Stat
                label="Saldo"
                value={result.creditValue > 0 ? formatRupiah(result.creditValue) : '—'}
                tone={colors.secondary}
              />
            </View>

            <Card tone="flat">
              {result.items.map((item) => (
                <Text key={item.productId} style={styles.resultLine}>
                  {item.name}: {item.qty} {item.unit} × {formatRupiah(item.unitCost)}
                </Text>
              ))}
            </Card>

            {result.creditValue > 0 ? (
              <Text style={styles.creditHint}>
                Saldo {formatRupiah(result.creditValue)} dipakai otomatis saat kamu mencatat
                kulakan berikutnya dari {result.supplierName}.
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <Button label="Bagikan" icon="share" variant="ghost" onPress={share} style={{ flex: 1 }} />
              <Button
                label="Selesai"
                icon="check"
                onPress={() => setResult(null)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : null}
      </Sheet>
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
  content: { paddingHorizontal: spacing.base, paddingBottom: 140, gap: spacing.md },
  hintRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  hintText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.cardHigh },
  chipText: { ...type.caption, color: colors.textMuted },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  creditHint: { ...type.caption, color: colors.secondary, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { ...type.bodyMedium, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  rowWarn: { ...type.caption, color: colors.amber, marginTop: 2 },
  qtyField: { width: 86 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  historyValue: { ...type.bodyMedium, color: colors.text },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerLabel: { ...type.caption, color: colors.textDim },
  footerValue: { ...type.bodyMedium, color: colors.text, marginTop: 2 },
  errorText: { ...type.caption, color: colors.danger },
  stats: {
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
  resultLine: { ...type.caption, color: colors.textMuted, marginBottom: 4 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
});
