// What the student was last doing on this device (a note, a file, a review left part-way), for
// Home's "Continue studying". Device-only for now; following you across devices comes in v1.6.

export type Recent = { kind: "note" | "file" | "review"; href: string; label: string; sub?: string; at: number };

const KEY = "stoga-recent";
/** Older than this, it is not worth offering. */
export const RECENT_DAYS = 7;

export function getRecent(): Recent | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "null") as Recent | null;
    return r && Date.now() - r.at < RECENT_DAYS * 86400_000 ? r : null;
  } catch {
    return null;
  }
}

export function setRecent(r: Omit<Recent, "at">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...r, at: Date.now() }));
  } catch {
    /* storage blocked: Home just will not offer it */
  }
}

/** Forget it once it is finished (a review with nothing left), if it is still the latest. */
export function clearRecent(href: string) {
  try {
    if (getRecent()?.href === href) localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
