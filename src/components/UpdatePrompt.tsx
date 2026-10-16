import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";
import { compareVersions } from "@/lib/changelog";

/** Screens where a reload would interrupt something (a review, a quiz, writing, an upload). */
const BUSY = /^\/(review\/session|quiz\/|notes\/|upload|practice)/;
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
    let alive = true;
    // Name what's new: the new version's changelog is already live on the server.
    void fetch("/changelog.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data: { releases?: { version: string; title: string }[] } | null) => {
        if (!alive) return;
        const latest = data?.releases?.slice().sort((a, b) => compareVersions(b.version, a.version))[0];
        toast(latest ? `Update ready: ${latest.title}` : "A new version of Stoga.study is ready.", {
          id: "sw-update",
          duration: Infinity,
          closeButton: true,
          description: latest ? `Version ${latest.version}. Update now, or it goes in next time you switch away.` : undefined,
          action: { label: "Update", onClick: () => updateServiceWorker() },
          cancel: { label: "What's new", onClick: () => { setNeedRefresh(false); window.location.assign("/changelog"); } },
          onDismiss: () => setNeedRefresh(false),
        });
      });
    return () => { alive = false; };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  // "Later" only hides the notice; the update still goes in at the next quiet moment.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden" || BUSY.test(location.pathname)) return;
      navigator.serviceWorker?.getRegistration().then((reg) => {
        const next = reg?.waiting;
        if (!next) return;
        // Let the new version take over, then load it once it is in charge.
        navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
        next.postMessage({ type: "SKIP_WAITING" });
      });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  return null;
}
