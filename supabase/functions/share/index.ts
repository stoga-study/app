// Private links to share a study set.
//
// POST { action: "create", source_id, with_file? }   → { token, expires_at }   (owner only)
// POST { action: "preview", token }                  → { title, by, kind, pages, counts, expires_at, mine, added_id }
// POST { action: "add", token, subject_id }          → { source_id }           a private copy in the student's class
// POST { action: "group_sets", group_id }            → { sets: [...] }         a group's shared sets (members only)
// POST { action: "group_add", set_id, subject_id }   → { source_id }           copy a group's set (members only)
// POST { action: "set_items", set_id }               → the group's version of a set: cards, note sections, history
// POST { action: "set_edit", set_id, item_type, item_id, fields } → edit one card or note section (members, unless locked)
// POST { action: "set_undo", change_id }             → take a change back (unless it was changed again since)
//
// Links work only for signed-in students, and only while not expired or turned off. The copy is made
// with server rights from an explicit list of study-set fields: the sharer's own notes, progress,
// mistakes and anything else in their account are never read or copied. Cards start fresh.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MAX_ACTIVE = 20;
const SRC = "id, filename, original_filename, kind, bytes, page_count, status, options, steps, content_hash, storage_path, archived";
const isMember = async (groupId: string, userId: string) => !!(await admin.from("group_members").select("user_id").eq("group_id", groupId).eq("user_id", userId).maybeSingle()).data;

