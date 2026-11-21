import AsyncStorage from '@react-native-async-storage/async-storage';
import { pauseMutations } from '../data/access';
import { drainOutboxWrites } from './sync/outbox';
import { useAppStore } from '../data/store';
import { localStore } from './db/local';
import { localJsonStorage } from './db/persistence';
import { clearPhotos } from './photos';
import { pauseSync, resumeSync } from './sync/engine';
import { clearSyncMetadata } from './sync/idmap';
import { resetSyncUiState } from './sync/state';

/** Wait for in-flight sync before deleting, so old data cannot reappear. */
export async function wipeDeviceData(): Promise<void> {
  pauseMutations(true);
  try {
    await pauseSync();
    await drainOutboxWrites();
    await localStore.clearOutbox();
    await clearSyncMetadata();
    await AsyncStorage.removeItem('inventoris-store-v1');
    await AsyncStorage.removeItem('warunglui-store-v1');
    await localStore.kvDel('warunglui-store-v1');
    if (!useAppStore.persist.hasHydrated()) await useAppStore.persist.rehydrate();
    useAppStore.getState().resetAll();
    useAppStore.setState((s) => ({ settings: { ...s.settings, printerName: '', printerAddress: '' } }));
    // Explicitly await persistence (Zustand setters do not return its promise).
    await localJsonStorage.setItem('inventoris-store-v1', JSON.stringify({ state: useAppStore.getState(), version: 2 }));
    clearPhotos(true);
    resetSyncUiState();
  } finally {
    resumeSync();
    pauseMutations(false);
  }
}
