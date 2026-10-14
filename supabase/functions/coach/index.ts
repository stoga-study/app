// The Stoga.study coach: an agent over the student's own study material, streamed as SSE.
//
// POST { message, history?: {role, content}[], today: "YYYY-MM-DD", plan_today?: string[] }  → text/event-stream
//   step { id, label, status: running|done|failed } · action { type, summary, ok, undo? } · link { label, href }
//   delta { text } · done { reply, crisis? } · error { error }
// Errors before the stream starts come back as JSON (limit, unavailable).
//
// Up to MAX_ROUNDS planning rounds pick tools (look things up, or act); then the answer streams. Every
// read and write runs as the student (row-level security), after checking each ref against their own
// classes, units, files and calendar. Writes come back with the exact Undo. It can add to their study
// material (cards, notes) and change their calendar, never delete or change files, cards or quizzes.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { llmJson, llmStream, recordUsage, setUsageLogger } from "../_lib/llm.ts";
import { ownProvider } from "../_lib/byok.ts";
import { cleanText } from "../_lib/study.ts";
import { wellbeing } from "../_lib/tutor.ts";
import {
  addDays, answerSystem, cleanCards, cleanTitle, contextText, crisisReply, isIsoDate, isTime, MAX_ROUNDS, parseCalls, READ_TOOLS, STEP_SCHEMA, stepLabel,
  stepSystem, validKind, type Call, type Ctx,
} from "../_lib/coach.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));
const MAX_MESSAGE = 1500;

type EventRow = { id: string; kind: string; title: string; subject_id: string | null; due_on: string; due_time: string | null; notes: string | null; done_at: string | null; created_at: string; updated_at: string; feed_id: string | null; external_id: string | null; event_units: { unit_id: string }[] };
type Undo =
  | { op: "delete"; id: string }
  | { op: "restore"; row: Omit<EventRow, "event_units">; unit_ids: string[] }
  | { op: "set_unit"; subject_id: string; unit_id: string | null; pinned: boolean }
  | { op: "delete_cards"; ids: string[] }
  | { op: "delete_note"; id: string };
type Done = { text: string; action?: { type: string; summary: string; ok: boolean; undo?: Undo }; link?: { label: string; href: string } };

const unitLabel = (u: { number: string | null; title: string | null; word: string | null }) =>
  u.number ? `${u.word ?? "Unit"} ${u.number}${u.title ? `: ${u.title}` : ""}` : u.title ?? "Unit";
const shortDate = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const strip = (s: string) => s.replace(/<\/?b>/g, "").replace(/\s+/g, " ").trim();

