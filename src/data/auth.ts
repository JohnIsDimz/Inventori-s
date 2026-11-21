import { localStore } from '../services/db/local';
import { setAccessSession } from './access';
/**
 * Sesi & peran pengguna.
 *
 * Mode lokal: `bootstrap()` langsung selesai, `role` tetap null, `userId` null.
 * Mode cloud: sesi dibaca dari Supabase, lalu keanggotaan (outlet + peran)
 * diambil dari tabel `members`.
 */
import { friendlyAuthError } from '../services/sync/errors';
import { create } from 'zustand';

import { memberRoleFromRemote } from '../services/sync/mappers';
import { isCloudEnabled, supabase } from '../services/supabase/client';
import type { Role } from '../utils/permissions';

interface MembershipRow {
  role?: unknown;
  outlet_id?: unknown;
  outlets?: { name?: unknown } | null;
}

interface AuthState {
  ready: boolean;
  userId: string | null;
  email: string | null;
  role: Role | null;
  outletId: string | null;
  outletName: string | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshMembership: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  userId: null,
  email: null,
  role: null,
  outletId: null,
  outletName: null,
  error: null,

  bootstrap: async () => {
    if (!isCloudEnabled || !supabase) {
      set({ ready: true });
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        set({ ready: true });
        return;
      }
      await prepareUser(user.id);
      set({ userId: user.id, email: user.email ?? null });
      await get().refreshMembership();
    } catch (error) {
      set({ error: msg(error) });
    } finally {
      set((state) => ({ ...state, ready: true }));
    }
  },

  signIn: async (email, password) => {
    if (!supabase) return 'Masuk belum bisa dipakai di perangkat ini.';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return friendlyAuthError(error);
      if (data.user) await prepareUser(data.user.id);
      set({ role: null, outletId: null, outletName: null });
      set({ userId: data.user?.id ?? null, email: data.user?.email ?? null, error: null });
      await get().refreshMembership();
      return null;
    } catch (error) {
      set({ userId: null, email: null, role: null, outletId: null, outletName: null });
      return friendlyAuthError(error);
    }
  },

  signOut: async () => {
    const { wipeDeviceData } = await import('../services/wipe');
    await wipeDeviceData();
    await localStore.kvDel('auth:last_user_id');
    await localStore.kvDel('auth:last_outlet_id');
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw new Error(friendlyAuthError(error));
    }
    set({ userId: null, email: null, role: null, outletId: null, outletName: null });
  },

  refreshMembership: async () => {
    if (!supabase) return;
    const userId = get().userId;
    if (!userId) return;
    const { data, error } = await supabase
      .from('members')
      .select('role, outlet_id, outlets(name)')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(1);

    if (error) {
      set({ role: null, outletId: null, outletName: null, error: friendlyAuthError(error) });
      return;
    }

    const row = (data?.[0] ?? null) as MembershipRow | null;
    const nextOutlet = typeof row?.outlet_id === 'string' ? row.outlet_id : '';
    const previousOutlet = await localStore.kvGet('auth:last_outlet_id');
    if (previousOutlet && previousOutlet !== nextOutlet) {
      const { wipeDeviceData } = await import('../services/wipe');
      await wipeDeviceData();
    }
    await localStore.kvSet('auth:last_outlet_id', nextOutlet);

    if (!row) {
      set({ role: null, outletId: null, outletName: null, error: 'Akun ini belum terhubung ke toko mana pun.' });
      return;
    }

    set({
      role: memberRoleFromRemote(row.role),
      outletId: typeof row.outlet_id === 'string' ? row.outlet_id : null,
      outletName: typeof row.outlets?.name === 'string' ? row.outlets.name : null,
      error: null,
    });
  },
}));

function msg(error: unknown): string {
  return error instanceof Error ? friendlyAuthError(error) : 'Terjadi kesalahan.';
}

useAuthStore.subscribe((state) => setAccessSession(state, isCloudEnabled));
setAccessSession(useAuthStore.getState(), isCloudEnabled);

async function prepareUser(userId: string): Promise<void> {
  const previous = await localStore.kvGet('auth:last_user_id');
  if (previous !== userId) {
    const { wipeDeviceData } = await import('../services/wipe');
    await wipeDeviceData();
  }
  await localStore.kvSet('auth:last_user_id', userId);
}
