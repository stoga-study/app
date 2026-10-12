// Builds a study set (notes, flashcards, practice quiz, study guide) from an uploaded source.
//
// POST { source_id }                          as the student: start, or resume after a failure.
// POST { source_id, user_id, task, attempt }  internal (service key): run one job, then start the next.
//
// Work runs as a chain of small jobs, one chunk of pages each, in the background. The student can
// leave the screen; progress is saved on the source row and streamed to the app.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { llmJson, LLMError } from "../_lib/llm.ts";
import {
  CARDS_SCHEMA, cardsPrompt, chunkPages, GUIDE_SCHEMA, guidePrompt, NOTES_SCHEMA, notesDigest, notesPrompt,
  QUIZ_SCHEMA, quizPrompt, tagged, validCards, validGuide, validNotes, validQuiz,
  type CardsOut, type GuideOut, type NotesOut, type Page, type QuizOut,
} from "../_lib/study.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });
const MAX_ATTEMPTS = 4;
// Rate limits get patient retries that honour retry-after.
const MAX_RATE_LIMIT_ATTEMPTS = 10;

type Task = { kind: "notes" | "cards"; part: number } | { kind: "quiz" | "guide" };
type Progress = { done: number; total: number };
type Steps = { notes: Progress; cards: Progress; quiz: Progress; guide: Progress; next: number; failed?: string };

function plan(chunks: number): Task[] {
  return [
    ...Array.from({ length: chunks }, (_, part) => ({ kind: "notes" as const, part })),
    ...Array.from({ length: chunks }, (_, part) => ({ kind: "cards" as const, part })),
    { kind: "quiz" },
    { kind: "guide" },
  ];
}

const freshSteps = (chunks: number): Steps => ({
  notes: { done: 0, total: chunks }, cards: { done: 0, total: chunks }, quiz: { done: 0, total: 1 }, guide: { done: 0, total: 1 }, next: 0,
});

async function loadPages(sourceId: string): Promise<Page[]> {
  const { data, error } = await admin.from("source_pages").select("page_no, text").eq("source_id", sourceId).order("page_no");
  if (error) throw error;
  return data ?? [];
}

