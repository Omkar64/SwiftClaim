import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Wraps user-only pages. If the logged-in user is an admin, redirect them
 * to the admin dashboard so they can't accidentally land on the user portal.
 */
export function UserOnlyGuard({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return null;

  // Admins must not use user-portal pages
  if (isAdmin) return <Navigate to="/admin" replace />;

  // Unauthenticated → send to auth
  if (!user) return <Navigate to="/auth" replace />;

  return <>{children}</>;
}

/**
 * Wraps admin-only pages. Non-admins get bounced:
 *   - Unauthenticated → /auth
 *   - Authenticated regular users → / (home), not admin area
 */
export function AdminOnlyGuard({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return null;

  // Not logged in → send to auth
  if (!user) return <Navigate to="/auth" replace />;

  // Logged-in but not admin → kick to home
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
