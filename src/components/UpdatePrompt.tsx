import { X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { compareVersions, type Release } from "@/lib/changelog";
import { Button } from "@/components/ui/button";

/** Screens where a reload would interrupt something (a review, a quiz, writing, an upload). */
const BUSY = /^\/(review\/session|quiz\/|notes\/|upload|practice)/;
const CHECK_EVERY = 30 * 60 * 1000;

/** Desktop-sized windows get a quiet corner notice; phones get the full card. */
const WIDE = "(min-width: 768px)";
const useWide = () => useSyncExternalStore(
  (on) => { const mq = window.matchMedia(WIDE); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); },
  () => window.matchMedia(WIDE).matches,
);

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
  const wide = useWide();
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
  const later = () => { setShow(false); setNeedRefresh(false); };
  return wide
    ? <UpdateNotice release={release} onUpdate={() => updateServiceWorker()} onLater={later} />
    : <UpdateCard release={release} onUpdate={() => updateServiceWorker()} onLater={later} />;
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
  // Brand v2: a quiet bottom sheet (BRAND.md). The version in mono, the title in the serif, what's new as a hairline list.
  return (
    <div className="update-backdrop fixed inset-0 z-[60] flex items-end justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onClick={onLater}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        aria-describedby="update-intro"
        ref={dialog}
        tabIndex={-1}
        className="update-card card w-full max-w-[28rem] !rounded-[1.375rem] px-5 pt-2 pb-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{release ? `Update ready · ${release.version}` : "Update ready"}</p>
          <button type="button" onClick={onLater} aria-label="Close" className="-mr-2 grid size-9 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="update-title" className="mt-1 text-[1.625rem] leading-[1.1]">{release?.title ?? "A new version is ready"}</h2>
        <p id="update-intro" className="mt-2 text-[0.9375rem] text-ink-2">{release?.intro ?? "Fixes and improvements, ready when you are."}</p>
        {highlights.length > 0 && (
          <ul className="mt-4 flex flex-col">
            {highlights.map((h) => (
              <li key={h.title} className="border-t border-line py-2.5">
                <b className="block text-[0.9375rem] font-semibold">{h.title}</b>
                <span className="block text-[0.8125rem] leading-snug text-muted">{h.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Button block disabled={updating} onClick={() => { setUpdating(true); onUpdate(); }}>{updating ? "Updating…" : "Update now"}</Button>
          <Button block variant="ghost" className="!text-ink-2" onClick={onLater}>Not now</Button>
        </div>
        <p className="mt-1 text-center text-[0.8125rem] text-muted">Not now puts it in next time you close the app.</p>
      </section>
    </div>
  );
}

/** On desktop: a small notice in the corner. Nothing is covered or blocked, and focus stays where it was. */
function UpdateNotice({ release, onUpdate, onLater }: { release: Release | null; onUpdate: () => void; onLater: () => void }) {
  const [updating, setUpdating] = useState(false);
  return (
    <section
      role="region"
      aria-label="Update ready"
      className="update-notice card fixed right-6 bottom-6 z-[60] flex w-[22rem] flex-col gap-3 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-bold text-brand">{release ? `Version ${release.version} is ready` : "An update is ready"}</p>
          <h2 className="mt-1 text-[1.125rem] leading-snug">{release?.title ?? "A new version of Stoga.study"}</h2>
        </div>
        <button type="button" onClick={onLater} aria-label="Close" className="-mt-1 -mr-2 grid size-9 flex-none place-items-center rounded-full text-muted hover:bg-soft hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      {release?.intro && <p className="text-[0.9375rem] text-ink-2">{release.intro}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={updating} onClick={() => { setUpdating(true); onUpdate(); }}>{updating ? "Updating…" : "Update now"}</Button>
        <Button size="sm" variant="ghost" onClick={onLater}>Later</Button>
      </div>
      <p className="text-[0.8125rem] text-muted">Later puts it in next time you close the app.</p>
    </section>
  );
}
