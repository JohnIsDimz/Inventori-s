import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../src/components/Icon';
import { Chip } from '../src/components/Primitives';
import { receivableSummary } from '../src/data/selectors';
import { useAppStore } from '../src/data/store';
import { useScopedData } from '../src/data/scope';
import { colors, fonts, gradients, radius, shadow, spacing, type } from '../src/theme/tokens';

export default function PilihTransaksiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const data = useScopedData();
  const kasbon = receivableSummary(data);

  const actions: {
    title: string;
    description: string;
    icon: IconName;
    tone: 'primary' | 'tertiary' | 'amber' | 'secondary';
    badge?: string;
    onPress: () => void;
  }[] = [
    {
      title: 'Buka Kasir (POS)',
      description: 'Pilih barang, pindai barcode, hitung kembalian, lalu cetak struk.',
      icon: 'cart',
      tone: 'primary',
      onPress: () => router.replace('/kasir'),
    },
    {
      title: 'Catat penjualan',
      description: 'Uang masuk dari pembeli — tunai, QRIS, atau kasbon.',
      icon: 'cartPlus',
      tone: 'primary',
      onPress: () => router.replace({ pathname: '/catat', params: { type: 'sale' } }),
    },
    {
      title: 'Catat pengeluaran',
      description: 'Belanja kulakan, listrik, gaji, dan biaya operasional lain.',
      icon: 'banknote',
      tone: 'tertiary',
      onPress: () => router.replace({ pathname: '/catat', params: { type: 'expense' } }),
    },
    {
      title: 'Buku kasbon',
      description: 'Piutang pelanggan dan utang ke agen kulakan.',
      icon: 'book',
      tone: 'amber',
      badge: kasbon.activeCount > 0 ? `${kasbon.activeCount} aktif` : undefined,
      onPress: () => router.replace('/kasbon'),
    },
    {
      title: 'Katalog stok',
      description: 'Tambah barang, atur harga, dan pantau stok menipis.',
      icon: 'package',
      tone: 'secondary',
      onPress: () => router.replace('/stok'),
    },
  ];

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.base) }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Mau catat apa?</Text>
            <Text style={styles.subtitle}>Pilih jenis catatan yang mau dibuat.</Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeButton}>
            <Icon name="close" size={16} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={{ gap: spacing.sm }}>
          {actions.map((action) => (
            <Pressable
              key={action.title}
              onPress={action.onPress}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]}
            >
              {action.tone === 'primary' ? (
                <LinearGradient
                  colors={gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.actionIcon}
                >
                  <Icon name={action.icon} size={20} color={colors.onPrimary} strokeWidth={2.1} />
                </LinearGradient>
              ) : (
                <View
                  style={[
                    styles.actionIcon,
                    {
                      backgroundColor:
                        action.tone === 'tertiary'
                          ? colors.tertiarySoft
                          : action.tone === 'amber'
                            ? colors.amberSoft
                            : colors.secondarySoft,
                      borderWidth: 1,
                      borderColor:
                        action.tone === 'tertiary'
                          ? colors.tertiaryBorder
                          : action.tone === 'amber'
                            ? colors.amberBorder
                            : colors.secondaryBorder,
                    },
                  ]}
                >
                  <Icon
                    name={action.icon}
                    size={19}
                    color={
                      action.tone === 'tertiary'
                        ? colors.tertiary
                        : action.tone === 'amber'
                          ? colors.amber
                          : colors.secondary
                    }
                    strokeWidth={1.9}
                  />
                </View>
              )}

              <View style={{ flex: 1 }}>
                <View style={styles.actionTitleRow}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  {action.badge ? <Chip label={action.badge} tone="amber" size="sm" /> : null}
                </View>
                <Text style={styles.actionDescription} numberOfLines={2}>
                  {action.description}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.footnote}>
          Tips: gunakan tombol + di bawah untuk membuka menu ini kapan saja.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    ...shadow.sheet,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.base },
  title: { ...type.h1, fontSize: 19, color: colors.white },
  subtitle: { ...type.caption, color: colors.textDim, marginTop: 2 },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white },
  actionDescription: { ...type.caption, color: colors.textDim, marginTop: 2, lineHeight: 16 },
  footnote: {
    ...type.micro,
    fontFamily: fonts.medium,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.base,
    letterSpacing: 0,
  },
});
