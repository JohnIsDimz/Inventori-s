/**
 * Data untuk layar, sudah disaring ke cabang yang sedang dibuka.
 *
 * Layar tetap menulis `const data = useScopedData()`. Bila toko hanya punya
 * satu cabang, isinya sama persis dengan `useAppStore()` — jadi angka untuk
 * pengguna lama tidak berubah karena Sprint 12.
 */
import { useMemo } from 'react';

import { scopeData, type ScopedData } from './outlets';
import { useAppStore } from './store';

export function useScopedData(): ScopedData {
  const state = useAppStore();
  return useMemo(() => scopeData(state), [state]);
}
