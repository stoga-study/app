import type { Database } from "../database.types";
import { supabase } from "../supabase";
import { today } from "../calendar";

export type Undo =
  | { op: "delete"; id: string }
  | { op: "restore"; row: Database["public"]["Tables"]["events"]["Row"]; unit_ids: string[] }
  | { op: "set_unit"; subject_id: string; unit_id: string | null; pinned: boolean };
export type CoachAction = { type: string; summary: string; ok: boolean; undo?: Undo; undone?: boolean };
export type CoachMessage = { role: "user" | "assistant"; content: string; actions?: CoachAction[]; crisis?: boolean };

/** Why the coach could not answer. */
export class CoachError extends Error {
  constructor(public code: "limit" | "busy" | "offline" | "unavailable", public resetsAt?: string) {
    super(code);
    this.name = "CoachError";
  }
}

export async function askCoach(message: string, history: CoachMessage[], planToday: string[]) {
  if (!navigator.onLine) throw new CoachError("offline");
  const { data, error } = await supabase.functions.invoke<{ reply: string; actions: CoachAction[]; crisis?: boolean }>("coach", {
    body: { message, today: today(), plan_today: planToday, history: history.slice(-10).map(({ role, content }) => ({ role, content })) },
  });
  if (error || !data) {
    const j = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new CoachError(j?.error === "limit" ? "limit" : j?.error === "busy" ? "busy" : "unavailable", j?.resets_at);
  }
  return data;
}

/** Take back one change the coach made. Plain writes as the student, so row-level security applies. */
export async function undoCoach(u: Undo) {
  const check = (r: { error: unknown }) => { if (r.error) throw r.error; };
  if (u.op === "delete") return check(await supabase.from("events").delete().eq("id", u.id));
  if (u.op === "set_unit") return check(await supabase.from("subjects").update({ current_unit_id: u.unit_id, current_unit_pinned: u.pinned }).eq("id", u.subject_id));
  const { id, ...rest } = u.row;
  const { data } = await supabase.from("events").select("id").eq("id", id).maybeSingle();
  // A removed event comes back with its own id, so anything that pointed at it still does.
  check(data ? await supabase.from("events").update(rest).eq("id", id) : await supabase.from("events").insert(u.row));
  check(await supabase.from("event_units").delete().eq("event_id", id));
  if (u.unit_ids.length) check(await supabase.from("event_units").insert(u.unit_ids.map((unit_id) => ({ event_id: id, unit_id }))));
}

// The conversation stays on this device (the last 40 messages).
const key = (userId: string) => `stoga-coach-${userId}`;
export function loadCoach(userId: string): CoachMessage[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveCoach(userId: string, msgs: CoachMessage[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(msgs.slice(-40)));
  } catch {
    /* storage full or blocked: the chat still works for this visit */
  }
}
