/** Status sinkronisasi yang ditampilkan di UI (pill kecil & layar Akun). */
import { create } from 'zustand';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

interface SyncUiState {
  status: SyncStatus;
  running: boolean;
  /** Jumlah perubahan yang menunggu dikirim. */
  pending: number;
  /** Jumlah catatan yang ditolak permanen sejak sesi dimulai. */
  droppedCount: number;
  /** Pesan peringatan bila ada catatan yang ditolak saat sinkronisasi. */
  warning: string | null;
  lastSyncAt: string | null;
  error: string | null;
  /** Hasil pemantauan NetInfo; false = tidak ada internet. */
  online: boolean;
}

export const useSyncStore = create<SyncUiState>(() => ({
  status: 'off',
  running: false,
  pending: 0,
  droppedCount: 0,
  warning: null,
  lastSyncAt: null,
  error: null,
  online: true,
}));

export function resetSyncUiState(): void {
  useSyncStore.setState({
    status: 'off',
    running: false,
    pending: 0,
    droppedCount: 0,
    warning: null,
    lastSyncAt: null,
    error: null,
  });
}

export function syncStatusLabel(
  state: Pick<SyncUiState, 'status' | 'pending' | 'online' | 'droppedCount'>,
  cloudEnabled: boolean,
): string {
  if (!cloudEnabled) return 'Di HP ini';
  if (!state.online) {
    return state.pending > 0 ? `Tidak tersambung · ${state.pending} menunggu` : 'Tidak tersambung';
  }
  if (state.status === 'syncing') return 'Menyinkronkan…';
  if (state.status === 'error') return 'Sinkron gagal';
  if ((state.droppedCount ?? 0) > 0) return 'Perlu diperiksa';
  if (state.pending > 0) return `${state.pending} menunggu`;
  return 'Tersinkron';
}
