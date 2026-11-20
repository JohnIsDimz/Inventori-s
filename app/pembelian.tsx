/**
 * Catat kulakan (Sprint 14).
 *
 * Alur yang ditiru dari kebiasaan warung: barang datang dari agen, nota
 * diletakkan di meja, lalu dicatat. Yang perlu diketik hanya **berapa banyak**
 * dan **harga belinya** — stok dan harga modal rata-rata diurus aplikasi.
 *
 * Uang yang keluar hari ini dicatat sebesar yang benar-benar dibayar. Kalau
 * belum lunas, sisanya otomatis masuk daftar utang supplier, bukan dianggap
 * sudah dibayar.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '../src/components/Field';
import { Icon } from '../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  SectionLabel,
  Sheet,
} from '../src/components/Primitives';
import { activeOutlet, outletLabel, stockFor } from '../src/data/outlets';
import {
  buildPurchaseItems,
  parseMoney,
  parseQty,
  previewCosts,
  purchaseRemaining,
  purchaseReportText,
  purchaseSummaryText,
  purchaseTotal,
  PURCHASE_METHODS,
  supplierSuggestions,
  validatePurchase,
  type PurchaseEntry,
} from '../src/data/purchases';
import { useScopedData } from '../src/data/scope';
import { availableCredit } from '../src/data/suppliers';
import { useAppStore } from '../src/data/store';
import type { PayMethod, Product, Purchase } from '../src/data/types';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat } from '../src/utils/format';
import { shareMessage } from '../src/utils/reminder';

type PayMode = 'lunas' | 'sebagian' | 'utang';

const PAY_MODE_LABEL: Record<PayMode, string> = {
  lunas: 'Lunas',
  sebagian: 'Bayar sebagian',
  utang: 'Belum bayar',
};

/** Jatuh tempo utang kulakan: tujuh hari, cukup untuk agen keliling. */
const dueDateIn = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

