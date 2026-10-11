import { Navigate, Outlet, useLocation } from "react-router";
import { ErrorState, PageSkeleton } from "@/components/States";
import { gradeFor } from "@/lib/grade";
import { useProfile } from "@/lib/queries/profile";
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

/** New students finish onboarding before reaching the app. */
export function RequireOnboarded() {
  const profile = useProfile();
  if (profile.isPending) return <div className="mx-auto max-w-xl p-6"><PageSkeleton /></div>;
  if (profile.isError)
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState title="We could not load your account" onRetry={() => profile.refetch()}>
          Check your connection, then try again. Your notes and cards are safe.
        </ErrorState>
      </div>
    );
  // New students, and anyone without a current grade (e.g. a new school year after graduating), set up first.
  if (!profile.data.onboarded || !gradeFor(profile.data.graduation_year)) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
