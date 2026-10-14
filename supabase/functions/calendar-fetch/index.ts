// Fetch a calendar link (.ics) for the student, since browsers can't read other sites' calendars.
//
// POST { url }  → { text, url }   the calendar's text, and the cleaned link to save
// POST { classify: { items: {title, notes}[], classes: string[] } }  → { results: {kind, class}[] }
//   sorts imported items the rules could not place: what kind each is, and which class (by index).
// Only public https addresses, checked again at every redirect; at most 3 MB and 10 seconds.
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { safeFeedUrl } from "../_lib/url.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { LLM_FAST_MODEL, llmJson, setUsageLogger } from "../_lib/llm.ts";
import { ownProvider } from "../_lib/byok.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));
const KINDS = ["test", "quiz", "homework", "project", "other"];
const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "kind", "class"],
        properties: { i: { type: "integer" }, kind: { type: "string", enum: KINDS }, class: { type: ["integer", "null"] } },
      },
    },
  },
};

/** Sort calendar items by kind and class. One light call; the client keeps its own guesses if this fails. */
async function classify(userId: string, items: { title: string; notes: string }[], classes: string[]) {
  const own = await ownProvider(admin, userId);
  const list = items.map((x, i) => `${i}. ${x.title}${x.notes ? ` (notes: ${x.notes})` : ""}`).join("\n");
  const out = await llmJson<{ results: { i: number; kind: string; class: number | null }[] }>({
    model: LLM_FAST_MODEL,
    own,
    effort: "light",
    maxTokens: 60 * items.length + 200,
    timeoutMs: 30_000,
    schemaName: "calendar_items",
    schema: CLASSIFY_SCHEMA,
    usage: { feature: "calendar_classify", userId, byok: !!own },
    messages: [
      {
        role: "system",
        content: `You sort a high school student's calendar items. For each item give:
- kind: "test" (tests, exams, finals, DBQs or FRQs written in class, summative assessments), "quiz", "homework" (anything to do and hand in or prepare: readings, worksheets, online practice, study guides, test corrections), "project" (projects, presentations, essays, papers, lab reports, speeches, posters), or "other" (school events, days off, clubs, sports, reminders).
- class: the index of the student's class it belongs to, or null if none clearly fits. Use course knowledge: "EME" or "Renaissance" fits World History, "titration" fits Chemistry, "derivatives" fits Calculus. Do not guess when unsure.
The student's classes:
${classes.map((c, i) => `${i}. ${c}`).join("\n") || "none"}`,
      },
      { role: "user", content: list },
    ],
  });
  return items.map((_, i) => {
    const r = out.results.find((x) => x.i === i);
    return { kind: r && KINDS.includes(r.kind) ? r.kind : null, class: r && Number.isInteger(r.class) && r.class! >= 0 && r.class! < classes.length ? r.class : null };
  });
}

const MAX_BYTES = 3_000_000;

async function fetchCalendar(start: string): Promise<{ text: string } | { error: string }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "Stoga.study calendar import" }, signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      const safe = next ? safeFeedUrl(new URL(next, url).toString()) : null;
      if (!safe) return { error: "bad_url" };
      url = safe;
      continue;
    }
    if (!res.ok) return { error: res.status === 401 || res.status === 403 || res.status === 404 ? "not_found" : "unreachable" };
    const reader = res.body?.getReader();
    if (!reader) return { error: "unreachable" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return { error: "too_big" }; }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }
    const text = new TextDecoder().decode(all);
    return /BEGIN:VCALENDAR/i.test(text.slice(0, 2000)) ? { text } : { error: "not_calendar" };
  }
  return { error: "unreachable" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));
  if (body.classify && typeof body.classify === "object") {
    const items = (Array.isArray(body.classify.items) ? body.classify.items : []).slice(0, 150)
      .map((x: { title?: unknown; notes?: unknown }) => ({ title: String(x?.title ?? "").slice(0, 120), notes: String(x?.notes ?? "").replace(/\s+/g, " ").slice(0, 160) }));
    const classes = (Array.isArray(body.classify.classes) ? body.classify.classes : []).slice(0, 20).map((c: unknown) => String(c).slice(0, 80));
    if (!items.length) return json(req, { results: [] });
    try {
      return json(req, { results: await classify(student.userId, items, classes) });
    } catch (e) {
      console.error("calendar classify", e instanceof Error ? e.message.slice(0, 200) : e);
      return json(req, { error: "unavailable" }, 502);
    }
  }
  const url = typeof body.url === "string" ? safeFeedUrl(body.url) : null;
  if (!url) return json(req, { error: "bad_url" }, 400);
  try {
    const out = await fetchCalendar(url);
    if ("error" in out) return json(req, out, 422);
    return json(req, { text: out.text, url });
  } catch (e) {
    console.error("calendar-fetch", e instanceof Error ? e.message : e);
    return json(req, { error: "unreachable" }, 422);
  }
});
