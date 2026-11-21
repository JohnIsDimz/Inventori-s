import { ACCOUNTS_ENABLED } from '../config/release';
import { canSession, type Action, type Role } from '../utils/permissions';

// Kept independent of device modules so store invariants remain testable.
let connected = ACCOUNTS_ENABLED && Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim(),
);
let session: { role: Role | null; userId: string | null; outletId: string | null } = {
  role: null, userId: null, outletId: null,
};
export function setAccessSession(next: typeof session, enabled: boolean): void {
  session = next;
  connected = enabled;
}
let mutationsPaused = false;
export function pauseMutations(paused: boolean): void { mutationsPaused = paused; }
export function canWrite(action: Action): boolean {
  if (mutationsPaused) return false;
  return canSession(session, action, connected);
}
