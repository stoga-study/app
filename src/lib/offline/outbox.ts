import { openDB, type IDBPDatabase } from "idb";
import type { CardRow } from "../fsrs";
import { supabase } from "../supabase";

// Card reviews are saved on the device first, then sent. Offline, they wait here and go out when the
// connection returns. Each has a client_id, so a review that is sent twice is still recorded once.

export type ReviewJob = { client_id: string; card_id: string; schedule: CardRow; rating: number; state: number; reviewed_at: string };

let dbp: Promise<IDBPDatabase> | null = null;
const db = () => (dbp ??= openDB("stoga-outbox", 1, { upgrade: (d) => d.createObjectStore("reviews", { keyPath: "client_id" }) }));

const listeners = new Set<(n: number) => void>();
export const onPendingChange = (fn: (n: number) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
async function announce() {
  const n = await (await db()).count("reviews");
  listeners.forEach((fn) => fn(n));
}

/** Each card with a review still waiting to send, and the schedule that review gave it. */
export async function pendingSchedules(): Promise<Map<string, CardRow>> {
  try {
    const jobs = ((await (await db()).getAll("reviews")) as ReviewJob[]).sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
    return new Map(jobs.map((j) => [j.card_id, j.schedule]));
  } catch {
    return new Map();
  }
}

export async function pendingCount() {
  return (await db()).count("reviews");
}

let flushing: Promise<void> | null = null;
let again = false; // a review was added while a flush was running

/** Send everything waiting, in order. Stops quietly at the first network failure. */
export function flush(): Promise<void> {
  if (flushing) {
    again = true;
    return flushing;
  }
  again = false;
  return (flushing = (async () => {
    try {
      const store = await db();
      const jobs = ((await store.getAll("reviews")) as ReviewJob[]).sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
      for (const j of jobs) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        const { error: upErr } = await supabase.from("cards").update(j.schedule).eq("id", j.card_id);
        if (upErr && upErr.code !== "PGRST116") break;
        const { error: logErr } = await supabase
          .from("card_reviews")
          .upsert({ client_id: j.client_id, card_id: j.card_id, rating: j.rating, state: j.state, reviewed_at: j.reviewed_at }, { onConflict: "client_id", ignoreDuplicates: true });
        if (logErr) break;
        await store.delete("reviews", j.client_id);
      }
    } catch {
      /* try again on the next flush */
    } finally {
      flushing = null;
      await announce();
      // Anything added mid-flush goes out now instead of waiting for the next trigger.
      if (again && (typeof navigator === "undefined" || navigator.onLine)) void flush();
    }
  })());
}

export async function enqueueReview(job: ReviewJob) {
  await (await db()).put("reviews", job);
  await announce();
  void flush();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  // Anything left from a previous visit goes out at start-up.
  setTimeout(() => void flush(), 1500);
}
