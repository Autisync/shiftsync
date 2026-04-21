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

    const loadProfile = async (userId: string) => {
      try {
        const nextProfile = await backend.users.getUserProfile(userId);
        if (mounted) {
          setProfile(nextProfile);
        }
      } catch {
        if (mounted) {
          setProfile(null);
        }
      }
    };

    // Bootstrap: restore existing session on mount
    void backend.auth
      .getSession()
      .then(async (restored) => {
        if (!mounted) return;
        setSession(restored);
        if (restored?.userId) {
          await loadProfile(restored.userId);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setProfile(null);
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    // Subscribe to subsequent auth state changes
    const unsubscribe = backend.auth.onAuthChange(async (updated) => {
      if (!mounted) return;
      setSession(updated);
      if (updated?.userId) {
        await loadProfile(updated.userId);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
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
