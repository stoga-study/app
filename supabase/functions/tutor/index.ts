// The Stoga.study tutor: hint-first answers grounded in the student's own pages, streamed as SSE.
//
// POST { subject_id, question, hint_level: 1|2|3, thread_id?, followup? }  → text/event-stream
//   events: meta { thread_id, sources, uncovered } · mode { mode } · delta { text } · done { message_id, content, citations, mode } · error { error }
//   Each new message is routed to a mode first (chat, explain, hint or check); ladder buttons are always "hint".
// POST { mode: "card", message_id }  → { card }   turn a tutor answer into a flashcard
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { LLM_FAST_MODEL, llmJson, llmStream, LLMError, recordUsage, setUsageLogger, type Effort, type OwnProvider } from "../_lib/llm.ts";
import { ownProvider } from "../_lib/byok.ts";
import { cleanText } from "../_lib/study.ts";
import { HINT_JUDGE_SCHEMA, hintJudgeMessages, hintRewrite, asksForCode, asksForGradedWork, checkCitations, CODE_FALLBACK, CODE_FIX, hasCode, isCodeClass, withoutCode, CRISIS_LINE, givingAwayPhrases, GRADED_FALLBACK, GRADED_FIX, GRADED_LIMIT, guessMode, hintFix, MODES, obviousMode, phrasesUsed, ROUTER_SCHEMA, safeHint, wellbeing, routerMessages, searchTerms, systemPrompt, userTurn, wordCount, type Depth, type Mode, type Src, type Turn } from "../_lib/tutor.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
setUsageLogger((row) => admin.from("ai_usage").insert(row));
const MAX_Q = 2000;
const MAX_PAGES = 6;

type Scope = { sourceId: string | null; unitId: string | null };

/** Rank the subject's pages for these words (any of them), as the student, so RLS applies. Narrowed to
 * one file or one unit when the conversation is scoped to it. */
/** Read an OpenAI-style SSE answer to the end, passing each piece of text to `onDelta` as it arrives. */
// deno-lint-ignore no-explicit-any
async function readAnswer(res: Response, onDelta?: (text: string) => void): Promise<{ text: string; usage: any }> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", text = "";
  // deno-lint-ignore no-explicit-any
  let usage: any = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      const chunk = JSON.parse(payload);
      if (chunk?.usage) usage = chunk.usage;
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta !== "string" || !delta) continue;
      text += delta;
      onDelta?.(delta);
    }
  }
  return { text, usage };
}

