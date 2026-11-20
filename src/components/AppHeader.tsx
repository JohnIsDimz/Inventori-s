import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { useAppStore } from '../data/store';
import { activeOutlet, outletLabel } from '../data/outlets';
import { useScopedData } from '../data/scope';
import { lowStock, receivableSummary } from '../data/selectors';
import { colors, fonts, gradients, radius, shadow, spacing, type } from '../theme/tokens';
import { initials } from '../utils/format';

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const data = useScopedData();
  const kasbon = receivableSummary(data);
  const stok = lowStock(data);
  const alerts = kasbon.overdueCount + kasbon.dueSoonCount + stok.length;
  const storeName = profile.name.trim() || 'Atur nama toko';

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <View style={styles.identity}>
          <LinearGradient
            colors={gradients.primaryDeep}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoRing}
          >
            <View style={styles.logoInner}>
              <Icon name="store" size={19} color={colors.primary} strokeWidth={1.9} />
            </View>
          </LinearGradient>

          <Pressable
            style={styles.nameBlock}
            onPress={() => router.push('/pengaturan')}
            hitSlop={6}
          >
            {/* Nama toko memakai lebar penuh, jam operasional turun ke baris
                kedua supaya nama panjang tidak terpotong. */}
            <Text style={styles.storeName} numberOfLines={1}>
              {storeName}
            </Text>
            <View style={styles.subtitleRow}>
              {/* Toko bercabang: nama cabang menggantikan baris merek, karena
                  nama cabang jauh lebih penting untuk dicek kasir. */}
              {data.outlets.length > 1 ? (
                <Pressable
                  onPress={() => router.push('/cabang')}
                  style={styles.outletChip}
                  hitSlop={6}
                  accessibilityLabel="Ganti cabang"
                >
                  <Icon name="store" size={10} color={colors.secondary} strokeWidth={2} />
                  <Text style={styles.outletChipText} numberOfLines={1}>
                    {outletLabel(activeOutlet(data.outlets, data.activeOutletId))}
                  </Text>
                  <Icon name="chevronDown" size={9} color={colors.secondary} strokeWidth={2.4} />
                </Pressable>
              ) : (
                <Text style={styles.subtitle} numberOfLines={1}>
                  <Text style={styles.brand}>Inventori’s</Text>
                  {profile.code ? <Text style={styles.dot}>{'  •  '}</Text> : null}
                  {profile.code ? <Text>ID {profile.code}</Text> : null}
                  {!profile.code && subtitle ? <Text style={styles.dot}>{'  •  '}</Text> : null}
                  {!profile.code && subtitle ? <Text>{subtitle}</Text> : null}
                </Text>
              )}
              <View style={styles.openBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.openText}>
                  {profile.openTime}–{profile.closeTime}
                </Text>
              </View>
            </View>
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.iconButton}
            hitSlop={8}
            onPress={() => router.push('/notifikasi')}
            accessibilityLabel="Notifikasi"
          >
            <Icon name="bell" size={18} color={colors.textMuted} strokeWidth={1.8} />
            {alerts > 0 ? (
              <View style={styles.alertDot}>
                <Text style={styles.alertDotText}>{alerts > 9 ? '9+' : alerts}</Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            style={styles.avatar}
            hitSlop={8}
            onPress={() => router.push('/pengaturan')}
            accessibilityLabel="Profil toko"
          >
            {profile.ownerName.trim() ? (
              <Text style={styles.avatarText}>{initials(profile.ownerName)}</Text>
            ) : (
              <Icon name="user" size={16} color={colors.secondary} strokeWidth={1.9} />
            )}
          </Pressable>
        </View>
      </View>
      <View style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(16,19,32,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
    paddingHorizontal: spacing.base,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  logoRing: { width: 40, height: 40, borderRadius: radius.md, padding: 1.5, ...shadow.neon },
  logoInner: {
    flex: 1,
    borderRadius: radius.md - 2,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBlock: { flex: 1, minWidth: 0 },
  outletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    // Nama toko panjang + jam operasional tidak boleh saling menabrak:
    // chip cabang yang mengalah lebih dulu (dipotong), bukan jamnya.
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
    backgroundColor: colors.secondarySoft,
    maxWidth: 165,
  },
  outletChipText: { ...type.micro, color: colors.secondary, flexShrink: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, minWidth: 0, overflow: 'hidden' },
  storeName: { ...type.h3, fontSize: 15.5, color: colors.white },
  openBadge: {
    flexShrink: 0,
    marginLeft: 'auto' as const,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  openText: { fontFamily: fonts.semibold, fontSize: 9, color: colors.primary },
  subtitle: { ...type.caption, color: colors.textDim, flexShrink: 1 },
  brand: { color: colors.secondary, fontFamily: fonts.bold },
  dot: { color: colors.textFaint },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alertDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  alertDotText: { fontFamily: fonts.bold, fontSize: 8, color: colors.bgDeep },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondarySoft,
    borderWidth: 1,
    borderColor: colors.secondaryBorder,
  },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 12, color: colors.secondary },
  hairline: { height: 0 },
});
