/** Komponen UI dasar yang dipakai lintas layar. */
import { LinearGradient } from 'expo-linear-gradient';
import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { colors, fonts, gradients, radius, shadow, spacing, type } from '../theme/tokens';

/* ---------------------------------------------------------------- Screen --- */

export function Screen({
  children,
  edges = { top: false, bottom: false },
  style,
}: {
  children: ReactNode;
  edges?: { top?: boolean; bottom?: boolean };
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, style]}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View
        style={[
          styles.flex,
          {
            paddingTop: edges.top ? insets.top : 0,
            paddingBottom: edges.bottom ? insets.bottom : 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Card --- */

export function Card({
  children,
  style,
  padded = true,
  tone = 'default',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'default' | 'high' | 'flat';
}) {
  return (
    <View
      style={[
        styles.card,
        tone === 'high' && { backgroundColor: colors.cardHigh },
        tone === 'flat' && { backgroundColor: colors.surface, borderColor: colors.border },
        padded && { padding: spacing.base },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* -------------------------------------------------------------- section --- */

export function SectionTitle({
  title,
  icon,
  right,
  subtitle,
  style,
}: {
  title: string;
  icon?: IconName;
  right?: ReactNode;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionLeft}>
        {icon ? (
          <View style={styles.sectionDot}>
            <Icon name={icon} size={13} color={colors.primary} strokeWidth={2} />
          </View>
        ) : (
          <View style={[styles.sectionDot, { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }]} />
        )}
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------ Chip --- */

type Tone = 'primary' | 'secondary' | 'tertiary' | 'amber' | 'danger' | 'neutral';

const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  primary: { fg: colors.primary, bg: colors.primarySoft, border: colors.primaryBorder },
  secondary: { fg: colors.secondary, bg: colors.secondarySoft, border: colors.secondaryBorder },
  tertiary: { fg: colors.tertiary, bg: colors.tertiarySoft, border: colors.tertiaryBorder },
  amber: { fg: colors.amber, bg: colors.amberSoft, border: colors.amberBorder },
  danger: { fg: colors.danger, bg: colors.dangerSoft, border: colors.dangerBorder },
  neutral: { fg: colors.textMuted, bg: 'rgba(255,255,255,0.06)', border: colors.border },
};

export function Chip({
  label,
  tone = 'neutral',
  icon,
  size = 'md',
  dot,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
  size?: 'sm' | 'md';
  dot?: boolean;
}) {
  const palette = TONES[tone];
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 6 : 8,
        },
      ]}
    >
      {dot ? <View style={[styles.chipDot, { backgroundColor: palette.fg }]} /> : null}
      {icon ? <Icon name={icon} size={size === 'sm' ? 10 : 12} color={palette.fg} strokeWidth={2} /> : null}
      <Text
        style={[
          styles.chipText,
          { color: palette.fg, fontSize: size === 'sm' ? 9 : 10 },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------- IconBadge --- */

export function IconBadge({
  name,
  tone = 'primary',
  size = 42,
  filled = false,
}: {
  name: IconName;
  tone?: Tone;
  size?: number;
  filled?: boolean;
}) {
  const palette = TONES[tone];
  if (filled) {
    return (
      <LinearGradient
        colors={
          tone === 'primary'
            ? (gradients.primary as unknown as [string, string])
            : tone === 'amber'
              ? (gradients.gold as unknown as [string, string])
              : (gradients.primary as unknown as [string, string])
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.badge,
          { width: size, height: size, borderRadius: size / 2.9, borderColor: 'transparent' },
          tone === 'primary' && shadow.neon,
        ]}
      >
        <Icon name={name} size={size * 0.5} color={colors.onPrimary} strokeWidth={2} />
      </LinearGradient>
    );
  }
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2.9,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      <Icon name={name} size={size * 0.46} color={palette.fg} strokeWidth={1.9} />
    </View>
  );
}

/* ---------------------------------------------------------------- Button --- */

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  style,
  fullWidth = true,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}) {
  const height = size === 'lg' ? 56 : 48;
  const blocked = Boolean(disabled || loading);
  /**
   * Tombol nonaktif tidak boleh memakai warna label tombol aktif: pada tombol
   * utama labelnya gelap (untuk latar hijau), sehingga di atas latar abu-abu
   * nonaktif teksnya nyaris tak terbaca. Pakai warna redup yang tetap kontras.
   */
  const labelColor = disabled ? colors.textDim : variant === 'primary' ? colors.onPrimary : colors.text;
  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <>
          {icon ? (
            <Icon
              name={icon}
              size={size === 'sm' ? 15 : 18}
              color={labelColor}
              strokeWidth={2}
            />
          ) : null}
          <Text
            style={[
              styles.buttonLabel,
              {
                color: labelColor,
                fontSize: size === 'sm' ? 12 : 14,
              },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.button,
    { height, borderRadius: size === 'sm' ? radius.md : radius.lg },
    fullWidth && { alignSelf: 'stretch' },
    variant === 'primary' && !disabled && shadow.neon,
    variant === 'primary' && disabled && { backgroundColor: colors.cardHigh },
    variant === 'secondary' && { backgroundColor: colors.cardHigh, borderColor: colors.borderStrong },
    variant === 'outline' && { backgroundColor: 'transparent', borderColor: colors.primaryBorder },
    variant === 'ghost' && { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: colors.border },
    variant === 'danger' && { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
    disabled && variant !== 'primary' && { opacity: 0.45 },
    style,
  ];

  if (variant === 'primary' && !disabled) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: blocked, busy: Boolean(loading) }} onPress={blocked ? undefined : onPress} disabled={blocked} style={containerStyle}>
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size === 'sm' ? radius.md : radius.lg }]}
        />
        <View style={styles.buttonRow}>{content}</View>
      </Pressable>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: blocked, busy: Boolean(loading) }} onPress={blocked ? undefined : onPress} disabled={blocked} style={containerStyle}>
      <View style={styles.buttonRow}>{content}</View>
    </Pressable>
  );
}

