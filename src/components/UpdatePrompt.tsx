import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { compareVersions, type Release } from "@/lib/changelog";
import { ReleaseIcon } from "@/components/ReleaseIcon";

/** Screens where a reload would interrupt something (a review, a quiz, writing, an upload). */
const BUSY = /^\/(review\/session|quiz\/|notes\/|upload|practice)/;
const CHECK_EVERY = 30 * 60 * 1000;

// A light card when a new version is ready, naming what's in it. It waits until the student isn't in the
// middle of something. If they choose Not now, the update is put in quietly the next time they switch
// away from the app (again, never mid-session), so fixes reach everyone the same day.
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
  const [release, setRelease] = useState<Release | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!needRefresh) return;
    let alive = true;
    // Name what's new: the new version's changelog is already live on the server.
    void fetch("/changelog.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data: { releases?: Release[] } | null) => {
        if (alive) setRelease(data?.releases?.slice().sort((a, b) => compareVersions(b.version, a.version))[0] ?? null);
      });
    // Open once the student isn't busy (the router lives inside the app, so look at the address).
    const check = () => { if (!BUSY.test(location.pathname)) { setShow(true); clearInterval(t); } };
    const t = setInterval(check, 1500);
    const first = setTimeout(check, 0);
    return () => { alive = false; clearInterval(t); clearTimeout(first); };
  }, [needRefresh]);

  // "Not now" only hides the card; the update still goes in at the next quiet moment.
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

  if (!needRefresh || !show) return null;
  return <UpdateCard release={release} onUpdate={() => updateServiceWorker()} onLater={() => { setShow(false); setNeedRefresh(false); }} />;
}

function UpdateCard({ release, onUpdate, onLater }: { release: Release | null; onUpdate: () => void; onLater: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Focus the card itself (screen readers read it), without lighting up a button before anyone touches it.
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onLater(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [onLater]);

  const highlights = release?.highlights.slice(0, 3) ?? [];
  return (
    <div className="update-backdrop fixed inset-0 z-[60] flex items-end justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center" onClick={onLater}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        aria-describedby="update-intro"
        ref={dialog}
        tabIndex={-1}
        className="update-card relative w-full max-w-[25rem] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onLater} aria-label="Close" className="update-close absolute -top-3 right-3 grid size-11 place-items-center rounded-full">
          <X className="size-5" />
        </button>
        <div className="overflow-hidden rounded-[1.75rem] bg-card">
          <div className="update-art grid place-items-center pt-9 pb-6">
            <span className="update-badge grid size-[4.5rem] place-items-center rounded-full">
              <ReleaseIcon name={highlights[0]?.icon ?? "check"} className="size-8" />
            </span>
          </div>
          <div className="flex flex-col items-center px-6 pb-6 text-center">
            <p className="text-[0.8125rem] font-bold tracking-wide text-brand uppercase">{release ? `New in ${release.version}` : "Update ready"}</p>
            <h2 id="update-title" className="mt-1 text-[1.5rem] leading-tight">{release?.title ?? "There's a new update"}</h2>
            <p id="update-intro" className="mt-2 text-ink-2">{release?.intro ?? "A newer version of Stoga.study is ready, with fixes and improvements."}</p>
            {highlights.length > 0 && (
              <ul className="mt-5 flex w-full flex-col gap-2 text-left">
                {highlights.map((h) => (
                  <li key={h.title} className="flex items-center gap-3 rounded-[1rem] bg-soft px-3 py-2.5">
                    <span className="grid size-8 flex-none place-items-center rounded-full bg-card text-brand"><ReleaseIcon name={h.icon} className="size-4" /></span>
                    <span className="font-bold text-ink">{h.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={updating}
              onClick={() => { setUpdating(true); onUpdate(); }}
              className="update-primary mt-6 min-h-12 w-full rounded-full px-6 font-bold"
            >
              {updating ? "Updating…" : "Update now"}
            </button>
            <button type="button" onClick={onLater} className="mt-2 min-h-11 w-full rounded-full font-bold text-ink-2 hover:text-ink">Not now</button>
            <p className="mt-1 text-[0.8125rem] text-muted">Not now? It goes in next time you leave the app.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