async function dispatch(body: Record<string, unknown>) {
  const res = await fetch(`${URL_}/functions/v1/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`dispatch failed: ${res.status}`);
}

async function runTask(sourceId: string, userId: string, index: number, attempt: number) {
  const { data: source } = await admin.from("sources").select("*").eq("id", sourceId).eq("user_id", userId).maybeSingle();
  if (!source || source.status !== "generating") return; // deleted, finished, or cancelled
  const steps = source.steps as Steps;
  const pages = await loadPages(sourceId);
  const chunks = chunkPages(pages);
  const tasks = plan(chunks.length);
  const task = tasks[index];
  if (!task) {
    await admin.from("sources").update({ status: "ready" }).eq("id", sourceId);
    return;
  }

  const word = source.kind === "pdf" ? "page" : "part";
  const valid = new Set(pages.map((p) => p.page_no));
  // Students on the Independent plan generate with their own key.
  const { data: ownKey } = await admin.rpc("read_api_key", { p_user: userId });
  const apiKey = typeof ownKey === "string" && ownKey ? ownKey : undefined;

  try {
    if (task.kind === "notes") {
      const chunk = chunks[task.part];
      const out = await llmJson<NotesOut>({
        schemaName: "notes", schema: NOTES_SCHEMA, apiKey, maxTokens: 4096, effort: "normal",
        messages: [{ role: "system", content: notesPrompt(word) }, { role: "user", content: tagged(chunk.pages, word) }],
      });
      const rows = validNotes(out, valid);
      await admin.from("notes_sections").delete().eq("source_id", sourceId).eq("gen_part", task.part);
      if (rows.length) {
        const { error } = await admin.from("notes_sections").insert(
          rows.map((r, i) => ({ ...r, user_id: userId, source_id: sourceId, gen_part: task.part, position: task.part * 100 + i })),
        );
        if (error) throw error;
      }
    } else if (task.kind === "cards") {
      const chunk = chunks[task.part];
      const chars = chunk.pages.reduce((n, p) => n + p.text.length, 0);
      const target = Math.max(6, Math.min(20, Math.round(chars / 450)));
      const out = await llmJson<CardsOut>({
        schemaName: "cards", schema: CARDS_SCHEMA, apiKey, maxTokens: 4096, effort: "normal",
        messages: [{ role: "system", content: cardsPrompt(word, target) }, { role: "user", content: tagged(chunk.pages, word) }],
      });
      const rows = validCards(out, valid);
      await admin.from("cards").delete().eq("source_id", sourceId).eq("gen_part", task.part).eq("edited", false);
      if (rows.length) {
        const { error } = await admin.from("cards").insert(
          rows.map((r) => ({ ...r, user_id: userId, subject_id: source.subject_id, source_id: sourceId, gen_part: task.part })),
        );
        if (error) throw error;
      }
    } else {
      const { data: notes } = await admin.from("notes_sections").select("title, body_md, pages").eq("source_id", sourceId).order("position");
      const digest = notesDigest(notes ?? [], word);
      if (digest) {
        if (task.kind === "quiz") {
          const out = validQuiz(await llmJson<QuizOut>({
            schemaName: "quiz", schema: QUIZ_SCHEMA, apiKey, maxTokens: 6000, effort: "deep", timeoutMs: 120_000,
            messages: [{ role: "system", content: quizPrompt(word) }, { role: "user", content: digest }],
          }), valid);
          if (out.questions.length < 3) throw new Error("too few valid quiz questions");
          await admin.from("quizzes").delete().eq("source_id", sourceId);
          const { data: quiz, error } = await admin.from("quizzes")
            .insert({ user_id: userId, subject_id: source.subject_id, source_id: sourceId, title: out.title }).select("id").single();
          if (error) throw error;
          const { error: qErr } = await admin.from("quiz_questions").insert(
            out.questions.map((q, i) => ({ ...q, user_id: userId, quiz_id: quiz.id, position: i })),
          );
          if (qErr) throw qErr;
        } else {
          const rows = validGuide(await llmJson<GuideOut>({
            schemaName: "guide", schema: GUIDE_SCHEMA, apiKey, maxTokens: 8000, effort: "deep", timeoutMs: 120_000,
            messages: [{ role: "system", content: guidePrompt(word) }, { role: "user", content: digest }],
          }), valid);
          await admin.from("guide_sections").delete().eq("source_id", sourceId);
          if (rows.length) {
            const { error } = await admin.from("guide_sections").insert(
              rows.map((r, i) => ({ ...r, user_id: userId, source_id: sourceId, position: i })),
            );
            if (error) throw error;
          }
        }
      }
    }

    const next: Steps = { ...steps, [task.kind]: { ...steps[task.kind], done: steps[task.kind].done + 1 }, next: index + 1 };
    delete next.failed;
    const last = index + 1 >= tasks.length;
    await admin.from("sources").update({ steps: next, status: last ? "ready" : "generating" }).eq("id", sourceId);
    if (!last) await dispatch({ source_id: sourceId, user_id: userId, task: index + 1, attempt: 0 });
  } catch (e) {
    const status = e instanceof LLMError ? e.status : 0;
    const outOfCredit = e instanceof LLMError && e.kind === "quota";
    console.error("generate", sourceId, task.kind, attempt, status, e instanceof Error ? e.message : e);
    const limited = status === 429 && !outOfCredit;
    if (attempt + 1 < (limited ? MAX_RATE_LIMIT_ATTEMPTS : MAX_ATTEMPTS) && status !== 401 && !outOfCredit) {
      const wait = limited ? Math.min(60, Math.max(5, (e as LLMError).retryAfter ?? 15)) : [3, 8, 15][Math.min(attempt, 2)];
      await new Promise((r) => setTimeout(r, wait * 1000));
      await dispatch({ source_id: sourceId, user_id: userId, task: index, attempt: attempt + 1 });
      return;
    }
    // Out of retries: stop here. "Try again" resumes from this job, keeping everything already made.
    await admin.from("sources")
      .update({ status: "failed", error_code: status === 401 ? "key_invalid" : status === 429 ? "rate_limited" : "generation_failed", steps: { ...steps, failed: task.kind } })
      .eq("id", sourceId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));

  // Internal job from the chain.
  if (req.headers.get("Authorization") === `Bearer ${SERVICE_KEY}`) {
    const { source_id, user_id, task, attempt } = body;
    if (typeof source_id !== "string" || typeof user_id !== "string" || !Number.isInteger(task)) return json(req, { error: "bad_job" }, 400);
    EdgeRuntime.waitUntil(runTask(source_id, user_id, task, Number(attempt) || 0));
    return json(req, { accepted: true }, 202);
  }

  // A student starting (or resuming) their own source.
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  if (typeof body.source_id !== "string") return json(req, { error: "source_id_required" }, 400);
  const { data: source } = await student.db.from("sources").select("id, status, steps").eq("id", body.source_id).maybeSingle();
  if (!source) return json(req, { error: "not_found" }, 404);
  if (source.status === "generating" || source.status === "ready") return json(req, { status: source.status });
  if (source.status !== "ready_text" && source.status !== "failed") return json(req, { error: "not_ready" }, 409);

  const resume = source.status === "failed" && (source.steps as Steps)?.next !== undefined;
  const steps = resume ? { ...(source.steps as Steps), failed: undefined } : freshSteps(chunkPages(await loadPages(source.id)).length);
  // Claim the source atomically, so a double tap cannot start two chains.
  const { data: claimed } = await student.db.from("sources")
    .update({ status: "generating", error_code: null, steps })
    .eq("id", source.id).in("status", ["ready_text", "failed"]).select("id");
  if (!claimed?.length) return json(req, { status: "generating" });

  EdgeRuntime.waitUntil(dispatch({ source_id: source.id, user_id: student.userId, task: steps.next, attempt: 0 }));
  return json(req, { status: "generating" }, 202);
});