const token = () => {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** A link that still works, with its file; null if it's unknown, expired or turned off. */
async function liveLink(t: unknown) {
  if (typeof t !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const { data: link } = await admin.from("share_links").select("id, user_id, source_id, with_file, expires_at, revoked_at").eq("token", t).maybeSingle();
  if (!link || link.revoked_at || Date.parse(link.expires_at) < Date.now()) return null;
  const { data: src } = await admin.from("sources").select(SRC).eq("id", link.source_id).maybeSingle();
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
type Src = NonNullable<Awaited<ReturnType<typeof liveLink>>>["src"];
async function copyInto(userId: string, subjectId: string, src: Src, o: { withFile: boolean; linkId?: string; setId?: string }) {
  const { data: made, error } = await admin.from("sources").insert({
    user_id: userId, subject_id: subjectId, filename: src.filename, original_filename: src.original_filename, kind: src.kind, bytes: src.bytes,
    page_count: src.page_count, status: src.status, options: src.options, steps: src.steps, counted: true, content_hash: src.content_hash,
    copied_from: o.linkId ?? null, copied_from_set: o.setId ?? null,
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
    if (o.withFile && src.storage_path) {
      const path = `${userId}/${id}/${src.storage_path.split("/").pop()}`;
      const { error: e } = await admin.storage.from("sources").copy(src.storage_path, path);
      if (!e) await admin.from("sources").update({ storage_path: path }).eq("id", id);
    }
    if (o.linkId) await admin.rpc("increment_share_copies", { p_link: o.linkId }).then(() => {}, () => {});
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

    if (body.action === "group_sets") {
      const groupId = String(body.group_id ?? "");
      if (!(await isMember(groupId, student.userId))) return json(req, { error: "not_member" }, 403);
      const { data: sets } = await admin.from("group_sets").select("id, source_id, shared_by, created_at").eq("group_id", groupId).order("created_at", { ascending: false }).limit(100);
      const ids = (sets ?? []).map((x) => x.source_id);
      const [{ data: srcs }, { data: members }, { data: mine }] = await Promise.all([
        ids.length ? admin.from("sources").select("id, filename, kind, page_count, status, archived").in("id", ids) : Promise.resolve({ data: [] as { id: string; filename: string; kind: string; page_count: number; status: string; archived: boolean }[] }),
        admin.from("group_members").select("user_id, display_name").eq("group_id", groupId),
        admin.from("sources").select("id, copied_from_set").eq("user_id", student.userId).in("copied_from_set", (sets ?? []).map((x) => x.id).concat(["00000000-0000-0000-0000-000000000000"])),
      ]);
      const name = new Map((members ?? []).map((m) => [m.user_id, m.display_name]));
      const out = [];
      for (const x of sets ?? []) {
        const src = (srcs ?? []).find((y) => y.id === x.source_id);
        if (!src || src.archived || (src.status !== "ready" && src.status !== "ready_text")) continue;
        out.push({
          id: x.id, title: src.filename, kind: src.kind, pages: src.page_count, by: name.get(x.shared_by) ?? "A member", mine_shared: x.shared_by === student.userId,
          counts: await counts(src.id), added_id: (mine ?? []).find((m) => m.copied_from_set === x.id)?.id ?? null, created_at: x.created_at,
        });
      }
      return json(req, { sets: out });
    }

    if (body.action === "group_add") {
      const { data: set } = await admin.from("group_sets").select("id, group_id, source_id, shared_by").eq("id", String(body.set_id ?? "")).maybeSingle();
      if (!set || !(await isMember(set.group_id, student.userId))) return json(req, { error: "not_member" }, 403);
      if (set.shared_by === student.userId) return json(req, { error: "own" }, 400);
      const { data: subject } = await student.db.from("subjects").select("id").eq("id", String(body.subject_id ?? "")).maybeSingle();
      if (!subject) return json(req, { error: "no_subject" }, 400);
      const { data: added } = await admin.from("sources").select("id").eq("user_id", student.userId).eq("copied_from_set", set.id).limit(1).maybeSingle();
      if (added) return json(req, { source_id: added.id, already: true });
      const { data: src } = await admin.from("sources").select(SRC).eq("id", set.source_id).maybeSingle();
      if (!src || src.archived) return json(req, { error: "gone" }, 404);
      return json(req, { source_id: await copyInto(student.userId, subject.id, src as Src, { withFile: true, setId: set.id }) });
    }

    if (body.action === "set_items" || body.action === "set_edit" || body.action === "set_undo") {
      // Which set, and is this student in its group?
      let setId = String(body.set_id ?? "");
      type Change = { id: string; set_id: string; item_type: string; item_id: string; before: Record<string, string>; after: Record<string, string>; undone_at: string | null };
      let change: Change | null = null;
      if (body.action === "set_undo") {
        const { data } = await admin.from("group_set_changes").select("id, set_id, item_type, item_id, before, after, undone_at").eq("id", String(body.change_id ?? "")).maybeSingle();
        if (!data) return json(req, { error: "not_found" }, 404);
        change = data as unknown as Change;
        setId = data.set_id;
      }
      const { data: set } = await admin.from("group_sets").select("id, group_id, source_id, shared_by, locked").eq("id", setId).maybeSingle();
      if (!set || !(await isMember(set.group_id, student.userId))) return json(req, { error: "not_member" }, 403);
      const { data: group } = await admin.from("groups").select("owner_id").eq("id", set.group_id).single();
      const canEdit = !set.locked || set.shared_by === student.userId;
      const { data: me } = await admin.from("group_members").select("display_name").eq("group_id", set.group_id).eq("user_id", student.userId).single();
      const table = (t: string) => (t === "card" ? "cards" : "notes_sections");
      const FIELDS: Record<string, { name: string; max: number }[]> = { card: [{ name: "front", max: 1000 }, { name: "back", max: 2000 }], note_section: [{ name: "title", max: 200 }, { name: "body_md", max: 20000 }] };

      if (body.action === "set_items") {
        const [{ data: src }, { data: cards }, { data: notes }, { data: history }] = await Promise.all([
          admin.from("sources").select("filename").eq("id", set.source_id).single(),
          admin.from("cards").select("id, front, back").eq("source_id", set.source_id).eq("hidden", false).order("created_at").limit(500),
          admin.from("notes_sections").select("id, title, body_md").eq("source_id", set.source_id).eq("hidden", false).order("position").limit(200),
          admin.from("group_set_changes").select("id, display_name, item_type, item_id, before, after, created_at, undone_at, undone_by").eq("set_id", set.id).order("created_at", { ascending: false }).limit(50),
        ]);
        return json(req, { title: src?.filename ?? "Study set", locked: set.locked, can_edit: canEdit, can_lock: set.shared_by === student.userId || group?.owner_id === student.userId, mine: set.shared_by === student.userId, cards, notes, history });
      }

      if (!canEdit) return json(req, { error: "locked" }, 403);

      if (body.action === "set_edit") {
        const type = String(body.item_type ?? "");
        if (!FIELDS[type]) return json(req, { error: "bad_item" }, 400);
        const { data: row } = await admin.from(table(type)).select("*").eq("id", String(body.item_id ?? "")).maybeSingle();
        const item = row as Record<string, unknown> | null;
        if (!item || item.source_id !== set.source_id) return json(req, { error: "not_found" }, 404);
        const before: Record<string, string> = {}, after: Record<string, string> = {};
        for (const f of FIELDS[type]) {
          const v = body.fields?.[f.name];
          const now = String(item[f.name] ?? "");
          if (typeof v !== "string") continue;
          const clean = v.trim().slice(0, f.max);
          if (!clean && type === "card") return json(req, { error: "empty" }, 400);
          if (clean === now) continue;
          before[f.name] = now;
          after[f.name] = clean;
        }
        if (!Object.keys(after).length) return json(req, { unchanged: true });
        const { error } = await admin.from(table(type)).update({ ...after, ...(type === "card" ? { edited: true } : {}) }).eq("id", String(item.id));
        if (error) throw error;
        const { data: logged } = await admin.from("group_set_changes").insert({ set_id: set.id, user_id: student.userId, display_name: me?.display_name ?? "A member", item_type: type, item_id: String(item.id), before, after }).select("id").single();
        return json(req, { change_id: logged?.id });
      }

      // set_undo: only if the item still says what the change made it say.
      if (!change || change.undone_at) return json(req, { error: "already_undone" }, 400);
      const { data: row } = await admin.from(table(change.item_type)).select("*").eq("id", change.item_id).maybeSingle();
      const item = row as Record<string, unknown> | null;
      if (!item) return json(req, { error: "not_found" }, 404);
      if (Object.entries(change.after).some(([k, v]) => String(item[k] ?? "") !== v)) return json(req, { error: "changed_since" }, 409);
      const { error } = await admin.from(table(change.item_type)).update(change.before).eq("id", change.item_id);
      if (error) throw error;
      await admin.from("group_set_changes").update({ undone_at: new Date().toISOString(), undone_by: me?.display_name ?? "A member" }).eq("id", change.id);
      return json(req, { undone: true });
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
      return json(req, { source_id: await copyInto(student.userId, subject.id, l.src, { withFile: l.link.with_file, linkId: l.link.id }) });
    }
    return json(req, { error: "bad_action" }, 400);
  } catch (e) {
    console.error("share", body.action, e instanceof Error ? e.message : e);
    return json(req, { error: "unavailable" }, 502);
  }
});
