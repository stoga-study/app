// The Stoga.study coach: a warm study-planning chat that can change the student's calendar.
//
// POST { message, history?: {role, content}[], today: "YYYY-MM-DD", plan_today?: string[] }
//   → { reply, actions: { type, summary, ok, undo? }[], crisis? }
// Every change runs as the student (row-level security) after checking each ref against their own
// classes, units and calendar, and comes back with the exact Undo for the app to show. It can only
// touch calendar items and a class's current unit: never notes, files, cards or quizzes.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { llmJson, LLMError, setUsageLogger } from "../_lib/llm.ts";
import { ownProvider } from "../_lib/byok.ts";
import { cleanText } from "../_lib/study.ts";
import { wellbeing } from "../_lib/tutor.ts";
import { addDays, cleanTitle, COACH_SCHEMA, coachSystem, contextText, crisisReply, isIsoDate, isTime, validKind, type CoachAction, type CoachOut, type Ctx } from "../_lib/coach.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));
const MAX_MESSAGE = 1000;
const MAX_ACTIONS = 5;

type EventRow = { id: string; kind: string; title: string; subject_id: string | null; due_on: string; due_time: string | null; notes: string | null; done_at: string | null; created_at: string; updated_at: string; event_units: { unit_id: string }[] };
/** What the app runs to take a change back. Every one is a plain write the student could make themselves. */
type Undo =
  | { op: "delete"; id: string }
  | { op: "restore"; row: Omit<EventRow, "event_units">; unit_ids: string[] }
  | { op: "set_unit"; subject_id: string; unit_id: string | null; pinned: boolean };
type Result = { type: string; summary: string; ok: boolean; undo?: Undo };

const unitLabel = (u: { number: string | null; title: string | null; word: string | null }) =>
  u.number ? `${u.word ?? "Unit"} ${u.number}${u.title ? `: ${u.title}` : ""}` : u.title ?? "Unit";
const shortDate = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

async function loadContext(db: SupabaseClient, today: string, planToday: string[]) {
  const [profile, subjects, units, events, cards, mistakes] = await Promise.all([
    db.from("profiles").select("first_name").maybeSingle(),
    db.from("subjects").select("id, name, current_unit_id, current_unit_pinned").eq("archived", false).order("created_at"),
    db.from("units").select("id, subject_id, number, title, word"),
    db.from("events").select("*, event_units(unit_id)").gte("due_on", addDays(today, -7)).order("due_on").limit(80),
    db.from("cards").select("subject_id").eq("hidden", false).eq("archived", false).lte("due", new Date().toISOString()).limit(5000),
    db.from("mistakes").select("question_id, quiz_questions(topic)").is("resolved_at", null).limit(200),
  ]);
  for (const r of [subjects, units, events, cards]) if (r.error) throw r.error;
  const classRef = new Map<string, string>(), unitRef = new Map<string, string>(), eventRef = new Map<string, string>();
  const byRef = { class: new Map<string, string>(), unit: new Map<string, { id: string; subject_id: string }>(), event: new Map<string, EventRow>() };
  (subjects.data ?? []).forEach((s, i) => { classRef.set(s.id, `C${i + 1}`); byRef.class.set(`C${i + 1}`, s.id); });
  (units.data ?? []).filter((u) => classRef.has(u.subject_id)).forEach((u, i) => { unitRef.set(u.id, `U${i + 1}`); byRef.unit.set(`U${i + 1}`, { id: u.id, subject_id: u.subject_id }); });
  (events.data as EventRow[] ?? []).forEach((e, i) => { eventRef.set(e.id, `E${i + 1}`); byRef.event.set(`E${i + 1}`, e); });
  const due = new Map<string, number>();
  for (const c of cards.data ?? []) due.set(c.subject_id, (due.get(c.subject_id) ?? 0) + 1);
  const topics = new Map<string, number>();
  for (const m of mistakes.data ?? []) {
    const t = (m.quiz_questions as unknown as { topic: string | null } | null)?.topic?.trim();
    if (t) topics.set(t, (topics.get(t) ?? 0) + 1);
  }
  const ctx: Ctx = {
    today,
    firstName: profile.data?.first_name ?? null,
    classes: (subjects.data ?? []).map((s) => ({
      ref: classRef.get(s.id)!,
      name: s.name,
      currentUnit: s.current_unit_id ? unitRef.get(s.current_unit_id) ?? null : null,
      units: (units.data ?? []).filter((u) => u.subject_id === s.id).map((u) => ({ ref: unitRef.get(u.id)!, name: unitLabel(u) })),
      dueCards: due.get(s.id) ?? 0,
    })),
    events: (events.data as EventRow[] ?? []).map((e) => ({
      ref: eventRef.get(e.id)!, kind: e.kind, title: e.title, classRef: e.subject_id ? classRef.get(e.subject_id) ?? null : null,
      date: e.due_on, time: e.due_time?.slice(0, 5) ?? null, done: !!e.done_at, unitRefs: e.event_units.map((u) => unitRef.get(u.unit_id)).filter((x): x is string => !!x),
    })),
    mistakes: mistakes.data?.length ?? 0,
    weakTopics: [...topics].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
    planToday,
  };
  const subjectName = new Map((subjects.data ?? []).map((s) => [s.id, s.name]));
  const currentUnit = new Map((subjects.data ?? []).map((s) => [s.id, { unit_id: s.current_unit_id as string | null, pinned: !!s.current_unit_pinned }]));
  const unitName = new Map((units.data ?? []).map((u) => [u.id, unitLabel(u)]));
  return { ctx, byRef, subjectName, currentUnit, unitName };
}
type Loaded = Awaited<ReturnType<typeof loadContext>>;