export default function PembelianScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useScopedData();
  const commitPurchase = useAppStore((s) => s.commitPurchase);

  const [supplier, setSupplier] = useState('');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Record<string, PurchaseEntry | undefined>>({});
  const [payMode, setPayMode] = useState<PayMode>('lunas');
  const [paidText, setPaidText] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Purchase | null>(null);

  const outletId = activeOutlet(data.outlets, data.activeOutletId)?.id ?? null;

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return data.products;
    return data.products.filter(
      (product) =>
        product.name.toLowerCase().includes(text) || (product.barcode ?? '').includes(text),
    );
  }, [data.products, query]);

  const items = useMemo(
    () => buildPurchaseItems(data.products, outletId, entries),
    [data.products, outletId, entries],
  );
  const total = purchaseTotal(items);

  const paid = useMemo(() => {
    if (payMode === 'lunas') return total;
    if (payMode === 'utang') return 0;
    return Math.min(total, parseMoney(paidText) ?? 0);
  }, [payMode, paidText, total]);

  const remaining = Math.max(0, total - paid);

  const preview = useMemo(
    () =>
      previewCosts(data.products, items, (product) => stockFor(product, outletId)),
    [data.products, items, outletId],
  );

  const setEntry = (productId: string, patch: Partial<PurchaseEntry>) => {
    setEntries((current) => {
      const base: PurchaseEntry =
        current[productId] ?? { productId, qty: '', unitCost: '' };
      return { ...current, [productId]: { ...base, ...patch, productId } };
    });
    setError(null);
  };

  const clearAll = () => {
    setEntries({});
    setNote('');
    setPaidText('');
    setPayMode('lunas');
    setError(null);
  };

  const submit = () => {
    const checked = validatePurchase({ supplierName: supplier, items, paid });
    if (!checked.ok) {
      setError(checked.reason ?? 'Kulakan belum bisa disimpan.');
      return;
    }
    const saved = commitPurchase({
      supplierName: supplier,
      entries,
      paid,
      method,
      dueDate: dueDateIn(7),
      note,
    });
    if (!saved.ok) {
      setError(saved.reason);
      return;
    }
    const fresh = useAppStore.getState().purchases[0] ?? null;
    setEntries({});
    setNote('');
    setPaidText('');
    setPayMode('lunas');
    setSupplier('');
    setError(null);
    if (fresh) setResult(fresh);
  };

  const share = () => {
    if (!result) return;
    void shareMessage(
      purchaseReportText(result, data.profile.name, formatRupiah, formatTanggalSingkat),
      'Nota kulakan',
    );
  };

  const suggestions = supplierSuggestions(data.purchases);
  const creditReady = supplier.trim()
    ? availableCredit([...data.purchases], [...data.purchaseReturns], supplier)
    : 0;
  const history = data.purchases.slice(0, 5);
  const filledCount = items.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Catat kulakan</Text>
          <Text style={styles.headerSub}>
            {data.outlets.length > 1
              ? outletLabel(activeOutlet(data.outlets, data.activeOutletId))
              : 'Belanja stok ke supplier'}
          </Text>
        </View>
        {filledCount > 0 ? (
          <Pressable onPress={clearAll} hitSlop={8} accessibilityLabel="Kosongkan isian">
            <Text style={styles.clearText}>Kosongkan</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {data.products.length === 0 ? (
          <Card>
            <EmptyState
              icon="package"
              title="Belum ada barang"
              description="Tambahkan barang di Katalog & stok dulu, lalu kembali ke sini untuk mencatat kulakan."
              action={<Button label="Buka katalog" icon="package" onPress={() => router.push('/stok')} />}
            />
          </Card>
        ) : (
          <>
            <Card tone="flat">
              <View style={styles.hintRow}>
                <Icon name="info" size={15} color={colors.secondary} strokeWidth={1.9} />
                <Text style={styles.hintText}>
                  Ketik jumlah yang dibeli dan harga belinya. Stok bertambah, dan harga modal
                  barang dihitung rata-rata supaya laba tetap akurat.
                </Text>
              </View>
            </Card>

            <TextField
              label="Supplier / toko kulakan"
              icon="truck"
              placeholder="Contoh: Agen Sumber Rejeki"
              value={supplier}
              onChangeText={(text) => {
                setSupplier(text);
                setError(null);
              }}
              maxLength={60}
            />
            {suggestions.length > 0 ? (
              <View style={styles.chipRow}>
                {suggestions.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => setSupplier(name)}
                    style={styles.suggestChip}
                    accessibilityLabel={`Pakai supplier ${name}`}
                  >
                    <Text style={styles.suggestText}>{name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <TextField
              icon="search"
              placeholder="Cari barang atau barcode"
              value={query}
              onChangeText={setQuery}
            />

            {filtered.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  icon="search"
                  title="Barang tidak ditemukan"
                  description="Coba kata lain, atau tambahkan barangnya di katalog."
                />
              </Card>
            ) : (
              <Card padded={false}>
                {filtered.map((product, index) => (
                  <PurchaseRow
                    key={product.id}
                    product={product}
                    outletId={outletId}
                    entry={entries[product.id]}
                    onChange={(patch) => setEntry(product.id, patch)}
                    last={index === filtered.length - 1}
                  />
                ))}
              </Card>
            )}

            <View>
              <SectionLabel>PEMBAYARAN</SectionLabel>
              <View style={styles.modeRow}>
                {(Object.keys(PAY_MODE_LABEL) as PayMode[]).map((mode) => {
                  const active = payMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        setPayMode(mode);
                        setError(null);
                      }}
                      style={[styles.modeChip, active && styles.modeChipActive]}
                      accessibilityLabel={`Bayar ${PAY_MODE_LABEL[mode]}`}
                    >
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>
                        {PAY_MODE_LABEL[mode]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {payMode === 'sebagian' ? (
                <TextField
                  label="Jumlah dibayar sekarang"
                  prefix="Rp"
                  keyboardType="number-pad"
                  placeholder={total > 0 ? String(total) : '0'}
                  value={paidText}
                  onChangeText={setPaidText}
                  accessibilityLabel="Jumlah dibayar sekarang"
                />
              ) : null}

              {payMode !== 'utang' ? (
                <View style={styles.methodRow}>
                  {PURCHASE_METHODS.map((option) => {
                    const active = method === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setMethod(option.id)}
                        style={[styles.methodChip, active && styles.methodChipActive]}
                        accessibilityLabel={`Bayar dengan ${option.label}`}
                      >
                        <Text style={[styles.methodText, active && styles.methodTextActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {creditReady > 0 ? (
                <Text style={styles.creditHint}>
                  Saldo retur {formatRupiah(creditReady)} dipakai otomatis, jadi uang tunai yang
                  keluar lebih sedikit.
                </Text>
              ) : null}

              {remaining > 0 ? (
                <Text style={styles.debtHint}>
                  Sisa {formatRupiah(remaining)} dicatat sebagai utang supplier.
                </Text>
              ) : null}
            </View>

            <TextField
              label="Catatan (opsional)"
              icon="edit"
              placeholder="Contoh: ongkir ditanggung agen"
              value={note}
              onChangeText={setNote}
            />

            {history.length > 0 ? (
              <View>
                <SectionLabel>KULAKAN TERAKHIR</SectionLabel>
                <Card padded={false} tone="flat">
                  {history.map((purchase, index) => {
                    const left = purchaseRemaining(purchase);
                    return (
                      <View
                        key={purchase.id}
                        style={[styles.historyRow, index !== history.length - 1 && styles.historyBorder]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.historyName} numberOfLines={1}>
                            {purchase.supplierName}
                          </Text>
                          <Text style={styles.historyMeta} numberOfLines={1}>
                            {formatTanggalSingkat(purchase.createdAt)} •{' '}
                            {purchaseSummaryText(purchase, formatRupiah)}
                          </Text>
                        </View>
                        {left > 0 ? (
                          <Chip label="Belum lunas" tone="amber" size="sm" />
                        ) : (
                          <Chip label="Lunas" tone="primary" size="sm" />
                        )}
                      </View>
                    );
                  })}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {data.products.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.footerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerLabel}>
                {filledCount === 0
                  ? 'Belum ada barang yang diisi'
                  : `${filledCount} barang • dibayar ${formatRupiah(paid)}`}
              </Text>
              <Text style={styles.footerValue}>Total {formatRupiah(total)}</Text>
            </View>
            <Button
              label="Simpan"
              icon="check"
              onPress={submit}
              disabled={filledCount === 0 || total <= 0}
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
        title="Kulakan tercatat"
        subtitle="Stok sudah bertambah dan harga modal ikut diperbarui."
      >
        {result ? (
          <ResultBody
            purchase={result}
            onShare={share}
            onClose={() => setResult(null)}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

function PurchaseRow({
  product,
  outletId,
  entry,
  onChange,
  last,
}: {
  product: Product;
  outletId: string | null;
  entry?: PurchaseEntry;
  onChange: (patch: Partial<PurchaseEntry>) => void;
  last: boolean;
}) {
  const stock = stockFor(product, outletId);
  const qty = parseQty(entry?.qty);
  const unitCost = parseMoney(entry?.unitCost) ?? Math.round(product.costPrice);
  const nextCost = useMemo(() => {
    if (qty === null) return null;
    const preview = previewCosts([product], [
      { productId: product.id, name: product.name, unit: product.unit, qty, unitCost },
    ], () => stock);
    return preview[0]?.after ?? null;
  }, [product, qty, unitCost, stock]);

  const subtotal = qty === null ? 0 : qty * unitCost;

  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            Stok {stock} {product.unit} • modal {formatRupiah(product.costPrice)}
          </Text>
        </View>
        {subtotal > 0 ? (
          <Text style={styles.rowSubtotal}>{formatRupiah(subtotal)}</Text>
        ) : null}
      </View>

      <View style={styles.rowFields}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Jumlah</Text>
          <TextField
            keyboardType="number-pad"
            placeholder="0"
            value={entry?.qty === undefined ? '' : String(entry.qty)}
            onChangeText={(text) => onChange({ qty: text.replace(/[^\d]/g, '').slice(0, 6) })}
            accessibilityLabel={`Jumlah beli ${product.name}`}
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <Text style={styles.fieldLabel}>Harga beli / {product.unit}</Text>
          <TextField
            prefix="Rp"
            keyboardType="number-pad"
            placeholder={String(product.costPrice)}
            value={entry?.unitCost === undefined ? '' : String(entry.unitCost)}
            onChangeText={(text) => onChange({ unitCost: text.replace(/[^\d]/g, '').slice(0, 9) })}
            accessibilityLabel={`Harga beli ${product.name}`}
          />
        </View>
      </View>

      {nextCost !== null && nextCost !== Math.round(product.costPrice) ? (
        <Text style={styles.costHint}>
          Modal rata-rata menjadi {formatRupiah(nextCost)} (dari {formatRupiah(product.costPrice)})
        </Text>
      ) : null}
    </View>
  );
}

function ResultBody({
  purchase,
  onShare,
  onClose,
}: {
  purchase: Purchase;
  onShare: () => void;
  onClose: () => void;
}) {
  const remaining = purchaseRemaining(purchase);
  const changes = (purchase.costChanges ?? []).filter(
    (change) => change.after !== change.before,
  );

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.resultStats}>
        <View style={styles.resultStat}>
          <Text style={styles.resultLabel}>Total</Text>
          <Text style={styles.resultValue}>{formatRupiah(purchase.total)}</Text>
        </View>
        <View style={styles.resultDivider} />
        <View style={styles.resultStat}>
          <Text style={styles.resultLabel}>Dibayar</Text>
          <Text style={styles.resultValue}>{formatRupiah(purchase.paid)}</Text>
        </View>
        <View style={styles.resultDivider} />
        <View style={styles.resultStat}>
          <Text style={styles.resultLabel}>Sisa</Text>
          <Text
            style={[
              styles.resultValue,
              { color: remaining > 0 ? colors.amber : colors.primary },
            ]}
          >
            {remaining > 0 ? formatRupiah(remaining) : 'Lunas'}
          </Text>
        </View>
      </View>

      {purchase.creditUsed && purchase.creditUsed > 0 ? (
        <Text style={styles.creditHint}>
          Saldo retur dipakai {formatRupiah(purchase.creditUsed)} — uang tunai yang keluar
          {' '}{formatRupiah(purchase.paid)}.
        </Text>
      ) : null}

      <Card tone="flat">
        <Text style={styles.resultLine}>Supplier: {purchase.supplierName}</Text>
        {purchase.items.map((item) => (
          <Text key={item.productId} style={styles.resultItem}>
            {item.name} {item.qty} {item.unit} × {formatRupiah(item.unitCost)}
          </Text>
        ))}
      </Card>

      {changes.length > 0 ? (
        <Card tone="flat">
          <Text style={styles.resultLabel}>Harga modal ikut berubah</Text>
          {changes.map((change) => {
            const item = purchase.items.find((row) => row.productId === change.productId);
            return (
              <Text key={change.productId} style={styles.resultItem}>
                {item?.name ?? 'Barang'}: {formatRupiah(change.before)} →{' '}
                {formatRupiah(change.after)}
              </Text>
            );
          })}
        </Card>
      ) : null}

      {remaining > 0 ? (
        <Text style={styles.debtHint}>
          Sisa {formatRupiah(remaining)} masuk daftar utang supplier dan bisa dibayar dari menu
          Kasbon & utang.
        </Text>
      ) : null}

      <View style={styles.resultActions}>
        <Button label="Bagikan" icon="share" variant="ghost" onPress={onShare} style={{ flex: 1 }} />
        <Button label="Selesai" icon="check" onPress={onClose} style={{ flex: 1 }} />
      </View>
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
  headerTitle: { ...type.h1, color: colors.text, fontWeight: '700' },
  headerSub: { ...type.caption, color: colors.textDim, marginTop: 2 },
  clearText: { ...type.caption, color: colors.amber, fontWeight: '600' },
  content: { paddingHorizontal: spacing.base, paddingBottom: 140, gap: spacing.md },
  hintRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  hintText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  suggestChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  suggestText: { ...type.caption, color: colors.textMuted },
  row: { padding: spacing.base, gap: spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { ...type.body, color: colors.text, fontWeight: '600' },
  rowMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  rowSubtotal: { ...type.body, color: colors.primary, fontWeight: '700' },
  rowFields: { flexDirection: 'row', gap: spacing.sm },
  fieldLabel: { ...type.caption, color: colors.textDim, marginBottom: 4 },
  costHint: { ...type.caption, color: colors.secondary },
  modeRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  modeChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  modeChipActive: { borderColor: colors.primary, backgroundColor: colors.cardHigh },
  modeText: { ...type.caption, color: colors.textMuted, fontWeight: '600' },
  modeTextActive: { color: colors.primary },
  methodRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  methodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodChipActive: { borderColor: colors.secondary },
  methodText: { ...type.caption, color: colors.textDim },
  methodTextActive: { color: colors.secondary, fontWeight: '600' },
  debtHint: { ...type.caption, color: colors.amber, marginTop: spacing.sm, lineHeight: 18 },
  creditHint: { ...type.caption, color: colors.secondary, marginTop: spacing.sm, lineHeight: 18 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  historyName: { ...type.body, color: colors.text, fontWeight: '600' },
  historyMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
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
  footerValue: { ...type.body, color: colors.text, fontWeight: '700', marginTop: 2 },
  errorText: { ...type.caption, color: colors.danger },
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  resultStat: { flex: 1, gap: 4 },
  resultDivider: { width: 1, height: 28, backgroundColor: colors.border },
  resultLabel: { ...type.caption, color: colors.textDim },
  resultValue: { ...type.body, color: colors.text, fontWeight: '700' },
  resultLine: { ...type.body, color: colors.text },
  resultItem: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  resultActions: { flexDirection: 'row', gap: spacing.sm },
});