async function loadContext(db: SupabaseClient, today: string, planToday: string[]) {
  const [profile, subjects, units, events, cards, mistakes, files] = await Promise.all([
    db.from("profiles").select("first_name").maybeSingle(),
    db.from("subjects").select("id, name, current_unit_id, current_unit_pinned").eq("archived", false).order("created_at"),
    db.from("units").select("id, subject_id, number, title, word"),
    db.from("events").select("*, event_units(unit_id)").gte("due_on", addDays(today, -7)).order("due_on").limit(80),
    db.from("cards").select("subject_id").eq("hidden", false).eq("archived", false).lte("due", new Date().toISOString()).limit(5000),
    db.from("mistakes").select("question_id, quiz_questions(topic)").is("resolved_at", null).limit(200),
    db.from("sources").select("id, filename, subject_id, unit_id, status").eq("archived", false).neq("status", "uploaded").order("created_at", { ascending: false }).limit(40),
  ]);
  for (const r of [subjects, units, events, cards, files]) if (r.error) throw r.error;
  const ref = { class: new Map<string, string>(), unit: new Map<string, string>(), event: new Map<string, string>(), file: new Map<string, string>() };
  const byRef = { class: new Map<string, string>(), unit: new Map<string, { id: string; subject_id: string }>(), event: new Map<string, EventRow>(), file: new Map<string, { id: string; filename: string; subject_id: string }>() };
  (subjects.data ?? []).forEach((s, i) => { ref.class.set(s.id, `C${i + 1}`); byRef.class.set(`C${i + 1}`, s.id); });
  (units.data ?? []).filter((u) => ref.class.has(u.subject_id)).forEach((u, i) => { ref.unit.set(u.id, `U${i + 1}`); byRef.unit.set(`U${i + 1}`, { id: u.id, subject_id: u.subject_id }); });
  ((events.data ?? []) as EventRow[]).forEach((e, i) => { ref.event.set(e.id, `E${i + 1}`); byRef.event.set(`E${i + 1}`, e); });
  (files.data ?? []).filter((f) => ref.class.has(f.subject_id)).forEach((f, i) => { ref.file.set(f.id, `F${i + 1}`); byRef.file.set(`F${i + 1}`, f); });
  const due = new Map<string, number>();
  for (const c of cards.data ?? []) due.set(c.subject_id, (due.get(c.subject_id) ?? 0) + 1);
  const topics = new Map<string, number>();
  for (const m of mistakes.data ?? []) {
    const t = (m.quiz_questions as unknown as { topic: string | null } | null)?.topic?.trim();
    if (t) topics.set(t, (topics.get(t) ?? 0) + 1);
  }
  const unitName = new Map((units.data ?? []).map((u) => [u.id, unitLabel(u)]));
  const ctx: Ctx = {
    today,
    firstName: profile.data?.first_name ?? null,
    classes: (subjects.data ?? []).map((s) => ({
      ref: ref.class.get(s.id)!, name: s.name, currentUnit: s.current_unit_id ? ref.unit.get(s.current_unit_id) ?? null : null,
      units: (units.data ?? []).filter((u) => u.subject_id === s.id).map((u) => ({ ref: ref.unit.get(u.id)!, name: unitLabel(u) })), dueCards: due.get(s.id) ?? 0,
    })),
    events: ((events.data ?? []) as EventRow[]).map((e) => ({
      ref: ref.event.get(e.id)!, kind: e.kind, title: e.title, classRef: e.subject_id ? ref.class.get(e.subject_id) ?? null : null,
      date: e.due_on, time: e.due_time?.slice(0, 5) ?? null, done: !!e.done_at, unitRefs: e.event_units.map((u) => ref.unit.get(u.unit_id)).filter((x): x is string => !!x),
    })),
    files: (files.data ?? []).filter((f) => ref.class.has(f.subject_id)).map((f) => ({ ref: ref.file.get(f.id)!, name: f.filename, classRef: ref.class.get(f.subject_id)!, unitRef: f.unit_id ? ref.unit.get(f.unit_id) ?? null : null })),
    mistakes: mistakes.data?.length ?? 0,
    weakTopics: [...topics].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
    planToday,
  };
  return {
    ctx, ref, byRef, unitName,
    subjectName: new Map((subjects.data ?? []).map((s) => [s.id, s.name])),
    currentUnit: new Map((subjects.data ?? []).map((s) => [s.id, { unit_id: s.current_unit_id as string | null, pinned: !!s.current_unit_pinned }])),
  };
}
type Loaded = Awaited<ReturnType<typeof loadContext>>;

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Look something up for the planner. Returns plain text; never throws. */
async function read(db: SupabaseClient, c: Call, l: Loaded): Promise<string> {
  const classId = str(c.args.class) ? l.byRef.class.get(str(c.args.class)!) ?? null : null;
  const unitId = str(c.args.unit) ? l.byRef.unit.get(str(c.args.unit)!)?.id ?? null : null;
  const cname = (id: string | null) => (id ? l.subjectName.get(id) ?? "" : "");
  try {
    if (c.tool === "search") {
      const query = str(c.args.query)?.slice(0, 120) ?? "";
      if (!query) return "search needs a query.";
      const { data, error } = await db.rpc("search_everything", { p_query: query, p_subject: classId ?? undefined, p_limit: 8 });
      if (error) throw error;
      if (!data?.length) return `Nothing in their material matches "${query}".`;
      const lines = data.map((r: { kind: string; title: string; snippet: string; source_id: string | null; page_no: number | null; subject_id: string }) =>
        `- [${r.kind}] ${strip(r.title)}${r.source_id && l.ref.file.has(r.source_id) ? ` (${l.ref.file.get(r.source_id)}${r.page_no ? ` p.${r.page_no}` : ""})` : ""} · ${cname(r.subject_id)}: ${strip(r.snippet)}`);
      // The best pages in full, so cards and summaries can be accurate.
      const pages = data.filter((r: { kind: string; source_id: string | null; page_no: number | null }) => r.kind === "page" && r.source_id && r.page_no).slice(0, 3);
      const full = await Promise.all(pages.map(async (p: { source_id: string; page_no: number; title: string }) => {
        const { data: pg } = await db.from("source_pages").select("text").eq("source_id", p.source_id).eq("page_no", p.page_no).maybeSingle();
        return pg?.text ? `\n${strip(p.title)} p.${p.page_no} in full:\n${pg.text.slice(0, 1500)}` : "";
      }));
      return `Search "${query}":\n${lines.join("\n")}${full.join("")}`;
    }
    if (c.tool === "files") {
      let q = db.from("sources").select("id, filename, subject_id, unit_id, page_count, status, created_at").eq("archived", false).neq("status", "uploaded").order("created_at", { ascending: false }).limit(30);
      if (classId) q = q.eq("subject_id", classId);
      if (unitId) q = q.eq("unit_id", unitId);
      const { data: fs, error } = await q;
      if (error) throw error;
      if (!fs.length) return "No files there yet.";
      const ids = fs.map((f) => f.id);
      const [cards, quizzes] = await Promise.all([
        db.from("cards").select("source_id").in("source_id", ids).eq("hidden", false).limit(5000),
        db.from("quizzes").select("source_id").in("source_id", ids),
      ]);
      const count = (rows: { source_id: string | null }[] | null, id: string) => (rows ?? []).filter((r) => r.source_id === id).length;
      return fs.map((f) => `- ${l.ref.file.get(f.id) ?? "?"} "${f.filename}" · ${cname(f.subject_id)}${f.unit_id ? `, ${l.unitName.get(f.unit_id)}` : ""} · ${f.page_count} pages · ${count(cards.data, f.id)} cards, ${count(quizzes.data, f.id)} quizzes${f.status === "ready_text" ? " (saved only, nothing made yet)" : ""}`).join("\n");
    }
    if (c.tool === "progress") {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      let cq = db.from("cards").select("id, subject_id, state, due").eq("hidden", false).eq("archived", false).limit(20000);
      if (classId) cq = cq.eq("subject_id", classId);
      const [cards, reviews, attempts, tests] = await Promise.all([
        cq,
        db.from("card_reviews").select("card_id").gte("reviewed_at", since).limit(5000),
        db.from("quiz_attempts").select("correct, total, finished_at, quizzes!quiz_attempts_quiz_id_fkey(title, subject_id)").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(20),
        db.from("practice_tests").select("pct, total, finished_at, subject_id").order("finished_at", { ascending: false }).limit(10),
      ]);
      const now = new Date().toISOString();
      const ids = new Set((cards.data ?? []).map((x) => x.id));
      const by = (s: number) => (cards.data ?? []).filter((x) => x.state === s).length;
      const quizzes = (attempts.data ?? []).map((a) => ({ ...a, q: a.quizzes as unknown as { title: string; subject_id: string } | null })).filter((a) => !classId || a.q?.subject_id === classId).slice(0, 5);
      const pts = (tests.data ?? []).filter((t) => !classId || t.subject_id === classId).slice(0, 3);
      return [
        `${classId ? cname(classId) : "All classes"}: ${(cards.data ?? []).length} cards: ${by(0)} new, ${by(1) + by(3)} learning, ${by(2)} in long-term review; ${(cards.data ?? []).filter((x) => x.due <= now).length} due now.`,
        `Reviews in the last 7 days: ${(reviews.data ?? []).filter((r) => ids.has(r.card_id)).length}.`,
        `Latest quizzes: ${quizzes.length ? quizzes.map((a) => `${a.q?.title ?? "quiz"} ${Math.round((100 * a.correct) / Math.max(1, a.total))}%`).join("; ") : "none taken"}.`,
        `Practice tests: ${pts.length ? pts.map((t) => `${t.pct}% on ${t.finished_at.slice(0, 10)}${classId ? "" : ` (${cname(t.subject_id)})`}`).join("; ") : "none"}.`,
      ].join("\n");
    }
    if (c.tool === "mistakes") {
      const { data, error } = await db.from("mistakes").select("quiz_questions(prompt, options, answer_index, topic, quizzes(subject_id))").is("resolved_at", null).order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      const rows = (data ?? []).map((m) => m.quiz_questions as unknown as { prompt: string; options: string[]; answer_index: number; topic: string | null; quizzes: { subject_id: string } | null } | null)
        .filter((q): q is NonNullable<typeof q> => !!q && (!classId || q.quizzes?.subject_id === classId)).slice(0, 10);
      return rows.length ? rows.map((q) => `- ${q.prompt} → ${q.options[q.answer_index]}${q.topic ? ` [${q.topic}]` : ""}`).join("\n") : "No open mistakes there.";
    }
    if (c.tool === "weak_cards") {
      let q = db.from("cards").select("front, back, lapses, difficulty, subject_id").eq("hidden", false).eq("archived", false).neq("state", 0).order("lapses", { ascending: false }).order("difficulty", { ascending: false }).limit(10);
      if (classId) q = q.eq("subject_id", classId);
      const { data, error } = await q;
      if (error) throw error;
      return data.length ? data.map((x) => `- ${x.front} → ${x.back} (forgotten ${x.lapses}×)`).join("\n") : "No studied cards yet, so no hard ones.";
    }
    return "Unknown tool.";
  } catch (e) {
    console.error("coach read", c.tool, e instanceof Error ? e.message : e);
    return `${c.tool} failed.`;
  }
}

