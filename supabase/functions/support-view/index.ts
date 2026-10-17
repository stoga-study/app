// The read-only support view behind a student's private link (no account needed).
//
// POST { token } → { summary, label, expires_at }   or 404 { error: "not_found" } if the link is unknown,
//                                                    expired or turned off.
//
// Read with server rights, but only for the one student whose working link this is, and only counts,
// dates, class names, calendar titles and readiness: never notes, chats, files, cards, quizzes or mistakes.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { corsHeaders, json } from "../_lib/cors.ts";
import { localNow, toPrefs } from "../_lib/notify.ts";
import { buildSummary, UPCOMING_DAYS } from "../_lib/support.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Row = Record<string, unknown>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

async function rows<T = Row>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" && /^[A-Za-z0-9_-]{24,64}$/.test(body.token) ? body.token : null;
  if (!token) return json(req, { error: "not_found" }, 404);
  try {
    const { data: link } = await admin.from("support_links").select("id, user_id, label, expires_at, revoked_at, views").eq("token", token).maybeSingle();
    if (!link || link.revoked_at || Date.parse(link.expires_at) < Date.now()) return json(req, { error: "not_found" }, 404);
    const me = link.user_id;
    await admin.from("support_links").update({ last_viewed_at: new Date().toISOString(), views: link.views + 1 }).eq("id", link.id);

    const { data: profile } = await admin.from("profiles").select("first_name, notify").eq("user_id", me).maybeSingle();
    const tz = toPrefs(profile?.notify).tz;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const localDate = (iso: string) => day.format(new Date(iso));
    const today = localNow(tz).date;
    const since = new Date(Date.now() - 31 * 864e5).toISOString();
    const end = new Date(Date.parse(`${today}T12:00:00Z`) + UPCOMING_DAYS * 864e5).toISOString().slice(0, 10);

    const [subjects, reviews, attempts, tests, asked, events, cards, quizzes, mistakes] = await Promise.all([
      rows<{ id: string; name: string }>(admin.from("subjects").select("id, name").eq("user_id", me).eq("archived", false).order("created_at")),
      rows(admin.from("card_reviews").select("reviewed_at, rating, cards(subject_id)").eq("user_id", me).gte("reviewed_at", since).limit(20000)),
      rows(admin.from("quiz_attempts").select("created_at, finished_at, total, correct, answers, quizzes(subject_id)").eq("user_id", me).gte("created_at", since).limit(5000)),
      rows(admin.from("practice_tests").select("finished_at, subject_id, total, points").eq("user_id", me).gte("finished_at", since).limit(1000)),
      rows(admin.from("chat_messages").select("created_at, chat_threads(subject_id)").eq("user_id", me).eq("role", "user").gte("created_at", since).limit(5000)),
      rows(admin.from("events").select("id, subject_id, kind, title, due_on, done_at, event_units(unit_id)").eq("user_id", me).gte("due_on", today).lte("due_on", end).limit(200)),
      rows(admin.from("cards").select("subject_id, state, sources(unit_id)").eq("user_id", me).eq("hidden", false).eq("archived", false).limit(20000)),
      rows(admin.from("quizzes").select("id, subject_id, sources(unit_id), quiz_questions!quiz_questions_quiz_id_fkey(count)").eq("user_id", me).eq("archived", false)),
      rows(admin.from("mistakes").select("quiz_questions(quizzes(subject_id, sources(unit_id)))").eq("user_id", me).is("resolved_at", null).limit(5000)),
    ]);
    const finished = await rows<{ quiz_id: string; correct: number; total: number }>(
      admin.from("quiz_attempts").select("quiz_id, correct, total").eq("user_id", me).not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(5000),
    );
    const latest = new Map<string, { correct: number; total: number }>();
    for (const a of finished) if (!latest.has(a.quiz_id)) latest.set(a.quiz_id, { correct: a.correct, total: a.total });

    const subjectOf = (v: unknown) => (one(v as Row | Row[]) as { subject_id?: string } | null)?.subject_id ?? null;
    const unitOf = (v: unknown) => (one(v as Row | Row[]) as { unit_id?: string | null } | null)?.unit_id ?? null;
    const activity = [
      ...reviews.map((r) => ({ at: String(r.reviewed_at), subject_id: subjectOf(r.cards), n: 1, correct: Number(r.rating) > 1 ? 1 : 0 })),
      ...attempts.filter((a) => Array.isArray(a.answers) && a.answers.length).map((a) => ({ at: String(a.finished_at ?? a.created_at), subject_id: subjectOf(a.quizzes), n: (a.answers as unknown[]).length, correct: Number(a.correct) })),
      ...tests.map((t) => ({ at: String(t.finished_at), subject_id: (t.subject_id as string) ?? null, n: Number(t.total), correct: Math.floor(Number(t.points)) })),
      ...asked.map((m) => ({ at: String(m.created_at), subject_id: subjectOf(m.chat_threads), n: 1, correct: null })),
    ];

    const summary = buildSummary({
      name: (profile?.first_name ?? "").trim().split(/\s+/)[0] || "Your student",
      today,
      localDate,
      subjects,
      activity,
      events: events.map((e) => ({
        id: String(e.id), subject_id: (e.subject_id as string) ?? null, kind: String(e.kind), title: String(e.title), due_on: String(e.due_on), done_at: (e.done_at as string) ?? null,
        unit_ids: ((e.event_units as { unit_id: string }[]) ?? []).map((u) => u.unit_id),
      })),
      cards: cards.map((c) => ({ subject_id: String(c.subject_id), unit_id: unitOf(c.sources), state: Number(c.state) })),
      quizzes: quizzes.map((q) => ({
        subject_id: String(q.subject_id), unit_id: unitOf(q.sources), count: ((q.quiz_questions as { count: number }[]) ?? [])[0]?.count ?? 0, last: latest.get(String(q.id)) ?? null,
      })),
      mistakes: mistakes.flatMap((m) => {
        const quiz = one((one(m.quiz_questions as Row | Row[]) as Row | null)?.quizzes as Row | Row[]) as { subject_id: string; sources: unknown } | null;
        return quiz ? [{ subject_id: quiz.subject_id, unit_id: unitOf(quiz.sources) }] : [];
      }),
    });
    return json(req, { summary, label: link.label, expires_at: link.expires_at });
  } catch (e) {
    console.error("support-view", e);
    return json(req, { error: "failed" }, 500);
  }
});
