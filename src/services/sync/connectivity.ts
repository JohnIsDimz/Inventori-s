/**
 * Status koneksi internet.
 *
 * Tujuan: aplikasi tahu kapan harus diam (offline) dan kapan harus langsung
 * menyinkronkan (begitu sinyal kembali), tanpa menunggu timer 30 detik.
 */
import NetInfo from '@react-native-community/netinfo';

import { useSyncStore } from './state';

/**
 * Mulai memantau koneksi. `onOnline` dipanggil sekali setiap kali status
 * berubah dari offline → online. Mengembalikan fungsi untuk berhenti.
 */
export function startConnectivity(onOnline: () => void): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    const next = state.isConnected !== false && state.isInternetReachable !== false;
    const was = useSyncStore.getState().online;
    useSyncStore.setState({ online: next });
    if (!was && next) onOnline();
  });
  return unsubscribe;
}

export function isOnline(): boolean {
  return useSyncStore.getState().online;
}