/** Carry out one change or make a button, after checking every ref and value; never throws. */
async function write(db: SupabaseClient, c: Call, l: Loaded): Promise<Done> {
  const a = c.args;
  const fail = (summary: string): Done => ({ text: `failed: ${summary}`, action: { type: c.tool, summary, ok: false } });
  const ok = (summary: string, undo?: Undo): Done => ({ text: `done: ${summary}`, action: { type: c.tool, summary, ok: true, undo } });
  const classId = str(a.class) ? l.byRef.class.get(str(a.class)!) ?? null : null;
  const unit = str(a.unit) ? l.byRef.unit.get(str(a.unit)!) ?? null : null;
  const unitIdsFor = (subjectId: string | null) => (Array.isArray(a.units) ? a.units : [])
    .map((r) => l.byRef.unit.get(String(r))).filter((u): u is { id: string; subject_id: string } => !!u && u.subject_id === subjectId).map((u) => u.id);
  const setUnits = async (eventId: string, ids: string[]) => {
    await db.from("event_units").delete().eq("event_id", eventId);
    if (ids.length) {
      const { error } = await db.from("event_units").insert(ids.map((unit_id) => ({ event_id: eventId, unit_id })));
      if (error) throw error;
    }
  };
  const describe = (title: string, subjectId: string | null, date: string) => `${title}${subjectId ? ` · ${l.subjectName.get(subjectId)}` : ""} · ${shortDate(date)}`;
  try {
    switch (c.tool) {
      case "add_event": {
        const title = cleanTitle(a.title);
        const kind = validKind(a.kind) ?? "other";
        if (!title || !isIsoDate(a.date)) return fail("Couldn't add that: it needs a name and a date.");
        const { data, error } = await db.from("events").insert({ kind, title, subject_id: classId, due_on: a.date, due_time: isTime(a.time) ? a.time : null }).select("id").single();
        if (error) throw error;
        await setUnits(data.id, kind === "test" || kind === "quiz" ? unitIdsFor(classId) : []);
        return ok(`Added ${describe(title, classId, a.date)}`, { op: "delete", id: data.id });
      }
      case "set_current_unit": {
        if (!unit) return fail("Couldn't find that unit.");
        const before = l.currentUnit.get(unit.subject_id) ?? { unit_id: null, pinned: false };
        const { error } = await db.from("subjects").update({ current_unit_id: unit.id, current_unit_pinned: true }).eq("id", unit.subject_id);
        if (error) throw error;
        return ok(`${l.subjectName.get(unit.subject_id)} is now on ${l.unitName.get(unit.id)}`, { op: "set_unit", subject_id: unit.subject_id, unit_id: before.unit_id, pinned: before.pinned });
      }
      case "make_cards": {
        if (!classId) return fail("Couldn't make cards: which class are they for?");
        const cards = cleanCards(a.cards);
        if (!cards.length) return fail("Couldn't make those cards.");
        const { data, error } = await db.from("cards").insert(cards.map((x) => ({ ...x, subject_id: classId, edited: true, tags: ["coach"] }))).select("id");
        if (error) throw error;
        return ok(`Made ${data.length} flashcard${data.length === 1 ? "" : "s"} in ${l.subjectName.get(classId)}`, { op: "delete_cards", ids: data.map((x) => x.id) });
      }
      case "write_note": {
        const title = cleanTitle(a.title);
        const body = typeof a.body === "string" ? a.body.trim().slice(0, 20000) : "";
        if (!classId || !title || !body) return fail("Couldn't save that note.");
        const { data, error } = await db.from("student_notes").insert({ subject_id: classId, unit_id: unit && unit.subject_id === classId ? unit.id : null, title, body }).select("id").single();
        if (error) throw error;
        return { ...ok(`Saved a note: ${title}`, { op: "delete_note", id: data.id }), link: { label: `Open “${title.slice(0, 40)}”`, href: `/notes/${data.id}` } };
      }
      case "link": {
        const to = str(a.to);
        const event = str(a.event) ? l.byRef.event.get(str(a.event)!) : undefined;
        const file = str(a.file) ? l.byRef.file.get(str(a.file)!) : undefined;
        const sid = classId ?? unit?.subject_id ?? event?.subject_id ?? null;
        const name = sid ? l.subjectName.get(sid) : null;
        const link = (label: string, href: string): Done => ({ text: `button: ${label}`, link: { label, href } });
        if (to === "review" && sid) return link(`Review ${unit ? l.unitName.get(unit.id) : name} cards`, `/review/session?subject=${sid}${unit ? `&unit=${unit.id}` : ""}`);
        if (to === "unit_quiz" && unit) return link(`Practise ${l.unitName.get(unit.id)}`, `/quiz/unit?unit=${unit.id}`);
        if (to === "practice_test" && event?.subject_id) return link(`Practice test for ${event.title}`, `/practice-test?event=${event.id}&subject=${event.subject_id}${event.event_units.length ? `&units=${event.event_units.map((u) => u.unit_id).join(",")}` : ""}`);
        if (to === "practice_test" && sid) return link(`Practice test: ${unit ? l.unitName.get(unit.id) : name}`, `/practice-test?subject=${sid}${unit ? `&units=${unit.id}` : ""}`);
        if (to === "mistakes") return link("Go over your mistakes", "/mistakes");
        if (to === "file" && file) return link(`Open ${file.filename.slice(0, 40)}`, `/sources/${file.id}`);
        if (to === "exam" && event) return link(`Prep for ${event.title}`, `/exam/${event.id}`);
        if (to === "calendar") return link("Open your calendar", "/calendar");
        if (to === "tutor") return link(name ? `Ask the ${name} tutor` : "Ask the tutor", sid ? `/tutor/${sid}` : "/tutor");
        if (to === "class" && sid) return link(`Open ${name}`, `/subjects/${sid}`);
        return { text: "failed: that button needs a class, unit, file or calendar item" };
      }
    }
    // Changes to a calendar item.
    const e = str(a.event) ? l.byRef.event.get(str(a.event)!) : undefined;
    if (!e) return fail("Couldn't find that on your calendar.");
    const { event_units, ...row } = e;
    const restore: Undo = { op: "restore", row, unit_ids: event_units.map((u) => u.unit_id) };
    if (c.tool === "delete_event") {
      const { error } = await db.from("events").delete().eq("id", e.id);
      if (error) throw error;
      return ok(`Removed ${describe(e.title, e.subject_id, e.due_on)}`, restore);
    }
    if (c.tool === "complete_event" || c.tool === "uncomplete_event") {
      const done = c.tool === "complete_event";
      const { error } = await db.from("events").update({ done_at: done ? new Date().toISOString() : null }).eq("id", e.id);
      if (error) throw error;
      return ok(`${done ? "Ticked off" : "Marked not done"}: ${e.title}`, restore);
    }
    // update_event: only the fields given.
    const patch: Record<string, unknown> = {};
    const title = cleanTitle(a.title);
    if (title) patch.title = title;
    if (validKind(a.kind)) patch.kind = validKind(a.kind);
    if (a.date != null) {
      if (!isIsoDate(a.date)) return fail("Couldn't change that: the date didn't make sense.");
      patch.due_on = a.date;
    }
    if (isTime(a.time)) patch.due_time = a.time;
    if (classId) patch.subject_id = classId;
    const subjectId = (patch.subject_id as string | undefined) ?? e.subject_id;
    const units = unitIdsFor(subjectId);
    if (!Object.keys(patch).length && !units.length) return fail("Nothing to change there.");
    if (Object.keys(patch).length) {
      const { error } = await db.from("events").update(patch).eq("id", e.id);
      if (error) throw error;
    }
    if (units.length || patch.subject_id) await setUnits(e.id, units);
    return ok(`Changed ${describe((patch.title as string) ?? e.title, subjectId, (patch.due_on as string) ?? e.due_on)}`, restore);
  } catch (err) {
    console.error("coach write", c.tool, err instanceof Error ? err.message : err);
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
  const today = isIsoDate(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const planToday = (Array.isArray(body.plan_today) ? body.plan_today : []).filter((x: unknown) => typeof x === "string").slice(0, 8).map((x: string) => x.slice(0, 120));
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t: { role?: unknown; content?: unknown }) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-10)
    .map((t: { role: "user" | "assistant"; content: string }) => ({ role: t.role, content: t.content.slice(0, 2000) }));

  const enc = new TextEncoder();
  const sse = (run: (send: (event: string, data: unknown) => void) => Promise<void>) =>
    new Response(new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          await run(send);
        } finally {
          controller.close();
        }
      },
    }), { headers: { ...corsHeaders(req), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });

  // Crisis language always gets the 988 line, from the server, with no model in the way and no allowance used.
  const feeling = wellbeing(message);
  if (feeling === "crisis") {
    const { data: p } = await student.db.from("profiles").select("first_name").maybeSingle();
    const reply = crisisReply(p?.first_name ?? null);
    return sse(async (send) => {
      send("delta", { text: reply });
      send("done", { reply, crisis: true });
    });
  }

  // Allowance: shared with the tutor, one per message. Students with their own key are not limited.
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
  try {
    loaded = await loadContext(student.db, today, planToday);
  } catch (e) {
    await refund();
    console.error("coach context", e instanceof Error ? e.message : e);
    return json(req, { error: "unavailable" }, 502);
  }
  const context = contextText(loaded.ctx);
  const names = {
    cls: (r: unknown) => (typeof r === "string" && loaded.byRef.class.has(r) ? loaded.subjectName.get(loaded.byRef.class.get(r)!) ?? null : null),
    unit: (r: unknown) => (typeof r === "string" && loaded.byRef.unit.has(r) ? loaded.unitName.get(loaded.byRef.unit.get(r)!.id) ?? null : null),
  };

  return sse(async (send) => {
    let answered = false;
    try {
      const lookedUp: string[] = [];
      const done: string[] = [];
      const buttons: string[] = [];
      const seen = new Set<string>();
      const rounds: { role: "assistant" | "user"; content: string }[] = [];
      let step = 0;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const out = await llmJson<{ calls: { tool: string; args: string }[] }>({
          schemaName: "coach_step", schema: STEP_SCHEMA, own, effort: "light", maxTokens: 2500, timeoutMs: 40_000,
          usage: { feature: "coach_step", userId: student.userId, byok: !!own },
          messages: [
            { role: "system", content: stepSystem() },
            { role: "system", content: context },
            ...history,
            { role: "user", content: message },
            ...rounds,
          ],
        });
        const calls = parseCalls(out.calls, seen);
        if (!calls.length) break;
        const results: string[] = [];
        // Reads run together; writes run in order, so "add the test, then make a button for it" works.
        const reads = calls.filter((c) => (READ_TOOLS as readonly string[]).includes(c.tool));
        const writes = calls.filter((c) => !(READ_TOOLS as readonly string[]).includes(c.tool));
        const ids = new Map(calls.map((c) => [c, `s${++step}`]));
        for (const c of calls) if (c.tool !== "link") send("step", { id: ids.get(c), label: stepLabel(c, names), status: "running" });
        await Promise.all(reads.map(async (c) => {
          const text = await read(student.db, c, loaded);
          results.push(`${c.tool} ${JSON.stringify(c.args)}:\n${text}`);
          lookedUp.push(text);
          send("step", { id: ids.get(c), status: text.endsWith("failed.") ? "failed" : "done" });
        }));
        for (const c of writes) {
          const r = await write(student.db, c, loaded);
          results.push(`${c.tool}: ${r.text}`);
          if (r.action) {
            done.push(`${r.action.ok ? "" : "FAILED: "}${r.action.summary}`);
            send("action", r.action);
          }
          if (r.link) {
            buttons.push(r.link.label);
            send("link", r.link);
          }
          if (c.tool !== "link") send("step", { id: ids.get(c), status: r.action?.ok === false ? "failed" : "done" });
        }
        rounds.push({ role: "assistant", content: JSON.stringify({ calls: calls.map((c) => ({ tool: c.tool, args: c.args })) }) });
        rounds.push({ role: "user", content: `Results:\n${results.join("\n\n")}\n\nCall more tools if you still need something; otherwise return no calls.` });
      }

      const summary = [
        lookedUp.length ? `Looked up:\n${lookedUp.join("\n\n").slice(0, 12000)}` : "Nothing was looked up.",
        `Done:\n${done.length ? done.map((d) => `- ${d}`).join("\n") : "- nothing"}`,
        buttons.length ? `Buttons:\n${buttons.map((b) => `- ${b}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
      const { res, model } = await llmStream({
        own, effort: "light", maxTokens: 900,
        messages: [
          { role: "system", content: answerSystem(feeling) },
          { role: "system", content: context },
          ...history,
          { role: "user", content: message },
          { role: "system", content: summary },
        ],
      });
      let full = "";
      // deno-lint-ignore no-explicit-any
      let usage: any = null;
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += value;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          const chunk = JSON.parse(payload);
          if (chunk?.usage) usage = chunk.usage;
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta !== "string" || !delta) continue;
          full += delta;
          answered = true;
          send("delta", { text: delta });
        }
      }
      await recordUsage({ feature: "coach", userId: student.userId, byok: !!own }, model, usage);
      send("done", { reply: full.trim() || "Done." });
    } catch (e) {
      console.error("coach", e instanceof Error ? e.message.slice(0, 300) : e);
      if (!answered) await refund();
      send("error", { error: "interrupted" });
    }
  });
});
