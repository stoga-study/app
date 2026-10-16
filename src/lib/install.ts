// Installing the app: Chrome, Edge and Android offer a real install prompt (captured here when the
// browser fires it); iPhone and iPad need Share, then Add to Home Screen.
import { useSyncExternalStore } from "react";
import { isIOS, isStandalone } from "./push";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: PromptEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // offered at a better moment, in the app's own words
    deferred = e as PromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export type InstallWay = "installed" | "prompt" | "ios" | "none";
const snapshot = (): InstallWay => (installed || isStandalone() ? "installed" : deferred ? "prompt" : isIOS() ? "ios" : "none");

/** How this device can install the app right now. */
export const useInstall = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, snapshot, () => "none" as InstallWay);

/** Show the browser's install prompt. Returns true if the student installed it. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}

const SNOOZE = "stoga-install-snooze";
/** Closing the offer hides it for 30 days. */
export const snoozed = () => {
  try {
    return Date.now() < Number(localStorage.getItem(SNOOZE) ?? 0);
  } catch {
    return false;
  }
};
export const snooze = () => {
  try {
    localStorage.setItem(SNOOZE, String(Date.now() + 30 * 86400_000));
  } catch {
    /* blocked storage: it just closes for this visit */
  }
};
