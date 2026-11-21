import { canSession, type Action } from '../src/utils/permissions';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthStore } from '../src/data/auth';
import { stockFor } from '../src/data/outlets';
import { useAppStore } from '../src/data/store';
import { useStoreHydrated } from '../src/data/store';
import { startConnectivity } from '../src/services/sync/connectivity';
import { startSyncLoop, stopSyncLoop, syncNow, syncSoon } from '../src/services/sync/engine';
import { remsyncReminders } from '../src/services/notifications/auto';
import { startRealtime, stopRealtime } from '../src/services/sync/realtime';
import { isCloudEnabled } from '../src/services/supabase/client';
import { colors } from '../src/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'PJS-Regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'PJS-Medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'PJS-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'PJS-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'PJS-ExtraBold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
  });
  const hydrated = useStoreHydrated();

  const router = useRouter();
  const segments = useSegments();
  const role = useAuthStore((s) => s.role);
  const authReady = useAuthStore((s) => s.ready);
  const userId = useAuthStore((s) => s.userId);
  const outletId = useAuthStore((s) => s.outletId);
  const bootstrapAuth = useAuthStore((s) => s.bootstrap);

  const restrictedRoutes: Record<string, Action> = {
    stok: 'product.manage', pembelian: 'product.manage', retur: 'product.manage',
    opname: 'stock.adjust', cabang: 'settings.manage', pengaturan: 'settings.manage',
    'harga-beli': 'profit.view', cadangan: 'settings.manage', supplier: 'product.manage',
    audit: 'audit.view', anggota: 'member.manage',
  };
  const requiredAction = restrictedRoutes[segments[0] ?? ''];
  const routeAllowed = !requiredAction || canSession({ role, userId, outletId }, requiredAction, isCloudEnabled);
  useEffect(() => {
    if (authReady && userId && outletId && !routeAllowed) router.replace('/(tabs)');
  }, [authReady, userId, outletId, routeAllowed, router]);

  // Data yang dipakai penjadwal pengingat (dipilih sempit agar efek tidak
  // dijalankan ulang oleh perubahan state lain).
  const receivables = useAppStore((s) => s.receivables);
  const orders = useAppStore((s) => s.orders);
  const notifEnabled = useAppStore((s) => s.settings.notifEnabled);
  const notifHour = useAppStore((s) => s.settings.notifHour);
  const rawProducts = useAppStore((s) => s.products);
  const purchases = useAppStore((s) => s.purchases);
  const activeOutletId = useAppStore((s) => s.activeOutletId);
  // Peringatan stok memakai stok cabang yang sedang dibuka, bukan stok cabang lain.
  const products = useMemo(
    () => rawProducts.map((product) => ({ ...product, stock: stockFor(product, activeOutletId) })),
    [rawProducts, activeOutletId],
  );

  // Sesi & peran dimuat sekali di awal (mode lokal langsung selesai).
  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  // Data sadar-cabang: toko satu lokasi mendapat satu cabang otomatis tanpa
  // layar tambahan; angka di layar tidak berubah.
  const ensureOutlets = useAppStore((s) => s.ensureOutlets);
  const ensureSuppliers = useAppStore((s) => s.ensureSuppliers);
  useEffect(() => {
    if (hydrated) ensureOutlets();
  }, [hydrated, ensureOutlets]);
  // Buku supplier dilengkapi dari nama yang sudah dipakai di kulakan & utang,
  // supaya pemilik tidak perlu mengetik ulang riwayat lamanya.
  useEffect(() => {
    if (hydrated) ensureSuppliers();
  }, [hydrated, ensureSuppliers]);

  // Penjaga rute: mode cloud wajib punya sesi, mode lokal tidak pernah diarahkan.
  useEffect(() => {
    if (!isCloudEnabled || !authReady) return;
    const onLoginScreen = segments[0] === 'masuk' || segments[0] === 'daftar';
    if (!userId && !onLoginScreen) router.replace('/masuk');
    if (userId && !outletId && !['akun', 'privasi', 'daftar'].includes(segments[0] ?? '')) router.replace('/akun');
    if (userId && outletId && onLoginScreen) router.replace('/(tabs)');
  }, [authReady, userId, outletId, segments, router]);

  // Pantau koneksi: begitu internet kembali, langsung sinkron tanpa menunggu timer.
  useEffect(() => {
    if (!isCloudEnabled) return;
    return startConnectivity(() => void syncNow());
  }, []);

  // Realtime: perubahan dari perangkat lain memicu sinkron hampir seketika.
  useEffect(() => {
    if (!isCloudEnabled || !userId || !outletId) return;
    startRealtime(outletId, () => syncSoon());
    return () => stopRealtime();
  }, [userId, outletId]);

  // Sinkron berkala selama pengguna masuk, plus sekali setiap aplikasi dibuka.
  useEffect(() => {
    if (!isCloudEnabled || !userId) {
      stopSyncLoop();
      return;
    }
    startSyncLoop(30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => {
      subscription.remove();
      stopSyncLoop();
    };
  }, [userId]);

  /**
   * Pengingat jatuh tempo dijadwalkan ulang setiap kali data berubah (kasbon
   * dibayar, pesanan diambil, tanggal digeser) — supaya tidak ada notifikasi
   * "hantu" untuk hal yang sudah selesai.
   */
  useEffect(() => {
    if (!hydrated) return;
    return remsyncReminders({
      enabled: notifEnabled,
      hour: notifHour,
      receivables,
      orders,
      products,
      purchases: purchases ?? [],
    });
  }, [hydrated, notifEnabled, notifHour, receivables, orders, products, purchases]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && hydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, hydrated]);

  // Tahan render pertama sampai font DAN data lokal siap, supaya layar tidak
  // sempat menampilkan saldo Rp 0 sebelum AsyncStorage selesai dimuat.
  if ((!fontsLoaded && !fontError) || !hydrated || (isCloudEnabled && !authReady)) {
    return <View style={styles.loading} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="catat" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen
            name="pilih-transaksi"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="kasbon/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="kasir" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'product.manage', isCloudEnabled)}>
          <Stack.Screen name="stok" />
          </Stack.Protected>
          <Stack.Screen name="pelanggan" />
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'settings.manage', isCloudEnabled)}>
          <Stack.Screen name="cabang" />
          </Stack.Protected>
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'stock.adjust', isCloudEnabled)}>
          <Stack.Screen name="opname" />
          </Stack.Protected>
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'product.manage', isCloudEnabled)}>
          <Stack.Screen name="pembelian" />
          </Stack.Protected>
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'product.manage', isCloudEnabled)}>
          <Stack.Screen name="supplier" />
          </Stack.Protected>
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'product.manage', isCloudEnabled)}>
          <Stack.Screen name="retur" />
          </Stack.Protected>
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'profit.view', isCloudEnabled)}>
          <Stack.Screen name="harga-beli" />
          </Stack.Protected>
          <Stack.Screen name="tagih-kasbon" />
          <Stack.Screen name="notifikasi" />
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'settings.manage', isCloudEnabled)}>
          <Stack.Screen name="pengaturan" />
          </Stack.Protected>
          <Stack.Screen name="akun" />
          <Stack.Screen name="shift" />
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'member.manage', isCloudEnabled)}>
          <Stack.Screen name="anggota" />
          </Stack.Protected>
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'audit.view', isCloudEnabled)}>
          <Stack.Screen name="audit" />
          </Stack.Protected>
          <Stack.Screen name="daftar" />
          <Stack.Protected guard={canSession({ role, userId, outletId }, 'settings.manage', isCloudEnabled)}>
          <Stack.Screen name="cadangan" />
          </Stack.Protected>
          <Stack.Screen name="privasi" />
          <Stack.Screen name="pengingat" />
          <Stack.Screen name="pesanan" />
          <Stack.Screen name="pesanan-baru" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="masuk" options={{ animation: 'fade' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg },
});
