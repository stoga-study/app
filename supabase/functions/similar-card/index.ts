// "Give me one like this": one new flashcard that tests the same idea as a given card, with different
// numbers or wording, so a student who just got one right (or wrong) can try a fresh variant right away.
// POST { card_id }  →  { card }   a new card row, ready to practise
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { ownProvider } from "../_lib/byok.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { cleanText } from "../_lib/study.ts";
import { LLM_FAST_MODEL, llmJson, setUsageLogger } from "../_lib/llm.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));

/** A day per student on the platform key, same scale as AI grading. Students with their own key are not limited. */
const DAILY_SIMILAR = 150;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["front", "back"],
  properties: { front: { type: "string" }, back: { type: "string" } },
};

const SYSTEM = `Make ONE new flashcard that tests the same idea as the one given, for a high school student, but it must not be the same question: change the numbers, the example or the wording.
- front: a clear question or problem, the same difficulty and format as the given one (if it has numbers, use different ones).
- back: a short, complete answer (one or two sentences, or a formula or number).
- If page text is given, stay consistent with it; you may invent realistic specifics the page does not cover only when the idea calls for it (e.g. new numbers for the same formula).
Plain text. Write math with Unicode symbols (×, ÷, √, ², ½, π), never LaTeX.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);

  const body = await req.json().catch(() => ({}));
  if (typeof body.card_id !== "string") return json(req, { error: "card_id_required" }, 400);
  const { data: card } = await student.db.from("cards").select("front, back, subject_id, source_id, pages").eq("id", body.card_id).maybeSingle();
  if (!card) return json(req, { error: "not_found" }, 404);

  const own = await ownProvider(admin, student.userId);
  if (!own) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", student.userId).eq("feature", "similar_card").gte("created_at", today.toISOString());
    if ((count ?? 0) >= DAILY_SIMILAR) return json(req, { error: "limit", limit: DAILY_SIMILAR }, 429);
  }

  let page: string | null = null;
  if (card.source_id && card.pages?.length) {
    const { data } = await student.db.from("source_pages").select("text").eq("source_id", card.source_id).in("page_no", card.pages.slice(0, 2)).order("page_no");
    page = (data ?? []).map((p) => p.text).join("\n\n") || null;
  }

  try {
    const out = await llmJson<{ front: string; back: string }>({
      model: LLM_FAST_MODEL,
      own,
      effort: "light",
      schemaName: "similar_card",
      schema: SCHEMA,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Question: ${card.front}\nAnswer: ${card.back}${page ? `\n\nFrom the page it came from:\n${page.slice(0, 2500)}` : ""}` },
      ],
      maxTokens: 500,
      timeoutMs: 20_000,
      usage: { feature: "similar_card", userId: student.userId, byok: !!own },
    });
    const front = cleanText(out.front, 300), back = cleanText(out.back, 600);
    if (!front || !back) return json(req, { error: "generation_failed" }, 502);
    // Not tied into generation runs (gen_part null) and marked edited so it never joins a shared snapshot.
    const { data: inserted, error } = await student.db.from("cards")
      .insert({ subject_id: card.subject_id, source_id: card.source_id, pages: card.pages, front, back, edited: true })
      .select("id, subject_id, source_id, front, back, pages, quote, edited, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, tags, created_at, sources(kind, unit_id)")
      .single();
    if (error) throw error;
    return json(req, { card: inserted });
  } catch (e) {
    console.error("similar-card", e instanceof Error ? e.message : e);
    const err = e as { kind?: string };
    const code = own && (err.kind === "auth" || err.kind === "quota") ? "key_invalid" : err.kind === "rate_limit" ? "busy" : "unavailable";
    return json(req, { error: code }, 503);
  }
});
