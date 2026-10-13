import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

/** Screens where a reload would interrupt something (a review, a quiz, writing, an upload). */
const BUSY = /^\/(review\/session|quiz\/|notes\/|upload)/;
const CHECK_EVERY = 30 * 60 * 1000;

// A calm notice when a new version is ready. If the student does not tap it, the update is put in
// quietly the next time they switch away from the app, unless they are in the middle of something,
// so fixes reach everyone the same day without ever interrupting a session.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Long-open tabs (and installed apps) check for a new version every half hour too.
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update().catch(() => {}), CHECK_EVERY);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast("A new version of Stoga.study is ready.", {
      id: "sw-update",
      duration: Infinity,
      action: { label: "Update", onClick: () => updateServiceWorker() },
      cancel: { label: "Later", onClick: () => setNeedRefresh(false) },
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  // "Later" only hides the notice; the update still goes in at the next quiet moment.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden" || BUSY.test(location.pathname)) return;
      navigator.serviceWorker?.getRegistration().then((reg) => {
        if (reg?.waiting) void updateServiceWorker(true);
      });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [updateServiceWorker]);

  return null;
}
