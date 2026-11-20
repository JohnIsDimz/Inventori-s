// Tipe tab bar ikut versi expo-router yang terpasang (SDK 58 mem-vendor
// react-navigation di dalam paket expo-router).
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/index';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, fonts, gradients, radius, shadow, type } from '../theme/tokens';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Beranda', icon: 'home' },
  transaksi: { label: 'Transaksi', icon: 'receipt' },
  kasbon: { label: 'Kasbon', icon: 'book' },
  laporan: { label: 'Laporan', icon: 'chart' },
};

export function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const router = useRouter();

  const renderTab = (name: string) => {
    const route = state.routes.find((item) => item.name === name);
    if (!route) return null;
    const config = TABS[name];
    const active = state.routes[state.index]?.key === route.key;

    const onPress = () => {
      const event = emitter.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!active && !event?.defaultPrevented) navigateToTab(route.key);
      if (!active) Haptics.selectionAsync().catch(() => {});
    };

    return (
      <Pressable key={name} onPress={onPress} style={styles.tab} accessibilityRole="tab">
        <View style={styles.iconSlot}>
          <Icon
            name={config.icon}
            size={21}
            color={active ? colors.primary : colors.textFaint}
            strokeWidth={active ? 2.1 : 1.7}
          />
          {active ? <View style={styles.activeDot} /> : null}
        </View>
        <Text style={[styles.tabLabel, active && { color: colors.primary }]}>{config.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {renderTab('index')}
        {renderTab('transaksi')}

        <View style={styles.fabSlot}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push('/pilih-transaksi');
            }}
            style={styles.fabPress}
            accessibilityLabel="Catat transaksi"
          >
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fab}
            >
              <Icon name="plus" size={26} color={colors.onPrimary} strokeWidth={2.4} />
            </LinearGradient>
            <Text style={styles.fabLabel}>Catat</Text>
          </Pressable>
        </View>

        {renderTab('kasbon')}
        {renderTab('laporan')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(16,19,32,0.97)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3, paddingVertical: 4 },
  iconSlot: { height: 24, alignItems: 'center', justifyContent: 'center' },
  activeDot: {
    position: 'absolute',
    bottom: -3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  tabLabel: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textFaint },
  fabSlot: { width: 76, alignItems: 'center' },
  fabPress: { alignItems: 'center', marginTop: -26 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
    ...shadow.neon,
  },
  fabLabel: {
    ...type.micro,
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
