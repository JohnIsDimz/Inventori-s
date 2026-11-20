import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from './Field';
import { Button, Chip, Sheet } from './Primitives';
import type { MutationResult, PayMethod } from '../data/types';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';
import { formatRupiah, maskNominal, parseNumber } from '../utils/format';

const METHODS: { id: PayMethod; label: string }[] = [
  { id: 'cash', label: 'Tunai' },
  { id: 'qris', label: 'QRIS' },
  { id: 'transfer', label: 'Transfer' },
];

export function DebtPaymentSheet({
  visible,
  onClose,
  title,
  subtitle,
  remaining,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  remaining: number;
  onSubmit: (amount: number, method: PayMethod) => MutationResult | void;
}) {
  const [value, setValue] = useState('');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValue(maskNominal(String(remaining)));
      setMethod('cash');
      setError(null);
    }
  }, [visible, remaining]);

  const amount = parseNumber(value);
  const rest = Math.max(0, remaining - amount);

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} scroll={false}>
      <Text style={styles.remaining}>
        Sisa tagihan: <Text style={{ color: colors.amber }}>{formatRupiah(remaining)}</Text>
      </Text>

      <TextField
        label="Jumlah dibayar"
        prefix="Rp"
        keyboardType="number-pad"
        value={value}
        onChangeText={(text) => {
          setValue(maskNominal(text));
          setError(null);
        }}
        style={{ marginTop: spacing.md }}
      />

      <View style={styles.quickRow}>
        {[0.25, 0.5, 1].map((ratio) => (
          <Pressable
            key={ratio}
            style={styles.quickChip}
            onPress={() => setValue(maskNominal(String(Math.round(remaining * ratio))))}
          >
            <Text style={styles.quickText}>{ratio === 1 ? 'Lunas' : `${ratio * 100}%`}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Metode</Text>
      <View style={styles.methodRow}>
        {METHODS.map((item) => {
          const active = item.id === method;
          return (
            <Pressable
              key={item.id}
              onPress={() => setMethod(item.id)}
              style={[styles.method, active && styles.methodActive]}
            >
              <Text style={[styles.methodText, active && { color: colors.primary }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.resultRow}>
        <Chip label={rest > 0 ? `Sisa setelah bayar ${formatRupiah(rest)}` : 'Akan lunas'} tone={rest > 0 ? 'amber' : 'primary'} size="sm" />
      </View>

      <Button
        label={amount > 0 ? `Simpan ${formatRupiah(amount)}` : 'Simpan pembayaran'}
        icon="check"
        disabled={amount <= 0 || amount > remaining}
        onPress={() => {
          const result = onSubmit(amount, method);
          if (result && !result.ok) {
            setError(result.reason);
            return;
          }
          onClose();
        }}
        style={{ marginTop: spacing.md }}
      />
      {amount > remaining ? <Text style={styles.warning}>Jumlah melebihi sisa tagihan.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  remaining: { ...type.body, color: colors.textMuted },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quickChip: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.textMuted },
  label: {
    ...type.micro,
    color: colors.textDim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  methodRow: { flexDirection: 'row', gap: spacing.sm },
  method: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  methodText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
  resultRow: { marginTop: spacing.md, alignItems: 'flex-start' },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
  warning: { ...type.caption, color: colors.danger, marginTop: spacing.sm, textAlign: 'center' },
});
