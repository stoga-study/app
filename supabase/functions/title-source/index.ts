// Suggests a clean, mid-length title for an uploaded source from its filename and first page.
// The app already shows an on-device cleaned title; this only replaces it with something better.
import { corsHeaders, json } from "../_lib/cors.ts";
import { studentClient } from "../_lib/auth.ts";
import { LLM_FAST_MODEL, llmJson } from "../_lib/llm.ts";

const MIN = 8, MAX = 56;

const SYSTEM = `You name study files for high school students. Given a file's original name, a cleaned name, its class and the start of its text, write one title.
Rules:
- 20 to 50 characters. Title Case, with small words (and, with, of, the, in, to) lowercase.
- Keep unit, lesson, chapter or week numbers when the file has them, e.g. "Unit 2, Lesson 6: ..." or, if that is too long, "Lesson 6: ...".
- Name the actual topic from the text, briefly. Prefer the topic over generic words like Notes, Packet, Worksheet.
- If it is an answer key or has answers, end with " (Answers)".
- No file extension, quotes, emoji, dates or the class name unless the file is about the whole course.`;

function clean(title: string): string | null {
  const t = title.normalize("NFKC").replace(/[\u2010-\u2013]/g, "-").replace(/["“”'`]/g, "").replace(/\.(pdf|docx?|txt|md)$/i, "").replace(/\s+/g, " ").trim();
  return t.length >= MIN && t.length <= MAX ? t : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);

  const { source_id } = await req.json().catch(() => ({}));
  if (typeof source_id !== "string") return json(req, { error: "source_id_required" }, 400);

  // RLS: only the owner's source and pages are visible here.
  const { data: source } = await student.db.from("sources").select("id, filename, original_filename, subject_id").eq("id", source_id).maybeSingle();
  if (!source) return json(req, { error: "not_found" }, 404);
  const [{ data: subject }, { data: pages }] = await Promise.all([
    student.db.from("subjects").select("name").eq("id", source.subject_id).maybeSingle(),
    student.db.from("source_pages").select("text").eq("source_id", source_id).order("page_no").limit(2),
  ]);
  const excerpt = (pages ?? []).map((p) => p.text).join("\n\n").slice(0, 2500);

  try {
    const out = await llmJson<{ title: string }>({
      model: LLM_FAST_MODEL,
      effort: "light",
      schemaName: "source_title",
      schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Original name: ${source.original_filename ?? source.filename}\nCleaned name: ${source.filename}\nClass: ${subject?.name ?? "unknown"}\n\nStart of the text:\n${excerpt || "(no text)"}`,
        },
      ],
      maxTokens: 200,
      timeoutMs: 20_000,
    });
    const title = clean(out.title);
    if (!title) return json(req, { title: source.filename, changed: false });
    if (title !== source.filename) {
      const { error } = await student.db.from("sources").update({ filename: title }).eq("id", source_id);
      if (error) throw error;
    }
    return json(req, { title, changed: title !== source.filename });
  } catch (e) {
    // The cleaned title stays; naming is a nicety, never a failure the student sees.
    console.error("title-source", e instanceof Error ? e.message : e);
    return json(req, { title: source.filename, changed: false });
  }
});
