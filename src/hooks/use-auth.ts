/**
 * src/hooks/use-auth.ts
 *
 * Auth session bootstrap hook.
 * Restores the session on mount, subscribes to auth state changes,
 * and exposes loading/session state for components.
 */

import { useState, useEffect } from "react";
import { getBackend } from "@/services/backend/backend-provider";
import type { AuthSession } from "@/types/domain";
import type { UserProfile } from "@/types/domain";

export interface UseAuthReturn {
  session: AuthSession | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const backend = getBackend();

    // Bootstrap: restore existing session on mount
    backend.auth.getSession().then(async (restored) => {
      if (!mounted) return;
      setSession(restored);
      if (restored?.userId) {
        const p = await backend.users.getUserProfile(restored.userId);
        if (mounted) setProfile(p);
      }
      setIsLoading(false);
    });

    // Subscribe to subsequent auth state changes
    const unsubscribe = backend.auth.onAuthChange(async (updated) => {
      if (!mounted) return;
      setSession(updated);
      if (updated?.userId) {
        const p = await backend.users.getUserProfile(updated.userId);
        if (mounted) setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return {
    session,
    profile,
    isLoading,
    isAuthenticated: session !== null,
  };
}
