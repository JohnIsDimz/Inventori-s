/**
 * Hitung stok fisik (Sprint 13).
 *
 * Alurnya dibuat sesederhana kebiasaan warung: buka layar ini, ketik jumlah
 * yang benar-benar ada di rak, lalu simpan. Barang yang tidak diketik tidak
 * diubah. Uang kas tidak disentuh — yang dicatat hanya jumlah barang dan nilai
 * selisihnya (memakai harga modal).
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  buildOpnameLines,
  opnameDiff,
  opnameReportText,
  opnameSummaryText,
  OPNAME_REASON_HINTS,
  parseCount,
  summarizeOpname,
  type OpnameLine,
} from '../src/data/opname';
import { useScopedData } from '../src/data/scope';
import { useAppStore } from '../src/data/store';
import type { Product } from '../src/data/types';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat } from '../src/utils/format';
import { shareMessage } from '../src/utils/reminder';

export default function OpnameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useScopedData();
  const commitOpname = useAppStore((s) => s.commitOpname);

  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ lines: OpnameLine[]; id: string } | null>(null);

  const outletId = activeOutlet(data.outlets, data.activeOutletId)?.id ?? null;

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return data.products;
    return data.products.filter(
      (product) =>
        product.name.toLowerCase().includes(text) || (product.barcode ?? '').includes(text),
    );
  }, [data.products, query]);

  /** Baris yang sudah diisi, untuk ringkasan berjalan di bagian bawah. */
  const lines = useMemo(
    () => buildOpnameLines(data.products, outletId, counts),
    [data.products, outletId, counts],
  );
  const summary = useMemo(() => summarizeOpname(lines), [lines]);

  const setCount = (productId: string, value: string) => {
    const digits = value.replace(/[^\d]/g, '').slice(0, 7);
    setCounts((current) => ({ ...current, [productId]: digits }));
    setError(null);
  };

  const clearAll = () => {
    setCounts({});
    setNote('');
    setError(null);
  };

  const submit = () => {
    if (lines.length === 0) {
      setError('Isi jumlah nyata minimal satu barang dulu.');
      return;
    }
    const resultSubmit = commitOpname({ counts, note });
    if (!resultSubmit.ok) {
      setError(resultSubmit.reason);
      return;
    }
    const fresh = useAppStore.getState().opnames[0];
    setCounts({});
    setNote('');
    setError(null);
    if (fresh) {
      setResult({
        id: fresh.id,
        lines: fresh.lines.map((line) => ({ ...line })),
      });
    }
  };

  const share = () => {
    if (!result) return;
    const text = opnameReportText(
      { createdAt: new Date().toISOString(), lines: result.lines, note },
      data.profile.name,
      (value) => formatRupiah(value),
      (iso) => formatTanggalSingkat(iso),
    );
    void shareMessage(text, 'Laporan hitung stok');
  };

  const history = data.opnames.slice(0, 6);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Hitung stok</Text>
          <Text style={styles.headerSub}>
            {data.outlets.length > 1
              ? outletLabel(activeOutlet(data.outlets, data.activeOutletId))
              : 'Catatan vs barang di rak'}
          </Text>
        </View>
        {Object.keys(counts).length > 0 ? (
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
              description="Tambahkan barang di Katalog & stok dulu, lalu kembali ke sini untuk menghitungnya."
              action={<Button label="Buka katalog" icon="package" onPress={() => router.push('/stok')} />}
            />
          </Card>
        ) : (
          <>
            <Card tone="flat">
              <View style={styles.hintRow}>
                <Icon name="info" size={15} color={colors.secondary} strokeWidth={1.9} />
                <Text style={styles.hintText}>
                  Ketik jumlah yang benar-benar ada di rak. Barang yang tidak diketik tidak diubah.
                  Uang kas tidak tersentuh — nilai selisih dihitung dari harga modal.
                </Text>
              </View>
            </Card>

            <TextField
              icon="search"
              placeholder="Cari barang atau barcode"
              value={query}
              onChangeText={setQuery}
            />

            {filtered.length === 0 ? (
              <Card>
                <EmptyState compact icon="search" title="Barang tidak ditemukan" description="Coba kata lain." />
              </Card>
            ) : (
              <Card padded={false}>
                {filtered.map((product, index) => (
                  <CountRow
                    key={product.id}
                    product={product}
                    outletId={outletId}
                    value={counts[product.id] ?? ''}
                    onChange={(value) => setCount(product.id, value)}
                    last={index === filtered.length - 1}
                  />
                ))}
              </Card>
            )}

            <TextField
              label="Catatan (opsional)"
              icon="edit"
              placeholder="Contoh: ada 2 bungkus pecah"
              value={note}
              onChangeText={setNote}
            />
            <View style={styles.reasonRow}>
              {OPNAME_REASON_HINTS.map((reason) => (
                <Pressable key={reason} onPress={() => setNote(reason)} style={styles.reasonChip}>
                  <Text style={styles.reasonText}>{reason}</Text>
                </Pressable>
              ))}
            </View>

            {history.length > 0 ? (
              <View>
                <SectionLabel>{'Hitungan terakhir'}</SectionLabel>
                <Card padded={false} tone="flat">
                  {history.map((session, index) => (
                    <View
                      key={session.id}
                      style={[styles.historyRow, index !== history.length - 1 && styles.historyBorder]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyDate}>{formatTanggalSingkat(session.createdAt)}</Text>
                        <Text style={styles.historyMeta} numberOfLines={1}>
                          {opnameSummaryText(summarizeOpname(session.lines as OpnameLine[]))}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.historyValue,
                          { color: session.lossValue > 0 ? colors.amber : colors.primary },
                        ]}
                      >
                        {session.lossValue > 0 ? `−${formatRupiah(session.lossValue)}` : 'Cocok'}
                      </Text>
                    </View>
                  ))}
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
                {summary.lines === 0 ? 'Belum ada yang dihitung' : opnameSummaryText(summary)}
              </Text>
              <Text style={styles.footerValue}>
                {summary.lossValue > 0 && summary.gainValue > 0
                  ? `Kurang ${formatRupiah(summary.lossValue)} • Lebih ${formatRupiah(summary.gainValue)}`
                  : summary.lossValue > 0
                    ? `Nilai kurang ${formatRupiah(summary.lossValue)}`
                    : summary.gainValue > 0
                      ? `Nilai lebih ${formatRupiah(summary.gainValue)}`
                      : 'Belum ada selisih'}
              </Text>
            </View>
            <Button
              label="Simpan"
              icon="check"
              onPress={submit}
              disabled={summary.lines === 0}
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
        title="Hitungan tersimpan"
        subtitle="Stok sudah disesuaikan dengan jumlah nyata."
      >
        {result ? <ResultBody lines={result.lines} onShare={share} onClose={() => setResult(null)} /> : null}
      </Sheet>
    </View>
  );
}