async function retrieve(db: SupabaseClient, subjectId: string, words: string[], scope: Scope) {
  if (!words.length) return [];
  const { data, error } = await db.rpc("search_pages", {
    p_subject: subjectId, p_query: words.join(" or "), p_limit: MAX_PAGES, p_source_id: scope.sourceId ?? undefined, p_unit_id: scope.unitId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []) as { source_id: string; filename: string; page_no: number; text: string; rank: number }[];
}

/** Rank the student's own notes the same way, as a second kind of "source": their own words, not a file. */
async function retrieveNotes(db: SupabaseClient, subjectId: string, words: string[], scope: Scope) {
  if (!words.length) return [];
  // "or", not a plain join: websearch_to_tsquery ANDs bare words, and a note matching some but not
  // all of them (the usual case) would otherwise never match, the same reason search_pages does this.
  let q = db.from("student_notes").select("id, title, body").eq("subject_id", subjectId).textSearch("search", words.join(" or "), { type: "websearch", config: "english" });
  if (scope.sourceId) q = q.eq("source_id", scope.sourceId);
  if (scope.unitId) q = q.eq("unit_id", scope.unitId);
  const { data, error } = await q.limit(3);
  if (error) throw error;
  // Reuses the page-hit shape (page_no fixed at 1: a note has no pages), so it flows through the same pipeline.
  return (data ?? []).filter((n) => n.body.trim()).map((n) => ({ source_id: n.id, filename: n.title.trim() || "Untitled note", page_no: 1, text: n.body, rank: 1 }));
}

/** The exact pages a card or quiz question cites, not a search: "Explain this" must be grounded in them. */
async function retrieveExact(db: SupabaseClient, sourceId: string, pages: number[]) {
  const { data: src } = await db.from("sources").select("filename").eq("id", sourceId).maybeSingle();
  if (!src || !pages.length) return [];
  const { data } = await db.from("source_pages").select("page_no, text").eq("source_id", sourceId).in("page_no", pages.slice(0, 4)).order("page_no");
  return (data ?? []).map((p) => ({ source_id: sourceId, filename: src.filename, page_no: p.page_no, text: p.text, rank: 1 }));
}

type ExplainContext = { kind: "card" | "quiz_question"; id: string };

/** Turns a card or a missed quiz question into a question for the tutor, grounded in its own pages. */
async function contextQuestion(db: SupabaseClient, ctx: ExplainContext) {
  if (ctx.kind === "card") {
    const { data } = await db.from("cards").select("front, back, source_id, pages").eq("id", ctx.id).maybeSingle();
    if (!data) return null;
    return {
      llmText: `Help me understand this flashcard, not just repeat the answer.\nQuestion: ${data.front}\nAnswer: ${data.back}`,
      display: `Explain: ${data.front}`,
      title: data.front.slice(0, 80),
      sourceId: data.source_id,
      pages: data.pages ?? [],
    };
  }
  const { data } = await db.from("quiz_questions").select("prompt, options, answer_index, explanation, pages, quizzes(source_id)").eq("id", ctx.id).maybeSingle();
  if (!data) return null;
  const options = (data.options as string[]) ?? [];
  const correct = options[data.answer_index] ?? "";
  const sourceId = (data.quizzes as unknown as { source_id: string | null } | null)?.source_id ?? null;
  return {
    llmText: `Help me understand this quiz question I got wrong, so I get the idea, not just this one answer.\nQuestion: ${data.prompt}\nOptions: ${options.map((o, i) => `${"ABCD"[i]}) ${o}`).join(" ")}\nThe correct answer: ${correct}\nGiven reason: ${data.explanation}`,
    display: `Explain: ${data.prompt}`,
    title: data.prompt.slice(0, 80),
    sourceId,
    pages: data.pages ?? [],
  };
}

/** Section titles from the subject's study sets, so the tutor knows what the student has uploaded. */
async function noteTopics(db: SupabaseClient, subjectId: string) {
  const { data: srcs } = await db.from("sources").select("id").eq("subject_id", subjectId).eq("status", "ready").eq("archived", false).order("created_at", { ascending: false }).limit(10);
  if (!srcs?.length) return [];
  const { data } = await db.from("notes_sections").select("title").in("source_id", srcs.map((s) => s.id)).order("position").limit(40);
  return [...new Set((data ?? []).map((n) => String(n.title).trim()))].slice(0, 25);
}


/** Pick the reply mode with the fast model; fall back to rules if it fails or is slow. */
async function route(history: Turn[], message: string, own: OwnProvider | undefined, userId: string): Promise<Mode> {
  const lastMode = [...history].reverse().find((t) => t.role === "assistant")?.mode;
  const obvious = obviousMode(message, lastMode);
  if (obvious) return obvious;
  try {
    const out = await llmJson<{ mode: Mode }>({ model: LLM_FAST_MODEL, schemaName: "route", schema: ROUTER_SCHEMA, messages: routerMessages(history, message), effort: "light", maxTokens: 50, timeoutMs: 8000, own, noRetry: true, usage: { feature: "tutor_route", userId, byok: !!own } });
    if (["chat", "explain", "hint", "check"].includes(out.mode)) return out.mode;
  } catch (e) {
    console.error("tutor route", e instanceof Error ? e.message.slice(0, 200) : e);
  }
  return guessMode(message, lastMode);
}

