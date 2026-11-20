import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { Chip, ProgressBar } from './Primitives';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';
import { daysUntil, formatRupiah, initials, labelJatuhTempo } from '../utils/format';

export function DebtCard({
  name,
  amount,
  paid,
  dueDate,
  note,
  itemCount,
  onPay,
  onRemind,
  onPress,
  last,
}: {
  name: string;
  amount: number;
  paid: number;
  dueDate: string;
  note?: string;
  itemCount?: number;
  onPay: () => void;
  onRemind?: () => void;
  onPress?: () => void;
  last?: boolean;
}) {
  const remaining = Math.max(0, amount - paid);
  const progress = amount > 0 ? paid / amount : 0;
  const diff = daysUntil(dueDate);
  const overdue = diff < 0;
  const settled = remaining <= 0;

  const tone = settled ? colors.primary : overdue ? colors.danger : diff <= 3 ? colors.amber : colors.secondary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, !last && styles.cardBorder, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.topRow}>
        <View style={[styles.avatar, { borderColor: `${tone}40`, backgroundColor: `${tone}18` }]}>
          <Text style={[styles.avatarText, { color: tone }]}>{initials(name)}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {note?.trim() ? note : itemCount ? `${itemCount} item` : 'Tanpa catatan'}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.amount, { color: tone }]}>{formatRupiah(remaining)}</Text>
          <Text style={styles.amountHint}>
            {settled ? 'Lunas' : paid > 0 ? `dari ${formatRupiah(amount)}` : 'Belum dibayar'}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <Chip
          size="sm"
          tone={settled ? 'primary' : overdue ? 'danger' : diff <= 3 ? 'amber' : 'secondary'}
          icon={settled ? 'checkCircle' : 'clock'}
          label={settled ? 'Sudah lunas' : labelJatuhTempo(dueDate)}
        />
        {!settled ? (
          <View style={styles.actions}>
            {onRemind ? (
              <Pressable onPress={onRemind} hitSlop={6} style={styles.remindButton}>
                <Icon name="whatsapp" size={13} color={colors.primary} strokeWidth={1.9} />
                <Text style={styles.remindText}>Ingatkan</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onPay} hitSlop={6} style={styles.payButton}>
              <Icon name="banknote" size={13} color={colors.onPrimary} strokeWidth={2} />
              <Text style={styles.payText}>Bayar</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {!settled && paid > 0 ? (
        <ProgressBar progress={progress} tone={overdue ? 'danger' : 'primary'} height={4} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  cardBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 12 },
  name: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  meta: { ...type.caption, color: colors.textDim, marginTop: 2 },
  amount: { fontFamily: fonts.numBold, fontSize: 14 },
  amountHint: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  remindButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  remindText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.primary },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  payText: { fontFamily: fonts.bold, fontSize: 10, color: colors.onPrimary },
});
