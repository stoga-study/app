// Private links to share a study set.
//
// POST { action: "create", source_id, with_file? }   → { token, expires_at }   (owner only)
// POST { action: "preview", token }                  → { title, by, kind, pages, counts, expires_at, mine, added_id }
// POST { action: "add", token, subject_id }          → { source_id }           a private copy in the student's class
//
// Links work only for signed-in students, and only while not expired or turned off. The copy is made
// with server rights from an explicit list of study-set fields: the sharer's own notes, progress,
// mistakes and anything else in their account are never read or copied. Cards start fresh.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MAX_ACTIVE = 20;

const token = () => {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A link that still works, with its file; null if it's unknown, expired or turned off. */
async function liveLink(t: unknown) {
  if (typeof t !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const { data: link } = await admin.from("share_links").select("id, user_id, source_id, with_file, expires_at, revoked_at").eq("token", t).maybeSingle();
  if (!link || link.revoked_at || Date.parse(link.expires_at) < Date.now()) return null;
  const { data: src } = await admin.from("sources").select("id, filename, original_filename, kind, bytes, page_count, status, options, steps, content_hash, storage_path, archived").eq("id", link.source_id).maybeSingle();
  if (!src || src.archived || (src.status !== "ready" && src.status !== "ready_text")) return null;
  return { link, src };
}

async function counts(sourceId: string) {
  const head = { count: "exact" as const, head: true };
  const [cards, notes, guide, terms, quizzes] = await Promise.all([
    admin.from("cards").select("id", head).eq("source_id", sourceId).eq("hidden", false),
    admin.from("notes_sections").select("id", head).eq("source_id", sourceId).eq("hidden", false),
    admin.from("guide_sections").select("id", head).eq("source_id", sourceId).eq("hidden", false),
    admin.from("key_terms").select("id", head).eq("source_id", sourceId).eq("hidden", false),
    admin.from("quizzes").select("id").eq("source_id", sourceId),
  ]);
  const quizIds = (quizzes.data ?? []).map((q) => q.id);
  const questions = quizIds.length ? (await admin.from("quiz_questions").select("id", head).in("quiz_id", quizIds).eq("hidden", false)).count ?? 0 : 0;
  return { cards: cards.count ?? 0, notes: notes.count ?? 0, guide: guide.count ?? 0, terms: terms.count ?? 0, questions };
}

/** Copy the study set into the student's class. Rows are inserted as the student's own. */
async function copyInto(userId: string, subjectId: string, l: NonNullable<Awaited<ReturnType<typeof liveLink>>>) {
  const { src, link } = l;
  const { data: made, error } = await admin.from("sources").insert({
    user_id: userId, subject_id: subjectId, filename: src.filename, original_filename: src.original_filename, kind: src.kind, bytes: src.bytes,
    page_count: src.page_count, status: src.status, options: src.options, steps: src.steps, counted: true, content_hash: src.content_hash, copied_from: link.id,
  }).select("id").single();
  if (error) throw error;
  const id = made.id;
  const own = { user_id: userId, source_id: id };
  try {
    const rows = async <T,>(q: PromiseLike<{ data: T[] | null; error: unknown }>) => {
      const { data, error: e } = await q;
      if (e) throw e;
      return data ?? [];
    };
    const ins = async (table: string, list: Record<string, unknown>[]) => {
      for (let i = 0; i < list.length; i += 200) {
        const { error: e } = await admin.from(table).insert(list.slice(i, i + 200));
        if (e) throw e;
      }
    };
    await ins("source_pages", (await rows(admin.from("source_pages").select("page_no, text").eq("source_id", src.id))).map((p) => ({ ...p, ...own })));
    await ins("notes_sections", (await rows(admin.from("notes_sections").select("position, title, body_md, pages, gen_part").eq("source_id", src.id).eq("hidden", false))).map((r) => ({ ...r, ...own })));
    await ins("guide_sections", (await rows(admin.from("guide_sections").select("position, title, body_md, pages, minutes").eq("source_id", src.id).eq("hidden", false))).map((r) => ({ ...r, ...own })));
    await ins("key_terms", (await rows(admin.from("key_terms").select("position, term, definition, pages").eq("source_id", src.id).eq("hidden", false))).map((r) => ({ ...r, ...own })));
    await ins("summaries", (await rows(admin.from("summaries").select("body_md").eq("source_id", src.id).eq("hidden", false))).map((r) => ({ ...r, ...own })));
    await ins("cards", (await rows(admin.from("cards").select("front, back, pages, quote, gen_part").eq("source_id", src.id).eq("hidden", false))).map((r) => ({ ...r, ...own, subject_id: subjectId })));
    for (const q of await rows(admin.from("quizzes").select("id, title, gen_run").eq("source_id", src.id).order("created_at"))) {
      const { data: quiz, error: e } = await admin.from("quizzes").insert({ ...own, subject_id: subjectId, title: q.title, gen_run: q.gen_run }).select("id").single();
      if (e) throw e;
      await ins("quiz_questions", (await rows(admin.from("quiz_questions").select("position, prompt, options, answer_index, hint, explanation, topic, pages, quote").eq("quiz_id", q.id).eq("hidden", false))).map((r) => ({ ...r, user_id: userId, quiz_id: quiz.id })));
    }
    if (link.with_file && src.storage_path) {
      const path = `${userId}/${id}/${src.storage_path.split("/").pop()}`;
      const { error: e } = await admin.storage.from("sources").copy(src.storage_path, path);
      if (!e) await admin.from("sources").update({ storage_path: path }).eq("id", id);
    }
    await admin.rpc("increment_share_copies", { p_link: link.id }).then(() => {}, () => {});
    return id;
  } catch (e) {
    // Never leave half a copy behind.
    await admin.from("sources").delete().eq("id", id);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "create") {
      // The student's own, ready file (row-level security checks it is theirs).
      const { data: src } = await student.db.from("sources").select("id, status").eq("id", String(body.source_id ?? "")).maybeSingle();
      if (!src || (src.status !== "ready" && src.status !== "ready_text")) return json(req, { error: "not_found" }, 404);
      const { count } = await admin.from("share_links").select("id", { count: "exact", head: true }).eq("user_id", student.userId).is("revoked_at", null).gt("expires_at", new Date().toISOString());
      if ((count ?? 0) >= MAX_ACTIVE) return json(req, { error: "too_many" }, 429);
      const { data, error } = await admin.from("share_links").insert({ user_id: student.userId, source_id: src.id, token: token(), with_file: body.with_file !== false }).select("token, expires_at").single();
      if (error) throw error;
      return json(req, data);
    }

    const l = await liveLink(body.token);
    if (!l) return json(req, { error: "gone" }, 404);

    if (body.action === "preview") {
      const [{ data: by }, c, { data: added }] = await Promise.all([
        admin.from("profiles").select("first_name").eq("user_id", l.link.user_id).maybeSingle(),
        counts(l.src.id),
        admin.from("sources").select("id").eq("user_id", student.userId).eq("copied_from", l.link.id).limit(1).maybeSingle(),
      ]);
      return json(req, {
        title: l.src.filename, by: by?.first_name?.split(" ")[0] ?? null, kind: l.src.kind, pages: l.src.page_count, with_file: l.link.with_file && !!l.src.storage_path,
        counts: c, expires_at: l.link.expires_at, mine: l.link.user_id === student.userId, added_id: added?.id ?? null,
      });
    }

    if (body.action === "add") {
      if (l.link.user_id === student.userId) return json(req, { error: "own" }, 400);
      const { data: subject } = await student.db.from("subjects").select("id").eq("id", String(body.subject_id ?? "")).maybeSingle();
      if (!subject) return json(req, { error: "no_subject" }, 400);
      const { data: added } = await admin.from("sources").select("id").eq("user_id", student.userId).eq("copied_from", l.link.id).limit(1).maybeSingle();
      if (added) return json(req, { source_id: added.id, already: true });
      return json(req, { source_id: await copyInto(student.userId, subject.id, l) });
    }
    return json(req, { error: "bad_action" }, 400);
  } catch (e) {
    console.error("share", body.action, e instanceof Error ? e.message : e);
    return json(req, { error: "unavailable" }, 502);
  }
});