async function makeCard(req: Request, student: { db: SupabaseClient; userId: string }, messageId: string) {
  const { data: msg } = await student.db.from("chat_messages").select("id, thread_id, content, citations, role, created_at").eq("id", messageId).maybeSingle();
  if (!msg || msg.role !== "assistant") return json(req, { error: "not_found" }, 404);
  const [{ data: thread }, { data: prior }] = await Promise.all([
    student.db.from("chat_threads").select("subject_id").eq("id", msg.thread_id).single(),
    student.db.from("chat_messages").select("content").eq("thread_id", msg.thread_id).eq("role", "user").lte("created_at", msg.created_at).order("created_at", { ascending: false }).limit(1),
  ]);
  const out = await llmJson<{ front: string; back: string }>({
    effort: "light",
    ...(await ownProvider(admin, student.userId).then((own) => ({ own, usage: { feature: "tutor_card", userId: student.userId, byok: !!own } }))),
    schemaName: "card",
    schema: { type: "object", additionalProperties: false, required: ["front", "back"], properties: { front: { type: "string" }, back: { type: "string" } } },
    messages: [
      { role: "system", content: "Turn this tutoring exchange into one flashcard. Front: a clear question. Back: a short, complete answer (one or two sentences or a formula). Plain text, Unicode math, no LaTeX, no citations." },
      { role: "user", content: `Student asked: ${prior?.[0]?.content ?? ""}\n\nTutor answered: ${msg.content}` },
    ],
    maxTokens: 1024,
  });
  const front = cleanText(out.front, 300), back = cleanText(out.back, 600);
  if (!front || !back) return json(req, { error: "card_failed" }, 502);
  const cites = (msg.citations as { source_id: string; page: number }[]) ?? [];
  const sameSource = cites.length && cites.every((c) => c.source_id === cites[0].source_id);
  const { data: card, error } = await student.db.from("cards")
    .insert({ subject_id: thread!.subject_id, front, back, source_id: sameSource ? cites[0].source_id : null, pages: sameSource ? [...new Set(cites.map((c) => c.page))] : [] })
    .select("id, front, back").single();
  if (error) throw error;
  return json(req, { card });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));

  if (body.mode === "card") {
    try {
      return await makeCard(req, student, String(body.message_id ?? ""));
    } catch (e) {
      console.error("tutor card", e instanceof Error ? e.message : e);
      return json(req, { error: "card_failed" }, 502);
    }
  }

  if (typeof body.subject_id !== "string") return json(req, { error: "question_required" }, 400);
  const level = [1, 2, 3].includes(body.hint_level) ? body.hint_level : 1;
  const wantsContext = body.context && typeof body.context === "object" && ["card", "quiz_question"].includes(body.context.kind) && typeof body.context.id === "string";
  // "Simpler" or "Go deeper" on one answer, or "Show a worked example": re-ask the same question, in
  // the same mode, just styled differently (a worked example only makes sense while working a problem).
  const depthOverride: "simpler" | "deeper" | null = body.depth_override === "simpler" || body.depth_override === "deeper" ? body.depth_override : null;
  const wantsWorked = body.worked_example === true;
  const isRetry = !!depthOverride || wantsWorked;
  const retryMode: Mode | null = isRetry && MODES.includes(body.retry_mode) ? body.retry_mode : null;
  let question: string;
  let display: string | null = null;
  let threadTitle: string | null = null;
  let forcedMode: Mode | null = wantsWorked ? "hint" : retryMode;
  let explicitPages: { sourceId: string; pages: number[] } | null = null;
  if (wantsContext) {
    const ctx = await contextQuestion(student.db, body.context as ExplainContext);
    if (!ctx) return json(req, { error: "not_found" }, 404);
    question = ctx.llmText;
    display = ctx.display;
    threadTitle = ctx.title;
    forcedMode = "explain";
    if (ctx.sourceId && ctx.pages.length) explicitPages = { sourceId: ctx.sourceId, pages: ctx.pages };
  } else {
    question = cleanText(body.question, MAX_Q);
    if (!question) return json(req, { error: "question_required" }, 400);
  }
  const { data: subject } = await student.db.from("subjects").select("id, name").eq("id", body.subject_id).maybeSingle();
  if (!subject) return json(req, { error: "not_found" }, 404);

  // Allowance: one message per answer. Students with their own key are not limited.
  const own = await ownProvider(admin, student.userId);
  const { data: allowed, error: allowErr } = await admin.rpc("consume_allowance", { p_user: student.userId, p_kind: "tutor_message", p_byok: !!own });
  if (allowErr) return json(req, { error: "unavailable" }, 503);
  if (!allowed) {
    const { data: status } = await student.db.rpc("allowance_status");
    const row = (status ?? []).find((r: { kind: string }) => r.kind === "tutor_message");
    return json(req, { error: "limit", used: row?.used, limit: row?.limit, resets_at: row?.resets_at }, 429);
  }
  const refund = () => admin.rpc("refund_allowance", { p_user: student.userId, p_kind: "tutor_message" });

  try {
    // Thread, its scope (one file, one unit, or the whole class) and history.
    let threadId: string | null = typeof body.thread_id === "string" ? body.thread_id : null;
    let scope: Scope = { sourceId: null, unitId: null };
    if (threadId) {
      const { data: t } = await student.db.from("chat_threads").select("id, scope_source_id, scope_unit_id").eq("id", threadId).eq("subject_id", subject.id).maybeSingle();
      if (!t) threadId = null;
      else scope = { sourceId: t.scope_source_id, unitId: t.scope_unit_id };
    }
    if (!threadId) {
      // A new thread's scope comes from the client, and only from one place a student can actually open
      // a scoped chat from: a specific file or a specific unit, both still checked by row-level security.
      const wantsScope = body.scope && typeof body.scope === "object";
      const scopeSourceId = wantsScope && typeof body.scope.source_id === "string" ? body.scope.source_id : null;
      const scopeUnitId = !scopeSourceId && wantsScope && typeof body.scope.unit_id === "string" ? body.scope.unit_id : null;
      const { data: t, error } = await student.db.from("chat_threads")
        .insert({ subject_id: subject.id, title: threadTitle ?? question.slice(0, 80), scope_source_id: scopeSourceId, scope_unit_id: scopeUnitId })
        .select("id, scope_source_id, scope_unit_id").single();
      if (error) throw error;
      threadId = t.id;
      scope = { sourceId: t.scope_source_id, unitId: t.scope_unit_id };
    }
    // "Explain this" already grounds in its own exact pages; a scope would only narrow that further for no reason.
    if (explicitPages) scope = { sourceId: null, unitId: null };
    const { data: recent } = await student.db.from("chat_messages").select("role, content, mode").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(10);
    const history = ((recent ?? []) as Turn[]).reverse();

    // Sources: the student's uploaded pages, and their own notes, both searched the same way.
    const previous = [...history].reverse().find((m) => m.role === "user" && m.content !== question)?.content ?? null;
    const feeling = body.followup || isRetry ? null : wellbeing(question);
    const [pageHits, noteHits, topics, routed, profileRow] = await Promise.all([
      explicitPages ? retrieveExact(student.db, explicitPages.sourceId, explicitPages.pages) : retrieve(student.db, subject.id, searchTerms(question, previous), scope),
      explicitPages ? Promise.resolve([]) : retrieveNotes(student.db, subject.id, searchTerms(question, previous), scope),
      noteTopics(student.db, subject.id),
      forcedMode ? Promise.resolve(forcedMode) : body.followup ? Promise.resolve<Mode>("hint") : route(history, question, own, student.userId),
      depthOverride ? Promise.resolve(null) : student.db.from("profiles").select("tutor_depth").maybeSingle(),
    ]);
    // A student who may be in crisis gets a caring reply, not schoolwork.
    const mode: Mode = feeling === "crisis" ? "chat" : routed;
    const depth: Depth = depthOverride === "simpler" ? "simple" : depthOverride === "deeper" ? "deep" : (profileRow?.data?.tutor_depth as Depth | undefined) ?? "standard";
    const ownNoteIds = new Set(noteHits.map((h) => h.source_id));
    const sources: Src[] = [];
    const blocks: string[] = [];
    for (const h of [...pageHits, ...noteHits]) {
      let s = sources.find((x) => x.source_id === h.source_id);
      if (!s) {
        s = { key: `S${sources.length + 1}`, source_id: h.source_id, filename: h.filename, kind: ownNoteIds.has(h.source_id) ? "note" : "pdf", pages: [] };
        sources.push(s);
      }
      s.pages.push(h.page_no);
      blocks.push(`[${s.key} p.${h.page_no}] (${ownNoteIds.has(h.source_id) ? `from your own notes: ${h.filename}` : h.filename})\n${h.text.slice(0, 2500)}`);
    }
    const fileSources = sources.filter((s) => !ownNoteIds.has(s.source_id));
    if (fileSources.length) {
      const { data: kinds } = await student.db.from("sources").select("id, kind").in("id", fileSources.map((s) => s.source_id));
      for (const k of kinds ?? []) { const s = sources.find((x) => x.source_id === k.id); if (s) s.kind = k.kind; }
    }

    const messages = [
      { role: "system", content: systemPrompt({ mode, level, className: subject.name, hasSources: sources.length > 0, topics, feeling, depth, workedExample: wantsWorked }) },
      // Earlier citation markers are dropped: S1 may mean a different file in this turn.
      ...history.map((m) => ({ role: m.role, content: m.content.replace(/\s*(\[S\d+[^\]]*\]|【[^】]*】)/g, "") })),
      { role: "user", content: userTurn(blocks, question, depthOverride ?? (wantsWorked ? "worked" : body.followup ? (level === 3 ? 3 : 2) : false)) },
    ];

    // Guarded turns (see _lib/tutor.ts): the answer is checked before the student sees it.
    const gradedWork = feeling !== "crisis" && asksForGradedWork(question);
    const problemText = body.followup ? [...history].reverse().find((t) => t.role === "user" && givingAwayPhrases(t.content).length)?.content ?? question : question;
    const banned = mode === "hint" && level < 3 && !wantsWorked ? givingAwayPhrases(problemText) : [];
    const codeClass = isCodeClass(subject.name);
    const codeAsked = !codeClass && asksForCode(question);
    const guarded = gradedWork || codeAsked || banned.length > 0;

    // Small talk is quick; a full worked explanation gets more thinking.
    const effort: Effort = feeling === "crisis" ? "normal" : mode === "chat" ? "light" : mode === "hint" && level === 3 ? "deep" : "normal";
    let res: Response;
    let model: string;
    try {
      ({ res, model } = await llmStream({ messages: messages as { role: "system" | "user" | "assistant"; content: string }[], effort, maxTokens: mode === "chat" ? 300 : 1200, own }));
    } catch (e) {
      await refund();
      const err = e instanceof LLMError ? e : null;
      console.error("tutor llm", err?.status, err?.message.slice(0, 200));
      const code = err?.kind === "auth" || (own && err?.kind === "quota") ? (own ? "key_invalid" : "unavailable") : err?.kind === "rate_limit" ? "busy" : "unavailable";
      return json(req, { error: code, retry_after: err?.retryAfter }, code === "busy" ? 503 : 502);
    }
    // Saved only once the answer is on its way, so a retry after "busy" does not repeat the question.
    let askedId: string | null = null;
    if (!body.followup && !isRetry) {
      const { data: asked } = await student.db.from("chat_messages").insert({ thread_id: threadId, role: "user", content: display ?? question }).select("id").single();
      askedId = asked?.id ?? null;
    }

    const enc = new TextEncoder();
    const send = (c: ReadableStreamDefaultController, event: string, data: unknown) => c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    const publicSources = sources.map(({ key, source_id, filename, kind, pages }) => ({ key, source_id, filename, kind, pages }));
    const stream = new ReadableStream({
      async start(controller) {
        send(controller, "meta", { thread_id: threadId, sources: publicSources, uncovered: sources.length === 0, model });
        send(controller, "mode", { mode });
        let full = "";
        try {
          if (!guarded) {
            const out = await readAnswer(res, (d) => send(controller, "delta", { text: d }));
            full = out.text;
            await recordUsage({ feature: "tutor", userId: student.userId, byok: !!own }, model, out.usage);
          } else {
            const first = await readAnswer(res);
            await recordUsage({ feature: "tutor", userId: student.userId, byok: !!own }, model, first.usage);
            full = first.text;
            const broken = (text: string) => !text.trim() || (codeAsked && hasCode(text)) || (gradedWork && wordCount(text) > GRADED_LIMIT) || (banned.length > 0 && phrasesUsed(text, banned).length > 0);
            if (broken(full)) {
              // One rewrite with the exact correction, then a safe answer if the rule is still broken.
              const fix = codeAsked && hasCode(full) ? CODE_FIX : gradedWork ? GRADED_FIX : hintFix(phrasesUsed(full, banned));
              try {
                const again = await llmStream({ messages: [...messages, { role: "assistant", content: full }, { role: "user", content: fix }] as { role: "system" | "user" | "assistant"; content: string }[], effort: "normal", maxTokens: 400, own });
                const second = await readAnswer(again.res);
                await recordUsage({ feature: "tutor_guard", userId: student.userId, byok: !!own }, again.model, second.usage);
                full = second.text;
              } catch (e) {
                console.error("tutor guard rewrite", e instanceof Error ? e.message : e);
              }
              if (broken(full)) {
                const plain = codeAsked ? withoutCode(full) : full;
                full = codeAsked && (!plain || (gradedWork && wordCount(plain) > GRADED_LIMIT)) ? CODE_FALLBACK
                  : gradedWork && wordCount(plain) > GRADED_LIMIT ? GRADED_FALLBACK
                  : banned.length > 0 && phrasesUsed(plain, banned).length > 0 ? safeHint(plain, phrasesUsed(plain, banned))
                  : plain || CODE_FALLBACK;
              }
            }
            // Multiple-choice hints get a second look, for give-aways that paraphrase a choice instead of repeating it.
            if (banned.length > 0) {
              const judge = (hint: string) => llmJson<{ gives_away: boolean; why: string }>({
                model: LLM_FAST_MODEL, schemaName: "hint_check", schema: HINT_JUDGE_SCHEMA as unknown as Record<string, unknown>, messages: hintJudgeMessages(problemText, hint),
                effort: "light", maxTokens: 120, timeoutMs: 10_000, noRetry: true, own, usage: { feature: "tutor_guard", userId: student.userId, byok: !!own },
              }).catch(() => ({ gives_away: false, why: "" }));
              const verdict = await judge(full);
              if (verdict.gives_away) {
                try {
                  const again = await llmStream({ messages: [...messages, { role: "assistant", content: full }, { role: "user", content: hintRewrite(verdict.why) }] as { role: "system" | "user" | "assistant"; content: string }[], effort: "normal", maxTokens: 300, own });
                  const second = await readAnswer(again.res);
                  await recordUsage({ feature: "tutor_guard", userId: student.userId, byok: !!own }, again.model, second.usage);
                  const rewritten = second.text.trim();
                  full = rewritten && !phrasesUsed(rewritten, banned).length && !(await judge(rewritten)).gives_away ? rewritten : safeHint("", []);
                } catch (e) {
                  console.error("tutor hint judge rewrite", e instanceof Error ? e.message : e);
                  full = safeHint("", []);
                }
              }
            }
            send(controller, "delta", { text: full });
          }
          // Safety net for every answer: outside computer science, no code is ever saved (the app shows the saved version).
          if (!codeClass && hasCode(full)) full = withoutCode(full) || CODE_FALLBACK;
          const checked = checkCitations(full, sources);
          // The crisis line is never left to chance.
          const cleaned = feeling === "crisis" && !/\b988\b/.test(checked.cleaned) ? `${checked.cleaned}\n\n${CRISIS_LINE}` : checked.cleaned;
          const used = checked.used;
          if (!cleaned) throw new Error("empty answer");
          const { data: saved, error } = await student.db.from("chat_messages")
            .insert({ thread_id: threadId, role: "assistant", content: cleaned, mode, hint_level: mode === "hint" || mode === "check" ? level : null, citations: used }).select("id").single();
          if (error) throw error;
          await student.db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
          send(controller, "done", { message_id: saved.id, content: cleaned, citations: used, mode });
        } catch (e) {
          console.error("tutor stream", e instanceof Error ? e.message : e);
          await refund();
          if (askedId) await student.db.from("chat_messages").delete().eq("id", askedId);
          send(controller, "error", { error: "interrupted" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { ...corsHeaders(req), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    console.error("tutor", e instanceof Error ? e.message : e);
    await refund();
    return json(req, { error: "unavailable" }, 502);
  }
});
