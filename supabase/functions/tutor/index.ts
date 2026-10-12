// The Stoga.study tutor: hint-first answers grounded in the student's own pages, streamed as SSE.
//
// POST { subject_id, question, hint_level: 1|2|3, thread_id?, followup? }  → text/event-stream
//   events: meta { thread_id, sources, uncovered } · mode { mode } · delta { text } · done { message_id, content, citations, mode } · error { error }
//   Each new message is routed to a mode first (chat, explain, hint or check); ladder buttons are always "hint".
// POST { mode: "card", message_id }  → { card }   turn a tutor answer into a flashcard
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { LLM_FAST_MODEL, LLM_MODEL, llmJson, llmStream, LLMError, type Effort } from "../_lib/llm.ts";
import { cleanText } from "../_lib/study.ts";
import { checkCitations, CRISIS_LINE, guessMode, obviousMode, ROUTER_SCHEMA, wellbeing, routerMessages, searchTerms, systemPrompt, userTurn, type Mode, type Src, type Turn } from "../_lib/tutor.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MAX_Q = 2000;
const MAX_PAGES = 6;

/** Rank the subject's pages for these words (any of them), as the student, so RLS applies. */
async function retrieve(db: SupabaseClient, subjectId: string, words: string[]) {
  if (!words.length) return [];
  const { data, error } = await db.rpc("search_pages", { p_subject: subjectId, p_query: words.join(" or "), p_limit: MAX_PAGES });
  if (error) throw error;
  return (data ?? []) as { source_id: string; filename: string; page_no: number; text: string; rank: number }[];
}

/** Section titles from the subject's study sets, so the tutor knows what the student has uploaded. */
async function noteTopics(db: SupabaseClient, subjectId: string) {
  const { data: srcs } = await db.from("sources").select("id").eq("subject_id", subjectId).eq("status", "ready").order("created_at", { ascending: false }).limit(10);
  if (!srcs?.length) return [];
  const { data } = await db.from("notes_sections").select("title").in("source_id", srcs.map((s) => s.id)).order("position").limit(40);
  return [...new Set((data ?? []).map((n) => String(n.title).trim()))].slice(0, 25);
}

/** The student's own key, if they added one. */
async function ownKey(userId: string) {
  const { data } = await admin.rpc("read_api_key", { p_user: userId });
  return typeof data === "string" && data ? data : undefined;
}

