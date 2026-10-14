import type { Database } from "../database.types";
import { supabase } from "../supabase";
import { today } from "../calendar";
import { appLocale, languageName } from "../locale";

export type Undo =
  | { op: "delete"; id: string }
  | { op: "restore"; row: Database["public"]["Tables"]["events"]["Row"]; unit_ids: string[] }
  | { op: "set_unit"; subject_id: string; unit_id: string | null; pinned: boolean }
  | { op: "delete_cards"; ids: string[] }
  | { op: "delete_note"; id: string };
export type CoachAction = { type: string; summary: string; ok: boolean; undo?: Undo; undone?: boolean };
export type CoachStep = { id: string; label: string; status: "running" | "done" | "failed" };
export type CoachLink = { label: string; href: string };
export type CoachMessage = {
  role: "user" | "assistant";
  content: string;
  steps?: CoachStep[];
  actions?: CoachAction[];
  links?: CoachLink[];
  crisis?: boolean;
  /** Still arriving. */
  live?: boolean;
};

export type CoachEvent =
  | { type: "step"; id: string; label?: string; status: CoachStep["status"] }
  | { type: "action"; summary: string; ok: boolean; undo?: Undo; action: string }
  | { type: "link"; label: string; href: string }
  | { type: "delta"; text: string }
  | { type: "done"; reply: string; crisis?: boolean }
  | { type: "error"; error: string; resets_at?: string };

/** A past message as the coach sees it, saying which of its changes were undone since. */
export function historyTurn(m: CoachMessage) {
  const undone = (m.actions ?? []).filter((a) => a.undone).map((a) => a.summary);
  return { role: m.role, content: undone.length ? `${m.content}\n\n(The student undid this since: ${undone.join("; ")}.)` : m.content };
}

/** Ask the coach; events arrive as it looks things up, acts, and writes its answer. */
export async function streamCoach(message: string, history: CoachMessage[], planToday: string[], onEvent: (e: CoachEvent) => void, signal?: AbortSignal) {
  if (!navigator.onLine) return onEvent({ type: "error", error: "offline" });
  const { data } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach`, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message, today: today(), language: languageName(appLocale()), plan_today: planToday, history: history.filter((m) => m.content).slice(-10).map(historyTurn) }),
      signal,
    });
  } catch {
    return onEvent({ type: "error", error: signal?.aborted ? "stopped" : navigator.onLine ? "unavailable" : "offline" });
  }
  if (!res.headers.get("content-type")?.includes("event-stream")) {
    const j = await res.json().catch(() => ({}));
    return onEvent({ type: "error", error: j.error ?? "unavailable", resets_at: j.resets_at });
  }
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true as const }));
    if (done) break;
    buf += value;
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const ev = /^event: (\w+)$/m.exec(block)?.[1];
      const raw = /^data: (.*)$/m.exec(block)?.[1];
      if (!ev || !raw) continue;
      const d = JSON.parse(raw);
      // An action's own "type" (add_event, make_cards…) is kept as `action`.
      onEvent(ev === "action" ? { ...d, type: "action", action: d.type } : ({ ...d, type: ev } as CoachEvent));
    }
  }
}

/** Take back one change the coach made. Plain writes as the student, so row-level security applies. */
export async function undoCoach(u: Undo) {
  const check = (r: { error: unknown }) => { if (r.error) throw r.error; };
  if (u.op === "delete") return check(await supabase.from("events").delete().eq("id", u.id));
  if (u.op === "delete_cards") return check(await supabase.from("cards").delete().in("id", u.ids));
  if (u.op === "delete_note") return check(await supabase.from("student_notes").delete().eq("id", u.id));
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
    // A reply cut off by closing the app is kept as it stands.
    return Array.isArray(v) ? v.map((m: CoachMessage) => ({ ...m, live: false, steps: m.steps?.map((s) => (s.status === "running" ? { ...s, status: "failed" as const } : s)) })) : [];
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
