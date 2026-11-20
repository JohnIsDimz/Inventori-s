/**
 * Design tokens — diekstrak dari file desain HTML (Tailwind config) lalu
 * dirapikan: satu sumber kebenaran untuk warna, radius, tipografi, dan elevasi.
 */
import { Platform } from 'react-native';

export const colors = {
  // Background & surface
  bg: '#101320',
  bgDeep: '#0a0d1a',
  surface: '#181b28',
  card: '#1c1f2d',
  cardHigh: '#262937',
  cardHighest: '#313443',

  // Garis & pemisah
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  overlay: 'rgba(4,6,12,0.72)',

  // Brand
  primary: '#00f5a0',
  primaryDim: '#00e293',
  primarySoft: 'rgba(0,245,160,0.12)',
  primaryBorder: 'rgba(0,245,160,0.32)',
  onPrimary: '#002b19',

  secondary: '#00d2ff',
  secondarySoft: 'rgba(0,210,255,0.12)',
  secondaryBorder: 'rgba(0,210,255,0.32)',

  tertiary: '#ff6b4a',
  tertiarySoft: 'rgba(255,107,74,0.12)',
  tertiaryBorder: 'rgba(255,107,74,0.32)',

  amber: '#ffc44d',
  amberSoft: 'rgba(255,196,77,0.12)',
  amberBorder: 'rgba(255,196,77,0.32)',

  danger: '#ff6b6b',
  dangerSoft: 'rgba(255,107,107,0.12)',
  dangerBorder: 'rgba(255,107,107,0.30)',

  // Teks
  text: '#e0e1f4',
  textMuted: '#b9cbbd',
  textDim: '#9aa4b6', // kontras 7.4:1 di kartu — lolos WCAG AA
  textFaint: '#8b95a8', // 5.6:1 di kartu, 4.9:1 di cardHigh — lolos WCAG AA untuk teks kecil

  white: '#ffffff',
} as const;

export const gradients = {
  /** Header hero / kartu saldo */
  hero: ['#123c33', '#102a3d', '#101320'] as const,
  /** Aksen utama (tombol & FAB) */
  primary: ['#00f5a0', '#00d2ff'] as const,
  primaryDeep: ['#00f5a0', '#00a8ff'] as const,
  /** Pemasukan */
  income: ['rgba(0,245,160,0.18)', 'rgba(0,245,160,0.02)'] as const,
  /** Pengeluaran */
  expense: ['rgba(255,107,74,0.18)', 'rgba(255,107,74,0.02)'] as const,
  /** Latar aplikasi */
  screen: ['#101320', '#0d1120', '#0a0d1a'] as const,
  card: ['#1e2233', '#171a27'] as const,
  gold: ['#ffd479', '#ff9f43'] as const,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Font: Plus Jakarta Sans (UI) + Inter (angka). Dimuat lewat expo-font di
 * app/_layout.tsx. Nama family di sini harus sama dengan key yang diregistrasi.
 */
export const fonts = {
  regular: 'PJS-Regular',
  medium: 'PJS-Medium',
  semibold: 'PJS-SemiBold',
  bold: 'PJS-Bold',
  extrabold: 'PJS-ExtraBold',
  numRegular: 'Inter-Regular',
  numMedium: 'Inter-Medium',
  numSemibold: 'Inter-SemiBold',
  numBold: 'Inter-Bold',
  /** Monospace untuk pratinjau struk 32 kolom agar kolom rata. */
  mono: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const type = {
  hero: { fontFamily: fonts.numBold, fontSize: 34, letterSpacing: -1 },
  h1: { fontFamily: fonts.extrabold, fontSize: 22, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.bold, fontSize: 16.5, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.bold, fontSize: 14.5, letterSpacing: -0.2 },
  // Skala naik tipis (audit UI 19/11): pemilik warung banyak yang berumur,
  // 13.5/11/10 terlalu kecil di HP 5–6 inci.
  body: { fontFamily: fonts.regular, fontSize: 14 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 14 },
  label: { fontFamily: fonts.semibold, fontSize: 12.5 },
  caption: { fontFamily: fonts.medium, fontSize: 11.5 },
  micro: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.35 },
  num: { fontFamily: fonts.numSemibold, fontSize: 15, letterSpacing: -0.2 },
  numLg: { fontFamily: fonts.numBold, fontSize: 18, letterSpacing: -0.4 },
} as const;

export const shadow = {
  neon: {
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
} as const;

export const hairline = Platform.select({ ios: 0.5, default: 1 }) as number;