/** Pick the reply mode with the fast model; fall back to rules if it fails or is slow. */
async function route(history: Turn[], message: string, apiKey?: string): Promise<Mode> {
  const lastMode = [...history].reverse().find((t) => t.role === "assistant")?.mode;
  const obvious = obviousMode(message, lastMode);
  if (obvious) return obvious;
  try {
    const out = await llmJson<{ mode: Mode }>({ model: LLM_FAST_MODEL, schemaName: "route", schema: ROUTER_SCHEMA, messages: routerMessages(history, message), effort: "light", maxTokens: 50, timeoutMs: 8000, apiKey, noRetry: true });
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
    apiKey: await ownKey(student.userId),
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

  const question = cleanText(body.question, MAX_Q);
  const level = [1, 2, 3].includes(body.hint_level) ? body.hint_level : 1;
  if (!question || typeof body.subject_id !== "string") return json(req, { error: "question_required" }, 400);
  const { data: subject } = await student.db.from("subjects").select("id, name").eq("id", body.subject_id).maybeSingle();
  if (!subject) return json(req, { error: "not_found" }, 404);

  // Allowance: one message per answer. Students with their own key are not limited.
  const apiKey = await ownKey(student.userId);
  const { data: allowed, error: allowErr } = await admin.rpc("consume_allowance", { p_user: student.userId, p_kind: "tutor_message", p_byok: !!apiKey });
  if (allowErr) return json(req, { error: "unavailable" }, 503);
  if (!allowed) {
    const { data: status } = await student.db.rpc("allowance_status");
    const row = (status ?? []).find((r: { kind: string }) => r.kind === "tutor_message");
    return json(req, { error: "limit", used: row?.used, limit: row?.limit, resets_at: row?.resets_at }, 429);
  }
  const refund = () => admin.rpc("refund_allowance", { p_user: student.userId, p_kind: "tutor_message" });

  try {
    // Thread and history.
    let threadId: string | null = typeof body.thread_id === "string" ? body.thread_id : null;
    if (threadId) {
      const { data: t } = await student.db.from("chat_threads").select("id").eq("id", threadId).eq("subject_id", subject.id).maybeSingle();
      if (!t) threadId = null;
    }
    if (!threadId) {
      const { data: t, error } = await student.db.from("chat_threads").insert({ subject_id: subject.id, title: question.slice(0, 80) }).select("id").single();
      if (error) throw error;
      threadId = t.id;
    }
    const { data: recent } = await student.db.from("chat_messages").select("role, content, mode").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(10);
    const history = ((recent ?? []) as Turn[]).reverse();

    // Sources.
    const previous = [...history].reverse().find((m) => m.role === "user" && m.content !== question)?.content ?? null;
    const feeling = body.followup ? null : wellbeing(question);
    const [hits, topics, routed] = await Promise.all([
      retrieve(student.db, subject.id, searchTerms(question, previous)),
      noteTopics(student.db, subject.id),
      body.followup ? Promise.resolve<Mode>("hint") : route(history, question, apiKey),
    ]);
    // A student who may be in crisis gets a caring reply, not schoolwork.
    const mode: Mode = feeling === "crisis" ? "chat" : routed;
    const sources: Src[] = [];
    const blocks: string[] = [];
    for (const h of hits) {
      let s = sources.find((x) => x.source_id === h.source_id);
      if (!s) {
        s = { key: `S${sources.length + 1}`, source_id: h.source_id, filename: h.filename, kind: "pdf", pages: [] };
        sources.push(s);
      }
      s.pages.push(h.page_no);
      blocks.push(`[${s.key} p.${h.page_no}] (${h.filename})\n${h.text.slice(0, 2500)}`);
    }
    if (sources.length) {
      const { data: kinds } = await student.db.from("sources").select("id, kind").in("id", sources.map((s) => s.source_id));
      for (const k of kinds ?? []) { const s = sources.find((x) => x.source_id === k.id); if (s) s.kind = k.kind; }
    }

    const messages = [
      { role: "system", content: systemPrompt({ mode, level, className: subject.name, hasSources: sources.length > 0, topics, feeling }) },
      // Earlier citation markers are dropped: S1 may mean a different file in this turn.
      ...history.map((m) => ({ role: m.role, content: m.content.replace(/\s*(\[S\d+[^\]]*\]|【[^】]*】)/g, "") })),
      { role: "user", content: userTurn(blocks, question, body.followup ? (level === 3 ? 3 : 2) : false) },
    ];

    // Small talk is quick; a full worked explanation gets more thinking.
    const effort: Effort = feeling === "crisis" ? "normal" : mode === "chat" ? "light" : mode === "hint" && level === 3 ? "deep" : "normal";
    let res: Response;
    try {
      res = await llmStream({ messages: messages as { role: "system" | "user" | "assistant"; content: string }[], effort, maxTokens: mode === "chat" ? 300 : 1200, apiKey });
    } catch (e) {
      await refund();
      const err = e instanceof LLMError ? e : null;
      console.error("tutor llm", err?.status, err?.message.slice(0, 200));
      const code = err?.kind === "auth" ? (apiKey ? "key_invalid" : "unavailable") : err?.kind === "rate_limit" ? "busy" : "unavailable";
      return json(req, { error: code, retry_after: err?.retryAfter }, code === "busy" ? 503 : 502);
    }
    // Saved only once the answer is on its way, so a retry after "busy" does not repeat the question.
    let askedId: string | null = null;
    if (!body.followup) {
      const { data: asked } = await student.db.from("chat_messages").insert({ thread_id: threadId, role: "user", content: question }).select("id").single();
      askedId = asked?.id ?? null;
    }

    const enc = new TextEncoder();
    const send = (c: ReadableStreamDefaultController, event: string, data: unknown) => c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    const publicSources = sources.map(({ key, source_id, filename, kind, pages }) => ({ key, source_id, filename, kind, pages }));
    const stream = new ReadableStream({
      async start(controller) {
        send(controller, "meta", { thread_id: threadId, sources: publicSources, uncovered: sources.length === 0, model: LLM_MODEL });
        send(controller, "mode", { mode });
        let full = "";
        try {
          const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
          let buf = "";
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
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (typeof delta !== "string" || !delta) continue;
              full += delta;
              send(controller, "delta", { text: delta });
            }
          }
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
