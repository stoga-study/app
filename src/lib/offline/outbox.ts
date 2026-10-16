import { openDB, type IDBPDatabase } from "idb";
import type { CardRow } from "../fsrs";
import { supabase } from "../supabase";

// Card reviews and quiz answers are saved on the device first, then sent. Offline, they wait here and
// go out, in order, when the connection returns. Each has a client_id and every write is repeatable,
// so something sent twice is still recorded once.

export type ReviewJob = { client_id: string; card_id: string; schedule: CardRow; rating: number; state: number; reviewed_at: string };

/** Quiz work: starting an attempt (its id is made on the device), and each answer with the attempt's state so far. */
export type QuizJob =
  | { client_id: string; at: string; type: "start"; attempt_id: string; quiz_id: string; total: number }
  | { client_id: string; at: string; type: "answer"; attempt_id: string | null; question_id: string; chosen: number; correct: boolean; answers: unknown[]; correct_so_far: number; finished: boolean };

let dbp: Promise<IDBPDatabase> | null = null;
const db = () => (dbp ??= openDB("stoga-outbox", 2, {
  upgrade: (d, old) => {
    if (old < 1) d.createObjectStore("reviews", { keyPath: "client_id" });
    if (old < 2) d.createObjectStore("quiz", { keyPath: "client_id" });
  },
}));
const waiting = async () => {
  const store = await db();
  return (await store.count("reviews")) + (await store.count("quiz"));
};

const listeners = new Set<(n: number) => void>();
export const onPendingChange = (fn: (n: number) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
async function announce() {
  const n = await waiting();
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
  return waiting();
}

/** Send one quiz job. Returns false to stop (offline, or the server said no for now). */
async function sendQuiz(j: QuizJob) {
  if (j.type === "start") {
    const { error } = await supabase.from("quiz_attempts").upsert({ id: j.attempt_id, quiz_id: j.quiz_id, total: j.total, answers: [], created_at: j.at }, { onConflict: "id", ignoreDuplicates: true });
    return !error;
  }
  if (j.attempt_id) {
    const { error } = await supabase.from("quiz_attempts").update({ answers: j.answers as never, correct: j.correct_so_far, ...(j.finished ? { finished_at: j.at } : {}) }).eq("id", j.attempt_id);
    if (error) return false;
  }
  // Getting it right clears it from mistake review; getting it wrong puts it there.
  const { error } = j.correct
    ? await supabase.from("mistakes").update({ resolved_at: j.at }).eq("question_id", j.question_id).is("resolved_at", null)
    : await supabase.from("mistakes").upsert({ question_id: j.question_id, attempt_id: j.attempt_id, chosen_index: j.chosen, resolved_at: null, created_at: j.at }, { onConflict: "user_id,question_id" });
  return !error;
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
      const quiz = ((await store.getAll("quiz")) as QuizJob[]).sort((a, b) => a.at.localeCompare(b.at));
      for (const j of quiz) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        if (!(await sendQuiz(j))) break;
        await store.delete("quiz", j.client_id);
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

export async function enqueueQuiz(job: QuizJob) {
  await (await db()).put("quiz", job);
  await announce();
  void flush();
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