const strip = ({ event_units: _u, ...row }: EventRow) => row;

/** Carry out one change, after checking every ref and value; never throws. */
async function apply(db: SupabaseClient, a: CoachAction, l: Loaded): Promise<Result> {
  const fail = (summary: string): Result => ({ type: a.type, summary, ok: false });
  try {
    const unitIdsFor = (subjectId: string | null) =>
      (a.units ?? []).map((r) => l.byRef.unit.get(r)).filter((u): u is { id: string; subject_id: string } => !!u && u.subject_id === subjectId).map((u) => u.id);
    const setUnits = async (eventId: string, ids: string[]) => {
      await db.from("event_units").delete().eq("event_id", eventId);
      if (ids.length) {
        const { error } = await db.from("event_units").insert(ids.map((unit_id) => ({ event_id: eventId, unit_id })));
        if (error) throw error;
      }
    };
    const describe = (title: string, subjectId: string | null, date: string) => `${title}${subjectId ? ` · ${l.subjectName.get(subjectId)}` : ""} · ${shortDate(date)}`;

    if (a.type === "add_event") {
      const title = cleanTitle(a.title);
      const kind = validKind(a.kind) ?? "other";
      if (!title || !isIsoDate(a.date)) return fail("Couldn't add that: it needs a name and a date.");
      const subjectId = a.class ? l.byRef.class.get(a.class) ?? null : null;
      const { data, error } = await db.from("events").insert({ kind, title, subject_id: subjectId, due_on: a.date, due_time: isTime(a.time) ? a.time : null }).select("id").single();
      if (error) throw error;
      await setUnits(data.id, kind === "test" || kind === "quiz" ? unitIdsFor(subjectId) : []);
      return { type: a.type, summary: `Added ${describe(title, subjectId, a.date)}`, ok: true, undo: { op: "delete", id: data.id } };
    }

    if (a.type === "set_current_unit") {
      const u = a.unit ? l.byRef.unit.get(a.unit) : undefined;
      if (!u) return fail("Couldn't find that unit.");
      const before = l.currentUnit.get(u.subject_id) ?? { unit_id: null, pinned: false };
      const { error } = await db.from("subjects").update({ current_unit_id: u.id, current_unit_pinned: true }).eq("id", u.subject_id);
      if (error) throw error;
      return { type: a.type, summary: `${l.subjectName.get(u.subject_id)} is now on ${l.unitName.get(u.id)}`, ok: true, undo: { op: "set_unit", subject_id: u.subject_id, unit_id: before.unit_id, pinned: before.pinned } };
    }

    const e = a.event ? l.byRef.event.get(a.event) : undefined;
    if (!e) return fail("Couldn't find that on your calendar.");
    const restore: Undo = { op: "restore", row: strip(e), unit_ids: e.event_units.map((u) => u.unit_id) };

    if (a.type === "delete_event") {
      const { error } = await db.from("events").delete().eq("id", e.id);
      if (error) throw error;
      return { type: a.type, summary: `Removed ${describe(e.title, e.subject_id, e.due_on)}`, ok: true, undo: restore };
    }
    if (a.type === "complete_event" || a.type === "uncomplete_event") {
      const done = a.type === "complete_event";
      const { error } = await db.from("events").update({ done_at: done ? new Date().toISOString() : null }).eq("id", e.id);
      if (error) throw error;
      return { type: a.type, summary: `${done ? "Ticked off" : "Marked not done"}: ${e.title}`, ok: true, undo: restore };
    }
    // update_event: only the fields given.
    const patch: Record<string, unknown> = {};
    const title = cleanTitle(a.title);
    if (title) patch.title = title;
    if (validKind(a.kind)) patch.kind = validKind(a.kind);
    if (a.date) {
      if (!isIsoDate(a.date)) return fail("Couldn't change that: the date didn't make sense.");
      patch.due_on = a.date;
    }
    if (isTime(a.time)) patch.due_time = a.time;
    if (a.class && l.byRef.class.has(a.class)) patch.subject_id = l.byRef.class.get(a.class);
    const subjectId = (patch.subject_id as string | undefined) ?? e.subject_id;
    const units = unitIdsFor(subjectId);
    if (!Object.keys(patch).length && !units.length) return fail("Nothing to change there.");
    if (Object.keys(patch).length) {
      const { error } = await db.from("events").update(patch).eq("id", e.id);
      if (error) throw error;
    }
    if (units.length || patch.subject_id) await setUnits(e.id, units);
    return { type: a.type, summary: `Changed ${describe((patch.title as string) ?? e.title, subjectId, (patch.due_on as string) ?? e.due_on)}`, ok: true, undo: restore };
  } catch (err) {
    console.error("coach action", a.type, err instanceof Error ? err.message : err);
    return fail("Couldn't make that change. Nothing changed there.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));
  const message = cleanText(body.message, MAX_MESSAGE);
  if (!message) return json(req, { error: "message_required" }, 400);
  // The student's own calendar date (their time zone); the server's only as a fallback.
  const today = isIsoDate(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const planToday = (Array.isArray(body.plan_today) ? body.plan_today : []).filter((x: unknown) => typeof x === "string").slice(0, 8).map((x: string) => x.slice(0, 120));
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t: { role?: unknown; content?: unknown }) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-10)
    .map((t: { role: "user" | "assistant"; content: string }) => ({ role: t.role, content: t.content.slice(0, 1500) }));

  // Crisis language always gets the 988 line, from the server, with no model in the way and no allowance used.
  const feeling = wellbeing(message);
  if (feeling === "crisis") {
    const { data: p } = await student.db.from("profiles").select("first_name").maybeSingle();
    return json(req, { reply: crisisReply(p?.first_name ?? null), actions: [], crisis: true });
  }

  // Allowance: shared with the tutor, one message per reply. Students with their own key are not limited.
  const own = await ownProvider(admin, student.userId);
  const { data: allowed, error: allowErr } = await admin.rpc("consume_allowance", { p_user: student.userId, p_kind: "tutor_message", p_byok: !!own });
  if (allowErr) return json(req, { error: "unavailable" }, 503);
  if (!allowed) {
    const { data: status } = await student.db.rpc("allowance_status");
    const row = (status ?? []).find((r: { kind: string }) => r.kind === "tutor_message");
    return json(req, { error: "limit", used: row?.used, limit: row?.limit, resets_at: row?.resets_at }, 429);
  }
  const refund = () => admin.rpc("refund_allowance", { p_user: student.userId, p_kind: "tutor_message" });

  let loaded: Loaded;
  let out: CoachOut;
  try {
    loaded = await loadContext(student.db, today, planToday);
    out = await llmJson<CoachOut>({
      schemaName: "coach",
      schema: COACH_SCHEMA,
      own,
      effort: "normal",
      maxTokens: 1500,
      timeoutMs: 45_000,
      usage: { feature: "coach", userId: student.userId, byok: !!own },
      messages: [
        { role: "system", content: coachSystem(feeling) },
        { role: "system", content: contextText(loaded.ctx) },
        ...history,
        { role: "user", content: message },
      ],
    });
  } catch (e) {
    await refund();
    console.error("coach", e instanceof Error ? e.message.slice(0, 300) : e);
    const status = e instanceof LLMError && e.kind === "rate_limit" ? 429 : 502;
    return json(req, { error: status === 429 ? "busy" : "coach_failed" }, status);
  }

  const results: Result[] = [];
  for (const a of (out.actions ?? []).slice(0, MAX_ACTIONS)) results.push(await apply(student.db, a, loaded));
  let reply = String(out.reply ?? "").trim().slice(0, 1200) || "Done.";
  // Never let the reply claim a change that did not happen.
  if (results.some((r) => !r.ok)) reply += results.every((r) => !r.ok) ? "\n\nActually, I couldn't make that change, so nothing changed. Could you say it another way?" : "\n\nOne of those didn't work, so check the list below.";
  return json(req, { reply, actions: results });
});
