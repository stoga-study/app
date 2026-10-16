// What the student was last doing (a note, a file, a review left part-way), for Home's "Continue
// studying". Saved on the device at once and to their profile too, so it follows them to their other
// devices; Home offers whichever is newer.
import { supabase } from "./supabase";

export type Recent = { kind: "note" | "file" | "review"; href: string; label: string; sub?: string; at: number };

const KEY = "stoga-recent";
/** Older than this, it is not worth offering. */
export const RECENT_DAYS = 7;

const fresh = (r: Recent | null | undefined) => (r && typeof r.at === "number" && Date.now() - r.at < RECENT_DAYS * 86400_000 ? r : null);

export function getRecent(): Recent | null {
  try {
    return fresh(JSON.parse(localStorage.getItem(KEY) ?? "null") as Recent | null);
  } catch {
    return null;
  }
}

/** The newer of this device's and the profile's (another device's), if either is still recent. */
export function newestRecent(local: Recent | null, fromProfile: unknown): Recent | null {
  const p = fromProfile && typeof fromProfile === "object" ? (fromProfile as Recent) : null;
  const remote = p && typeof p.href === "string" && p.href.startsWith("/") ? fresh(p) : null;
  if (!local) return remote;
  if (!remote) return local;
  return remote.at > local.at ? remote : local;
}

let lastSent = "";
async function saveToProfile(r: Recent | null) {
  const key = r ? r.href : "";
  // One write per change of place, not per keystroke.
  if (key === lastSent && r) return;
  lastSent = key;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid || !navigator.onLine) return;
  await supabase.from("profiles").update({ recent: r }).eq("user_id", uid);
}

export function setRecent(r: Omit<Recent, "at">) {
  const full = { ...r, at: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    /* storage blocked: the profile copy still works */
  }
  void saveToProfile(full).catch(() => {});
}

/** Forget it once it is finished (a review with nothing left), if it is still the latest. */
export function clearRecent(href: string) {
  try {
    if (getRecent()?.href === href) {
      localStorage.removeItem(KEY);
      void saveToProfile(null).catch(() => {});
    }
  } catch {
    /* nothing to clear */
  }
}
