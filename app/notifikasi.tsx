import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../src/components/Icon';
import { Button, Card, Chip, EmptyState, IconBadge } from '../src/components/Primitives';
import { activeReceivables, debtRemaining, lowStock, todaySummary } from '../src/data/selectors';
import { priceRiseItems } from '../src/data/stock-alerts';
import { useAppStore } from '../src/data/store';
import { useScopedData } from '../src/data/scope';
import { colors, fonts, radius, spacing, type } from '../src/theme/tokens';
import { daysUntil, formatRupiah, labelJatuhTempo } from '../src/utils/format';
import { buildReminderMessage, shareMessage } from '../src/utils/reminder';

interface AlertItem {
  id: string;
  icon: IconName;
  tone: 'amber' | 'danger' | 'tertiary' | 'secondary';
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
  secondary?: { label: string; onPress: () => void };
}

export default function NotifikasiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useScopedData();
  const today = todaySummary(data);

  const alerts: AlertItem[] = [];

  for (const item of activeReceivables(data)) {
    const diff = daysUntil(item.dueDate);
    if (diff > 3) continue;
    const overdue = diff < 0;
    alerts.push({
      id: `rcv-${item.id}`,
      icon: overdue ? 'alert' : 'clock',
      tone: overdue ? 'danger' : 'amber',
      title: overdue ? `Kasbon telat: ${item.customerName}` : `Jatuh tempo: ${item.customerName}`,
      description: `Sisa ${formatRupiah(debtRemaining(item))} • ${labelJatuhTempo(item.dueDate)}`,
      actionLabel: 'Catat pembayaran',
      onPress: () => router.push(`/kasbon/${item.id}`),
      secondary: {
        label: 'Ingatkan',
        onPress: () =>
          shareMessage(
            buildReminderMessage({
              template: data.settings.reminderTemplate,
              customerName: item.customerName,
              storeName: data.profile.name,
              amount: debtRemaining(item),
              dueDate: item.dueDate,
              itemCount: item.items?.length,
            }),
            `Pengingat kasbon ${item.customerName}`,
          ),
      },
    });
  }

  // Harga beli yang naik ≥ 5% dibanding kulakan sebelumnya (Sprint 17).
  for (const rise of priceRiseItems(data.purchases ?? [], data.products)) {
    alerts.push({
      id: `harga-${rise.productId}`,
      icon: 'trendUp',
      tone: 'tertiary',
      title: `Harga beli naik: ${rise.name}`,
      description: `Naik ${rise.percent.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% jadi ${formatRupiah(rise.latest)} • sebelumnya ${formatRupiah(rise.previous)}`,
      actionLabel: 'Lihat riwayat harga',
      onPress: () => router.push({ pathname: '/harga-beli', params: { product: rise.productId } }),
    });
  }

  for (const product of lowStock(data)) {
    alerts.push({
      id: `stok-${product.id}`,
      icon: 'package',
      tone: 'amber',
      title: `Stok menipis: ${product.name}`,
      description: `Sisa ${product.stock} ${product.unit} dari minimum ${product.minStock} ${product.unit}`,
      actionLabel: 'Buka katalog',
      onPress: () => router.push('/stok'),
    });
  }

  if (today.txCount === 0) {
    alerts.push({
      id: 'info-kosong',
      icon: 'receipt',
      tone: 'secondary',
      title: 'Belum ada catatan hari ini',
      description: 'Catat penjualan dan pengeluaran hari ini agar laporan tetap akurat.',
      actionLabel: 'Catat sekarang',
      onPress: () => router.push('/pilih-transaksi'),
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
          <Icon name="chevronLeft" size={17} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pengingat</Text>
          <Text style={styles.headerSubtitle}>{alerts.length} hal perlu perhatian</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconBadge name="bell" tone="secondary" size={38} />
          <Text style={styles.intro}>
            Pengingat dihitung dari data Anda sendiri: jatuh tempo kasbon, stok di bawah minimum, dan aktivitas hari
            ini. Tidak perlu dihapus manual — entri hilang otomatis begitu kasbon dibayar atau stok ditambah.
          </Text>
        </Card>

        {alerts.length === 0 ? (
          <Card>
            <EmptyState
              icon="checkCircle"
              title="Semua aman"
              description="Tidak ada kasbon yang mendesak dan stok masih di atas batas minimum."
              action={<Button label="Kembali ke beranda" variant="ghost" onPress={() => router.back()} />}
            />
          </Card>
        ) : (
          alerts.map((alert) => {
            const tone =
              alert.tone === 'danger'
                ? colors.danger
                : alert.tone === 'amber'
                  ? colors.amber
                  : alert.tone === 'tertiary'
                    ? colors.tertiary
                    : colors.secondary;
            return (
              <Card key={alert.id} style={{ borderColor: `${tone}55`, gap: spacing.sm }}>
                <View style={styles.alertTop}>
                  <IconBadge name={alert.icon} tone={alert.tone} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>{alert.title}</Text>
                    <Text style={styles.alertDesc}>{alert.description}</Text>
                  </View>
                  <Chip
                    label={
                      alert.tone === 'danger'
                        ? 'Telat'
                        : alert.id.startsWith('stok-')
                          ? 'Stok'
                          : alert.tone === 'amber'
                            ? 'Segera'
                            : 'Info'
                    }
                    tone={alert.tone}
                    size="sm"
                  />
                </View>
                <View style={styles.alertActions}>
                  <Pressable onPress={alert.onPress} style={styles.primaryAction} hitSlop={4}>
                    <Text style={styles.primaryActionText}>{alert.actionLabel}</Text>
                    <Icon name="arrowRight" size={12} color={colors.onPrimary} strokeWidth={2.2} />
                  </Pressable>
                  {alert.secondary ? (
                    <Pressable
                      onPress={alert.secondary.onPress}
                      style={styles.secondaryAction}
                      hitSlop={4}
                    >
                      <Icon name="whatsapp" size={12} color={colors.primary} strokeWidth={1.9} />
                      <Text style={styles.secondaryActionText}>{alert.secondary.label}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
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
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { ...type.h2, fontSize: 15, color: colors.white },
  headerSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: 40 },
  intro: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 17 },
  alertTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  alertTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  alertDesc: { ...type.caption, color: colors.textDim, marginTop: 2 },
  alertActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  primaryActionText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.onPrimary },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  secondaryActionText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.primary },
});
