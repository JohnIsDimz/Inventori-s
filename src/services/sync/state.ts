/** Status sinkronisasi yang ditampilkan di UI (pill kecil & layar Akun). */
import { create } from 'zustand';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

interface SyncUiState {
  status: SyncStatus;
  running: boolean;
  /** Jumlah perubahan yang menunggu dikirim. */
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
  /** Hasil pemantauan NetInfo; false = tidak ada internet. */
  online: boolean;
}

export const useSyncStore = create<SyncUiState>(() => ({
  status: 'off',
  running: false,
  pending: 0,
  lastSyncAt: null,
  error: null,
  online: true,
}));

export function syncStatusLabel(
  state: Pick<SyncUiState, 'status' | 'pending' | 'online'>,
  cloudEnabled: boolean,
): string {
  if (!cloudEnabled) return 'Di HP ini';
  if (!state.online) {
    return state.pending > 0 ? `Tidak tersambung · ${state.pending} menunggu` : 'Tidak tersambung';
  }
  if (state.status === 'syncing') return 'Menyinkronkan…';
  if (state.status === 'error') return 'Sinkron gagal';
  if (state.pending > 0) return `${state.pending} menunggu`;
  return 'Tersinkron';
}
