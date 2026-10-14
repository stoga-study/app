// AI helpers for a student's own notes: Tidy (clean up structure and wording, keep their content),
// Fill gaps (facts the linked file covers that the notes don't, each with its page) and Make cards
// (flashcards from what the notes already say). Tidy and Fill gaps only return a suggestion; the
// student applies it themselves by saving the note as usual. Make cards inserts real cards.
//
// POST { note_id, action: "tidy" }        → { body }
// POST { note_id, action: "fill_gaps" }   → { additions: { text, page }[] }
// POST { note_id, action: "make_cards" }  → { cards: { id, front, back }[] }
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { ownProvider } from "../_lib/byok.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { LLM_FAST_MODEL, llmJson, setUsageLogger } from "../_lib/llm.ts";
import { CARDS_SCHEMA, cleanText, tagged, validCards, type CardsOut } from "../_lib/study.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));

/** A day per student on the platform key, same scale as AI grading. Students with their own key are not limited. */
const DAILY_ASSIST = 100;
const MAX_BODY = 20_000;

const TIDY_SCHEMA = { type: "object", additionalProperties: false, required: ["body"], properties: { body: { type: "string" } } };
const TIDY_SYSTEM = `Tidy this student's own notes: fix structure, grammar and formatting, group scattered points under clear headings, merge true duplicates. Keep every fact, opinion and specific wording choice that matters to them: you are editing for clarity, never rewriting their ideas, changing their meaning, or adding anything they did not write.
Plain text markdown: "## " headings, "- " bullets, **bold** for key terms. No code fences. Write math in plain text with Unicode symbols, never LaTeX.`;

const GAPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["additions"],
  properties: {
    additions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text", "page"], properties: { text: { type: "string" }, page: { type: "integer" } } },
    },
  },
};
type GapsOut = { additions: { text: string; page: number }[] };
const gapsSystem = (word: string) => `Compare this student's own notes to the ${word}s of the file they came from.
Find up to 5 specific facts, definitions, formulas or steps the file covers that the notes do not mention at all, and that are worth having alongside what is already there. Skip anything already in the notes, even if worded differently; skip anything minor.
- text: one short, bullet-ready sentence, in your own words, grounded only in the file.
- page: the ${word} it came from.
Return fewer than 5, or none, when the notes already cover the file well.`;

const MAX_CARDS = 8;
const makeCardsSystem = (target: number) => `Make up to ${target} flashcards from this student's own notes, one idea per card.
- front: a clear question or term.
- back: a short, complete answer (one or two sentences, or a formula).
- Only test what the notes actually say. No duplicates, and the answer must not appear in the question.
- pages: always an empty array (these notes are not tied to file pages).
Plain text. Write math with Unicode symbols, never LaTeX. Make fewer than ${target} if the notes do not have that many distinct ideas.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (!["tidy", "fill_gaps", "make_cards"].includes(action)) return json(req, { error: "bad_action" }, 400);
  if (typeof body.note_id !== "string") return json(req, { error: "note_id_required" }, 400);
  const { data: note } = await student.db.from("student_notes").select("title, body, subject_id, source_id").eq("id", body.note_id).maybeSingle();
  if (!note) return json(req, { error: "not_found" }, 404);
  const text = cleanText(note.body, MAX_BODY);
  if (!text) return json(req, { error: "empty_note" }, 400);
  if (action === "fill_gaps" && !note.source_id) return json(req, { error: "no_file" }, 400);

  const own = await ownProvider(admin, student.userId);
  if (!own) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", student.userId).eq("feature", "notes_assist").gte("created_at", today.toISOString());
    if ((count ?? 0) >= DAILY_ASSIST) return json(req, { error: "limit", limit: DAILY_ASSIST }, 429);
  }
  const usage = { feature: "notes_assist", userId: student.userId, byok: !!own };

  try {
    if (action === "tidy") {
      const out = await llmJson<{ body: string }>({
        schemaName: "tidy", schema: TIDY_SCHEMA, own, effort: "normal", maxTokens: Math.min(6000, text.length + 1000), timeoutMs: 40_000,
        messages: [{ role: "system", content: TIDY_SYSTEM }, { role: "user", content: `Title: ${note.title || "Untitled"}\n\n${text}` }],
        usage,
      });
      const tidied = cleanText(out.body, MAX_BODY);
      if (!tidied) return json(req, { error: "generation_failed" }, 502);
      return json(req, { body: tidied });
    }

    if (action === "fill_gaps") {
      const { data: src } = await student.db.from("sources").select("kind, page_count").eq("id", note.source_id!).maybeSingle();
      const { data: pages } = await student.db.from("source_pages").select("page_no, text").eq("source_id", note.source_id!).order("page_no");
      if (!pages?.length) return json(req, { error: "no_file" }, 400);
      const word = src?.kind === "pdf" || src?.kind === "image" ? "page" : src?.kind === "pptx" ? "slide" : "part";
      const valid = new Set(pages.map((p) => p.page_no));
      const out = await llmJson<GapsOut>({
        schemaName: "gaps", schema: GAPS_SCHEMA, own, effort: "normal", maxTokens: 1200, timeoutMs: 40_000,
        messages: [{ role: "system", content: gapsSystem(word) }, { role: "user", content: `My notes:\n${text}\n\n---\nThe file:\n${tagged(pages, word).slice(0, 16_000)}` }],
        usage,
      });
      const additions = (out.additions ?? [])
        .map((a) => ({ text: cleanText(a.text, 400), page: a.page }))
        .filter((a) => a.text && valid.has(a.page))
        .slice(0, 5);
      return json(req, { additions, word });
    }

    // make_cards
    const target = Math.min(MAX_CARDS, Math.max(3, Math.round(text.length / 350)));
    const out = validCards(
      await llmJson<CardsOut>({
        schemaName: "cards", schema: CARDS_SCHEMA, own, effort: "normal", maxTokens: Math.min(6000, 150 * target + 600), timeoutMs: 40_000,
        messages: [{ role: "system", content: makeCardsSystem(target) }, { role: "user", content: text }],
        usage,
      }),
      new Set(),
    ).slice(0, target);
    if (!out.length) return json(req, { error: "generation_failed" }, 502);
    const { data: cards, error } = await student.db.from("cards")
      .insert(out.map((c) => ({ subject_id: note.subject_id, source_id: note.source_id, front: c.front, back: c.back, edited: true })))
      .select("id, front, back");
    if (error) throw error;
    return json(req, { cards });
  } catch (e) {
    console.error("notes-assist", action, e instanceof Error ? e.message : e);
    const err = e as { kind?: string };
    const code = own && (err.kind === "auth" || err.kind === "quota") ? "key_invalid" : err.kind === "rate_limit" ? "busy" : "unavailable";
    return json(req, { error: code }, 503);
  }
});
