// Bring back a Stoga.study export (its data.json), into the same account or a new one.
//
// POST { action: "classes", subjects, units, goals }               → { subjects: {old: new}, units: {old: new}, added, skipped }
// POST { action: "source", source, subject_id, unit_id, pages, notes_sections, guide_sections, key_terms, summaries,
//        cards, quizzes, quiz_questions }                          → { source_id, existed, added, skipped }
// POST { action: "rest", student_notes, events, event_units, cards, subjects, units, sources } → { added, skipped }
//
// Restore never overwrites. Every row keeps its id from the export unless another account has it; then it
// gets an id worked out from the student and the original, so restoring the same backup again lands on the
// same ids. A row whose id is already in this student's account is skipped, so restoring twice, or into the
// same account after deleting a few things, only adds what's missing. Rows are built from an explicit list
// of fields and always belong to the caller. Classes with the same name are merged.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Row = Record<string, unknown>;
type Ids = Record<string, string>;
const MAX_ROWS = 5000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, MAX_ROWS) : []);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown) => v === true;
const strs = (v: unknown, max = 50) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((x) => x.slice(0, 60)) : []);
const ints = (v: unknown) => (Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, 200) : []);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null);
/** Keep only the given fields that are present (so database defaults apply to the rest). */
const pick = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

/** A stable id for this student's copy of a row another account has (a name-based, version 5 style UUID). */
async function derived(userId: string, old: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`stoga-restore:${userId}:${old}`))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

async function owners(table: string, ids: string[]) {
  const owner = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from(table).select("id, user_id").in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) owner.set(r.id, r.user_id);
  }
  return owner;
}

/** Decide each row's id: its own if free, a stable new one if another account has it; skip it if it's already this student's. */
async function place(table: string, userId: string, rows: Row[]): Promise<{ ids: Ids; fresh: Row[]; mine: number }> {
  const want = new Map<Row, string>();
  const first = await owners(table, [...new Set(rows.map((r) => uuid(r.id)).filter((x): x is string => !!x))]);
  for (const r of rows) {
    const old = uuid(r.id);
    if (old) want.set(r, first.has(old) && first.get(old) !== userId ? await derived(userId, old) : old);
  }
  const taken = new Map([...first, ...(await owners(table, [...new Set([...want.values()].filter((v) => !first.has(v)))]))]);
  const ids: Ids = {};
  const fresh: Row[] = [];
  let mine = 0;
  for (const r of rows) {
    const old = uuid(r.id);
    const id = want.get(r);
    if (old && id && ids[old]) continue; // the same row twice in one backup
    if (old && id && taken.get(id) === userId) { ids[old] = id; mine++; continue; }
    const use = id && !taken.has(id) ? id : crypto.randomUUID();
    if (old) ids[old] = use;
    fresh.push({ ...r, id: use });
  }
  return { ids, fresh, mine };
}

/** Insert in batches; if a batch is refused, try its rows one at a time and count the ones that can't go in. */
async function insert(table: string, rows: Row[]): Promise<{ added: number; failed: Set<number> }> {
  const failed = new Set<number>();
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await admin.from(table).insert(batch);
    if (!error) continue;
    for (let j = 0; j < batch.length; j++) {
      const { error: e } = await admin.from(table).insert(batch[j]);
      if (e) failed.add(i + j);
    }
  }
  return { added: rows.length - failed.size, failed };
}

/** The student's own rows among these ids (to check every reference the client passes). */
async function owned(table: string, userId: string, ids: string[]) {
  const set = new Set<string>();
  const want = [...new Set(ids)];
  for (let i = 0; i < want.length; i += 200) {
    const { data } = await admin.from(table).select("id").eq("user_id", userId).in("id", want.slice(i, i + 200));
    for (const r of data ?? []) set.add(r.id);
  }
  return set;
}
const mapIds = (v: unknown): Ids => Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([k, x]) => uuid(k) && uuid(x)).map(([k, x]) => [k.toLowerCase(), String(x).toLowerCase()]));

