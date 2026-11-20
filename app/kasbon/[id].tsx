import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DebtPaymentSheet } from '../../src/components/DebtPaymentSheet';
import { Icon } from '../../src/components/Icon';
import {
  Button,
  Card,
  Chip,
  Divider,
  KeyValueRow,
  ProgressBar,
  SectionLabel,
  Sheet,
} from '../../src/components/Primitives';
import { debtPaid, debtRemaining, debtSettled } from '../../src/data/selectors';
import { useAppStore } from '../../src/data/store';
import { useScopedData } from '../../src/data/scope';
import type { PayMethod } from '../../src/data/types';
import { colors, fonts, gradients, radius, spacing, type } from '../../src/theme/tokens';
import {
  formatJam,
  formatRupiah,
  formatTanggalPanjang,
  formatTanggalSingkat,
  labelJatuhTempo,
} from '../../src/utils/format';
import { buildReminderMessage, shareMessage } from '../../src/utils/reminder';
import { LinearGradient } from 'expo-linear-gradient';

export default function KasbonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const data = useScopedData();
  const payReceivable = useAppStore((s) => s.payReceivable);
  const deleteReceivable = useAppStore((s) => s.deleteReceivable);

  const [payOpen, setPayOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const receivable = data.receivables.find((r) => r.id === id);

  if (!receivable) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.missing}>Kasbon tidak ditemukan.</Text>
        <Button label="Kembali" variant="ghost" onPress={() => router.back()} style={{ margin: spacing.base }} />
      </View>
    );
  }

  const paid = debtPaid(receivable);
  const remaining = debtRemaining(receivable);
  const settled = debtSettled(receivable);
  const progress = receivable.amount > 0 ? paid / receivable.amount : 0;

  const remind = () => {
    const message = buildReminderMessage({
      template: data.settings.reminderTemplate,
      customerName: receivable.customerName,
      storeName: data.profile.name,
      amount: remaining,
      dueDate: receivable.dueDate,
      itemCount: receivable.items?.length,
    });
    shareMessage(message, `Pengingat kasbon ${receivable.customerName}`);
  };

  const confirmDelete = () => {
    Alert.alert('Hapus kasbon?', 'Riwayat pembayaran ikut terhapus dan saldo dihitung ulang.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          const result = deleteReceivable(receivable.id);
          if (!result.ok) {
            Alert.alert('Tidak bisa dihapus', result.reason);
            return;
          }
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Detail kasbon</Text>
        <Pressable onPress={confirmDelete} style={styles.closeButton} hitSlop={10}>
          <Icon name="trash" size={16} color={colors.danger} strokeWidth={1.9} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
          <View style={styles.heroBody}>
            <View style={styles.heroTop}>
              <Chip
                label={settled ? 'LUNAS' : labelJatuhTempo(receivable.dueDate)}
                tone={settled ? 'primary' : 'amber'}
                dot
                size="sm"
              />
              <Text style={styles.heroDate}>Jatuh tempo {formatTanggalSingkat(receivable.dueDate)}</Text>
            </View>
            <Text style={styles.heroName}>{receivable.customerName}</Text>
            <Text style={styles.heroRemaining}>{formatRupiah(remaining)}</Text>
            <Text style={styles.heroHint}>
              {settled
                ? 'Tagihan sudah lunas'
                : `Sisa dari total ${formatRupiah(receivable.amount)} • terbayar ${formatRupiah(paid)}`}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar progress={progress} tone={settled ? 'primary' : 'primary'} height={6} />
            </View>
            <View style={styles.heroActions}>
              {settled ? (
                <Button
                  label="Riwayat pembayaran"
                  icon="history"
                  variant="ghost"
                  size="sm"
                  onPress={() => setHistoryOpen(true)}
                  style={{ flex: 1 }}
                />
              ) : null}
              <Button
                label="Ingatkan"
                icon="whatsapp"
                variant="ghost"
                size="sm"
                onPress={remind}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Card>

        <Card>
          <SectionLabel>Rincian</SectionLabel>
          <KeyValueRow label="Total kasbon" value={formatRupiah(receivable.amount)} icon="coins" />
          <KeyValueRow label="Sudah dibayar" value={formatRupiah(paid)} icon="checkCircle" />
          <KeyValueRow
            label="Sisa"
            value={formatRupiah(remaining)}
            valueStyle={{ color: settled ? colors.primary : colors.amber }}
            icon="clock"
          />
          <Divider style={{ marginVertical: 6 }} />
          <KeyValueRow label="Dibuat" value={formatTanggalPanjang(receivable.createdAt)} icon="calendar" />
          {receivable.note ? <KeyValueRow label="Catatan" value={receivable.note} icon="edit" /> : null}
        </Card>

        {receivable.items && receivable.items.length > 0 ? (
          <Card>
            <SectionLabel>Barang yang diambil</SectionLabel>
            {receivable.items.map((item, index) => (
              <KeyValueRow
                key={`${item.name}-${index}`}
                label={`${item.name} × ${item.qty}`}
                value={formatRupiah(item.price * item.qty)}
              />
            ))}
          </Card>
        ) : null}

        <Card>
          <View style={styles.historyHead}>
            <SectionLabel>Riwayat pembayaran</SectionLabel>
            <Chip label={`${receivable.payments.length} kali`} tone="neutral" size="sm" />
          </View>
          {receivable.payments.length === 0 ? (
            <Text style={styles.emptyHistory}>Belum ada pembayaran tercatat.</Text>
          ) : (
            [...receivable.payments]
              .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
              .map((payment, index) => (
                <View key={payment.id} style={[styles.paymentRow, index !== receivable.payments.length - 1 && styles.paymentBorder]}>
                  <View style={styles.paymentIcon}>
                    <Icon name="arrowDownLeft" size={13} color={colors.primary} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paymentAmount}>{formatRupiah(payment.amount)}</Text>
                    <Text style={styles.paymentMeta}>
                      {formatTanggalSingkat(payment.paidAt)} • {formatJam(payment.paidAt)} •{' '}
                      {payment.method === 'cash' ? 'Tunai' : payment.method === 'qris' ? 'QRIS' : 'Transfer'}
                    </Text>
                  </View>
                </View>
              ))
          )}
        </Card>

        {!settled ? (
          <Button label="Catat pembayaran" icon="check" size="lg" onPress={() => setPayOpen(true)} />
        ) : null}
      </ScrollView>

      <DebtPaymentSheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Pembayaran ${receivable.customerName}`}
        subtitle="Bisa dibayar sebagian."
        remaining={remaining}
        onSubmit={(value: number, method: PayMethod) => payReceivable(receivable.id, value, method)}
      />

      <Sheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Riwayat pembayaran">
        {receivable.payments.map((payment) => (
          <KeyValueRow
            key={payment.id}
            label={formatTanggalPanjang(payment.paidAt)}
            value={formatRupiah(payment.amount)}
          />
        ))}
      </Sheet>
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { ...type.h2, fontSize: 15, color: colors.white, flex: 1 },
  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: 48 },

  heroBody: { padding: spacing.base },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroDate: { ...type.micro, fontFamily: fonts.medium, color: colors.textDim },
  heroName: { ...type.caption, color: colors.textMuted, marginTop: spacing.md },
  heroRemaining: { fontFamily: fonts.numBold, fontSize: 30, color: colors.white, letterSpacing: -1 },
  heroHint: { ...type.caption, color: colors.textDim, marginTop: 2 },
  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },

  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyHistory: { ...type.caption, color: colors.textDim, paddingVertical: spacing.md },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  paymentBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  paymentIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  paymentAmount: { ...type.num, fontSize: 13, color: colors.white },
  paymentMeta: { ...type.micro, fontFamily: fonts.medium, color: colors.textFaint, marginTop: 1 },
  missing: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
