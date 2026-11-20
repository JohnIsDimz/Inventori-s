/** Pil kecil status sinkron: Di HP ini / Menyinkronkan / N menunggu / Tersinkron. */
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isCloudEnabled } from '../services/supabase/client';
import { syncStatusLabel, useSyncStore } from '../services/sync/state';
import { colors, fonts, radius, spacing, type } from '../theme/tokens';

export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const status = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pending);
  const online = useSyncStore((s) => s.online);
  const label = syncStatusLabel({ status, pending, online }, isCloudEnabled);

  const tone = !isCloudEnabled
    ? colors.textDim
    : !online
      ? colors.amber
      : status === 'error'
        ? colors.danger
        : pending > 0
          ? colors.amber
          : colors.primary;

  return (
    <Pressable
      onPress={() => router.push('/akun')}
      style={[styles.pill, compact && styles.pillCompact]}
      accessibilityRole="button"
      accessibilityLabel={`Status sinkron: ${label}. Buka layar akun.`}
    >
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={[styles.label, { color: tone }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  pillCompact: { paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { ...type.micro, fontFamily: fonts.semibold, letterSpacing: 0.2 },
});
