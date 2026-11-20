import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect } from 'react-native-svg';

import { colors, fonts, radius, spacing, type } from '../theme/tokens';
import { formatCompactRupiah } from '../utils/format';
import type { MonthPoint, WeeklyBucket } from '../data/selectors';

export interface BarSeries {
  label: string;
  sublabel?: string;
  primary: number;
  secondary: number;
}

/**
 * Grafik batang berpasangan (pemasukan vs pengeluaran). Digambar dengan SVG
 * supaya tetap tajam dan tidak butuh library chart tambahan.
 */
export function GroupedBarChart({
  series,
  primaryLabel = 'Masuk',
  secondaryLabel = 'Keluar',
  primaryColor = colors.primary,
  secondaryColor = colors.tertiary,
  height = 132,
}: {
  series: BarSeries[];
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...series.flatMap((s) => [s.primary, s.secondary]));
  const chartHeight = height;
  const axisWidth = 0;
  const slot = series.length > 0 ? (width - axisWidth) / series.length : 0;
  const barWidth = Math.min(16, Math.max(7, slot * 0.26));

  return (
    <View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: primaryColor }]} />
          <Text style={styles.legendText}>{primaryLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: secondaryColor }]} />
          <Text style={styles.legendText}>{secondaryLabel}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={styles.maxLabel}>maks {formatCompactRupiah(max)}</Text>
      </View>

      <View style={{ height: chartHeight + 22 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <Svg width={width} height={chartHeight}>
              {[0, 0.5, 1].map((ratio) => (
                <Line
                  key={ratio}
                  x1={0}
                  y1={chartHeight - ratio * (chartHeight - 10) - 1}
                  x2={width}
                  y2={chartHeight - ratio * (chartHeight - 10) - 1}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray={ratio === 0 ? undefined : '3 5'}
                />
              ))}
              {series.map((item, index) => {
                const center = slot * index + slot / 2;
                const usable = chartHeight - 10;
                const h1 = Math.max(item.primary > 0 ? 3 : 0, (item.primary / max) * usable);
                const h2 = Math.max(item.secondary > 0 ? 3 : 0, (item.secondary / max) * usable);
                const empty = item.primary <= 0 && item.secondary <= 0;
                return (
                  <G key={`${item.label}-${index}`}>
                    {empty ? (
                      // Bulan tanpa data: tandai garis dasar supaya tidak terlihat seperti grafik rusak.
                      <Rect
                        x={center - 3}
                        y={chartHeight - 5}
                        width={6}
                        height={3}
                        rx={1.5}
                        fill="rgba(255,255,255,0.16)"
                      />
                    ) : null}
                    <Rect
                      x={center - barWidth - 1.5}
                      y={chartHeight - h1}
                      width={barWidth}
                      height={h1}
                      rx={barWidth / 2.4}
                      fill={primaryColor}
                      opacity={0.92}
                    />
                    <Rect
                      x={center + 1.5}
                      y={chartHeight - h2}
                      width={barWidth}
                      height={h2}
                      rx={barWidth / 2.4}
                      fill={secondaryColor}
                      opacity={0.92}
                    />
                  </G>
                );
              })}
            </Svg>

            <View style={[styles.xAxis, { width }]}>
              {series.map((item, index) => (
                <View key={`${item.label}-x-${index}`} style={{ width: slot, alignItems: 'center' }}>
                  <Text
                    style={[
                      styles.xLabel,
                      item.primary <= 0 && item.secondary <= 0 && { color: colors.textFaint },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.sublabel ? <Text style={styles.xSublabel}>{item.sublabel}</Text> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

export function WeeklyFlowChart({ buckets }: { buckets: WeeklyBucket[] }) {
  return (
    <GroupedBarChart
      series={buckets.map((b) => ({
        label: b.label,
        sublabel: b.sublabel,
        primary: b.income,
        secondary: b.expense,
      }))}
      primaryLabel="Omzet"
      secondaryLabel="Pengeluaran"
    />
  );
}

export function MonthlyBars({ points }: { points: MonthPoint[] }) {
  return (
    <GroupedBarChart
      series={points.map((p) => ({
        label: p.label,
        primary: p.income,
        secondary: p.expense,
      }))}
      primaryLabel="Omzet"
      secondaryLabel="Biaya"
      height={104}
    />
  );
}

/* ------------------------------------------------------------------ Donut --- */

export interface DonutSlice {
  label: string;
  amount: number;
  color: string;
}

export function DonutChart({
  slices,
  size = 132,
  strokeWidth = 15,
  centerTitle = 'Total',
}: {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerTitle?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const radiusValue = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  let offset = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {slices.map((slice) => {
            const fraction = total > 0 ? slice.amount / total : 0;
            const dash = fraction * circumference;
            const circle = (
              <Circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radiusValue}
                stroke={slice.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return circle;
          })}
        </G>
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutTitle}>{centerTitle}</Text>
        <Text style={styles.donutValue} numberOfLines={1}>
          {formatCompactRupiah(total)}
        </Text>
      </View>
    </View>
  );
}

export const donutPalette = [colors.primary, colors.secondary, colors.amber, colors.tertiary, '#a78bfa', '#f472b6'];

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { ...type.micro, fontFamily: fonts.semibold, color: colors.textMuted },
  maxLabel: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint },
  xAxis: { flexDirection: 'row', marginTop: 6 },
  xLabel: { fontFamily: fonts.semibold, fontSize: 10, color: colors.textMuted },
  xSublabel: { fontFamily: fonts.medium, fontSize: 8.5, color: colors.textFaint, marginTop: 1 },

  donutCenter: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutTitle: { ...type.micro, color: colors.textDim },
  donutValue: { fontFamily: fonts.numBold, fontSize: 15, color: colors.white, marginTop: 2 },

});
