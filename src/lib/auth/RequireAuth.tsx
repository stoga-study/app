import { Navigate, Outlet, useLocation } from "react-router";
import { PageSkeleton } from "@/components/States";
import { useAuth } from "./session";

/** Signed-out students go to the welcome screen; the page they wanted is remembered. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="mx-auto max-w-xl p-6"><PageSkeleton label="Checking your sign-in." /></div>;
  if (!session) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Signed-in students skip the welcome and sign-in screens. */
export function RedirectIfSignedIn() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