const card = (r: Row, userId: string, subjectId: string, sourceId: string | null) => pick({
  id: r.id, user_id: userId, subject_id: subjectId, source_id: sourceId, front: text(r.front, 2000), back: text(r.back, 4000), tags: strs(r.tags),
  pages: ints(r.pages), quote: text(r.quote, 1000), hidden: bool(r.hidden), archived: bool(r.archived), due: date(r.due) ? r.due : null,
  stability: num(r.stability), difficulty: num(r.difficulty), elapsed_days: num(r.elapsed_days), scheduled_days: num(r.scheduled_days),
  learning_steps: num(r.learning_steps), reps: num(r.reps), lapses: num(r.lapses), state: num(r.state), last_review: date(r.last_review) ? r.last_review : null,
  created_at: date(r.created_at) ? r.created_at : null,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const me = student.userId;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "classes") {
      // Classes: the same one (by id) or one with the same name is reused; otherwise it's made.
      const { data: have } = await admin.from("subjects").select("id, name, catalog_id").eq("user_id", me);
      const byName = new Map((have ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]));
      const byCourse = new Map((have ?? []).filter((s) => s.catalog_id).map((s) => [s.catalog_id, s.id]));
      const subjects: Ids = {};
      const toPlace: Row[] = [];
      for (const s of list(body.subjects)) {
        const old = uuid(s.id);
        const name = text(s.name, 80)?.trim();
        if (!old || !name) continue;
        const same = (have ?? []).find((h) => h.id === old)?.id ?? byCourse.get(String(s.catalog_id)) ?? byName.get(name.toLowerCase());
        if (same) subjects[old] = same;
        else toPlace.push(s);
      }
      const placedS = await place("subjects", me, toPlace);
      Object.assign(subjects, placedS.ids);
      const rowsS = placedS.fresh.map((s) => pick({
        id: s.id, user_id: me, name: text(s.name, 80)?.trim(), area: text(s.area, 40), level: text(s.level, 4), course_code: text(s.course_code, 4), catalog_id: text(s.catalog_id, 80),
        school_year: text(s.school_year, 20), color_index: Math.min(3, Math.max(0, Math.trunc(num(s.color_index) ?? 0))), archived: bool(s.archived),
        study_defaults: s.study_defaults && typeof s.study_defaults === "object" ? s.study_defaults : null,
      }));
      const s1 = await insert("subjects", rowsS);
      // A class whose details don't fit today's rules still comes back, by name, so nothing inside it is lost.
      for (const i of [...s1.failed]) {
        const { error: e } = await admin.from("subjects").insert({ id: rowsS[i].id, user_id: me, name: rowsS[i].name });
        if (!e) { s1.failed.delete(i); s1.added++; }
        else for (const [k, v] of Object.entries(subjects)) if (v === rowsS[i].id) delete subjects[k];
      }

      // Units, inside those classes; a unit with the same number or title in that class is reused.
      const mySubjects = await owned("subjects", me, Object.values(subjects));
      const unitRows = list(body.units).filter((u) => mySubjects.has(subjects[uuid(u.subject_id) ?? ""] ?? ""));
      const { data: haveU } = await admin.from("units").select("id, subject_id, number, title").eq("user_id", me);
      const units: Ids = {};
      const toPlaceU: Row[] = [];
      for (const u of unitRows) {
        const old = uuid(u.id);
        if (!old) continue;
        const sid = subjects[uuid(u.subject_id)!];
        const same = (haveU ?? []).find((h) => h.id === old || (h.subject_id === sid && ((u.number && h.number === u.number) || (!u.number && u.title && h.title === u.title))));
        if (same) units[old] = same.id;
        else toPlaceU.push({ ...u, subject_id: sid });
      }
      const placedU = await place("units", me, toPlaceU);
      Object.assign(units, placedU.ids);
      const rowsU = placedU.fresh.map((u) => pick({ id: u.id, user_id: me, subject_id: u.subject_id, number: text(u.number, 3), title: text(u.title, 80), word: text(u.word, 10) }));
      const u1 = await insert("units", rowsU);
      rowsU.forEach((r, i) => { if (u1.failed.has(i)) for (const [k, v] of Object.entries(units)) if (v === r.id) delete units[k]; });

      // Goals (at most four; the database keeps that rule).
      const placedG = await place("goals", me, list(body.goals));
      const g1 = await insert("goals", placedG.fresh.map((g) => pick({ id: g.id, user_id: me, kind: text(g.kind, 20), target: num(g.target), label: text(g.label, 80), subject_id: subjects[uuid(g.subject_id) ?? ""] ?? null })));

      return json(req, { subjects, units, added: s1.added + u1.added + g1.added, skipped: s1.failed.size + u1.failed.size + g1.failed.size });
    }

    if (body.action === "source") {
      const src: Row = body.source && typeof body.source === "object" ? body.source : {};
      const subjectId = uuid(body.subject_id);
      if (!subjectId || !(await owned("subjects", me, [subjectId])).has(subjectId)) return json(req, { error: "no_class" }, 400);
      const unitId = uuid(body.unit_id);
      const unit = unitId && (await owned("units", me, [unitId])).has(unitId) ? unitId : null;
      const placed = await place("sources", me, [src]);
      if (!placed.fresh.length) return json(req, { source_id: placed.ids[uuid(src.id) ?? ""] ?? null, existed: true, added: 0, skipped: 0 });
      const id = placed.fresh[0].id as string;
      const pages = list(body.pages);
      const generated = list(body.notes_sections).length + list(body.cards).length + list(body.quizzes).length + list(body.guide_sections).length;
      const { error } = await admin.from("sources").insert(pick({
        id, user_id: me, subject_id: subjectId, unit_id: unit, filename: text(src.filename, 255) || "Restored file", original_filename: text(src.original_filename, 255),
        kind: ["pdf", "docx", "text", "image", "pptx"].includes(String(src.kind)) ? src.kind : "text", page_count: num(src.page_count) ?? pages.length,
        status: generated ? "ready" : "ready_text", tags: strs(src.tags, 20), archived: bool(src.archived), lesson: text(src.lesson, 7),
        // Making more from a restored file counts once, like a new upload.
        counted: false, created_at: date(src.created_at) ? src.created_at : null,
      }));
      if (error) {
        // A lesson number that doesn't fit the format shouldn't lose the whole file.
        const { error: e2 } = await admin.from("sources").insert({ id, user_id: me, subject_id: subjectId, filename: text(src.filename, 255) || "Restored file", kind: "text", status: generated ? "ready" : "ready_text", counted: false });
        if (e2) return json(req, { error: "source_failed" }, 400);
      }
      const own = { user_id: me, source_id: id };
      let added = 1, skipped = 0;
      const tally = (r: { added: number; failed: Set<number> }) => { added += r.added; skipped += r.failed.size; };
      const pageNos = new Set<number>();
      tally(await insert("source_pages", pages.filter((p) => Number.isInteger(p.page_no) && !pageNos.has(p.page_no as number) && pageNos.add(p.page_no as number)).map((p) => ({ ...own, page_no: p.page_no, text: text(p.text, 200000) ?? "" }))));
      const kids = async (table: string, rows: Row[], build: (r: Row) => Row) => { const p = await place(table, me, rows); tally(await insert(table, p.fresh.map((r) => pick({ ...build(r), id: r.id, ...own })))); return p.ids; };
      await kids("notes_sections", list(body.notes_sections), (r) => ({ position: num(r.position) ?? 0, title: text(r.title, 300) ?? "", body_md: text(r.body_md, 100000) ?? "", pages: ints(r.pages), hidden: bool(r.hidden) }));
      await kids("guide_sections", list(body.guide_sections), (r) => ({ position: num(r.position) ?? 0, title: text(r.title, 300) ?? "", body_md: text(r.body_md, 100000) ?? "", minutes: num(r.minutes), pages: ints(r.pages), hidden: bool(r.hidden) }));
      await kids("key_terms", list(body.key_terms), (r) => ({ position: num(r.position) ?? 0, term: text(r.term, 300) ?? "", definition: text(r.definition, 4000) ?? "", pages: ints(r.pages), hidden: bool(r.hidden) }));
      await kids("summaries", list(body.summaries).slice(0, 5), (r) => ({ body_md: text(r.body_md, 100000) ?? "", hidden: bool(r.hidden) }));
      const pc = await place("cards", me, list(body.cards));
      tally(await insert("cards", pc.fresh.map((r) => card(r, me, subjectId, id))));
      const quizIds = await kids("quizzes", list(body.quizzes), (r) => ({ subject_id: subjectId, title: text(r.title, 200) || "Quiz", created_at: date(r.created_at) ? r.created_at : null }));
      const questions = list(body.quiz_questions).filter((q) => quizIds[uuid(q.quiz_id) ?? ""]);
      const pq = await place("quiz_questions", me, questions);
      tally(await insert("quiz_questions", pq.fresh.map((q) => pick({
        id: q.id, user_id: me, quiz_id: quizIds[uuid(q.quiz_id)!], position: num(q.position) ?? 0, prompt: text(q.prompt, 2000) ?? "", options: strs(q.options, 8).length ? (q.options as unknown[]).slice(0, 8).map((o) => text(o, 1000)) : [],
        answer_index: num(q.answer_index) ?? 0, hint: text(q.hint, 1000), explanation: text(q.explanation, 4000) ?? "", topic: text(q.topic, 120), pages: ints(q.pages), quote: text(q.quote, 1000), hidden: bool(q.hidden),
      }))));
      return json(req, { source_id: id, existed: false, added, skipped });
    }

    if (body.action === "rest") {
      const subjects = mapIds(body.subjects), units = mapIds(body.units), sources = mapIds(body.sources);
      const [mySubjects, myUnits, mySources] = await Promise.all([owned("subjects", me, Object.values(subjects)), owned("units", me, Object.values(units)), owned("sources", me, Object.values(sources))]);
      const sub = (v: unknown) => { const x = subjects[uuid(v) ?? ""]; return x && mySubjects.has(x) ? x : null; };
      const uni = (v: unknown) => { const x = units[uuid(v) ?? ""]; return x && myUnits.has(x) ? x : null; };
      const srcOf = (v: unknown) => { const x = sources[uuid(v) ?? ""]; return x && mySources.has(x) ? x : null; };
      let added = 0, skipped = 0;
      const tally = (r: { added: number; failed: Set<number> }) => { added += r.added; skipped += r.failed.size; };

      // Cards that aren't from a file (typed or imported).
      const loose = list(body.cards).filter((c) => sub(c.subject_id));
      const pc = await place("cards", me, loose);
      tally(await insert("cards", pc.fresh.map((c) => card(c, me, sub(c.subject_id)!, srcOf(c.source_id)))));

      const notes = list(body.student_notes).filter((n) => sub(n.subject_id));
      const pn = await place("student_notes", me, notes);
      tally(await insert("student_notes", pn.fresh.map((n) => pick({
        id: n.id, user_id: me, subject_id: sub(n.subject_id), unit_id: uni(n.unit_id), source_id: srcOf(n.source_id), title: text(n.title, 120) ?? "", body: text(n.body, 200000) ?? "",
        created_at: date(n.created_at) ? n.created_at : null, updated_at: date(n.updated_at) ? n.updated_at : null,
      }))));

      const pe = await place("events", me, list(body.events));
      tally(await insert("events", pe.fresh.map((e) => pick({
        id: e.id, user_id: me, subject_id: sub(e.subject_id), kind: text(e.kind, 20), title: text(e.title, 120), due_on: date(e.due_on)?.slice(0, 10),
        due_time: typeof e.due_time === "string" && /^\d{2}:\d{2}/.test(e.due_time) ? e.due_time : null, notes: text(e.notes, 1000), done_at: date(e.done_at) ? e.done_at : null,
      }))));
      const myEvents = await owned("events", me, Object.values(pe.ids));
      const links = list(body.event_units).map((l) => ({ user_id: me, event_id: pe.ids[uuid(l.event_id) ?? ""], unit_id: uni(l.unit_id) })).filter((l) => l.event_id && myEvents.has(l.event_id) && l.unit_id);
      if (links.length) await admin.from("event_units").upsert(links, { onConflict: "event_id,unit_id", ignoreDuplicates: true });

      return json(req, { added, skipped });
    }

    return json(req, { error: "unknown_action" }, 400);
  } catch (e) {
    console.error("restore", e);
    return json(req, { error: "failed" }, 500);
  }
});
