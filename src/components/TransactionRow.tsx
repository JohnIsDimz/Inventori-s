import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Chip } from './Primitives';
import { useAppStore } from '../data/store';
import { debtRemaining, debtSettled } from '../data/selectors';
import type { Transaction } from '../data/types';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';
import { formatJam, formatRupiah, labelHari, labelJatuhTempo } from '../utils/format';

export function TransactionRow({
  tx,
  onPress,
  showDate,
  last,
}: {
  tx: Transaction;
  onPress?: () => void;
  showDate?: boolean;
  last?: boolean;
}) {
  const categories = useAppStore((s) => s.categories);
  const receivables = useAppStore((s) => s.receivables);

  const category = categories.find((c) => c.id === tx.categoryId);
  const isSale = tx.type === 'sale';
  const receivable = tx.receivableId
    ? receivables.find((r) => r.id === tx.receivableId)
    : undefined;
  const settled = receivable ? debtSettled(receivable) : true;
  const remaining = receivable ? debtRemaining(receivable) : 0;

  const title = tx.note?.trim() || category?.label || (isSale ? 'Penjualan' : 'Pengeluaran');
  const methodLabel =
    tx.method === 'cash'
      ? 'Tunai'
      : tx.method === 'qris'
        ? 'QRIS'
        : tx.method === 'transfer'
          ? 'Transfer'
          : 'Kasbon';

  const amountColor = isSale ? colors.primary : colors.tertiary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: 0.7 }]}
    >
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: isSale ? colors.primarySoft : colors.tertiarySoft,
            borderColor: isSale ? colors.primaryBorder : colors.tertiaryBorder,
          },
        ]}
      >
        <Icon
          name={(category?.icon ?? (isSale ? 'cart' : 'truck')) as IconName}
          size={17}
          color={amountColor}
          strokeWidth={1.9}
        />
      </View>

      <View style={styles.middle}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {showDate ? `${labelHari(tx.createdAt)} • ` : ''}
            {formatJam(tx.createdAt)} • {methodLabel}
          </Text>
        </View>
        {receivable ? (
          <View style={{ marginTop: 4 }}>
            <Chip
              size="sm"
              tone={settled ? 'primary' : 'amber'}
              icon={settled ? 'checkCircle' : 'clock'}
              label={
                settled
                  ? 'Kasbon lunas'
                  : `Sisa ${formatRupiah(remaining)} • ${labelJatuhTempo(receivable.dueDate)}`
              }
            />
          </View>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
          {isSale ? '+' : '−'}
          {formatRupiah(tx.amount)}
        </Text>
        <Text style={styles.amountHint} numberOfLines={1}>
          {isSale ? (category?.label ?? 'Penjualan') : (category?.label ?? 'Biaya')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.base,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  middle: { flex: 1, minWidth: 0 },
  title: { ...type.bodyMedium, fontFamily: fonts.semibold, color: colors.white },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { ...type.caption, color: colors.textDim, flexShrink: 1 },
  right: { alignItems: 'flex-end', maxWidth: 120 },
  amount: { ...type.num, fontFamily: fonts.numBold, fontSize: 14 },
  amountHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 2 },
});
