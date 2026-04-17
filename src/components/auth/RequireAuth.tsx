/**
 * src/components/auth/RequireAuth.tsx
 *
 * Route guard component.
 * Wraps authenticated routes and redirects unauthenticated users
 * to the landing page while preserving the intended destination.
 *
 * Usage:
 *   <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
 */

import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { LoadingState } from "@/components/ui/loading-state";

interface RequireAuthProps {
  children: ReactNode;
  /** Path to redirect to when unauthenticated. Defaults to "/" */
  redirectTo?: string;
}

export function RequireAuth({ children, redirectTo = "/" }: RequireAuthProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-autisync-surface flex items-center justify-center"
        aria-label="Loading…"
        aria-live="polite"
      >
        <LoadingState message="A carregar sessão..." />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