function ResultBody({
  lines,
  onShare,
  onClose,
}: {
  lines: OpnameLine[];
  onShare: () => void;
  onClose: () => void;
}) {
  const summary = summarizeOpname(lines);
  const selisih = lines.filter((line) => opnameDiff(line) !== 0);
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.resultStats}>
        <View style={styles.resultStat}>
          <Text style={styles.resultLabel}>Dihitung</Text>
          <Text style={styles.resultValue}>{summary.lines}</Text>
        </View>
        <View style={styles.resultDivider} />
        <View style={styles.resultStat}>
          <Text style={styles.resultLabel}>Kurang</Text>
          <Text style={[styles.resultValue, { color: summary.under > 0 ? colors.amber : colors.text }]}>
            {summary.under}
          </Text>
        </View>
        <View style={styles.resultDivider} />
        <View style={styles.resultStat}>
          <Text style={styles.resultLabel}>Lebih</Text>
          <Text style={[styles.resultValue, { color: summary.over > 0 ? colors.secondary : colors.text }]}>
            {summary.over}
          </Text>
        </View>
      </View>

      {summary.lossValue > 0 || summary.gainValue > 0 ? (
        <Card tone="flat">
          {summary.lossValue > 0 ? (
            <Text style={styles.resultLine}>Nilai barang kurang: {formatRupiah(summary.lossValue)}</Text>
          ) : null}
          {summary.gainValue > 0 ? (
            <Text style={styles.resultLine}>Nilai barang lebih: {formatRupiah(summary.gainValue)}</Text>
          ) : null}
        </Card>
      ) : (
        <Text style={styles.resultLine}>Semua barang yang dihitung cocok dengan catatan.</Text>
      )}

      {selisih.length > 0 ? (
        <Card padded={false} tone="flat">
          {selisih.map((line, index) => {
            const diff = opnameDiff(line);
            return (
              <View
                key={line.productId}
                style={[styles.historyRow, index !== selisih.length - 1 && styles.historyBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyDate} numberOfLines={1}>
                    {line.name}
                  </Text>
                  <Text style={styles.historyMeta}>
                    Catatan {line.system} → hitung {line.counted} {line.unit}
                  </Text>
                </View>
                <Chip
                  label={`${diff > 0 ? '+' : ''}${diff}`}
                  tone={diff > 0 ? 'secondary' : 'amber'}
                  size="sm"
                />
              </View>
            );
          })}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Bagikan laporan" icon="share" variant="ghost" style={{ flex: 1 }} onPress={onShare} />
        <Button label="Selesai" icon="check" style={{ flex: 1 }} onPress={onClose} />
      </View>
    </View>
  );
}

function CountRow({
  product,
  outletId,
  value,
  onChange,
  last,
}: {
  product: Product;
  outletId: string | null;
  value: string;
  onChange: (value: string) => void;
  last: boolean;
}) {
  const counted = parseCount(value);
  const system = stockFor(product, outletId);
  const diff = counted === null ? null : counted - system;
  return (
    <View style={[styles.countRow, !last && styles.countBorder]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.countName} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.countMeta}>
          Catatan {system} {product.unit}
        </Text>
      </View>

      {diff !== null ? (
        <Chip
          label={diff === 0 ? 'cocok' : `${diff > 0 ? '+' : ''}${diff}`}
          tone={diff === 0 ? 'primary' : diff > 0 ? 'secondary' : 'amber'}
          size="sm"
        />
      ) : null}

      <View style={styles.countInput}>
        <TextField
          keyboardType="number-pad"
          value={value}
          onChangeText={onChange}
          accessibilityLabel={`Jumlah nyata ${product.name}`}
          style={styles.countField}
        />
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.h1, color: colors.text },
  headerSub: { ...type.caption, color: colors.textDim, marginTop: 2 },
  clearText: { ...type.label, color: colors.amber },
  content: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  hintRow: { flexDirection: 'row', gap: spacing.sm },
  hintText: { flex: 1, ...type.caption, color: colors.textMuted, lineHeight: 18 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  countBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  countName: { ...type.h3, color: colors.text },
  countMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  countInput: { width: 92 },
  countField: { marginBottom: 0 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  reasonText: { ...type.caption, color: colors.textMuted },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerLabel: { ...type.caption, color: colors.textDim },
  footerValue: { ...type.h3, color: colors.text, marginTop: 2 },
  errorText: { ...type.caption, color: colors.danger },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  historyDate: { ...type.label, color: colors.text },
  historyMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  historyValue: { ...type.num },
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultStat: { flex: 1, gap: 3 },
  resultDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.sm },
  resultLabel: { ...type.micro, color: colors.textDim },
  resultValue: { ...type.h2, color: colors.text },
  resultLine: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
});
