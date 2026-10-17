import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { compareVersions, type Release } from "@/lib/changelog";
import { ReleaseIcon } from "@/components/ReleaseIcon";
import { Button } from "@/components/ui/button";

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
  // Built like the brand's lesson card (Brand Guidelines p. 11): a solid burgundy header with the seal's
  // circles and a tilted tile, on a tactile white card. Burgundy only.
  return (
    <div className="update-backdrop fixed inset-0 z-[60] flex items-end justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center" onClick={onLater}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        aria-describedby="update-intro"
        ref={dialog}
        tabIndex={-1}
        className="update-card card w-full max-w-[26rem] overflow-hidden !rounded-[1.75rem] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ink-panel burgundy !rounded-none px-6 pt-5 pb-7">
          <span className="circle circle-big right-[-4.5rem] top-[-5rem] size-48" aria-hidden="true" />
          <span className="circle circle-hot right-14 top-[6.5rem] size-3" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="font-display text-[1.0625rem] font-bold tracking-[-0.02em]">Stoga.study</span>
              {release && <span className="chip chip-dark !min-h-6 !px-2.5 !text-[0.75rem] tabular-nums">Version {release.version}</span>}
            </span>
            <button type="button" onClick={onLater} aria-label="Close" className="-mr-2 grid size-11 place-items-center rounded-full text-white/85 hover:bg-white/10 hover:text-white">
              <X className="size-5" />
            </button>
          </div>
          <span className="update-tile tile mt-5"><ReleaseIcon name={highlights[0]?.icon ?? "check"} /></span>
          <h2 id="update-title" className="mt-5 text-[1.625rem] leading-[1.1] tracking-[-0.02em] text-white">{release?.title ?? "A new version is ready"}</h2>
          <p id="update-intro" className="ink-muted mt-2">{release?.intro ?? "Fixes and improvements, ready when you are."}</p>
        </header>
        <div className="px-6 pt-5 pb-6">
          {highlights.length > 0 && (
            <ul className="mb-6 flex flex-col gap-4">
              {highlights.map((h) => (
                <li key={h.title} className="flex items-start gap-3">
                  <span className="tile soft !size-9 !rounded-[0.75rem] [&>svg]:!size-[1.125rem]"><ReleaseIcon name={h.icon} /></span>
                  <span className="min-w-0">
                    <span className="block font-bold text-ink">{h.title}</span>
                    <span className="block text-[0.875rem] leading-snug text-muted">{h.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-3">
            <Button block disabled={updating} onClick={() => { setUpdating(true); onUpdate(); }}>{updating ? "Updating…" : "Update now"}</Button>
            <Button block variant="secondary" onClick={onLater}>Not now</Button>
          </div>
          <p className="mt-3 text-center text-[0.8125rem] text-muted">Not now puts it in next time you close the app.</p>
        </div>
      </section>
    </div>
  );
}
