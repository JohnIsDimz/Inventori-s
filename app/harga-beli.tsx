/**
 * Riwayat harga beli satu barang (Sprint 16).
 *
 * Setiap kulakan menyimpan harga beli yang benar-benar dibayar. Layar ini
 * menyusunnya menjadi grafik kecil + daftar, supaya pertanyaan "agen memang
 * naikkan harga, atau saya yang salah catat?" bisa dijawab dalam sekali lihat.
 *
 * Semua hitungan diambil dari `src/data/price-history.ts` (murni, diuji
 * `npm run test:laporan`).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Icon } from '../src/components/Icon';
import { Button, Card, EmptyState, SectionLabel } from '../src/components/Primitives';
import { activeOutlet, outletLabel } from '../src/data/outlets';
import { priceBoard, priceChartPoints } from '../src/data/price-history';
import { useScopedData } from '../src/data/scope';
import { colors, radius, spacing, type } from '../src/theme/tokens';
import { formatRupiah, formatTanggalSingkat } from '../src/utils/format';

const CHART_HEIGHT = 120;
/** Jarak tepi supaya titik teratas/terbawah tidak terpotong. */
const CHART_PAD = 9;

export default function HargaBeliScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ product?: string }>();
  const data = useScopedData();

  const [productId, setProductId] = useState<string | null>(params.product ?? null);
  const product = data.products.find((row) => row.id === productId) ?? data.products[0] ?? null;

  const board = useMemo(
    () =>
      product
        ? priceBoard(data.purchases, product.id, product.costPrice)
        : { points: [], stats: null, trend: '' },
    [data.purchases, product],
  );

  const [chartWidth, setChartWidth] = useState(0);
  const chart = useMemo(() => priceChartPoints(board.points, 100, 100), [board.points]);

  const px = (value: number) =>
    CHART_PAD + (value / 100) * Math.max(1, chartWidth - CHART_PAD * 2);
  const py = (value: number) => CHART_PAD + (value / 100) * Math.max(1, CHART_HEIGHT - CHART_PAD * 2);

  const path = chart
    .map((dot, index) => `${index === 0 ? 'M' : 'L'}${px(dot.x).toFixed(1)} ${py(dot.y).toFixed(1)}`)
    .join(' ');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Riwayat harga beli</Text>
          <Text style={styles.headerSub}>
            {data.outlets.length > 1
              ? outletLabel(activeOutlet(data.outlets, data.activeOutletId))
              : 'Harga kulakan per barang'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!product ? (
          <Card>
            <EmptyState
              icon="package"
              title="Belum ada barang"
              description="Tambahkan barang di Katalog & stok dulu."
              action={<Button label="Buka katalog" icon="package" onPress={() => router.push('/stok')} />}
            />
          </Card>
        ) : (
          <>
            <View>
              <SectionLabel>BARANG</SectionLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {data.products.map((row) => {
                  const isActive = row.id === product.id;
                  return (
                    <Pressable
                      key={row.id}
                      onPress={() => setProductId(row.id)}
                      style={[styles.chip, isActive && styles.chipActive]}
                      accessibilityLabel={`Lihat harga beli ${row.name}`}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]} numberOfLines={1}>
                        {row.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Card>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productMeta}>
                Modal sekarang {formatRupiah(product.costPrice)} • jual {formatRupiah(product.sellPrice)}
              </Text>
              <Text style={[styles.trend, { color: board.stats && board.stats.changePercent > 0 ? colors.amber : colors.secondary }]}>
                {board.trend}
              </Text>
            </Card>

            {board.points.length === 0 ? (
              <Card>
                <EmptyState
                  icon="truck"
                  title="Belum ada riwayat harga"
                  description="Riwayat muncul setelah kamu mencatat kulakan barang ini."
                  action={<Button label="Catat kulakan" icon="truck" onPress={() => router.push('/pembelian')} />}
                />
              </Card>
            ) : (
              <>
                <Card>
                  <View
                    style={styles.chartWrap}
                    onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
                  >
                    {chartWidth > 0 ? (
                      <Svg width={chartWidth} height={CHART_HEIGHT}>
                        <Line x1={0} y1={CHART_HEIGHT} x2={chartWidth} y2={CHART_HEIGHT} stroke={colors.border} strokeWidth={1} />
                        <Line x1={0} y1={0} x2={chartWidth} y2={0} stroke={colors.border} strokeWidth={1} strokeDasharray="3 5" />
                        {chart.length > 1 ? (
                          <Path d={path} stroke={colors.primary} strokeWidth={2.2} fill="none" />
                        ) : null}
                        {chart.map((dot, index) => (
                          <Circle
                            key={`${dot.point.purchaseId}-${index}`}
                            cx={px(dot.x)}
                            cy={py(dot.y)}
                            r={4}
                            fill={index === chart.length - 1 ? colors.primary : colors.cardHigh}
                            stroke={colors.primary}
                            strokeWidth={1.6}
                          />
                        ))}
                      </Svg>
                    ) : null}
                  </View>
                  <View style={styles.chartLegend}>
                    <Text style={styles.legendText}>Tertinggi {formatRupiah(board.stats?.highest ?? 0)}</Text>
                    <Text style={styles.legendText}>Terendah {formatRupiah(board.stats?.lowest ?? 0)}</Text>
                  </View>
                </Card>

                <View style={styles.statsRow}>
                  <Stat label="Terakhir" value={formatRupiah(board.stats?.latest ?? 0)} />
                  <View style={styles.statDivider} />
                  <Stat label="Rata-rata" value={formatRupiah(board.stats?.average ?? 0)} />
                  <View style={styles.statDivider} />
                  <Stat label="Kulakan" value={`${board.stats?.count ?? 0} kali`} />
                </View>

                <View>
                  <SectionLabel>DAFTAR KULAKAN</SectionLabel>
                  <Card padded={false}>
                    {[...board.points].reverse().map((point, index, list) => (
                      <View
                        key={`${point.purchaseId}-${point.at}`}
                        style={[styles.historyRow, index !== list.length - 1 && styles.historyBorder]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.historySupplier} numberOfLines={1}>
                            {point.supplierName}
                          </Text>
                          <Text style={styles.historyMeta} numberOfLines={1}>
                            {formatTanggalSingkat(point.at)} • {point.qty} unit
                          </Text>
                        </View>
                        <Text style={styles.historyValue}>{formatRupiah(point.unitCost)}</Text>
                      </View>
                    ))}
                  </Card>
                </View>
              </>
            )}

            <Button label="Catat kulakan baru" icon="truck" onPress={() => router.push('/pembelian')} fullWidth />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
  chipRow: { gap: spacing.xs, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    maxWidth: 180,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.cardHigh },
  chipText: { ...type.caption, color: colors.textMuted },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  productName: { ...type.h2, color: colors.text },
  productMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  trend: { ...type.caption, marginTop: spacing.sm },
  chartWrap: { height: CHART_HEIGHT, justifyContent: 'center' },
  chartLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  legendText: { ...type.caption, color: colors.textDim },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  stat: { flex: 1, gap: 4 },
  statDivider: { width: 1, height: 26, backgroundColor: colors.border },
  statLabel: { ...type.caption, color: colors.textDim },
  statValue: { ...type.bodyMedium, color: colors.text },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  historySupplier: { ...type.bodyMedium, color: colors.text },
  historyMeta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  historyValue: { ...type.bodyMedium, color: colors.primary },
});
