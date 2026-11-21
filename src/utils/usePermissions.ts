import { useAuthStore } from '../data/auth';
import { isCloudEnabled } from '../services/supabase/client';
import { canSession, type Action } from './permissions';
export function useCan(action: Action): boolean {
  const session = useAuthStore();
  return canSession(session, action, isCloudEnabled);
}
export function useCanSeeProfit(): boolean { return useCan('profit.view'); }
