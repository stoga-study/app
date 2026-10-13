import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { unseen, useChangelog } from "@/lib/changelog";
import { useProfile } from "@/lib/queries/profile";
import { useMarkSeen } from "@/routes/WhatsNew";

// Once per app open, at most: never interrupt a student twice in one sitting.
let shownThisOpen = false;
// Mid-task screens are never interrupted; the update shows on the next screen instead.
const BUSY = /^\/(review\/session|quiz\/|upload|notes\/|practice)/;

/** After an update, opens the full-screen "What's new" once. Brand-new students are simply marked up to date. */
export function WhatsNewGate() {
  const profile = useProfile();
  const log = useChangelog();
  const location = useLocation();
  const navigate = useNavigate();
  const markSeen = useMarkSeen();
  const latest = log.data?.[0]?.version;
  const seen = profile.data?.last_seen_version;
  const pending = !!(log.data && seen && unseen(log.data, seen).length);

  useEffect(() => {
    if (!latest || !profile.data) return;
    if (seen == null) void markSeen(latest);
    else if (pending && !shownThisOpen && location.pathname !== "/whats-new" && !BUSY.test(location.pathname)) {
      shownThisOpen = true;
      navigate("/whats-new", { state: { from: location.pathname + location.search } });
    }
  }, [latest, seen, pending, profile.data, location.pathname, location.search, navigate, markSeen]);

  return <Outlet />;
}
