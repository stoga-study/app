// Grades a typed answer to one of the student's flashcards: right, partly or not yet, with what was
// missing. Uses the student's own key when they have one; otherwise a daily limit keeps costs safe.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { ownProvider } from "../_lib/byok.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { cleanGrade, DAILY_GRADES, GRADE_SCHEMA, GRADE_SYSTEM, gradeMessage, MAX_ANSWER, type Grade } from "../_lib/grade.ts";
import { LLM_FAST_MODEL, llmJson, setUsageLogger } from "../_lib/llm.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);

  const body = await req.json().catch(() => ({}));
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (typeof body.card_id !== "string") return json(req, { error: "card_id_required" }, 400);
  if (!answer) return json(req, cleanGrade({ verdict: "not_yet", feedback: "Give it a try, even a few words. Then we can check it.", missing: [] }));
  if (answer.length > MAX_ANSWER) return json(req, { error: "too_long" }, 400);

  // Row-level security: only the student's own card (and its page) is visible here.
  const { data: card } = await student.db.from("cards").select("id, front, back, source_id, pages").eq("id", body.card_id).maybeSingle();
  if (!card) return json(req, { error: "not_found" }, 404);

  const own = await ownProvider(admin, student.userId);
  if (!own) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", student.userId).eq("feature", "grade_answer").gte("created_at", today.toISOString());
    if ((count ?? 0) >= DAILY_GRADES) return json(req, { error: "grade_limit", limit: DAILY_GRADES }, 429);
  }

  let page: string | null = null;
  if (card.source_id && card.pages?.length) {
    const { data } = await student.db.from("source_pages").select("text").eq("source_id", card.source_id).in("page_no", card.pages.slice(0, 2)).order("page_no");
    page = (data ?? []).map((p) => p.text).join("\n\n") || null;
  }

  try {
    const out = await llmJson<Grade>({
      model: LLM_FAST_MODEL,
      own,
      effort: "light",
      schemaName: "grade",
      schema: GRADE_SCHEMA,
      messages: [{ role: "system", content: GRADE_SYSTEM }, { role: "user", content: gradeMessage({ front: card.front, back: card.back, answer, page }) }],
      maxTokens: 400,
      timeoutMs: 20_000,
      usage: { feature: "grade_answer", userId: student.userId, byok: !!own },
    });
    return json(req, cleanGrade(out));
  } catch (e) {
    const err = e as { kind?: string };
    const code = own && (err.kind === "auth" || err.kind === "quota") ? "key_invalid" : err.kind === "rate_limit" ? "busy" : "unavailable";
    return json(req, { error: code }, 503);
  }
});