/* ------------------------------------------------------------- EmptyState --- */

export function EmptyState({
  icon = 'sparkle',
  title,
  description,
  action,
  compact,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.empty, compact && { paddingVertical: spacing.lg }]}>
      <View style={styles.emptyIconWrap}>
        <Icon name={icon} size={26} color={colors.primary} strokeWidth={1.7} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {action ? <View style={{ marginTop: spacing.md, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

/* -------------------------------------------------------------- Segmented --- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string; badge?: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && { color: colors.bgDeep }]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.badge ? (
              <View style={[styles.segmentBadge, active && { backgroundColor: 'rgba(0,0,0,0.16)' }]}>
                <Text style={[styles.segmentBadgeText, active && { color: colors.bgDeep }]}>
                  {option.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------- ProgressBar --- */

export function ProgressBar({
  progress,
  tone = 'primary',
  height = 6,
}: {
  progress: number;
  tone?: Tone;
  height?: number;
}) {
  const palette = TONES[tone];
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View
        style={[
          styles.progressFill,
          {
            width: `${Math.min(100, Math.max(0, progress * 100))}%`,
            backgroundColor: palette.fg,
            height,
          },
        ]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ Sheet --- */

export function Sheet({
  visible,
  onClose,
  children,
  title,
  subtitle,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Tutup dialog" style={styles.sheetBackdrop} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheetCard, { paddingBottom: insets.bottom + spacing.base }]}>
          <View style={styles.sheetGrabber} />
          {title ? (
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{title}</Text>
                {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Tutup dialog" onPress={onClose} hitSlop={10} style={styles.sheetClose}>
                <Icon name="close" size={16} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}
          <Body
            {...(scroll
              ? { contentContainerStyle: { paddingBottom: spacing.sm }, showsVerticalScrollIndicator: false }
              : {})}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </Body>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Misc --- */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function KeyValueRow({
  label,
  value,
  valueStyle,
  icon,
}: {
  label: string;
  value: string;
  valueStyle?: StyleProp<TextStyle>;
  icon?: IconName;
}) {
  return (
    <View style={styles.kvRow}>
      <View style={styles.kvLeft}>
        {icon ? <Icon name={icon} size={14} color={colors.textFaint} /> : null}
        <Text style={styles.kvLabel}>{label}</Text>
      </View>
      <Text style={[styles.kvValue, valueStyle]}>{value}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  sectionDot: {
    width: 20,
    height: 20,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  sectionTitle: { ...type.h3, color: colors.white },
  sectionSubtitle: { ...type.caption, color: colors.textDim, marginTop: 1 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  chipDot: { width: 5, height: 5, borderRadius: 3 },
  chipText: { fontFamily: fonts.semibold, letterSpacing: 0.2 },

  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonLabel: { fontFamily: fonts.bold, letterSpacing: -0.2 },

  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
  },
  emptyTitle: { ...type.bodyMedium, fontFamily: fonts.bold, color: colors.white, textAlign: 'center' },
  emptyDescription: {
    ...type.caption,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
    maxWidth: 300,
  },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentLabel: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.textMuted },
  segmentBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  segmentBadgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.textMuted },

  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: { borderRadius: radius.pill },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    maxHeight: '88%',
    ...shadow.sheet,
  },
  sheetGrabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetTitle: { ...type.h2, color: colors.white, lineHeight: 21 },
  sheetSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 4, lineHeight: 16 },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },

  divider: { height: 1, backgroundColor: colors.border },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    gap: spacing.sm,
  },
  kvLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  kvLabel: { ...type.caption, color: colors.textMuted },
  kvValue: { ...type.num, fontSize: 13, color: colors.text },
  fieldLabel: {
    ...type.micro,
    color: colors.textDim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
});
