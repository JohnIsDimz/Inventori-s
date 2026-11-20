import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../src/components/AppHeader';
import { DonutChart, donutPalette, MonthlyBars, WeeklyFlowChart } from '../../src/components/Charts';
import { Icon } from '../../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconBadge,
  ProgressBar,
  SectionTitle,
  Segmented,
  Sheet,
} from '../../src/components/Primitives';
import {
  dailyFlow,
  expenseBreakdown,
  monthRange,
  monthlySeries,
  previousMonthSummary,
  summarize,
  topProducts,
  topSaleCategories,
  weeklyFlow,
} from '../../src/data/selectors';
import { opnameInRange, opnameRangeText } from '../../src/data/opname';
import { useAuthStore } from '../../src/data/auth';
import { useAppStore } from '../../src/data/store';
import { useScopedData } from '../../src/data/scope';
import { canSeeProfit } from '../../src/utils/permissions';
import { shareCsv, shareReportPdf } from '../../src/services/export';
import { colors, fonts, gradients, radius, spacing, type } from '../../src/theme/tokens';
import { formatBulanTahun, formatCompactRupiah, formatRupiah, formatTanggalSingkat } from '../../src/utils/format';

type Period = 'week' | 'month' | 'prev';

export default function LaporanScreen() {
  const router = useRouter();
  // Peran kasir tidak boleh melihat laba (lihat src/utils/permissions.ts).
  const role = useAuthStore((state) => state.role);
  const showProfit = canSeeProfit(role);
  const data = useScopedData();
  const [period, setPeriod] = useState<Period>('month');
  const [exporting, setExporting] = useState(false);
  const [opnameSheet, setOpnameSheet] = useState(false);

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end, label: '7 hari terakhir' };
    }
    if (period === 'prev') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const [from, to] = monthRange(prev);
      return { from, to, label: formatBulanTahun(prev) };
    }
    const [from, to] = monthRange(now);
    return { from, to, label: formatBulanTahun(now) };
  }, [period]);

  const summary = summarize(data, range.from, range.to);
  const prev = previousMonthSummary(data);
  const weekly = weeklyFlow(data, new Date());
  const breakdown = expenseBreakdown(data, range.from, range.to);
  const products = topProducts(data, range.from, range.to, 4);
  const categories = topSaleCategories(data, range.from, range.to, 5);
  const daily = dailyFlow(data, period === 'week' ? 7 : 7);
  const series = monthlySeries(data, 6);
  const hasAnyData = data.transactions.length > 0;
  const delta = period === 'month' && prev.income > 0 ? summary.income - prev.income : null;
  const deltaPct = delta !== null && prev.income > 0 ? (delta / prev.income) * 100 : null;
  const dailyMaxIncome = Math.max(1, ...daily.map((d) => d.income));
  const opnameRange = opnameInRange(data.opnames, range.from, range.to);

  return (
    <View style={styles.root}>
      <AppHeader subtitle="Laporan" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: '7 hari' },
            { value: 'month', label: 'Bulan ini' },
            { value: 'prev', label: 'Bulan lalu' },
          ]}
        />

        {/* Laba bersih */}
        <Card padded={false} style={{ overflow: 'hidden', borderColor: colors.primaryBorder }}>
          <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
          <View style={styles.heroBody}>
            <View style={styles.heroTop}>
              <Chip label="LABA BERSIH" tone="primary" dot size="sm" />
              <Text style={styles.heroPeriod}>{range.label}</Text>
            </View>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {showProfit ? formatRupiah(summary.profit) : 'Akses terbatas'}
            </Text>
            <View style={styles.heroMeta}>
              <Chip
                label={
                  !showProfit
                    ? 'Laba hanya untuk pemilik/admin'
                    : summary.income > 0
                      ? `Margin ${summary.margin.toFixed(1)}%`
                      : 'Belum ada omzet'
                }
                tone={summary.profit >= 0 ? 'secondary' : 'danger'}
                icon="pie"
                size="sm"
              />
              {deltaPct !== null ? (
                <Chip
                  label={`${deltaPct >= 0 ? '+' : '−'}${Math.abs(deltaPct).toFixed(1)}% vs bulan lalu`}
                  tone={deltaPct >= 0 ? 'primary' : 'danger'}
                  icon={deltaPct >= 0 ? 'trendUp' : 'trendDown'}
                  size="sm"
                />
              ) : null}
            </View>

            <View style={styles.heroGrid}>
              <View style={styles.heroGridItem}>
                <Text style={styles.heroGridLabel}>Pemasukan</Text>
                <Text style={[styles.heroGridValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatRupiah(summary.income)}
                </Text>
                <Text style={styles.heroGridHint}>{summary.saleCount} nota</Text>
              </View>
              <View style={styles.heroGridDivider} />
              <View style={styles.heroGridItem}>
                <Text style={styles.heroGridLabel}>Pengeluaran</Text>
                <Text style={[styles.heroGridValue, { color: colors.tertiary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatRupiah(summary.expense)}
                </Text>
                <Text style={styles.heroGridHint}>{summary.expenseCount} pengeluaran</Text>
              </View>
            </View>
          </View>
        </Card>

        {!hasAnyData ? (
          <Card>
            <EmptyState
              icon="chart"
              title="Laporan masih kosong"
              description="Grafik, margin, dan juara penjualan akan otomatis terbentuk setelah Anda mencatat transaksi pertama."
              action={<Button label="Catat transaksi" icon="plus" onPress={() => router.push('/pilih-transaksi')} />}
            />
          </Card>
        ) : (
          <>
            {/* Arus kas mingguan */}
            <View>
              <SectionTitle
                title="Arus kas mingguan"
                icon="chart"
                right={<Chip label={formatBulanTahun(new Date())} tone="neutral" size="sm" />}
              />
              <Card>
                <WeeklyFlowChart buckets={weekly} />
                {summary.cogs > 0 ? (
                  <Text style={styles.cogsNote}>
                    HPP barang tercatat {formatRupiah(summary.cogs)} • laba kotor {formatRupiah(summary.income - summary.cogs)}
                  </Text>
                ) : (
                  <Text style={styles.cogsNote}>
                    Isi harga modal pada rincian barang agar laba kotor per barang ikut terhitung.
                  </Text>
                )}
              </Card>
            </View>

            {/* Tren 6 bulan */}
            <View>
              <SectionTitle title="Tren 6 bulan" icon="trendUp" />
              <Card>
                <MonthlyBars points={series} />
              </Card>
            </View>

            {/* Omzet & untung harian */}
            <View>
              <SectionTitle
                title="Omzet harian (7 hari)"
                icon="trendUp"
                right={<Text style={styles.sectionHint}>{formatRupiah(daily.reduce((sum, d) => sum + d.income, 0))}</Text>}
              />
              <Card padded={false}>
                {daily.map((day, index) => (
                  <View key={day.isoDate} style={[styles.dailyRow, index !== daily.length - 1 && styles.dailyBorder]}>
                    <View style={styles.dailyDateCol}>
                      <Text style={styles.dailyDay}>{day.sublabel}</Text>
                      <Text style={styles.dailyDate}>{day.label}</Text>
                    </View>
                    <View style={styles.dailyBars}>
                      <View style={styles.dailyBarTrack}>
                        <View
                          style={[
                            styles.dailyBarFill,
                            {
                              width: `${
                                dailyMaxIncome > 0 ? Math.min(100, (day.income / dailyMaxIncome) * 100) : 0
                              }%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.dailyCount}>{day.txCount > 0 ? `${day.txCount} transaksi` : 'Tidak ada transaksi'}</Text>
                    </View>
                    <View style={styles.dailyValueCol}>
                      <Text style={styles.dailyIncome}>{formatRupiah(day.income)}</Text>
                      <Text style={[styles.dailyProfit, { color: day.profit >= 0 ? colors.primary : colors.danger }]}>
                        {day.profit >= 0 ? '+' : '−'}
                        {formatRupiah(Math.abs(day.profit))}
                      </Text>
                    </View>
                  </View>
                ))}
                <View style={styles.dailyFooter}>
                  <Text style={styles.dailyFooterText}>
                    Angka kanan bawah = untung harian (omzet − pengeluaran).
                  </Text>
                </View>
              </Card>
            </View>

            {/* Kategori paling laku */}
            <View>
              <SectionTitle
                title="Kategori paling laku"
                icon="tag"
                right={<Text style={styles.sectionHint}>{range.label}</Text>}
              />
              <Card padded={false}>
                {categories.length === 0 ? (
                  <EmptyState
                    compact
                    icon="tag"
                    title="Belum ada penjualan"
                    description="Kategori akan berperingkat otomatis setelah penjualan tercatat."
                  />
                ) : (
                  categories.map((row, index) => (
                    <View key={row.categoryId} style={[styles.rankRow, index !== categories.length - 1 && styles.rankBorder]}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankBadgeText}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rankHead}>
                          <Text style={styles.rankLabel} numberOfLines={1}>
                            {row.label}
                          </Text>
                          <Text style={styles.rankAmount}>{formatRupiah(row.amount)}</Text>
                        </View>
                        <View style={styles.dailyBarTrack}>
                          <View style={[styles.dailyBarFill, { width: `${Math.min(100, row.percent)}%` }]} />
                        </View>
                        <Text style={styles.rankMeta}>
                          {row.txCount} nota • {row.percent.toFixed(1)}% omzet
                          {row.qty > 0 ? ` • ${row.qty} barang` : ''}
                          {row.margin > 0 ? ` • untung ${formatRupiah(row.margin)}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </View>

            {/* Alokasi pengeluaran */}
            <View>
              <SectionTitle
                title="Alokasi pengeluaran"
                icon="pie"
                right={<Text style={styles.sectionHint}>{formatRupiah(summary.expense)}</Text>}
              />
              <Card>
                {breakdown.length === 0 ? (
                  <EmptyState
                    compact
                    icon="pie"
                    title="Belum ada pengeluaran"
                    description="Catat kulakan atau biaya operasional untuk melihat komposisinya."
                  />
                ) : (
                  <View style={styles.donutRow}>
                    <DonutChart
                      slices={breakdown.slice(0, 5).map((row, index) => ({
                        label: row.label,
                        amount: row.amount,
                        color: donutPalette[index % donutPalette.length],
                      }))}
                      size={124}
                      centerTitle="Total"
                    />
                    <View style={styles.donutLegend}>
                      {breakdown.slice(0, 5).map((row, index) => (
                        <View key={row.categoryId} style={styles.legendRow}>
                          <View
                            style={[styles.legendDot, { backgroundColor: donutPalette[index % donutPalette.length] }]}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.legendLabel} numberOfLines={1}>
                              {row.label}
                            </Text>
                            <Text style={styles.legendValue}>
                              {formatRupiah(row.amount)} • {row.percent.toFixed(0)}%
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </Card>
            </View>

            {/* Juara penjualan */}
            <View>
              <SectionTitle title="Juara penjualan" icon="flame" right={<Chip label="Top 4" tone="amber" size="sm" />} />
              <Card padded={false}>
                {products.length === 0 ? (
                  <EmptyState
                    compact
                    icon="package"
                    title="Belum ada rincian barang"
                    description="Saat mencatat penjualan, buka “Rincian barang” dan isi nama serta jumlahnya. Laporan ini akan terisi otomatis."
                  />
                ) : (
                  products.map((product, index) => (
                    <View
                      key={product.name}
                      style={[styles.productRow, index !== products.length - 1 && styles.productBorder]}
                    >
                      <View style={[styles.rank, index === 0 && { backgroundColor: colors.amberSoft, borderColor: colors.amberBorder }]}>
                        <Text style={[styles.rankText, index === 0 && { color: colors.amber }]}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productName} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text style={styles.productMeta}>
                          {product.qty} {product.unit} terjual • omzet {formatRupiah(product.revenue)}
                        </Text>
                        <View style={{ marginTop: 5 }}>
                          <ProgressBar
                            progress={products[0].qty > 0 ? product.qty / products[0].qty : 0}
                            tone={index === 0 ? 'amber' : 'secondary'}
                            height={4}
                          />
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', maxWidth: 96 }}>
                        <Text style={styles.productMarginLabel}>Margin</Text>
                        <Text style={styles.productMargin}>
                          {product.hasCost ? formatRupiah(product.margin) : '—'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </View>
          </>
        )}

        {/* Selisih hitung stok (Sprint 16) */}
        <View>
          <SectionTitle
            title="Selisih hitung stok"
            icon="checkCircle"
            right={<Text style={styles.sectionHint}>{range.label}</Text>}
          />
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.opnameHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.opnameTitle}>{opnameRangeText(opnameRange)}</Text>
                <Text style={styles.opnameDesc}>
                  {opnameRange.lossValue > 0
                    ? `Nilai barang kurang ${formatRupiah(opnameRange.lossValue)}${opnameRange.gainValue > 0 ? ` • lebih ${formatRupiah(opnameRange.gainValue)}` : ''}`
                    : opnameRange.gainValue > 0
                      ? `Nilai barang lebih ${formatRupiah(opnameRange.gainValue)}`
                      : 'Tidak ada nilai yang hilang di periode ini.'}
                </Text>
              </View>
              {opnameRange.sessions > 0 ? (
                <Pressable
                  style={styles.opnameButton}
                  onPress={() => setOpnameSheet(true)}
                  accessibilityLabel="Lihat rincian selisih hitung stok"
                >
                  <Text style={styles.opnameButtonText}>Rincian</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.opnameButton}
                  onPress={() => router.push('/opname')}
                  accessibilityLabel="Buka hitung stok"
                >
                  <Text style={styles.opnameButtonText}>Hitung</Text>
                </Pressable>
              )}
            </View>
            {opnameRange.losses.length > 0 ? (
              <View style={{ gap: 4 }}>
                {opnameRange.losses.map((row) => (
                  <View key={row.name} style={styles.opnameRow}>
                    <Text style={styles.opnameRowName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text style={styles.opnameRowValue}>
                      {row.units} {row.unit} • {formatRupiah(row.value)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        </View>

        {/* Ekspor */}
        <View>
          <SectionTitle title="Ekspor & berkas resmi" icon="download" />
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.exportHead}>
              <IconBadge name="shield" tone="primary" size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.exportTitle}>Laporan siap dibagikan (PDF & CSV)</Text>
                <Text style={styles.exportDesc}>
                  {formatTanggalSingkat(range.from)} – {formatTanggalSingkat(range.to)} •{' '}
                  {summary.txCount} transaksi tercatat
                </Text>
                <Text style={styles.exportNote}>
                  Rekap internal, bukan dokumen pajak resmi.
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.exportButton}
              disabled={!hasAnyData || exporting}
              onPress={async () => {
                setExporting(true);
                await shareReportPdf(data, range.from, range.to);
                setExporting(false);
              }}
            >
              <Icon name="fileText" size={17} color={colors.text} strokeWidth={1.9} />
              <View style={{ flex: 1 }}>
                <Text style={styles.exportButtonTitle}>Unduh laporan PDF</Text>
                <Text style={styles.exportButtonHint}>
                  Laba rugi, biaya, selisih hitung stok & riwayat harga beli
                </Text>
              </View>
              <Icon name="download" size={16} color={colors.textFaint} />
            </Pressable>
            <Pressable
              style={styles.exportButton}
              disabled={!hasAnyData || exporting}
              onPress={async () => {
                setExporting(true);
                await shareCsv(data, range.from, range.to);
                setExporting(false);
              }}
            >
              <Icon name="table" size={17} color={colors.text} strokeWidth={1.9} />
              <View style={{ flex: 1 }}>
                <Text style={styles.exportButtonTitle}>Ekspor data transaksi (CSV)</Text>
                <Text style={styles.exportButtonHint}>
                  Satu berkas: transaksi, selisih hitung stok, riwayat harga beli
                </Text>
              </View>
              <Icon name="download" size={16} color={colors.textFaint} />
            </Pressable>
            <Text style={styles.exportNote}>
              Semua berkas dibuat di HP Anda dan tidak diunggah ke mana pun.
            </Text>
          </Card>
        </View>

        <Card style={styles.tipCard}>
          <View style={styles.tipRow}>
            <IconBadge name="bulb" tone="secondary" size={34} />
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>Cara membaca laporan ini</Text>
              <Text style={styles.tipText}>
                Laba bersih = omzet penjualan − pengeluaran. Kasbon dihitung sebagai omzet saat barang keluar, tetapi
                baru masuk kas ketika pelanggan membayar — lihat “Pemasukan” vs “Uang masuk” pada PDF.
              </Text>
            </View>
          </View>
        </Card>

        <Text style={styles.footerNote}>Angka maksimum ditampilkan ringkas ({formatCompactRupiah(1000000)}) pada grafik.</Text>
      </ScrollView>

      <Sheet
        visible={opnameSheet}
        onClose={() => setOpnameSheet(false)}
        title="Rincian selisih stok"
        subtitle={range.label}
      >
        <View style={{ gap: spacing.md }}>
          <View style={styles.opnameStats}>
            <View style={{ flex: 1 }}>
              <Text style={styles.opnameStatLabel}>Nilai kurang</Text>
              <Text style={[styles.opnameStatValue, { color: colors.amber }]}>
                {formatRupiah(opnameRange.lossValue)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.opnameStatLabel}>Nilai lebih</Text>
              <Text style={[styles.opnameStatValue, { color: colors.secondary }]}>
                {formatRupiah(opnameRange.gainValue)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.opnameStatLabel}>Selisih bersih</Text>
              <Text style={styles.opnameStatValue}>{formatRupiah(opnameRange.netValue)}</Text>
            </View>
          </View>

          <Card padded={false} tone="flat">
            {opnameRange.perSession.map((row, index, list) => (
              <View
                key={row.id}
                style={[styles.opnameSessionRow, index !== list.length - 1 && styles.opnameSessionBorder]}
              >
                <Text style={styles.opnameSessionDate}>{formatTanggalSingkat(row.at)}</Text>
                <Text style={styles.opnameSessionValue}>
                  {row.lossValue > 0 ? `−${formatRupiah(row.lossValue)}` : 'Cocok'}
                </Text>
              </View>
            ))}
          </Card>

          {opnameRange.losses.length > 0 ? (
            <View>
              <SectionTitle title="Barang paling sering kurang" icon="trendDown" />
              <Card tone="flat">
                {opnameRange.losses.map((row) => (
                  <Text key={row.name} style={styles.opnameLossLine}>
                    {row.name} — {row.units} {row.unit} ({row.times}x dihitung) •{' '}
                    {formatRupiah(row.value)}
                  </Text>
                ))}
              </Card>
            </View>
          ) : null}

          <Button
            label="Hitung stok lagi"
            icon="checkCircle"
            onPress={() => {
              setOpnameSheet(false);
              router.push('/opname');
            }}
            fullWidth
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 104 },

  heroBody: { padding: spacing.base },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPeriod: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim },
  heroValue: { fontFamily: fonts.numBold, fontSize: 32, color: colors.white, letterSpacing: -1.2, marginTop: spacing.md },
  heroMeta: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  heroGrid: {
    flexDirection: 'row',
    marginTop: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  heroGridItem: { flex: 1, gap: 2 },
  heroGridDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: spacing.md },
  heroGridLabel: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim, letterSpacing: 0.3 },
  heroGridValue: { fontFamily: fonts.numBold, fontSize: 16 },
  heroGridHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  dailyBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dailyDateCol: { width: 34, alignItems: 'center' },
  dailyDay: { ...type.micro, fontFamily: fonts.semibold, color: colors.textDim },
  dailyDate: { fontFamily: fonts.numBold, fontSize: 13, color: colors.white },
  dailyBars: { flex: 1, gap: 4 },
  dailyBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  dailyBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  dailyCount: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },
  dailyValueCol: { alignItems: 'flex-end', minWidth: 92 },
  dailyIncome: { fontFamily: fonts.numBold, fontSize: 12.5, color: colors.text },
  dailyProfit: { fontFamily: fonts.numSemibold, fontSize: 10.5, marginTop: 1 },
  dailyFooter: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  dailyFooterText: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },

  rankRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  rankBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  rankBadgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primary },
  rankHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 4 },
  rankLabel: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white, flexShrink: 1 },
  rankAmount: { fontFamily: fonts.numBold, fontSize: 12.5, color: colors.primary },
  rankMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 5, lineHeight: 14 },

  sectionHint: { fontFamily: fonts.numSemibold, fontSize: 11, color: colors.textDim },
  cogsNote: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: spacing.md, lineHeight: 15 },

  donutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  donutLegend: { flex: 1, gap: 7 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendLabel: { ...type.caption, fontFamily: fonts.semibold, color: colors.text },
  legendValue: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },

  productRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  productBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankText: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.textMuted },
  productName: { ...type.caption, fontFamily: fonts.bold, color: colors.white },
  productMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textDim, marginTop: 2 },
  productMarginLabel: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },
  productMargin: { fontFamily: fonts.numSemibold, fontSize: 12, color: colors.primary },

  opnameHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  opnameTitle: { ...type.bodyMedium, color: colors.text },
  opnameDesc: { ...type.caption, color: colors.textDim, marginTop: 2 },
  opnameButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  opnameButtonText: { ...type.caption, color: colors.secondary },
  opnameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  opnameStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.base,
    gap: spacing.sm,
  },
  opnameStatLabel: { ...type.caption, color: colors.textDim },
  opnameStatValue: { ...type.bodyMedium, color: colors.text, marginTop: 2 },
  opnameSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  opnameSessionBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  opnameSessionDate: { ...type.caption, color: colors.textMuted, flex: 1 },
  opnameSessionValue: { ...type.bodyMedium, color: colors.amber },
  opnameLossLine: { ...type.caption, color: colors.textMuted, marginBottom: 6 },
  opnameRowName: { ...type.caption, color: colors.textMuted, flex: 1 },
  opnameRowValue: { ...type.caption, color: colors.amber },
  exportHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  exportTitle: { ...type.caption, fontFamily: fonts.bold, color: colors.white },
  exportDesc: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 2 },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportButtonTitle: { ...type.caption, fontFamily: fonts.semibold, color: colors.text },
  exportButtonHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },
  exportNote: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, lineHeight: 15, textAlign: 'center' },

  tipCard: { borderColor: colors.border },
  tipRow: { flexDirection: 'row', gap: spacing.md },
  tipTitle: { ...type.caption, fontFamily: fonts.bold, color: colors.white, marginBottom: 3 },
  tipText: { ...type.micro, fontFamily: fonts.medium, color: colors.textMuted, lineHeight: 16, letterSpacing: 0 },

  footerNote: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, textAlign: 'center' },
});
